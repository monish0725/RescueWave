#!/usr/bin/env python3
"""
evaluate_face_matcher.py — genuine/impostor threshold validation
(final-audit Phase 3.5).

This does NOT compute or print an "accuracy percentage." Without a real
labeled dataset, that number would be invented. What it does instead:
given one reference photo and a folder of labeled test images, it
computes the actual cosine-similarity distribution for genuine matches
(same person) and impostor comparisons (different people), reports where
they land, and tells you whether FACE_MATCH_CONFIDENCE_THRESHOLD (from
your .env / config.py) currently sits somewhere that separates them
cleanly, overlaps, or is miscalibrated in an obvious direction. That's a
real, honest signal you can act on; a fabricated accuracy number is not.

USAGE
    python tools/evaluate_face_matcher.py \\
        --reference path/to/reference_photo.jpg \\
        --labels path/to/labels.csv

labels.csv format (one row per test image):
    filename,label
    same_person_different_lighting.jpg,genuine
    same_person_cctv_angle.jpg,genuine
    random_stranger.jpg,impostor
    similar_looking_person.jpg,impostor

Paths in `filename` are resolved relative to the labels.csv file's own
directory unless they're absolute.

WHAT THIS TESTS (per the audit's 3.5 spec):
    - Genuine matches: same person, reference vs. CCTV-like image —
      exercise this with real variation (JPEG recompression, different
      lighting/angle/distance/quality), not just a second identical copy
      of the reference photo.
    - Impostor tests: reference vs. different people, ideally including
      similar-looking ones — this is what actually stresses a threshold;
      testing only against very different-looking people will make any
      threshold look better than it is.

WHAT YOU NEED TO PROVIDE: real photos. This script has no test images
built in and will not fabricate a result if you give it too few.
"""
import argparse
import csv
import statistics
import sys
from pathlib import Path

import cv2
import numpy as np


def _load_face_app():
    from insightface.app import FaceAnalysis

    print("Loading InsightFace (buffalo_l)... first run downloads ~330MB.")
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(320, 320))
    return app


def _embed(app, path: Path):
    img = cv2.imread(str(path))
    if img is None:
        print(f"  ⚠️  could not read {path.name}, skipping")
        return None
    faces = app.get(img)
    if not faces:
        print(f"  ⚠️  no face detected in {path.name}, skipping")
        return None
    if len(faces) > 1:
        print(f"  ⚠️  {len(faces)} faces detected in {path.name} — using the highest-confidence one; "
              f"for a clean test, crop or choose an image with just one face")
    face = max(faces, key=lambda f: f.det_score)
    return face.normed_embedding


def _summarize(name: str, values: list):
    if not values:
        print(f"{name}: no samples")
        return None
    print(
        f"{name}: n={len(values)}  min={min(values):.3f}  max={max(values):.3f}  "
        f"mean={statistics.mean(values):.3f}"
        + (f"  stdev={statistics.stdev(values):.3f}" if len(values) > 1 else "")
    )
    return {"n": len(values), "min": min(values), "max": max(values), "mean": statistics.mean(values)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reference", required=True, help="Path to the reference photo (the missing person's uploaded photo, or a stand-in for testing)")
    parser.add_argument("--labels", required=True, help="Path to a labels.csv (see --help for format)")
    parser.add_argument("--threshold", type=float, default=None, help="Threshold to evaluate against (default: reads FACE_MATCH_CONFIDENCE_THRESHOLD from the ai-service .env/config)")
    args = parser.parse_args()

    reference_path = Path(args.reference)
    labels_path = Path(args.labels)
    if not reference_path.exists():
        sys.exit(f"Reference photo not found: {reference_path}")
    if not labels_path.exists():
        sys.exit(f"Labels file not found: {labels_path}")

    threshold = args.threshold
    if threshold is None:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from rescuewave_ai.config import config
        threshold = config.FACE_MATCH_CONFIDENCE_THRESHOLD
        print(f"Using FACE_MATCH_CONFIDENCE_THRESHOLD from config: {threshold}")

    app = _load_face_app()

    print(f"\nEmbedding reference photo: {reference_path.name}")
    reference_embedding = _embed(app, reference_path)
    if reference_embedding is None:
        sys.exit("Could not get a usable face from the reference photo — nothing to evaluate against.")

    genuine_sims, impostor_sims = [], []
    with open(labels_path, newline="") as f:
        rows = list(csv.DictReader(f))

    print(f"\nEvaluating {len(rows)} labeled test image(s)...")
    for row in rows:
        label = row["label"].strip().lower()
        if label not in ("genuine", "impostor"):
            print(f"  ⚠️  unrecognized label '{row['label']}' for {row['filename']} — expected 'genuine' or 'impostor', skipping")
            continue
        img_path = Path(row["filename"])
        if not img_path.is_absolute():
            img_path = labels_path.parent / img_path
        if not img_path.exists():
            print(f"  ⚠️  {img_path} does not exist, skipping")
            continue
        embedding = _embed(app, img_path)
        if embedding is None:
            continue
        sim = float(np.dot(reference_embedding, embedding))
        (genuine_sims if label == "genuine" else impostor_sims).append(sim)
        print(f"  {label:9s} {img_path.name:40s} similarity={sim:.3f}")

    print("\n--- Results ---")
    genuine_stats = _summarize("Genuine (same person)", genuine_sims)
    impostor_stats = _summarize("Impostor (different people)", impostor_sims)

    print(f"\nCurrent threshold: {threshold}")
    if genuine_stats and impostor_stats:
        false_negatives = sum(1 for s in genuine_sims if s < threshold)
        false_positives = sum(1 for s in impostor_sims if s >= threshold)
        print(f"  False negatives (genuine matches that would be MISSED at this threshold): {false_negatives}/{len(genuine_sims)}")
        print(f"  False positives (impostors that would INCORRECTLY match at this threshold): {false_positives}/{len(impostor_sims)}")

        if genuine_stats["min"] > impostor_stats["max"]:
            print(f"  The two groups don't overlap at all in this test set — any threshold between "
                  f"{impostor_stats['max']:.3f} and {genuine_stats['min']:.3f} separates them cleanly here.")
        elif genuine_stats["min"] <= impostor_stats["max"]:
            print("  The two groups OVERLAP in this test set — no single threshold will get both "
                  "false negatives and false positives to zero here. That's expected with real-world "
                  "photos; it's a reason to also keep FACE_MATCH_CONSECUTIVE_FRAMES > 1 (temporal "
                  "confirmation), not just to keep raising the threshold.")
    else:
        print("  Not enough labeled samples in both groups to say anything meaningful — "
              "add more genuine and impostor test images and re-run.")

    print(
        "\nThis is a threshold validated using this project's own test cases — NOT a general accuracy "
        "claim, and not something to report as an 'accuracy percentage' without a much larger, properly "
        "curated labeled dataset than any single run of this script is likely to have."
    )


if __name__ == "__main__":
    main()
