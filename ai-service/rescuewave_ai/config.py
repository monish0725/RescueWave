"""Loads configuration from environment / .env — nothing hardcoded here.

Every credential and every tunable used by this service comes from the
environment. If you're looking for the account this service logs in as,
it's in your own .env file, never in source control.
"""
import os
from dotenv import load_dotenv

_AI_SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(_AI_SERVICE_DIR, ".ultralytics"))

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _float(name: str, default: float) -> float:
    val = os.getenv(name)
    return float(val) if val else default


def _int(name: str, default: int) -> int:
    val = os.getenv(name)
    return int(val) if val else default


class Config:
    API_URL = os.getenv("RESCUEWAVE_API_URL", "http://localhost:4000/api")
    EMAIL = os.getenv("RESCUEWAVE_EMAIL", "")
    PASSWORD = os.getenv("RESCUEWAVE_PASSWORD", "")

    CAMERA_IDS = [c.strip() for c in os.getenv("CAMERA_IDS", "").split(",") if c.strip()]

    # Local/demo webcam location override. Useful when the camera source is
    # a Mac webcam (`stream_url=0`) and the registered camera record has no
    # physical lat/lng yet. These values are used for camera-AI SOS alerts,
    # SMS/email backup alerts, and map links.
    CAMERA_LOCATION_ADDRESS = os.getenv("CAMERA_LOCATION_ADDRESS", "").strip()
    CAMERA_LOCATION_LAT = os.getenv("CAMERA_LOCATION_LAT", "").strip()
    CAMERA_LOCATION_LNG = os.getenv("CAMERA_LOCATION_LNG", "").strip()

    # 0.5 is the commonly-used cosine-similarity threshold for buffalo_l's
    # ArcFace embeddings specifically (a different scale than the old LBPH
    # heuristic that used to live here) — same-photo tests during
    # development scored ~0.98-1.00; two different photos of the same
    # person typically score lower than that, which is what this threshold
    # is calibrated against, not just "identical image" cases.
    FACE_MATCH_CONFIDENCE_THRESHOLD = _float("FACE_MATCH_CONFIDENCE_THRESHOLD", 0.5)  # cosine similarity (ArcFace) — 0.4-0.6 is the typical usable range
    FACE_MATCH_POLL_SECONDS = _int("FACE_MATCH_POLL_SECONDS", 5)
    MISSING_PERSONS_REFRESH_SECONDS = _int("MISSING_PERSONS_REFRESH_SECONDS", 120)
    FACE_MATCH_DET_SIZE = _int("FACE_MATCH_DET_SIZE", 320)  # SCRFD input size — larger = more accurate but slower
    FACE_MATCH_CONSECUTIVE_FRAMES = _int("FACE_MATCH_CONSECUTIVE_FRAMES", 3)  # poll cycles required before reporting a match
    FACE_MATCH_COOLDOWN_SECONDS = _int("FACE_MATCH_COOLDOWN_SECONDS", 300)  # don't re-report the same person/camera pair more than once per this many seconds
    LOCAL_FEATURE_ENABLED = _bool("LOCAL_FEATURE_ENABLED", True)
    LOCAL_FEATURE_METHOD = os.getenv("LOCAL_FEATURE_METHOD", "orb").strip()
    LOCAL_FEATURE_MIN_SCORE = _float("LOCAL_FEATURE_MIN_SCORE", 0.08)
    SSIM_ENABLED = _bool("SSIM_ENABLED", True)
    SSIM_MIN_SCORE = _float("SSIM_MIN_SCORE", 0.18)
    FINAL_MATCH_CONFIDENCE_THRESHOLD = _float("FINAL_MATCH_CONFIDENCE_THRESHOLD", 0.50)
    MATCH_WEIGHT_ARCFACE = _float("MATCH_WEIGHT_ARCFACE", 0.72)
    MATCH_WEIGHT_LOCAL_FEATURE = _float("MATCH_WEIGHT_LOCAL_FEATURE", 0.20)
    MATCH_WEIGHT_SSIM = _float("MATCH_WEIGHT_SSIM", 0.08)

    # Face QUALITY gates — applied per detected face, before it's allowed to
    # be compared against the reference set at all. Tuned to reject obvious
    # garbage detections (a face-shaped blur in the background, a face too
    # small/far to mean anything), not to be a second confidence threshold —
    # FACE_MATCH_CONFIDENCE_THRESHOLD above is what actually decides a match.
    FACE_QUALITY_MIN_DET_SCORE = _float("FACE_QUALITY_MIN_DET_SCORE", 0.5)   # SCRFD's own detection confidence
    FACE_QUALITY_MIN_FACE_SIZE_PX = _int("FACE_QUALITY_MIN_FACE_SIZE_PX", 40)  # min bbox width/height in the CCTV frame
    FACE_QUALITY_MIN_SHARPNESS = _float("FACE_QUALITY_MIN_SHARPNESS", 40.0)  # Laplacian variance; lower = blurrier

    # Same quality bar, applied once to a missing-person REFERENCE photo at
    # upload/refresh time — deliberately separate constants (a reference
    # photo can reasonably require a slightly higher bar than a CCTV frame
    # glimpse, and tuning one shouldn't silently move the other).
    REFERENCE_MIN_FACE_SIZE_PX = _int("REFERENCE_MIN_FACE_SIZE_PX", 80)
    REFERENCE_MIN_SHARPNESS = _float("REFERENCE_MIN_SHARPNESS", 40.0)

    SOS_ENABLED = _bool("SOS_ENABLED", True)
    SOS_HOLD_SECONDS = _float("SOS_HOLD_SECONDS", 1.0)
    SOS_COOLDOWN_SECONDS = _float("SOS_COOLDOWN_SECONDS", 30)
    SOS_MAX_HANDS = _int("SOS_MAX_HANDS", 6)
    SOS_SAME_PERSON_HAND_DISTANCE = _float("SOS_SAME_PERSON_HAND_DISTANCE", 0.34)
    SOS_REQUIRE_SINGLE_OPEN_PALM_PER_PERSON = _bool("SOS_REQUIRE_SINGLE_OPEN_PALM_PER_PERSON", True)
    VOSK_MODEL_PATH = os.getenv("VOSK_MODEL_PATH", "").strip()
    VOICE_TRIGGER_WORDS = [w.strip().lower() for w in os.getenv("VOICE_TRIGGER_WORDS", "help,sos,emergency,save me,help me,rescue").split(",") if w.strip()]
    VOICE_TRIGGER_COOLDOWN_SECONDS = _float("VOICE_TRIGGER_COOLDOWN_SECONDS", 3)
    EMOTION_MODEL_PATH = os.getenv("EMOTION_MODEL_PATH", "").strip()
    EMOTION_ALERT_THRESHOLD = _float("EMOTION_ALERT_THRESHOLD", 0.45)
    FALL_DETECTION_ENABLED = _bool("FALL_DETECTION_ENABLED", True)
    FALL_DETECTION_MODEL_PATH = os.getenv(
        "FALL_DETECTION_MODEL_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "fall-detection", "yolo11n.pt")),
    ).strip()
    FALL_PERSON_CONFIDENCE = _float("FALL_PERSON_CONFIDENCE", 0.55)
    FALL_MIN_PERSON_WIDTH = _int("FALL_MIN_PERSON_WIDTH", 100)
    FALL_MIN_PERSON_HEIGHT = _int("FALL_MIN_PERSON_HEIGHT", 150)
    FALL_HORIZONTAL_RATIO = _float("FALL_HORIZONTAL_RATIO", 1.25)
    FALL_MOVEMENT_MIN_DELTA = _float("FALL_MOVEMENT_MIN_DELTA", 4)
    FALL_MOVEMENT_MEMORY_SECONDS = _float("FALL_MOVEMENT_MEMORY_SECONDS", 1.5)
    FALL_CONFIRM_SECONDS = _float("FALL_CONFIRM_SECONDS", 2.0)
    FALL_HOLD_SECONDS = _float("FALL_HOLD_SECONDS", 8.0)
    FALL_EVENT_COOLDOWN_SECONDS = _float("FALL_EVENT_COOLDOWN_SECONDS", 20.0)
    IRREGULAR_POSTURE_CONFIRM_SECONDS = _float("IRREGULAR_POSTURE_CONFIRM_SECONDS", 4.0)

    # Transparent weighted threat-score fusion (final-audit Phase 9) — a
    # plain, inspectable point system, not a model: each signal contributes
    # a configurable number of points toward a 0-100 score, and an alert
    # only fires once the total crosses THREAT_SCORE_ALERT_THRESHOLD. This
    # replaces a hard "gesture AND emotion" gate with something that (a)
    # can still alert from voice alone if it's strong enough, and (b) shows
    # its work — every alert description includes the exact breakdown.
    THREAT_WEIGHT_GESTURE = _float("THREAT_WEIGHT_GESTURE", 40)
    THREAT_WEIGHT_VOICE = _float("THREAT_WEIGHT_VOICE", 30)
    THREAT_WEIGHT_EMOTION = _float("THREAT_WEIGHT_EMOTION", 20)
    THREAT_WEIGHT_REPEATED = _float("THREAT_WEIGHT_REPEATED", 10)
    THREAT_WEIGHT_FALL = _float("THREAT_WEIGHT_FALL", 70)
    THREAT_WEIGHT_IRREGULAR_POSTURE = _float("THREAT_WEIGHT_IRREGULAR_POSTURE", 35)
    THREAT_SCORE_ALERT_THRESHOLD = _float("THREAT_SCORE_ALERT_THRESHOLD", 40)  # MEDIUM (30-59) and up, by default

    SHOW_PREVIEW_WINDOW = _bool("SHOW_PREVIEW_WINDOW", True)

    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT = _int("SMTP_PORT", 587)
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", os.getenv("SENDER_EMAIL", "")).strip()
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", os.getenv("SENDER_PASSWORD", "")).strip()
    ALERT_EMAIL_TO = [e.strip() for e in os.getenv("ALERT_EMAIL_TO", os.getenv("POLICE_EMAIL", "")).split(",") if e.strip()]

    TWILIO_SID = os.getenv("TWILIO_SID", "").strip()
    TWILIO_AUTH = os.getenv("TWILIO_AUTH", "").strip()
    TWILIO_FROM = os.getenv("TWILIO_FROM", "").strip()
    TWILIO_TO = [p.strip() for p in os.getenv("TWILIO_TO", os.getenv("POLICE_PHONE", "")).split(",") if p.strip()]
    TWILIO_CALL_TO = [p.strip() for p in os.getenv("TWILIO_CALL_TO", "").split(",") if p.strip()]
    GEOCODER_ENABLED = _bool("GEOCODER_ENABLED", True)
    GEOCODER_USER_AGENT = os.getenv("GEOCODER_USER_AGENT", "rescuewave-ai-service/1.0").strip()
    GEOCODER_TIMEOUT_SECONDS = _float("GEOCODER_TIMEOUT_SECONDS", 5)

    def validate(self):
        problems = []
        if not self.EMAIL or not self.PASSWORD:
            problems.append("RESCUEWAVE_EMAIL / RESCUEWAVE_PASSWORD are not set — copy .env.example to .env and fill them in.")
        return problems


config = Config()
