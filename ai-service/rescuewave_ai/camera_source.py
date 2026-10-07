"""Opens a camera's configured stream_url as an OpenCV VideoCapture.

Two forms are supported:
  - "webcam:<index>"  -> the machine's own local webcam (demo/testing —
                          standing in for "one camera" when there's no real
                          IP camera to point at, as discussed for this phase)
  - "<index>"         -> shorthand for "webcam:<index>"
  - anything else      -> passed straight to cv2.VideoCapture, so a real
                          RTSP/HTTP camera stream URL just works
"""
import logging
import threading
import time

import cv2

log = logging.getLogger("rescuewave_ai.camera_source")


def open_capture(stream_url: str) -> cv2.VideoCapture:
    stream_url = str(stream_url).strip()
    if stream_url.startswith("webcam:"):
        index = int(stream_url.split(":", 1)[1] or "0")
        cap = cv2.VideoCapture(index)
    elif stream_url.isdigit():
        cap = cv2.VideoCapture(int(stream_url))
    else:
        cap = cv2.VideoCapture(stream_url)

    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera stream: {stream_url!r}")
    return cap


def read_frame(cap: cv2.VideoCapture):
    """Returns a BGR frame, or None if the read failed (stream hiccup —
    caller should keep trying, not treat this as fatal).

    For a finite source (a local video FILE used as a stand-in camera —
    common for demos when there's no real IP camera to point at) this also
    loops back to the start on EOF instead of failing forever. A live
    stream/webcam has no known frame count (`CAP_PROP_FRAME_COUNT` reports
    0 or a negative value for those), so this only ever engages for files —
    it won't mask a real live-stream disconnect, which still surfaces as a
    plain failed read for main.py's normal retry loop to handle."""
    ok, frame = cap.read()
    if ok and frame is not None:
        return frame

    total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    if total_frames and total_frames > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()
        if ok and frame is not None:
            log.info("Reached end of file-based stream — looped back to the start.")
            return frame

    return None


class FrameReader:
    """Reads frames on a dedicated background thread, decoupled from
    whatever a consumer does with each frame.

    Why this exists: on constrained hardware (in particular, single-core
    machines — this is exactly what surfaced the issue during
    development), a slow synchronous step in the main loop — InsightFace's
    inference call can legitimately take hundreds of milliseconds to
    multiple seconds depending on the machine — can starve the video
    decoder of CPU time badly enough that subsequent `cap.read()` calls
    start failing, even though the stream itself is fine. Reading
    continuously on its own thread means the decoder always gets serviced
    promptly; slow consumers (face matching) just always work with
    whatever the latest available frame is instead of blocking the reader.
    """

    def __init__(self, cap: cv2.VideoCapture):
        self._cap = cap
        self._lock = threading.Lock()
        self._latest_frame = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=2)

    def _run(self):
        while not self._stop.is_set():
            frame = read_frame(self._cap)
            if frame is not None:
                with self._lock:
                    self._latest_frame = frame
            else:
                time.sleep(0.1)

    def get_latest_frame(self):
        """Returns the most recently read frame, or None if nothing's been
        read yet. The same frame is returned to multiple callers between
        reads — that's expected (a slow consumer polling less often than
        the camera's frame rate should see the newest frame, not block
        waiting for a new one)."""
        with self._lock:
            return self._latest_frame
