"""Fall and irregular-posture detection for camera SOS.

This adapts the standalone fall-detection scripts into a reusable module:
YOLO detects people, bbox movement is remembered briefly, and a fall is
confirmed only when the person remains horizontal for the configured
duration. It also reports persistent irregular horizontal posture as a
lower-confidence event, without raising a full emergency by itself.
"""
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

from ..config import config

log = logging.getLogger("rescuewave_ai.sos.fall")


@dataclass
class FallPostureEvent:
    kind: str  # "fall_confirmed" | "irregular_posture"
    confidence: float
    bbox: tuple
    description: str


class FallPostureDetector:
    def __init__(self):
        self._model = None
        self._available = False
        self._last_error = None
        self._previous_center = None
        self._movement_recent = False
        self._movement_time = None
        self._possible_fall_start = None
        self._fall_confirmed_until = 0.0
        self._last_event_at = 0.0
        self.last_bbox = None
        self.last_confidence = 0.0
        self.last_aspect_ratio = 0.0
        self.last_posture = "no_person"
        self.last_confirm_progress = 0.0

        if not config.FALL_DETECTION_ENABLED:
            log.info("Fall/posture detection disabled (FALL_DETECTION_ENABLED=false).")
            return
        if not os.path.isfile(config.FALL_DETECTION_MODEL_PATH):
            self._last_error = f"model not found: {config.FALL_DETECTION_MODEL_PATH}"
            log.warning("Fall/posture detection disabled (%s).", self._last_error)
            return
        try:
            from ultralytics import YOLO

            self._model = YOLO(config.FALL_DETECTION_MODEL_PATH)
            self._available = True
            log.info("Fall/posture detection ready (model: %s).", config.FALL_DETECTION_MODEL_PATH)
        except Exception as e:
            self._last_error = str(e)
            log.warning("Fall/posture detection disabled: %s", e)

    @property
    def available(self) -> bool:
        return self._available

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def process(self, bgr_frame) -> Optional[FallPostureEvent]:
        if not self.available:
            return None

        now = time.time()
        best = self._detect_best_person(bgr_frame)
        if best is None:
            self._previous_center = None
            self._possible_fall_start = None
            self.last_bbox = None
            self.last_confidence = 0.0
            self.last_aspect_ratio = 0.0
            self.last_posture = "no_person"
            self.last_confirm_progress = 0.0
            return None

        x1, y1, x2, y2, width, height, confidence = best
        bbox = (x1, y1, x2 - x1, y2 - y1)
        self.last_bbox = bbox
        self.last_confidence = confidence
        center = ((x1 + x2) // 2, (y1 + y2) // 2)

        if self._previous_center is not None:
            movement = abs(center[0] - self._previous_center[0]) + abs(center[1] - self._previous_center[1])
            if movement > config.FALL_MOVEMENT_MIN_DELTA:
                self._movement_recent = True
                self._movement_time = now
        self._previous_center = center

        if self._movement_recent and self._movement_time and now - self._movement_time > config.FALL_MOVEMENT_MEMORY_SECONDS:
            self._movement_recent = False

        aspect_ratio = width / float(max(height, 1))
        horizontal = aspect_ratio >= config.FALL_HORIZONTAL_RATIO
        self.last_aspect_ratio = aspect_ratio
        self.last_posture = "horizontal" if horizontal else "upright"

        if not horizontal:
            self._possible_fall_start = None
            self.last_confirm_progress = 0.0
            return None

        if self._movement_recent and now >= self._fall_confirmed_until:
            if self._possible_fall_start is None:
                self._possible_fall_start = now
                log.info("Possible fall detected; confirming for %.1fs.", config.FALL_CONFIRM_SECONDS)
            elif now - self._possible_fall_start >= config.FALL_CONFIRM_SECONDS:
                self._possible_fall_start = None
                self.last_confirm_progress = 1.0
                self._fall_confirmed_until = now + config.FALL_HOLD_SECONDS
                return self._event(
                    "fall_confirmed",
                    confidence,
                    bbox,
                    f"Fall confirmed by camera AI: person remained horizontal for {config.FALL_CONFIRM_SECONDS:.1f}s after movement",
                    now,
                )

        if self._possible_fall_start is None:
            self._possible_fall_start = now
        elif now - self._possible_fall_start >= config.IRREGULAR_POSTURE_CONFIRM_SECONDS:
            self.last_confirm_progress = 1.0
            return self._event(
                "irregular_posture",
                confidence,
                bbox,
                f"Irregular body posture detected by camera AI: person appears horizontal for {config.IRREGULAR_POSTURE_CONFIRM_SECONDS:.1f}s",
                now,
            )

        confirm_window = config.FALL_CONFIRM_SECONDS if self._movement_recent else config.IRREGULAR_POSTURE_CONFIRM_SECONDS
        self.last_confirm_progress = 0.0 if self._possible_fall_start is None else min(1.0, (now - self._possible_fall_start) / max(confirm_window, 0.001))
        return None

    def _event(self, kind: str, confidence: float, bbox: tuple, description: str, now: float) -> Optional[FallPostureEvent]:
        if now - self._last_event_at < config.FALL_EVENT_COOLDOWN_SECONDS:
            return None
        self._last_event_at = now
        log.warning("%s (confidence %.2f)", description, confidence)
        return FallPostureEvent(kind=kind, confidence=confidence, bbox=bbox, description=description)

    def _detect_best_person(self, frame):
        results = self._model(frame, conf=config.FALL_PERSON_CONFIDENCE, classes=[0], verbose=False)
        best = None
        best_conf = 0.0
        for result in results:
            for box in result.boxes:
                confidence = float(box.conf[0])
                if confidence < config.FALL_PERSON_CONFIDENCE:
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                width = x2 - x1
                height = y2 - y1
                if width < config.FALL_MIN_PERSON_WIDTH or height < config.FALL_MIN_PERSON_HEIGHT:
                    continue
                if confidence > best_conf:
                    best_conf = confidence
                    best = (x1, y1, x2, y2, width, height, confidence)
        return best
