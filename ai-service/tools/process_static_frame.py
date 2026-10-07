#!/usr/bin/env python3
import argparse
import logging
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, ROOT)
os.environ.setdefault("MPLCONFIGDIR", os.path.join(ROOT, ".matplotlib-cache"))
os.environ.setdefault("XDG_CACHE_HOME", os.path.join(ROOT, ".cache"))

import cv2

from rescuewave_ai.api_client import api_client
from rescuewave_ai.face_matcher import FaceMatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("process_static_frame")


def main():
    parser = argparse.ArgumentParser(description="Process still images through the RescueWave missing-person matcher.")
    parser.add_argument("images", nargs="+")
    parser.add_argument("--camera-id", required=True)
    parser.add_argument("--report", action="store_true", help="Insert any detected match into the backend.")
    args = parser.parse_args()

    matcher = FaceMatcher(api_client)
    matcher.refresh_reference_set()

    for image_path in args.images:
      frame = cv2.imread(image_path)
      if frame is None:
          log.error("Could not read %s", image_path)
          continue
      result = matcher.process_frame(frame, args.camera_id)
      if not result:
          log.info("No reportable match for %s", image_path)
          continue
      log.warning(
          "Potential match in %s: missing_person=%s similarity=%.3f face_detection=%.3f",
          image_path, result.missing_person_id, result.similarity, result.face_detection_score,
      )
      if args.report:
          snapshot_path = f"/tmp/rescuewave_static_match_{int(time.time())}.jpg"
          x, y, w, h = result.bbox
          annotated = frame.copy()
          cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 215, 255), 2)
          cv2.imwrite(snapshot_path, annotated)
          snapshot_url = api_client.upload_file(snapshot_path)
          match = api_client.report_match(
              result.missing_person_id,
              args.camera_id,
              result.similarity,
              snapshot_url=snapshot_url,
              face_detection_score=result.face_detection_score,
              local_feature_score=result.local_feature_score,
              ssim_score=result.ssim_score,
              final_confidence=result.final_confidence,
              match_label=result.label,
          )
          log.warning("Reported backend match: %s", match["id"])


if __name__ == "__main__":
    main()
