"""Thin wrapper around the RescueWave backend API.

Logs in as the account configured in .env (the camera owner) and reuses
that JWT for every call — cameras, missing persons, matches, uploads, and
alerts all use the same ownership-scoped endpoints the mobile app and
admin dashboard use. There is no separate "service" auth mechanism; this
service is just another authenticated RescueWave client.
"""
import logging
import mimetypes
import os
import time

import requests

from .config import config

log = logging.getLogger("rescuewave_ai.api_client")


class ApiClient:
    def __init__(self):
        self._token = None
        self._token_expires_at = 0
        self.session = requests.Session()

    def _login(self):
        resp = self.session.post(
            f"{config.API_URL}/auth/login",
            json={"email": config.EMAIL, "password": config.PASSWORD},
            timeout=15,
        )
        if resp.status_code == 401:
            raise RuntimeError(
                "AI service login failed. Check RESCUEWAVE_EMAIL and "
                f"RESCUEWAVE_PASSWORD in ai-service/.env for {config.EMAIL}. "
                "If you copied .env.example unchanged, create the local demo "
                "account from backend/ with: node src/admin-cli.js "
                "ensure-ai-demo camowner@example.com change_me --camera"
            )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["token"]
        # JWTs from this backend last 30 days by default; re-login well
        # before that rather than trying to parse/trust the token's own exp.
        self._token_expires_at = time.time() + 60 * 60 * 24
        log.info("Logged in to RescueWave as %s", data["user"]["email"])
        return data["user"]

    def _headers(self):
        if not self._token or time.time() >= self._token_expires_at:
            self._login()
        return {"Authorization": f"Bearer {self._token}"}

    def _request(self, method, path, **kwargs):
        url = f"{config.API_URL}{path}"
        resp = self.session.request(method, url, headers=self._headers(), timeout=20, **kwargs)
        if resp.status_code == 401:
            # token might have been invalidated server-side — retry once after a fresh login
            self._token = None
            resp = self.session.request(method, url, headers=self._headers(), timeout=20, **kwargs)
        resp.raise_for_status()
        return resp.json() if resp.content else None

    # --- Cameras -----------------------------------------------------------------
    def get_streaming_cameras(self):
        """Every stream this account can monitor.

        Admin AI accounts scan all active registered streams. Ordinary camera
        owners fall back to their own stream-enabled cameras.
        """
        try:
            data = self._request("GET", "/cameras/streaming/all")
        except requests.HTTPError as e:
            if e.response is None or e.response.status_code not in (403, 404):
                raise
            data = self._request("GET", "/cameras/mine/streaming")
        return data["cameras"]

    def get_camera(self, camera_id):
        return self._request("GET", f"/cameras/{camera_id}")["camera"]

    def send_camera_heartbeat(self, camera_id, voice_enabled=None, emotion_enabled=None, fall_enabled=None):
        """`voice_enabled`/`emotion_enabled` let the admin dashboard show a
        real Configured/Not Configured status for these optional
        submodules (final-audit Phase 8) instead of guessing — pass
        `bool(config.VOSK_MODEL_PATH)` / `bool(config.EMOTION_MODEL_PATH)`.
        Omit either (leave it None) and the backend just leaves that
        column as whatever it last was, rather than overwriting a real
        value with an unknown one."""
        body = {}
        if voice_enabled is not None:
            body["voice_enabled"] = bool(voice_enabled)
        if emotion_enabled is not None:
            body["emotion_enabled"] = bool(emotion_enabled)
        if fall_enabled is not None:
            body["fall_enabled"] = bool(fall_enabled)
        try:
            self._request("POST", f"/cameras/{camera_id}/ai-heartbeat", json=body or None)
        except requests.RequestException as e:
            log.warning("Heartbeat failed for camera %s: %s", camera_id, e)

    # --- Missing persons -----------------------------------------------------------
    def get_active_missing_persons(self):
        data = self._request("GET", "/missing-persons?status=missing")
        return data["missingPersons"]

    def report_match(
        self,
        missing_person_id,
        camera_id,
        confidence,
        snapshot_url=None,
        face_detection_score=None,
        local_feature_score=None,
        ssim_score=None,
        final_confidence=None,
        match_label=None,
    ):
        return self._request(
            "POST",
            f"/missing-persons/{missing_person_id}/matches",
            json={
                "camera_id": camera_id,
                "confidence": confidence,
                "snapshot_url": snapshot_url,
                "face_detection_score": face_detection_score,
                "local_feature_score": local_feature_score,
                "ssim_score": ssim_score,
                "final_confidence": final_confidence,
                "match_label": match_label,
            },
        )["match"]

    def update_missing_person_validation(self, missing_person_id, status, reason=None):
        """Reports whether a missing person's reference photo actually
        passed validate_reference_photo() (see face_matcher.py) — 'ok'
        clears any earlier rejection (e.g. the reporter uploaded a better
        photo since), 'rejected' records the specific reason so the
        mobile app can show the reporter something actionable instead of
        the photo just silently never being used for matching."""
        self._request(
            "PATCH",
            f"/missing-persons/{missing_person_id}/validation",
            json={"status": status, "reason": reason},
        )

    def get_missing_person_matches(self, missing_person_id):
        return self._request("GET", f"/missing-persons/{missing_person_id}/matches")["matches"]

    # --- Alerts (used by the SOS module, source='camera_ai') -----------------------
    def create_camera_alert(self, category, description, lat, lng, address=None, photo_url=None):
        return self._request(
            "POST",
            "/alerts",
            json={
                "source": "camera_ai",
                "category": category,
                "description": description,
                "lat": lat,
                "lng": lng,
                "address": address,
                "photo_url": photo_url,
            },
        )

    # --- Uploads ---------------------------------------------------------------------
    def upload_file(self, file_path):
        """Uploads a local file (e.g. a matched frame snapshot) and returns its URL."""
        mime_type = mimetypes.guess_type(file_path)[0] or "image/jpeg"
        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f, mime_type)}
            resp = self.session.post(f"{config.API_URL}/uploads", headers=self._headers(), files=files, timeout=30)
        resp.raise_for_status()
        return resp.json()["url"]


api_client = ApiClient()
