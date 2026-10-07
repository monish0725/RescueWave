"""Secondary verification for ArcFace candidates.

ArcFace remains the identity engine. This module only checks whether the
reference face crop and CCTV face crop share enough local visual structure
to strengthen or weaken an already-plausible ArcFace candidate.
"""
from __future__ import annotations

import cv2
import numpy as np
from typing import Optional


def crop_face(img_bgr, bbox, padding: float = 0.18, size: int = 224):
    h, w = img_bgr.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    pad_x, pad_y = int(bw * padding), int(bh * padding)
    x1, y1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
    x2, y2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
    crop = img_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.equalizeHist(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


class LocalFeatureVerifier:
    def __init__(self, method: str = "orb"):
        self.method = method.strip().lower()
        self._orb = cv2.ORB_create(nfeatures=600, fastThreshold=8)

    def score(self, reference_crop, candidate_crop) -> Optional[float]:
        if reference_crop is None or candidate_crop is None:
            return None
        if self.method in ("disabled", "none", "off"):
            return None
        # XFeat/ALIKE are optional local-feature engines. In this local demo
        # environment we use OpenCV ORB as the dependency-free verifier while
        # keeping the module boundary/score contract identical.
        return self._orb_score(reference_crop, candidate_crop)

    def _orb_score(self, reference_crop, candidate_crop) -> Optional[float]:
        ref_gray = cv2.cvtColor(reference_crop, cv2.COLOR_BGR2GRAY)
        cand_gray = cv2.cvtColor(candidate_crop, cv2.COLOR_BGR2GRAY)
        kp1, des1 = self._orb.detectAndCompute(ref_gray, None)
        kp2, des2 = self._orb.detectAndCompute(cand_gray, None)
        if des1 is None or des2 is None or not kp1 or not kp2:
            return None
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = matcher.match(des1, des2)
        if not matches:
            return 0.0
        good = [m for m in matches if m.distance <= 64]
        denom = max(12, min(len(kp1), len(kp2)))
        return float(min(1.0, len(good) / denom))


def ssim_score(reference_crop, candidate_crop) -> Optional[float]:
    if reference_crop is None or candidate_crop is None:
        return None
    ref = cv2.cvtColor(reference_crop, cv2.COLOR_BGR2GRAY).astype(np.float32)
    cand = cv2.cvtColor(candidate_crop, cv2.COLOR_BGR2GRAY).astype(np.float32)
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    mu_x = cv2.GaussianBlur(ref, (11, 11), 1.5)
    mu_y = cv2.GaussianBlur(cand, (11, 11), 1.5)
    sigma_x = cv2.GaussianBlur(ref * ref, (11, 11), 1.5) - mu_x * mu_x
    sigma_y = cv2.GaussianBlur(cand * cand, (11, 11), 1.5) - mu_y * mu_y
    sigma_xy = cv2.GaussianBlur(ref * cand, (11, 11), 1.5) - mu_x * mu_y
    score_map = ((2 * mu_x * mu_y + c1) * (2 * sigma_xy + c2)) / ((mu_x * mu_x + mu_y * mu_y + c1) * (sigma_x + sigma_y + c2))
    return float(max(0.0, min(1.0, score_map.mean())))
