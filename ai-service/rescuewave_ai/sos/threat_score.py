"""Transparent, configurable weighted threat-score fusion for the SOS
module (final-audit Phase 9).

Deliberately NOT a new ML model — a plain, inspectable point system. Each
signal contributes a configurable number of points (see config.py) toward
a 0-100 total; the point of doing it this way instead of a hard AND-gate
or a black-box classifier is that every alert can show its exact working:
"Threat Score 70/100 (HIGH) — Gesture 40/40, Emotion 20/20, Repeated 10/10."

Default weights (all overridable via env):
    Gesture detected        +40
    Voice keyword heard     +30
    Distress emotion        +20
    Repeated detection      +10
    Fall confirmed          +70
    Irregular posture       +35

Severity bands (fixed, matches the audit spec):
    0-29     LOW
    30-59    MEDIUM
    60-79    HIGH
    80-100   CRITICAL

An alert only fires once the total crosses THREAT_SCORE_ALERT_THRESHOLD —
never from a single weak signal alone (e.g. emotion by itself is 20 points,
below the default 40-point threshold, so it can never alert on its own).
"""
from dataclasses import dataclass

from ..config import config

SEVERITY_BANDS = [
    (0, 29, "LOW"),
    (30, 59, "MEDIUM"),
    (60, 79, "HIGH"),
    (80, 100, "CRITICAL"),
]


def severity_for(score: float) -> str:
    score = max(0.0, min(100.0, score))
    for low, high, label in SEVERITY_BANDS:
        if low <= score <= high:
            return label
    return "CRITICAL"  # unreachable given the clamp above; kept as a safe default


@dataclass
class ThreatScore:
    gesture_points: float = 0.0
    voice_points: float = 0.0
    emotion_points: float = 0.0
    repeated_points: float = 0.0
    fall_points: float = 0.0
    posture_points: float = 0.0

    @property
    def total(self) -> float:
        return min(100.0, self.gesture_points + self.voice_points + self.emotion_points + self.repeated_points + self.fall_points + self.posture_points)

    @property
    def severity(self) -> str:
        return severity_for(self.total)

    @property
    def triggers_alert(self) -> bool:
        return self.total >= config.THREAT_SCORE_ALERT_THRESHOLD

    def breakdown_text(self) -> str:
        parts = []
        if self.gesture_points:
            parts.append(f"Gesture {self.gesture_points:.0f}/{config.THREAT_WEIGHT_GESTURE:.0f}")
        if self.voice_points:
            parts.append(f"Voice {self.voice_points:.0f}/{config.THREAT_WEIGHT_VOICE:.0f}")
        if self.emotion_points:
            parts.append(f"Emotion {self.emotion_points:.0f}/{config.THREAT_WEIGHT_EMOTION:.0f}")
        if self.repeated_points:
            parts.append(f"Repeated {self.repeated_points:.0f}/{config.THREAT_WEIGHT_REPEATED:.0f}")
        if self.fall_points:
            parts.append(f"Fall {self.fall_points:.0f}/{config.THREAT_WEIGHT_FALL:.0f}")
        if self.posture_points:
            parts.append(f"Posture {self.posture_points:.0f}/{config.THREAT_WEIGHT_IRREGULAR_POSTURE:.0f}")
        return ", ".join(parts) if parts else "no active signals"


def compute(
    gesture_detected: bool,
    voice_triggered: bool,
    emotion_distress: bool,
    repeated: bool,
    fall_confirmed: bool = False,
    irregular_posture: bool = False,
) -> ThreatScore:
    return ThreatScore(
        gesture_points=config.THREAT_WEIGHT_GESTURE if gesture_detected else 0.0,
        voice_points=config.THREAT_WEIGHT_VOICE if voice_triggered else 0.0,
        emotion_points=config.THREAT_WEIGHT_EMOTION if emotion_distress else 0.0,
        repeated_points=config.THREAT_WEIGHT_REPEATED if repeated else 0.0,
        fall_points=config.THREAT_WEIGHT_FALL if fall_confirmed else 0.0,
        posture_points=config.THREAT_WEIGHT_IRREGULAR_POSTURE if irregular_posture else 0.0,
    )
