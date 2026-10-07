"""Small geocoding helpers for alert messages.

The service should still work without internet, so failures return None
instead of blocking SOS creation or direct SMS/email backup alerts.
"""
import logging

import requests

from .config import config

log = logging.getLogger("rescuewave_ai.geocoder")


def geocode_address(address: str):
    if not config.GEOCODER_ENABLED or not address:
        return None
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": config.GEOCODER_USER_AGENT},
            timeout=config.GEOCODER_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        log.info("Geocoding failed for %r: %s", address, e)
        return None


def reverse_geocode(lat, lng):
    if not config.GEOCODER_ENABLED or lat is None or lng is None:
        return None
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "zoom": 18},
            headers={"User-Agent": config.GEOCODER_USER_AGENT},
            timeout=config.GEOCODER_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("display_name") or None
    except Exception as e:
        log.info("Reverse geocoding failed for %s,%s: %s", lat, lng, e)
        return None
