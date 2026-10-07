#!/usr/bin/env python3
"""
RescueWave AI CCTV Service — Phase 7 (final audit).

Runs against one or more of your own registered cameras (see
backend/src/routes/cameras.js — a camera must have a stream_url configured
to be picked up here) and does two independent things per camera:

  1. Face matching: compares faces seen in the feed against active missing
     person reports, and reports any match to the backend.
  2. SOS detection (optional, on by default): hand-gesture, voice-keyword,
     and (if a trained model is configured) emotion-gated distress
     detection, adapted from the original prototype script — raises a
     real RescueWave alert via the normal SOS pipeline instead of sending
     its own email/SMS.

Usage:
  python main.py                      # auto-discovers this account's streaming cameras
  python main.py --camera-id <id>     # just one camera
  python main.py --no-sos             # face matching only
  python main.py --no-face-match      # SOS detection only
"""
import argparse
import logging
import os
import threading
import time

os.environ.setdefault("MPLCONFIGDIR", os.path.join(os.path.dirname(__file__), ".matplotlib-cache"))
os.environ.setdefault("XDG_CACHE_HOME", os.path.join(os.path.dirname(__file__), ".cache"))
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(os.path.dirname(__file__), ".ultralytics"))

import cv2

from rescuewave_ai.api_client import api_client
from rescuewave_ai.camera_source import open_capture, FrameReader
from rescuewave_ai.config import config
from rescuewave_ai.face_matcher import FaceMatcher
from rescuewave_ai.sos.sos_module import SosModule

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("rescuewave_ai.main")


def run_camera(camera: dict, do_face_match: bool, do_sos: bool):
    log.info("Starting camera %s (%s) — stream: %s", camera["id"], camera["name"], camera["stream_url"])
    cap = open_capture(camera["stream_url"])
    reader = FrameReader(cap)
    reader.start()

    face_matcher = FaceMatcher(api_client) if do_face_match else None
    if face_matcher:
        face_matcher.refresh_reference_set()

    sos = SosModule(api_client, camera) if do_sos else None
    if sos:
        sos.start()

    last_heartbeat = 0.0
    last_face_check = 0.0
    warned_no_frame_yet = False
    monitoring_active = True
    preview_title = f"RescueWave AI Monitor - {camera['name']}"
    control_state = {"toggle_clicked": False, "button_rect": None}

    try:
        while True:
            frame = reader.get_latest_frame()
            now = time.time()
            if now - last_heartbeat > 30:
                api_client.send_camera_heartbeat(
                    camera["id"],
                    voice_enabled=do_sos and bool(sos and sos.voice_detector.runtime_available),
                    emotion_enabled=do_sos and bool(sos and sos.emotion_detector.available),
                    fall_enabled=do_sos and bool(sos and sos.fall_posture_detector.available),
                )
                last_heartbeat = now
            if frame is None:
                if not warned_no_frame_yet:
                    log.info("Waiting for the first frame from camera %s…", camera["id"])
                    warned_no_frame_yet = True
                time.sleep(0.5)
                continue

            # Face matching runs against whatever the reader thread's most
            # recent frame is — deliberately decoupled from the read loop
            # (see FrameReader's docstring) so a slow inference call here
            # never blocks the camera from continuing to be read.
            if monitoring_active and face_matcher and now - last_face_check >= config.FACE_MATCH_POLL_SECONDS:
                last_face_check = now
                if face_matcher.should_refresh():
                    face_matcher.refresh_reference_set()
                result = face_matcher.process_frame(frame, camera["id"])
                if result:
                    _report_match(face_matcher, result, camera, frame)

            if monitoring_active and sos:
                sos.process_frame(frame)

            if config.SHOW_PREVIEW_WINDOW:
                if sos:
                    sos.draw_overlay(frame)
                control_state["button_rect"] = _draw_monitoring_header(frame, camera, monitoring_active, do_face_match, do_sos)
                cv2.imshow(preview_title, frame)
                cv2.setMouseCallback(preview_title, _handle_preview_click, control_state)
                key = cv2.waitKey(1) & 0xFF
                if control_state["toggle_clicked"]:
                    control_state["toggle_clicked"] = False
                    monitoring_active = not monitoring_active
                    log.info("Monitoring %s for camera %s", "resumed" if monitoring_active else "paused", camera["id"])
                elif key in (ord("s"), ord("r")):
                    monitoring_active = True
                    log.info("Monitoring resumed for camera %s", camera["id"])
                elif key in (ord("p"), ord("x")):
                    monitoring_active = False
                    log.info("Monitoring paused for camera %s; preview remains open", camera["id"])
                elif key in (27, ord("q")):  # Esc or q
                    break
            else:
                time.sleep(0.05)  # yield — this loop no longer blocks on a slow cap.read(), so don't spin flat-out
    finally:
        reader.stop()
        cap.release()
        if config.SHOW_PREVIEW_WINDOW:
            cv2.destroyAllWindows()
        if sos:
            sos.stop()


def _draw_monitoring_header(frame, camera: dict, active: bool, do_face_match: bool, do_sos: bool):
    status = "MONITORING ON" if active else "MONITORING PAUSED"
    status_color = (27, 180, 89) if active else (0, 165, 255)
    modes = []
    if do_face_match:
        modes.append("missing-person")
    if do_sos:
        modes.append("gesture/voice/fall/posture")
    mode_text = " + ".join(modes) or "preview only"
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, 0), (w, 82), (10, 18, 34), -1)
    cv2.putText(frame, "RescueWave AI Camera Monitor", (16, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, camera.get("name") or camera["id"], (16, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (210, 225, 245), 1, cv2.LINE_AA)
    status_rect = (w - 210, 14, w - 18, 42)
    cv2.rectangle(frame, status_rect[:2], status_rect[2:], status_color, -1)
    cv2.putText(frame, status, (w - 196, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)
    button_label = "Pause Monitoring" if active else "Start Monitoring"
    button_rect = (w - 210, 48, w - 18, 76)
    cv2.rectangle(frame, button_rect[:2], button_rect[2:], (245, 247, 250), -1)
    cv2.rectangle(frame, button_rect[:2], button_rect[2:], status_color, 2)
    cv2.putText(frame, button_label, (w - 192, 67), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (10, 18, 34), 1, cv2.LINE_AA)
    cv2.putText(frame, f"{mode_text} | S/R start | P/X stop | Q/Esc quit", (16, 74), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (230, 236, 245), 1, cv2.LINE_AA)
    return button_rect


def _handle_preview_click(event, x, y, flags, state):
    if event != cv2.EVENT_LBUTTONDOWN:
        return
    rect = state.get("button_rect")
    if not rect:
        return
    x1, y1, x2, y2 = rect
    if x1 <= x <= x2 and y1 <= y <= y2:
        state["toggle_clicked"] = True


def _report_match(face_matcher, result, camera, frame):
    """`result` is a face_matcher.FaceMatchResult. Never call this a
    "confirmed" match anywhere in logs/notifications — see Phase 3.7 of
    the audit: AI recognition is a lead for a human to verify, not proof."""
    snapshot_path = f"/tmp/rescuewave_match_{result.missing_person_id}_{int(time.time())}.jpg"
    x, y, w, h = result.bbox
    annotated = frame.copy()
    cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 215, 255), 2)
    cv2.imwrite(snapshot_path, annotated)

    try:
        snapshot_url = api_client.upload_file(snapshot_path)
    except Exception as e:
        log.warning("Could not upload match snapshot: %s", e)
        snapshot_url = None

    try:
        match = api_client.report_match(
            result.missing_person_id, camera["id"], result.similarity,
            snapshot_url=snapshot_url,
            face_detection_score=result.face_detection_score,
            local_feature_score=result.local_feature_score,
            ssim_score=result.ssim_score,
            final_confidence=result.final_confidence,
            match_label=result.label,
        )
        face_matcher.remember_reported_match(result.missing_person_id, camera["id"], match["id"])
        log.warning(
            "POTENTIAL MATCH reported: missing person %s on camera %s at %s (arcface %.3f, local %s, ssim %s, final %.3f, label %s, face detection %.2f) — requires human verification",
            result.missing_person_id,
            camera.get("name") or camera["id"],
            camera.get("address") or f"{camera.get('lat')}, {camera.get('lng')}",
            result.similarity,
            "n/a" if result.local_feature_score is None else f"{result.local_feature_score:.3f}",
            "n/a" if result.ssim_score is None else f"{result.ssim_score:.3f}",
            result.final_confidence,
            result.label,
            result.face_detection_score,
        )
    except Exception as e:
        log.error("Failed to report match to backend: %s", e)


def main():
    parser = argparse.ArgumentParser(description="RescueWave AI CCTV service")
    parser.add_argument("--camera-id", action="append", dest="camera_ids", help="Run against a specific camera ID (repeatable). Default: auto-discover.")
    parser.add_argument("--no-face-match", action="store_true", help="Disable missing-person face matching.")
    parser.add_argument("--no-sos", action="store_true", help="Disable gesture/voice/emotion SOS detection.")
    args = parser.parse_args()

    problems = config.validate()
    if problems:
        for p in problems:
            log.error(p)
        return

    camera_ids = args.camera_ids or config.CAMERA_IDS
    if camera_ids:
        cameras = [api_client.get_camera(cid) for cid in camera_ids]
    else:
        cameras = api_client.get_streaming_cameras()

    if not cameras:
        log.error(
            "No cameras with a stream_url configured were found for this account. "
            "Register one (or add a stream_url to an existing camera) from the RescueWave app, "
            "or point CAMERA_IDS in .env at specific cameras."
        )
        return

    log.info("Running against %d camera(s): %s", len(cameras), ", ".join(c["name"] for c in cameras))

    if len(cameras) == 1:
        run_camera(cameras[0], do_face_match=not args.no_face_match, do_sos=not args.no_sos)
        return

    if config.SHOW_PREVIEW_WINDOW:
        log.warning("Multiple cameras detected; disabling preview windows to keep OpenCV stable on macOS.")
        config.SHOW_PREVIEW_WINDOW = False

    threads = []
    for camera in cameras:
        thread = threading.Thread(
            target=run_camera,
            args=(camera, not args.no_face_match, not args.no_sos),
            name=f"RescueWaveCamera-{camera['id']}",
            daemon=True,
        )
        thread.start()
        threads.append(thread)

    try:
        while any(thread.is_alive() for thread in threads):
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Stopping AI service…")


if __name__ == "__main__":
    main()
