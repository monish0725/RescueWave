"""Hand-gesture SOS detection — adapted from the RescueWave prototype
gesture script (mediapipe hand landmarks), cleaned up into a reusable
class with no hardcoded credentials and no direct email/SMS/calling. This
module only *detects*; sos_module.py decides what to do about it (create a
real RescueWave alert via the API, using the existing Helper/Authority
dispatch pipeline, rather than reinventing Twilio/SMTP here).

Detects one pattern:
  - HELP        — exactly one open palm (5 fingers extended) for an
                  estimated person, held continuously.
"""
import time
from dataclasses import dataclass
from typing import Optional

import mediapipe as mp

from ..config import config

mp_hands = mp.solutions.hands

WRIST_TO_MIDDLE_MCP_MIN = 0.045


def count_extended_fingers(landmarks, handedness_label: str) -> int:
    count = 0
    is_right = handedness_label.lower() == "right"
    try:
        tip, ip = landmarks[4], landmarks[3]
        if (tip.x < ip.x and is_right) or (tip.x > ip.x and not is_right):
            count += 1
    except Exception:
        pass
    for tip_idx, pip_idx in ((8, 6), (12, 10), (16, 14), (20, 18)):
        try:
            if landmarks[tip_idx].y < landmarks[pip_idx].y:
                count += 1
        except Exception:
            pass
    return count


def _hand_center(landmarks):
    xs = [p.x for p in landmarks]
    ys = [p.y for p in landmarks]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _bbox_center(bbox):
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _bbox_union(boxes):
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def is_open_palm(landmarks, handedness_label: str) -> bool:
    if count_extended_fingers(landmarks, handedness_label) != 5:
        return False
    try:
        # Reject tiny/far detections that often look like five fingers.
        palm_span = abs(landmarks[0].y - landmarks[9].y)
        return palm_span >= WRIST_TO_MIDDLE_MCP_MIN
    except Exception:
        return True


@dataclass
class GestureEvent:
    gesture: str  # "HELP"
    bbox: Optional[tuple] = None
    confidence: float = 1.0
    people_count: int = 1


@dataclass
class GestureObservation:
    candidate: str
    bbox: Optional[tuple]
    hold_progress: float
    people_count: int = 1
    hand_count: int = 1
    note: str = ""


class GestureDetector:
    """Wraps a mediapipe Hands instance + hold/confirm logic (a candidate
    gesture must be seen continuously for `hold_seconds` before it counts,
    matching the original script's anti-false-positive behavior)."""

    def __init__(
        self,
        hold_seconds=1.0,
        max_hands=None,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
        same_person_hand_distance=None,
        require_single_open_palm_per_person=None,
    ):
        self.hold_seconds = hold_seconds
        self.same_person_hand_distance = same_person_hand_distance or config.SOS_SAME_PERSON_HAND_DISTANCE
        self.require_single_open_palm_per_person = (
            config.SOS_REQUIRE_SINGLE_OPEN_PALM_PER_PERSON
            if require_single_open_palm_per_person is None
            else require_single_open_palm_per_person
        )
        self._hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=max_hands or config.SOS_MAX_HANDS,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._last_candidate = None
        self._hold_start = None
        self.last_observation = None

    def close(self):
        self._hands.close()

    def process(self, frame_rgb) -> Optional[GestureEvent]:
        """Feed one RGB frame in. Returns a confirmed GestureEvent only once
        the gesture has been held continuously for hold_seconds, else None."""
        results = self._hands.process(frame_rgb)
        candidate = None
        candidate_bbox = None
        people_count = 0
        hand_count = 0
        note = ""

        if results.multi_hand_landmarks and results.multi_handedness:
            hands = []
            for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
                lm = hand_landmarks.landmark
                label = handedness.classification[0].label
                bbox = self._landmark_bbox(lm)
                hands.append({
                    "landmarks": lm,
                    "label": label,
                    "bbox": bbox,
                    "center": _hand_center(lm),
                    "open": is_open_palm(lm, label),
                })

            groups = self._estimate_person_hand_groups(hands)
            people_count = len(groups)
            hand_count = len(hands)
            valid_groups = []
            suppressed_two_hand_groups = 0
            for group in groups:
                open_hands = [h for h in group if h["open"]]
                if len(open_hands) == 1:
                    valid_groups.append(open_hands[0])
                elif len(open_hands) > 1 and self.require_single_open_palm_per_person:
                    suppressed_two_hand_groups += 1

            if valid_groups:
                candidate = "HELP"
                candidate_bbox = _bbox_union([h["bbox"] for h in valid_groups])
                if people_count > 1:
                    note = f"{len(valid_groups)} person(s) with one open palm"
            elif suppressed_two_hand_groups:
                note = "ignored: same person appears to be showing two open hands"

        now = time.time()
        if candidate is None:
            self._last_candidate, self._hold_start = None, None
            self.last_observation = GestureObservation("none", None, 0.0, people_count, hand_count, note) if note else None
            return None

        if candidate == self._last_candidate:
            if self._hold_start is None:
                self._hold_start = now
            elif now - self._hold_start >= self.hold_seconds:
                self._last_candidate, self._hold_start = None, None
                self.last_observation = GestureObservation(candidate, candidate_bbox, 1.0, people_count, hand_count, note)
                return GestureEvent(gesture=candidate, bbox=candidate_bbox, confidence=1.0, people_count=max(1, people_count))
        else:
            self._last_candidate, self._hold_start = candidate, now
        progress = 0.0 if self._hold_start is None else min(1.0, (now - self._hold_start) / max(self.hold_seconds, 0.001))
        self.last_observation = GestureObservation(candidate, candidate_bbox, progress, people_count, hand_count, note)
        return None

    def _estimate_person_hand_groups(self, hands):
        """Group hands that are likely from the same person.

        Without a full body detector in this module, this uses a hand-only
        heuristic: two hands close enough in normalized image space and at a
        similar vertical level are treated as one person. Hands farther apart
        are treated as different people, so two separate people can each raise
        one palm while a single person raising both palms is rejected.
        """
        groups = []
        for hand in sorted(hands, key=lambda h: h["center"][0]):
            placed = False
            hx, hy = hand["center"]
            for group in groups:
                centers = [_bbox_center(h["bbox"]) for h in group]
                gx = sum(c[0] for c in centers) / len(centers)
                gy = sum(c[1] for c in centers) / len(centers)
                if abs(hx - gx) <= self.same_person_hand_distance and abs(hy - gy) <= 0.28:
                    group.append(hand)
                    placed = True
                    break
            if not placed:
                groups.append([hand])
        return groups

    def _landmark_bbox(self, landmarks):
        if not landmarks:
            return None
        xs = [p.x for p in landmarks]
        ys = [p.y for p in landmarks]
        return (min(xs), min(ys), max(xs), max(ys))
