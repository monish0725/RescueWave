# RescueWave AI CCTV Service (Phase 7 — final audit)

A separate Python service — not part of the Node backend or the mobile
app — that does two things against a camera feed:

1. **Missing-person face matching**: compares faces seen in the feed
   against active missing-person reports, and reports a hit back to the
   backend (visible in the mobile app's missing-person detail screen and
   the admin dashboard).
2. **Gesture/voice/emotion SOS detection**: adapted from an earlier
   prototype script, raises a real RescueWave alert (same pipeline as the
   phone's SOS button) via a transparent weighted threat score (see
   "Threat score fusion" below) when it sees a distress gesture, hears a
   trigger word, or completes the 4-step SOS gesture sequence.

Both are genuinely real and were tested end-to-end against the actual
backend during development (real face detection, real InsightFace
matching, real alert creation) — not mocked. See "What's genuinely
tested" below for exactly what that means and its limits.

## What's new in the final audit (Phase 7)

Scoped to the audit's Phase 3 (missing-person AI) and Phase 9 (SOS fusion)
— no new AI models, no cross-camera tracking, nothing beyond what those
phases asked for:

- **3.1 Reference photo validation** — a missing-person reference photo is
  now checked (decodable, exactly one face, face large/sharp enough) with
  a specific rejection reason (`no_face`, `multiple_faces`, `face_too_small`,
  `too_blurry`) instead of a silent skip. See `validate_reference_photo()`
  in `face_matcher.py`. The AI service now reports that verdict back to
  the backend via `/api/missing-persons/:id/validation`, and both the mobile
  app and admin dashboard show the rejection reason so the reporter can
  upload a better reference photo.
- **3.2 All faces per frame** — `process_frame()` used to compare only the
  single highest-confidence face against the reference set. It now
  compares every quality-passing face and keeps the best match across the
  whole frame, so a bystander with a more prominent face can no longer
  crowd out the actual missing person.
- **3.3 Quality filtering** — each face is checked against
  `FACE_QUALITY_MIN_DET_SCORE` / `_MIN_FACE_SIZE_PX` / `_MIN_SHARPNESS`
  before being allowed into that comparison at all.
- **3.4 Fully configurable thresholds** — `FACE_MATCH_COOLDOWN_SECONDS`
  moved out of a hardcoded `300` in `__init__` into `.env`, alongside the
  quality thresholds above.
- **3.5 Validation script** — `tools/evaluate_face_matcher.py` computes
  genuine/impostor similarity distributions from your own labeled test
  photos and reports where the current threshold falls. It does not, and
  will not, print a fabricated accuracy percentage.
- **3.6 / 3.9 Temporal confirmation + duplicate suppression** — already
  implemented before this pass (`FACE_MATCH_CONSECUTIVE_FRAMES` +
  cooldown); unchanged, just confirmed still correct while touching this
  file.
- **3.7 Terminology** — "match" language throughout ai-service (logs,
  direct-alert emails, push notification text queued via the backend)
  now consistently says "potential match" / "requires verification",
  never "confirmed."
- **3.8 Match metadata** — `process_frame()` now returns a
  `FaceMatchResult` with `face_detection_score` and `bbox` alongside
  `similarity`, and that detection score is now actually persisted:
  `missing_person_matches.face_detection_score` is a new nullable column
  (migration verified against both a fresh DB and an existing one — see
  the backend's own migration list in `src/db/index.js`).
- **9. Threat-score fusion** — `sos_module.py` previously only ever
  alerted from a hard "gesture AND distress-emotion" gate: voice alone
  could never alert no matter how clear the trigger word, and a gesture
  with no emotion model configured could never alert either. It's now a
  transparent, configurable weighted score (`sos/threat_score.py`) —
  Gesture 40 / Voice 30 / Emotion 20 / Repeated-detection 10 by default,
  0-100 scale, LOW/MEDIUM/HIGH/CRITICAL bands — and an alert only fires
  once the total crosses `THREAT_SCORE_ALERT_THRESHOLD` (40 by default).
  Every alert description includes the exact breakdown, e.g. `Threat
  Score 70/100 (HIGH) — Gesture 40/40, Emotion 20/20, Repeated 10/10`, so
  it's inspectable wherever alert descriptions already render (mobile,
  admin) without needing new backend fields for this part.

None of this could be exercised against a live camera or a running
backend from the environment this was written in (no camera, no network
to a live backend instance). What WAS verified here: every file compiles
and imports cleanly, the threat-score fusion's actual point math was unit
-tested with synthetic inputs (confirms e.g. emotion alone genuinely can't
cross the default alert threshold), the face-quality sharpness heuristic
was checked against a synthetic sharp-vs-blurred image pair, and the new
database migration was tested against both a fresh database and a
simulated pre-3.8 existing one. "The wiring is correct" and "it performs
well on your specific cameras and lighting" remain different claims.

## ⚠️ About the original prototype script

If you're comparing this against an earlier script you had lying around:
that script had a **live Gmail App Password and a live Twilio Auth Token
hardcoded in plaintext**. Neither was carried into this service — every
credential here comes from your own `.env`, never from source. If those
original credentials haven't been rotated yet (Google Account → Security →
App Passwords; Twilio Console → rotate Auth Token), do that first — this
note is a permanent reminder, not a one-time nag.

## Setup

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt     # core: face matching + gesture SOS
cp .env.example .env
# edit .env: set RESCUEWAVE_EMAIL / RESCUEWAVE_PASSWORD to a real
# RescueWave account, and RESCUEWAVE_API_URL if your backend isn't on
# localhost:4000
```

For a quick local demo with the default `.env.example` values, create the
matching backend account and a `webcam:0` camera before starting the
service:

```bash
cd ../backend
node src/admin-cli.js ensure-ai-demo camowner@example.com change_me --camera
cd ../ai-service
```

That account must **own** whichever camera(s) you point this at — the
backend checks camera ownership on every heartbeat/match/alert call, the
same way it does for the mobile app. Register a camera first (from the
app's "Register CCTV Camera" screen, or `POST /api/cameras`), with a
Stream URL set under "Advanced" — `webcam:0` for your laptop's webcam is
the easiest way to try this out.

```bash
python main.py                      # auto-discovers this account's cameras with a stream configured
python main.py --camera-id <id>     # just one
python main.py --no-sos             # face matching only
python main.py --no-face-match      # SOS detection only
```

### Optional: voice and emotion detection

The core install (above) gets you face matching + gesture detection. Voice
and emotion detection are heavier and need extra setup:

```bash
pip install -r requirements-optional.txt
```

- **Voice**: also download a [Vosk model](https://alphacephei.com/vosk/models)
  (e.g. `vosk-model-small-en-us-0.15`) and point `VOSK_MODEL_PATH` at the
  extracted folder in `.env`.
- **Emotion**: needs an already-**trained** Keras model file. This service
  does not train one for you — that needs the FER2013 dataset (~35k
  labeled images) and real training time, which is its own separate
  project, not something a "detection service" should do inline. If you
  have a `.h5` model from training the original script's path yourself,
  point `EMOTION_MODEL_PATH` at it. Without one, the SOS module simply
  skips the emotion gate (gesture/voice alerts still fire; they're just
  not filtered by detected emotion).

Both degrade gracefully — the service logs "disabled" for whichever one
isn't configured and keeps running normally otherwise.

## How face matching works (and its real limits)

```
CCTV frame
   ↓
SCRFD               (face detection — every face in the frame, not just one)
   ↓
Face alignment       (handled internally by InsightFace before embedding)
   ↓
ArcFace (buffalo_l)
   ↓
512-D facial embedding, per face
   ↓
Quality filter        (detection confidence / face size / sharpness — see config)
   ↓
Cosine similarity vs. every active missing-person reference embedding
   ↓
Best-scoring (face, missing person) pair across the whole frame
   ↓
Temporal confirmation (N consecutive polling cycles above threshold)
   ↓
Duplicate suppression (cooldown per missing-person/camera pair)
   ↓
Potential Missing-Person Match  ← reported to the backend; a human still verifies it
```

Uses **InsightFace** — SCRFD for detection, ArcFace (`buffalo_l`) for
512-d embeddings — not a classical method (LBPH, or OpenCV's older Haar
cascades) and not a third-party service. This is the real, current
implementation; if you're reading an older description of this project
that mentions LBPH, that's describing a since-replaced approach, not what
runs today.

**Real numbers from development, not a marketing claim**: on the same
JPEG-recompression robustness test used to validate the earlier LBPH
attempt, LBPH's confidence dropped from a perfect same-image match (1.00)
to a false rejection (~0.00); ArcFace scored ~0.98 cosine similarity on
the same test. That's the actual reason for the migration, not a cosmetic
rename.

**What "AI Detection" does NOT mean here**: a similarity score above
threshold is a **potential match** — a lead worth a human looking at, not
proof of identity. It always requires several consecutive matching poll
cycles (temporal confirmation) before it's even reported, and every place
this surfaces — service logs, direct-alert emails, the mobile app's match
list, admin — says "potential"/"requires verification," never
"confirmed." There is no accuracy percentage claimed anywhere in this
service for the same reason Phase 12 of the audit prohibits one on the
analytics dashboard: no properly labeled ground-truth dataset exists to
compute one honestly. `tools/evaluate_face_matcher.py` exists to let you
generate a real, if project-scale, precision/recall picture from your own
test photos instead.

**Known real limits**: still meaningfully worse on low light, extreme
angles, heavy occlusion (masks, hoods), and low-resolution/far-away CCTV
crops than a well-lit portrait comparison — that's true of every current
face-recognition approach, not a shortfall specific to this codebase. The
quality filter (`FACE_QUALITY_MIN_*` in `.env`) exists specifically to
stop the worst of those cases (a tiny, blurry, low-confidence detection)
from being compared at all, rather than pretending they're reliable.

## What's genuinely tested vs. what needs your own verification

Tested end-to-end during development, with real code against a real
(temporary) backend instance:
- Face detection on a real photograph, InsightFace (SCRFD+ArcFace)
  embedding + cosine-similarity matching, including realistic degraded
  conditions (noise, JPEG recompression)
- The full pipeline via the actual `main.py` entrypoint: login → discover
  camera → load missing-person reference photo from the backend → open a
  video stream → detect + match a frame → upload the snapshot → report the
  match → confirm it landed correctly in the backend, camera name and all
- The AI heartbeat mechanism (`ai_last_seen_at`/`ai_status` flipping to
  "connected" only after a real successful frame read)
- Gesture detection logic (mediapipe hand landmarks) with synthetic
  landmark data proving the finger-counting and gesture-classification
  math is correct
- A gesture-triggered alert creating a real `source: 'camera_ai'` alert
  via the same endpoint the phone's SOS button uses

Additionally verified during this pass (final-audit Phase 3/9):
- `threat_score.compute()` against synthetic signal combinations —
  confirmed emotion alone (20 pts) can't cross the default 40-point alert
  threshold, confirmed a single gesture (40 pts) can, confirmed the score
  caps at 100 with every signal active
- The face-quality sharpness heuristic against a synthetic sharp-vs-
  blurred image pair (correctly scores the sharp one higher)
- The `face_detection_score` database migration against both a fresh
  database and a simulated pre-Phase-3.8 existing one — confirmed the
  column is added correctly either way

**Not tested here** (needs a real camera/microphone, which this
environment doesn't have): live webcam gesture recognition end-to-end,
voice detection against a real microphone, emotion detection against a
trained model (none was available to test with), and the new multi-face-
per-frame / quality-filtering logic in `face_matcher.py` against real
CCTV footage with multiple people in it — the logic was code-reviewed and
compiles cleanly, but "correctly picks the right face out of several real
faces" needs a real multi-person scene to actually confirm. The underlying
pieces (mediapipe Hands, Vosk, InsightFace, a Keras model) are all
standard, well-documented APIs used as documented — but "the wiring is
correct" and "it works well on your specific camera and lighting" are
different claims, and only the first one is something verifiable from
here.

## Architecture note

This mirrors the backend's own framing (see `backend/src/db/index.js`):
alerts this service raises use `source: 'camera_ai'`, exactly like a
manual SOS uses `source: 'manual_sos'`. Everything downstream — Helper/
Authority matching, push notifications, the admin dashboard, the mobile
app's alert screens — already handles that source with zero changes
needed. Face matches land in `missing_person_matches`, surfaced in the
mobile app's missing-person detail screen and ready for the admin
dashboard.

## Running as a long-lived service

`main.py` is a straightforward blocking loop, fine for a demo (`python
main.py` in a terminal, or under `screen`/`tmux`). For multiple cameras,
run one process per camera (`python main.py --camera-id <id>` in separate
terminals or systemd units) rather than threading them into one process —
keeps each camera's failure isolated and its OpenCV preview window
independent, which matters more for a demo than raw throughput.
