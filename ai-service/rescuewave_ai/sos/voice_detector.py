"""Voice keyword detection via Vosk — optional. Needs both the `vosk` +
`sounddevice` packages (requirements-optional.txt) AND a downloaded Vosk
model directory (VOSK_MODEL_PATH in .env). If either is missing, this
detector reports itself as unavailable rather than crashing the service —
gesture detection and face matching work fine without it.
"""
import json
import logging
import queue
import threading
import time

from ..config import config

log = logging.getLogger("rescuewave_ai.sos.voice")

DEFAULT_TRIGGER_WORDS = ("help", "sos", "emergency", "save me", "help me", "rescue")

try:
    from vosk import KaldiRecognizer, Model as VoskModel
    import sounddevice as sd

    _DEPS_AVAILABLE = True
except Exception:
    _DEPS_AVAILABLE = False


class VoiceDetector:
    """Runs a background listener thread; on_trigger(text) is called from
    that thread whenever a trigger word is heard, so callers should treat
    it like any other cross-thread callback (keep it fast, thread-safe)."""

    def __init__(self, model_path: str, on_trigger):
        self.model_path = model_path
        self.on_trigger = on_trigger
        self._thread = None
        self._stop = threading.Event()
        self._started = threading.Event()
        self._failed = threading.Event()
        self._last_trigger_at = 0.0

    @property
    def available(self) -> bool:
        return _DEPS_AVAILABLE and bool(self.model_path)

    @property
    def runtime_available(self) -> bool:
        return self.available and self._started.is_set() and not self._failed.is_set()

    def start(self):
        if not self.available:
            reason = "vosk/sounddevice not installed" if not _DEPS_AVAILABLE else "VOSK_MODEL_PATH not set"
            log.info("Voice detection disabled (%s).", reason)
            return
        try:
            device = sd.query_devices(kind="input")
            log.info("Voice input device: %s", device.get("name", "default"))
        except Exception as e:
            self._failed.set()
            log.error("Voice detection disabled (no usable microphone input): %s", e)
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _run(self):
        try:
            model = VoskModel(self.model_path)
        except Exception as e:
            log.error("Could not load Vosk model at %s: %s", self.model_path, e)
            return

        recognizer = KaldiRecognizer(model, 16000)
        audio_queue = queue.Queue(maxsize=8)

        def callback(indata, frames, time_info, status):
            if self._stop.is_set():
                raise sd.CallbackStop()
            try:
                audio_queue.put_nowait(bytes(indata))
            except queue.Full:
                pass

        try:
            with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype="int16", channels=1, callback=callback):
                self._started.set()
                log.info("Voice detection listening (model: %s).", self.model_path)
                while not self._stop.is_set():
                    try:
                        chunk = audio_queue.get(timeout=0.25)
                    except queue.Empty:
                        continue
                    if recognizer.AcceptWaveform(chunk):
                        result = json.loads(recognizer.Result() or "{}")
                        text = (result.get("text") or "").lower()
                    else:
                        result = json.loads(recognizer.PartialResult() or "{}")
                        text = (result.get("partial") or "").lower()
                    if text:
                        log.debug("Voice heard: %s", text)
                    if self._matches_trigger(text):
                        now = time.time()
                        if now - self._last_trigger_at >= config.VOICE_TRIGGER_COOLDOWN_SECONDS:
                            self._last_trigger_at = now
                            self.on_trigger(text)
        except Exception as e:
            self._failed.set()
            log.error("Voice listener stopped: %s", e)
        finally:
            self._started.clear()
            time.sleep(0.05)

    def _matches_trigger(self, text: str) -> bool:
        if not text:
            return False
        words = config.VOICE_TRIGGER_WORDS or DEFAULT_TRIGGER_WORDS
        normalized = f" {text.lower()} "
        return any(f" {word} " in normalized for word in words)
