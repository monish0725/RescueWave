"""Orchestrates gesture + voice + emotion detection for one camera and, once
the fused threat score (see threat_score.py) crosses the alert threshold,
raises a REAL RescueWave alert via the same POST /api/alerts endpoint a
phone's SOS button uses (source='camera_ai'). From there it's
indistinguishable from a manual SOS to the rest of the system — existing
Helper/Authority matching, push notifications, and the admin dashboard all
just work, unchanged.

This deliberately does NOT send its own email/SMS/calls (the original
prototype script did, directly via SMTP/Twilio) — reusing RescueWave's own
dispatch pipeline means one place decides who gets notified and how,
instead of two independent alerting paths that could disagree.

FINAL-AUDIT PHASE 9 CHANGE: the previous version only ever alerted from a
hard "gesture AND distress-emotion" gate — voice alone could never alert,
however clear the trigger word, and a gesture could never alert without a
successful emotion read even if no emotion model was configured at all.
This now fuses gesture / voice / emotion / repeated-detection into one
transparent 0-100 threat score (each signal's point value is configurable
in .env) and alerts once the total crosses THREAT_SCORE_ALERT_THRESHOLD —
so voice alone CAN alert if it's strong enough, and a missing/unconfigured
emotion model just means that signal contributes 0 rather than blocking
everything else.

FINAL-AUDIT FOLLOW-UP: SOS alerts now attach a real snapshot (the frame
being processed when the alert fired), the same way missing-person
matches already did — previously `create_camera_alert()` never sent a
`photo_url` at all, so a gesture/voice alert had zero visual evidence
attached, unlike a face match.
"""
import logging
import os
import time
from datetime import datetime

import cv2

from ..config import config
from ..geocoder import geocode_address, reverse_geocode
from ..notifier import send_direct_alert
from . import threat_score
from .emotion_detector import EmotionDetector
from .fall_posture_detector import FallPostureDetector
from .gesture_detector import GestureDetector
from .voice_detector import VoiceDetector

log = logging.getLogger("rescuewave_ai.sos")

VOICE_ACTIVE_WINDOW_SECONDS = 5.0  # how long a voice trigger counts as "currently active" for fusion purposes

GESTURE_CATEGORY = {
    "HELP": "suspicious_activity",
}
GESTURE_DESCRIPTION = {
    "HELP": "Single open-palm HELP gesture detected by camera AI",
}
FALL_CATEGORY = {
    "fall_confirmed": "medical",
    "irregular_posture": "suspicious_activity",
}


class SosModule:
    def __init__(self, api_client, camera):
        self.api = api_client
        self.camera = camera  # dict with id, lat, lng, address
        self._geocoded_location = None
        self._reverse_geocoded_address = None
        self.gesture_detector = GestureDetector(hold_seconds=config.SOS_HOLD_SECONDS, max_hands=config.SOS_MAX_HANDS)
        self.emotion_detector = EmotionDetector(config.EMOTION_MODEL_PATH)
        self.voice_detector = VoiceDetector(config.VOSK_MODEL_PATH, on_trigger=self._on_voice_trigger)
        self.fall_posture_detector = FallPostureDetector()
        self._last_alert_at = 0.0
        self._emotion_frame_counter = 0
        self._gesture_streak = 0          # consecutive process_frame() calls with a gesture event — feeds "repeated" points
        self._last_voice_trigger_at = 0.0
        self._last_voice_text = ""
        self._latest_frame = None  # set every process_frame() call; used by _raise_alert() to attach a snapshot
        self._last_score = threat_score.compute(False, False, self.emotion_detector.indicates_distress(), False)
        self._last_gesture_event = None
        self._last_fall_event = None
        self._last_gesture_event_at = 0.0
        self._last_fall_event_at = 0.0
        if self._location_lat() is None or self._location_lng() is None:
            log.warning(
                "Camera %s has no precise lat/lng. Set CAMERA_LOCATION_LAT and CAMERA_LOCATION_LNG in ai-service/.env, "
                "or edit this camera in the app/admin dashboard, so SMS/email alerts include an exact map link.",
                self.camera.get("name") or self.camera.get("id"),
            )

    def start(self):
        self.voice_detector.start()

    def stop(self):
        self.voice_detector.stop()
        self.gesture_detector.close()

    # ---- voice: fires independently of the per-frame loop, on its own thread ----
    def _on_voice_trigger(self, heard_text: str):
        self._last_voice_trigger_at = time.time()
        self._last_voice_text = heard_text
        score = threat_score.compute(
            gesture_detected=False,
            voice_triggered=True,
            emotion_distress=self.emotion_detector.indicates_distress(),
            repeated=self._gesture_streak >= 2,
        )
        self._last_score = score
        self._maybe_raise("other", f'Voice trigger detected by camera AI: "{heard_text}"', score, direct_alert=True)

    # ---- gesture + fusion: runs once per captured frame ----
    def process_frame(self, bgr_frame):
        self._latest_frame = bgr_frame  # for _raise_alert()'s snapshot, incl. voice-triggered alerts firing off-thread
        self._emotion_frame_counter += 1
        if self._emotion_frame_counter >= 10:
            self._emotion_frame_counter = 0
            self.emotion_detector.update(bgr_frame)

        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        event = self.gesture_detector.process(rgb)
        fall_event = self.fall_posture_detector.process(bgr_frame)
        self._last_gesture_event = event
        self._last_fall_event = fall_event
        if event:
            self._last_gesture_event_at = time.time()
        if fall_event:
            self._last_fall_event_at = time.time()

        gesture_detected = event is not None
        fall_confirmed = fall_event is not None and fall_event.kind == "fall_confirmed"
        irregular_posture = fall_event is not None and fall_event.kind == "irregular_posture"
        self._gesture_streak = self._gesture_streak + 1 if gesture_detected else 0
        voice_active = (time.time() - self._last_voice_trigger_at) < VOICE_ACTIVE_WINDOW_SECONDS

        if not gesture_detected and not voice_active and fall_event is None:
            return  # nothing to score this cycle

        score = threat_score.compute(
            gesture_detected=gesture_detected,
            voice_triggered=voice_active,
            emotion_distress=self.emotion_detector.indicates_distress(),
            repeated=self._gesture_streak >= 2,
            fall_confirmed=fall_confirmed,
            irregular_posture=irregular_posture,
        )
        self._last_score = score

        if fall_event:
            category = FALL_CATEGORY.get(fall_event.kind, "medical")
            description = f"{fall_event.description} (YOLO person confidence {fall_event.confidence:.2f})"
            direct_alert = False
        elif gesture_detected:
            category = GESTURE_CATEGORY.get(event.gesture, "other")
            description = GESTURE_DESCRIPTION.get(event.gesture, f"{event.gesture} detected by camera AI")
            if getattr(event, "people_count", 1) > 1:
                description += f" ({event.people_count} people with one open palm each)"
            direct_alert = True
        else:
            category, description = "other", f'Voice trigger still active: "{self._last_voice_text}"'
            direct_alert = True

        self._maybe_raise(category, description, score, direct_alert=direct_alert)

    def draw_overlay(self, frame):
        """Draws live SOS analysis onto the OpenCV preview frame in-place."""
        h, w = frame.shape[:2]
        now = time.time()
        voice_active = (time.time() - self._last_voice_trigger_at) < VOICE_ACTIVE_WINDOW_SECONDS
        gesture_obs = self.gesture_detector.last_observation
        recent_gesture = self._last_gesture_event if now - self._last_gesture_event_at < 3 else None
        recent_fall = self._last_fall_event if now - self._last_fall_event_at < 5 else None

        if gesture_obs and gesture_obs.bbox:
            x1, y1, x2, y2 = self._scale_bbox(gesture_obs.bbox, w, h)
            score_text = f"{gesture_obs.candidate} {self._last_score.total:.0f}/100"
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            self._label(frame, x1, max(22, y1 - 8), score_text, (0, 0, 255))

        fall_detector = self.fall_posture_detector
        if fall_detector.last_bbox:
            x, y, bw, bh = fall_detector.last_bbox
            if recent_fall and recent_fall.kind == "fall_confirmed":
                color = (0, 0, 255)
                label = f"FALL {fall_detector.last_confidence:.2f}"
            elif fall_detector.last_posture == "horizontal":
                color = (0, 165, 255)
                label = f"POSTURE horizontal {fall_detector.last_confirm_progress * 100:.0f}%"
            else:
                color = (0, 180, 0)
                label = f"PERSON upright {fall_detector.last_confidence:.2f}"
            cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)
            self._label(frame, x, max(22, y - 8), label, color)

        emotion_label = "unavailable"
        if self.emotion_detector.available:
            if self.emotion_detector.last_label:
                emotion_label = (
                    f"{self.emotion_detector.last_label} {self.emotion_detector.last_confidence:.2f} "
                    f"(smile {self.emotion_detector.last_smile_confidence:.2f})"
                )
            else:
                emotion_label = "analyzing"
        fall_label = "ready" if fall_detector.available else "unavailable"
        if recent_fall:
            fall_label = f"{recent_fall.kind} {recent_fall.confidence:.2f}"
        elif fall_detector.last_bbox:
            fall_label = f"{fall_detector.last_posture} {fall_detector.last_confidence:.2f}"
        posture_label = "normal"
        if fall_detector.last_posture == "horizontal":
            posture_label = f"horizontal {fall_detector.last_aspect_ratio:.2f} ({fall_detector.last_confirm_progress * 100:.0f}%)"
        elif fall_detector.last_posture == "upright":
            posture_label = f"upright {fall_detector.last_aspect_ratio:.2f}"
        gesture_label = "none"
        if gesture_obs:
            gesture_label = f"{gesture_obs.candidate} {gesture_obs.hold_progress * 100:.0f}%"
            if gesture_obs.note:
                gesture_label = f"{gesture_label} - {gesture_obs.note}"
        if recent_gesture:
            gesture_label = f"{recent_gesture.gesture} confirmed"

        lines = [
            f"Threat: {self._last_score.total:.0f}/100 {self._last_score.severity}",
            f"Gesture: {gesture_label}",
            f"Voice: {'active' if voice_active else 'listening'}",
            f"Emotion: {emotion_label}",
            f"Fall: {fall_label}",
            f"Posture: {posture_label}",
        ]
        self._panel(frame, lines)
        return frame

    def _maybe_raise(self, category: str, description: str, score: "threat_score.ThreatScore", direct_alert: bool = False):
        log.info(
            "Threat score for camera %s: %.0f/100 (%s) — %s%s",
            self.camera.get("name"), score.total, score.severity, score.breakdown_text(),
            "" if score.triggers_alert else " — below alert threshold, not raising",
        )
        if not score.triggers_alert:
            return
        full_description = f"{description} — Threat Score {score.total:.0f}/100 ({score.severity}): {score.breakdown_text()}"
        self._raise_alert(category, full_description, direct_alert=direct_alert)

    def _raise_alert(self, category: str, description: str, direct_alert: bool = False):
        now = time.time()
        if now - self._last_alert_at < config.SOS_COOLDOWN_SECONDS:
            log.info("Suppressing alert (cooldown): %s", description)
            return
        self._last_alert_at = now
        photo_url = self._capture_snapshot()
        try:
            result = self.api.create_camera_alert(
                category=category,
                description=description,
                lat=self._location_lat(),
                lng=self._location_lng(),
                address=self._location_address(),
                photo_url=photo_url,
            )
            log.warning(
                "🚨 ALERT RAISED via camera %s: %s (helpers notified: %s, authorities notified: %s)",
                self.camera.get("name"),
                description,
                result.get("helpersNotified"),
                result.get("authoritiesNotified"),
            )
            if direct_alert:
                send_direct_alert(
                    "RescueWave Camera AI Alert",
                    self._direct_alert_body(description, category, photo_url),
                    self._direct_call_message(description),
                )
        except Exception as e:
            log.error("Failed to raise alert with backend: %s", e)

    def _location_lat(self):
        explicit = self._coerce_float(config.CAMERA_LOCATION_LAT) if config.CAMERA_LOCATION_LAT else self._coerce_float(self.camera.get("lat"))
        if explicit is not None:
            return explicit
        geocoded = self._geocode_location()
        return geocoded[0] if geocoded else None

    def _location_lng(self):
        explicit = self._coerce_float(config.CAMERA_LOCATION_LNG) if config.CAMERA_LOCATION_LNG else self._coerce_float(self.camera.get("lng"))
        if explicit is not None:
            return explicit
        geocoded = self._geocode_location()
        return geocoded[1] if geocoded else None

    def _location_address(self):
        address = config.CAMERA_LOCATION_ADDRESS or self.camera.get("address")
        if address:
            return address
        lat = self._coerce_float(config.CAMERA_LOCATION_LAT) if config.CAMERA_LOCATION_LAT else self._coerce_float(self.camera.get("lat"))
        lng = self._coerce_float(config.CAMERA_LOCATION_LNG) if config.CAMERA_LOCATION_LNG else self._coerce_float(self.camera.get("lng"))
        if lat is not None and lng is not None:
            if self._reverse_geocoded_address is None:
                self._reverse_geocoded_address = reverse_geocode(lat, lng)
            if self._reverse_geocoded_address:
                return self._reverse_geocoded_address
        return "Mac webcam location"

    def _map_url(self):
        lat = self._location_lat()
        lng = self._location_lng()
        if lat is None or lng is None:
            return None
        return f"https://maps.google.com/?q={lat:.7f},{lng:.7f}"

    def _direct_alert_body(self, description: str, category: str, photo_url=None):
        lat = self._location_lat()
        lng = self._location_lng()
        map_url = self._map_url()
        lines = [
            "RescueWave Camera AI Alert",
            "",
            description,
            "",
            f"Alert type: {category}",
            f"Camera: {self.camera.get('name') or self.camera.get('id')}",
            f"Precise location: {self._location_address()}",
        ]
        if lat is not None and lng is not None:
            lines.append(f"Coordinates: {lat:.7f}, {lng:.7f}")
        else:
            lines.append("Coordinates: not configured")
        if map_url:
            lines.append(f"Open map: {map_url}")
        else:
            lines.append("Open map: unavailable until CAMERA_LOCATION_LAT/CAMERA_LOCATION_LNG or camera lat/lng is set")
        if photo_url:
            lines.append(f"Snapshot: {photo_url}")
        return "\n".join(lines)

    def _direct_call_message(self, description: str):
        address = self._location_address()
        map_url = self._map_url()
        if map_url:
            return f"RescueWave camera AI detected a possible emergency at {address}. Check SMS for exact Google Maps location."
        return f"RescueWave camera AI detected a possible emergency at {address}. Exact coordinates are not configured."

    def _geocode_location(self):
        if self._geocoded_location is not None:
            return self._geocoded_location
        address = config.CAMERA_LOCATION_ADDRESS or self.camera.get("address")
        self._geocoded_location = geocode_address(address) if address else None
        return self._geocoded_location

    @staticmethod
    def _coerce_float(value):
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _capture_snapshot(self):
        """Saves the most recent processed frame and uploads it, so this
        alert has a real photo_url the way missing-person matches already
        do — returns None (not an error) if there's no frame yet, or if
        the upload itself fails, so a snapshot problem never blocks the
        actual alert from being raised."""
        if self._latest_frame is None:
            return None
        path = f"/tmp/rescuewave_sos_{self.camera.get('id')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        try:
            cv2.imwrite(path, self._latest_frame)
            return self.api.upload_file(path)
        except Exception as e:
            log.warning("Could not capture/upload SOS snapshot (alert will still be raised without one): %s", e)
            return None
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def _scale_bbox(self, bbox, width, height, pad=12):
        x1, y1, x2, y2 = bbox
        return (
            max(0, int(x1 * width) - pad),
            max(0, int(y1 * height) - pad),
            min(width - 1, int(x2 * width) + pad),
            min(height - 1, int(y2 * height) + pad),
        )

    def _panel(self, frame, lines):
        x, y = 12, 12
        line_h = 24
        width = max(310, max(cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)[0][0] for line in lines) + 24)
        height = line_h * len(lines) + 16
        overlay = frame.copy()
        cv2.rectangle(overlay, (x, y), (x + width, y + height), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.68, frame, 0.32, 0, frame)
        for i, line in enumerate(lines):
            color = (0, 0, 255) if line.startswith("Gesture:") and "none" not in line else (245, 245, 245)
            cv2.putText(frame, line, (x + 12, y + 26 + i * line_h), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)

    def _label(self, frame, x, y, text, color):
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (x, y - th - 8), (x + tw + 10, y + 5), color, -1)
        cv2.putText(frame, text, (x + 5, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
