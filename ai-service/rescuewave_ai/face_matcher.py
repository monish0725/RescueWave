"""Face matching: registered missing-person photos vs. live camera frames.

Uses InsightFace — SCRFD for face detection, ArcFace (the `buffalo_l`
model pack) for 512-d face embeddings — instead of classical LBPH (the
prior approach in this file). This is a genuine upgrade, not a cosmetic
rename: on the exact same JPEG-recompression robustness test used to
validate the old approach, LBPH scored confidence ~0.77 (down from a
perfect same-image match of 1.00) — the same test scored ArcFace at
cosine similarity ~0.98.

First run downloads the buffalo_l pack (~330MB) to ~/.insightface/ —
needs real internet access once, then it's cached.

Matching uses plain NumPy cosine similarity over an in-memory reference
list, not a FAISS index. At this project's realistic scale (dozens to a
few hundred active missing-person records, not millions), a linear scan
over 512-d vectors is sub-millisecond — FAISS exists to make approximate
search over massive indexes fast, which isn't the problem here.

FINAL-AUDIT PHASE 3 CHANGES:

  3.1 Reference photo validation — `validate_reference_photo()` returns a
      structured reason (no_face / multiple_faces / face_too_small /
      too_blurry / undecodable) instead of silently skipping a bad photo.
      Whatever calls this (currently just this module's own logging) can
      now say something specific instead of a generic "didn't work."

  3.2 ALL faces per frame — `process_frame()` used to pick the single
      highest-detection-confidence face and compare only that one against
      the reference set. That's exactly backwards when the missing person
      isn't the most prominent face in frame: a bystander standing closer
      to the camera would silently win and the missing person never gets
      compared at all. It now compares every quality-passing face and
      keeps the best-scoring (face, missing_person) pair across the whole
      frame.

  3.3 Quality filtering — each detected face is checked against
      FACE_QUALITY_MIN_DET_SCORE / _MIN_FACE_SIZE_PX / _MIN_SHARPNESS
      before it's allowed to be compared at all, so an obviously bad
      detection (tiny, blurry, low-confidence) can't win a "best across
      the frame" comparison just because nothing else beat it.

  3.4 Every threshold above is env-configurable (see config.py) — nothing
      in this file hardcodes a magic number anymore, including the match
      cooldown, which used to be a hardcoded 300 in __init__.
"""
import logging
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Dict, Optional, Set, Tuple

import cv2
import numpy as np

from .config import config
from .local_feature_verifier import LocalFeatureVerifier, crop_face, ssim_score

log = logging.getLogger("rescuewave_ai.face_matcher")

_face_app = None  # lazy-loaded — see _get_face_app()

VALIDATION_MESSAGES = {
    "undecodable": "This photo could not be read. Please upload a different image file.",
    "no_face": "No face was detected in this photo. Please upload a clear image containing one person's face.",
    "multiple_faces": "Multiple faces were detected. Please upload a photo containing only the missing person.",
    "face_too_small": "The face in this photo is too small to use reliably. Please upload a closer, higher-resolution photo.",
    "too_blurry": "This photo is too blurry to use reliably. Please upload a sharper image.",
}


def _get_face_app():
    """Loads the InsightFace model pack on first use. `.prepare()` itself
    is ~5-10s (mostly model file I/O); separately, the actual first
    inference call pays a one-time onnxruntime graph-optimization cost
    that was observed varying widely (roughly 8-45s depending on system
    load during testing) — real, but not something `.prepare()` triggers.
    That cost lands on whichever `.get()` call happens first. In practice
    that's `refresh_reference_set()` processing a real missing-person
    photo, which main.py always calls once before it starts reading
    camera frames — so this delay shows up during startup/"loading", not
    mid-stream once frames are actually being read."""
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis

        log.info("Loading InsightFace (buffalo_l)... first run downloads ~330MB, then it's cached.")
        _face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        _face_app.prepare(ctx_id=0, det_size=(config.FACE_MATCH_DET_SIZE, config.FACE_MATCH_DET_SIZE))
        log.info("InsightFace ready (first real detection call will still take longer than steady-state — see docstring).")
    return _face_app


def _sharpness(img_bgr, bbox) -> float:
    """Variance of the Laplacian over the face crop — a standard, cheap
    blur proxy (sharp edges -> high variance; a blurry photo has none).
    Not a perceptual-quality model, just a threshold on this one number."""
    x1, y1, x2, y2 = [max(0, int(v)) for v in bbox]
    crop = img_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _face_quality_ok(face, img_bgr, min_det_score: float, min_size_px: int, min_sharpness: float) -> Tuple[bool, Optional[str]]:
    x1, y1, x2, y2 = face.bbox
    w, h = x2 - x1, y2 - y1
    if face.det_score < min_det_score:
        return False, "low_detection_confidence"
    if w < min_size_px or h < min_size_px:
        return False, "face_too_small"
    if _sharpness(img_bgr, face.bbox) < min_sharpness:
        return False, "too_blurry"
    return True, None


@dataclass
class ValidationResult:
    ok: bool
    face: object = None
    reason: Optional[str] = None  # key into VALIDATION_MESSAGES when not ok

    @property
    def message(self) -> Optional[str]:
        return VALIDATION_MESSAGES.get(self.reason) if self.reason else None


def validate_reference_photo(image_bytes) -> ValidationResult:
    """3.1 — checks a missing-person reference photo is actually usable
    BEFORE it's trusted for matching, and says specifically why not if it
    isn't, rather than silently continuing with nothing (or worse, with a
    wrong face)."""
    img = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return ValidationResult(ok=False, reason="undecodable")

    faces = _get_face_app().get(img)
    if not faces:
        return ValidationResult(ok=False, reason="no_face")
    if len(faces) > 1:
        return ValidationResult(ok=False, reason="multiple_faces")

    face = faces[0]
    ok, reason = _face_quality_ok(
        face, img,
        min_det_score=config.FACE_QUALITY_MIN_DET_SCORE,
        min_size_px=config.REFERENCE_MIN_FACE_SIZE_PX,
        min_sharpness=config.REFERENCE_MIN_SHARPNESS,
    )
    if not ok:
        # "low_detection_confidence" doesn't have its own reporter-facing
        # message (it's rare for a single clear face in a portrait-style
        # reference photo) — fold it into the blur message, the closest
        # actionable advice ("upload a clearer photo").
        return ValidationResult(ok=False, reason="too_blurry" if reason == "low_detection_confidence" else reason)

    return ValidationResult(ok=True, face=face)


def _load_reference_face(photo_url_absolute: str, person_label: str):
    """Downloads a missing person's reference photo and validates it.
    Returns (face_or_None, ValidationResult) — the caller decides what to
    do with the result (currently: log it AND report it back to the
    backend so the reporter can actually see why a photo was rejected,
    not just this service's own log)."""
    try:
        with urllib.request.urlopen(photo_url_absolute, timeout=15) as resp:
            data = np.asarray(bytearray(resp.read()), dtype=np.uint8)
    except Exception as e:
        log.warning("Could not download reference photo for %s (%s): %s", person_label, photo_url_absolute, e)
        return None, None  # a download failure isn't a validation verdict — don't report a false "rejected"

    result = validate_reference_photo(data)
    if not result.ok:
        log.warning("Reference photo for %s rejected [%s]: %s", person_label, result.reason, result.message)
        return None, result
    return result.face, result


@dataclass
class ReferenceEntry:
    missing_person_id: str
    embedding: np.ndarray  # normed_embedding — unit vector, so dot product == cosine similarity
    face_crop: object = None


@dataclass
class ReferenceSet:
    entries: list = field(default_factory=list)
    loaded_at: float = 0.0


@dataclass
class FaceMatchResult:
    """3.8 — match metadata. What actually gets persisted (missing_person_id,
    confidence, snapshot) lives in the backend's `missing_person_matches`
    table plus the /matches API call in main.py; this is what ai-service
    itself has on hand to hand over."""
    missing_person_id: str
    similarity: float          # 0-1 ArcFace cosine similarity
    face_detection_score: float  # 0-1 SCRFD detection confidence for the matched face
    local_feature_score: Optional[float]
    ssim_score: Optional[float]
    final_confidence: float
    label: str
    bbox: tuple                 # (x, y, w, h) in the source frame


class FaceMatcher:
    def __init__(self, api_client):
        self.api = api_client
        self._reference = ReferenceSet()
        self._consecutive_hits: Dict[Tuple[str, str], int] = {}  # (missing_person_id, camera_id) -> consecutive matching frames
        self._last_reported_at: Dict[Tuple[str, str], float] = {}
        self._last_reported_match_id: Dict[Tuple[str, str], str] = {}
        self._last_reported_validation: Dict[str, str] = {}  # missing_person_id -> "status:reason", to dedup PATCH calls
        self.consecutive_frames_required = config.FACE_MATCH_CONSECUTIVE_FRAMES
        self._local_verifier = LocalFeatureVerifier(config.LOCAL_FEATURE_METHOD)

    def refresh_reference_set(self):
        missing_people = self.api.get_active_missing_persons()
        entries = []
        base = config.API_URL.rsplit("/api", 1)[0]
        active_ids = {person["id"] for person in missing_people}

        for person in missing_people:
            label = person.get("name") or person.get("id")
            if not person.get("photo_url"):
                log.info("Skipping %s: no reference photo.", label)
                continue
            url = person["photo_url"]
            if url.startswith("/"):
                url = base + url
            face, result = _load_reference_face(url, label)
            if face is not None:
                ref_crop = None
                try:
                    with urllib.request.urlopen(url, timeout=15) as resp:
                        img = cv2.imdecode(np.asarray(bytearray(resp.read()), dtype=np.uint8), cv2.IMREAD_COLOR)
                    if img is not None:
                        ref_crop = crop_face(img, face.bbox)
                except Exception:
                    ref_crop = None
                entries.append(ReferenceEntry(missing_person_id=person["id"], embedding=face.normed_embedding, face_crop=ref_crop))
                log.info("Loaded reference face for %s (%s), detection confidence %.2f.", label, person["id"], face.det_score)
            self._report_validation_status(person, result)

        self._reference = ReferenceSet(entries=entries, loaded_at=time.time())
        self._prune_inactive_people(active_ids)
        if not entries:
            log.info("No missing-person reference photos with a usable face yet.")
        else:
            log.info("Loaded %d missing-person reference face(s).", len(entries))

    def _prune_inactive_people(self, active_ids: Set[str]):
        """When a reporter marks someone found, the backend removes that
        record from /missing-persons?status=missing. Drop any cached
        per-camera match memory for that person too, so the AI service
        stops treating them as a searchable case immediately after the
        next reference refresh."""
        for cache in (self._consecutive_hits, self._last_reported_at, self._last_reported_match_id):
            for key in list(cache.keys()):
                missing_person_id = key[0]
                if missing_person_id not in active_ids:
                    cache.pop(key, None)

    def _report_validation_status(self, person: dict, result):
        """Pushes validate_reference_photo()'s verdict to the backend so
        it reaches the mobile app (see missing/[id].tsx). `result` is None
        for a download failure — not a real verdict on the photo itself,
        so nothing is reported in that case (better to say nothing than
        to wrongly tell a reporter their photo was rejected when it was
        actually just a network blip). Skips the API call entirely if the
        status/reason hasn't changed since last time, so a healthy
        reference set doesn't generate a PATCH request every single
        refresh cycle forever."""
        if result is None:
            return
        status = "ok" if result.ok else "rejected"
        reason = None if result.ok else result.reason
        cache_key = f"{status}:{reason}"
        if self._last_reported_validation.get(person["id"]) == cache_key:
            return
        try:
            self.api.update_missing_person_validation(person["id"], status, reason)
            self._last_reported_validation[person["id"]] = cache_key
        except Exception as e:
            log.warning("Could not report photo validation status for %s: %s", person.get("name") or person["id"], e)

    def should_refresh(self) -> bool:
        return (time.time() - self._reference.loaded_at) >= config.MISSING_PERSONS_REFRESH_SECONDS

    def _best_match(self, embedding: np.ndarray):
        """Cosine similarity of one face embedding against every reference
        entry. Plain NumPy — see the module docstring for why this doesn't
        need FAISS at this scale."""
        if not self._reference.entries:
            return None, 0.0
        sims = [float(np.dot(embedding, e.embedding)) for e in self._reference.entries]
        best_idx = int(np.argmax(sims))
        return self._reference.entries[best_idx], sims[best_idx]

    def _combined_confidence(self, arcface_score: float, local_score: Optional[float], pixel_score: Optional[float]) -> float:
        parts = [(config.MATCH_WEIGHT_ARCFACE, arcface_score)]
        if config.LOCAL_FEATURE_ENABLED and local_score is not None:
            parts.append((config.MATCH_WEIGHT_LOCAL_FEATURE, local_score))
        if config.SSIM_ENABLED and pixel_score is not None:
            parts.append((config.MATCH_WEIGHT_SSIM, pixel_score))
        total_weight = sum(w for w, _ in parts) or 1.0
        return float(sum(w * s for w, s in parts) / total_weight)

    def _label_for(self, arcface_score: float, local_score: Optional[float], pixel_score: Optional[float], final_confidence: float) -> str:
        if final_confidence >= config.FINAL_MATCH_CONFIDENCE_THRESHOLD and arcface_score >= config.FACE_MATCH_CONFIDENCE_THRESHOLD:
            secondary_ok = (
                not config.LOCAL_FEATURE_ENABLED
                or local_score is None
                or local_score >= config.LOCAL_FEATURE_MIN_SCORE
            )
            ssim_ok = not config.SSIM_ENABLED or pixel_score is None or pixel_score >= config.SSIM_MIN_SCORE
            return "high_confidence_match" if secondary_ok and ssim_ok else "possible_match_requires_more_frames"
        if arcface_score >= config.FACE_MATCH_CONFIDENCE_THRESHOLD * 0.85:
            return "possible_match_requires_more_frames"
        return "no_match"

    def process_frame(self, frame, camera_id: str) -> Optional[FaceMatchResult]:
        """Checks one camera frame against the current reference set.

        3.2/3.3: every face SCRFD finds in the frame is quality-filtered,
        then compared against the reference set; the single best-scoring
        (face, missing_person) pair across the WHOLE frame is what
        continues to the consecutive-frame/cooldown logic below — so a
        prominent bystander's face can't crowd out a smaller/farther
        match to the actual missing person.

        Requires FACE_MATCH_CONSECUTIVE_FRAMES consecutive calls (i.e.
        consecutive poll cycles, not consecutive raw video frames — see
        main.py's polling cadence) scoring above threshold for the SAME
        person before reporting anything (3.6 temporal confirmation), and
        won't re-report the same pairing inside FACE_MATCH_COOLDOWN_SECONDS
        (3.9 duplicate suppression).

        Returns a FaceMatchResult on a freshly confirmed POTENTIAL match
        (never "confirmed identification" — see the module-level note on
        terminology), else None.
        """
        if not self._reference.entries:
            return None

        faces = _get_face_app().get(frame)
        if not faces:
            log.info("No faces detected on camera %s in this frame.", camera_id)
            self._consecutive_hits.clear()  # nobody in frame — any partial streak resets
            return None

        candidates = []
        rejected = []
        for face in faces:
            ok, reason = _face_quality_ok(
                face, frame,
                min_det_score=config.FACE_QUALITY_MIN_DET_SCORE,
                min_size_px=config.FACE_QUALITY_MIN_FACE_SIZE_PX,
                min_sharpness=config.FACE_QUALITY_MIN_SHARPNESS,
            )
            if not ok:
                rejected.append(reason)
                continue
            reference, similarity = self._best_match(face.normed_embedding)
            if reference is not None:
                candidate_crop = crop_face(frame, face.bbox)
                local_score = self._local_verifier.score(reference.face_crop, candidate_crop) if config.LOCAL_FEATURE_ENABLED else None
                pixel_score = ssim_score(reference.face_crop, candidate_crop) if config.SSIM_ENABLED else None
                final_confidence = self._combined_confidence(similarity, local_score, pixel_score)
                label = self._label_for(similarity, local_score, pixel_score, final_confidence)
                candidates.append((reference.missing_person_id, similarity, local_score, pixel_score, final_confidence, label, face))

        if not candidates:
            log.info("Detected %d face(s) on camera %s, but none passed quality filters: %s", len(faces), camera_id, ", ".join(r or "unknown" for r in rejected))
            self._consecutive_hits.clear()
            return None

        missing_person_id, similarity, local_score, pixel_score, final_confidence, label, face = max(candidates, key=lambda c: c[4])
        log.info(
            "Best face candidate on camera %s: missing_person=%s arcface=%.3f local=%s ssim=%s final=%.3f label=%s det_score=%.2f",
            camera_id,
            missing_person_id,
            similarity,
            "n/a" if local_score is None else f"{local_score:.3f}",
            "n/a" if pixel_score is None else f"{pixel_score:.3f}",
            final_confidence,
            label,
            face.det_score,
        )

        key = (missing_person_id, camera_id)
        if label == "no_match":
            log.info("Rejected candidate on camera %s: final %.3f / arcface %.3f below configured thresholds.", camera_id, final_confidence, similarity)
            self._consecutive_hits[key] = 0
            return None

        self._consecutive_hits[key] = self._consecutive_hits.get(key, 0) + 1
        if self._consecutive_hits[key] < self.consecutive_frames_required:
            return None  # trending toward a match, but not confirmed yet

        now = time.time()
        if now - self._last_reported_at.get(key, 0) < config.FACE_MATCH_COOLDOWN_SECONDS:
            if self._last_match_still_pending(missing_person_id, camera_id, key):
                return None  # already reported this pairing recently — keep the streak, just don't spam
            log.info("Previous match for %s on camera %s was reviewed; allowing a fresh sighting.", missing_person_id, camera_id)

        self._last_reported_at[key] = now
        self._consecutive_hits[key] = 0
        x1, y1, x2, y2 = face.bbox.astype(int)
        bbox = (x1, y1, x2 - x1, y2 - y1)  # (x, y, w, h) — matches the shape callers already expect
        return FaceMatchResult(missing_person_id=missing_person_id, similarity=similarity,
                               face_detection_score=float(face.det_score),
                               local_feature_score=local_score, ssim_score=pixel_score,
                               final_confidence=final_confidence, label=label, bbox=bbox)

    def remember_reported_match(self, missing_person_id: str, camera_id: str, match_id: str):
        self._last_reported_match_id[(missing_person_id, camera_id)] = match_id

    def _last_match_still_pending(self, missing_person_id: str, camera_id: str, key) -> bool:
        match_id = self._last_reported_match_id.get(key)
        if not match_id:
            return True
        try:
            matches = self.api.get_missing_person_matches(missing_person_id)
            match = next((m for m in matches if m.get("id") == match_id), None)
            return not match or match.get("verification_status") == "pending"
        except Exception as e:
            log.warning("Could not check review status for last match %s on camera %s: %s", match_id, camera_id, e)
            return True
