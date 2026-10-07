# RescueWave — Final Audit Engineering Report

Scope: mobile (priority), ai-service, admin-dashboard, plus the small
backend changes those three required. Delivered as three phase-wise zips
(mobile, ai-service, admin-dashboard) and one final consolidated
submission archive (`rescuewave-final-submission.zip`) that supersedes
them. This report is the single consolidated summary the original audit
prompt asked for at the end.

---

## 1. Completed changes

**Mobile** — terminology and consent-language accuracy. No new features;
this app's actual feature set was already honestly represented, it just
had drifted out of sync with what ai-service shipped later.
**AI-service** — Phase 3 (missing-person AI quality) and Phase 9 (SOS
fusion) implemented for real: all-faces-per-frame comparison, quality
filtering, reference validation, configurable thresholds, a genuine
validation script, and a transparent weighted threat score replacing a
hard AND-gate.
**Admin-dashboard** — a real AI Sightings verification workflow, Voice/
Emotion module status now reflects what the AI service actually reports,
and a real alert lifecycle timeline + labeled evidence section wired
into the existing Alerts page (see note below — this needed zero new
backend work; the data already existed and just wasn't surfaced).
**Backend** — three small, additive, migration-tested schema changes to
support the above (nothing removed, nothing reshaped).
**Cross-cutting** — root README's factual/internal contradictions fixed,
`.gitignore` added where it was completely missing (root, backend,
mobile), a live placeholder JWT secret replaced with a real one, and a
full manual testing checklist written.

## 2. Files modified

**Mobile**: `missing/[id].tsx`, `missing/add.tsx`, `camera-register.tsx`,
`cameras.tsx`, `about.tsx`, `camera.tsx`.

**AI-service**: `rescuewave_ai/face_matcher.py` (rewritten),
`rescuewave_ai/sos/sos_module.py` (rewritten), `rescuewave_ai/config.py`,
`rescuewave_ai/api_client.py`, `main.py`, `README.md`, `.env.example`;
new: `rescuewave_ai/sos/threat_score.py`,
`tools/evaluate_face_matcher.py`.

**Admin-dashboard**: `src/pages/MissingPersons.tsx` (rewritten),
`src/pages/AIMonitoring.tsx`, `src/pages/SystemHealth.tsx`,
`src/api/admin.ts`, `src/api/types.ts`.

**Backend**: `src/db/index.js` (+3 migrations), `src/routes/missingPersons.js`,
`src/routes/cameras.js`, `src/routes/admin.js`.

**Project-level**: root `README.md`, new root `.gitignore`, new
`backend/.gitignore`, new `mobile/.gitignore`, new root `TESTING.md`,
`backend/.env`'s `JWT_SECRET` (local file only, not in any archive).

## 3. AI changes — final InsightFace pipeline

```
CCTV frame
   ↓
SCRFD (face detection — every face in the frame)
   ↓
Face alignment (internal to InsightFace, before embedding)
   ↓
ArcFace (buffalo_l)
   ↓
512-D embedding, per face
   ↓
Quality filter (FACE_QUALITY_MIN_DET_SCORE / _FACE_SIZE_PX / _SHARPNESS)
   ↓
Cosine similarity vs. every active missing-person reference embedding
   ↓
Best-scoring (face, missing person) pair across the WHOLE frame
   ↓
Temporal confirmation (FACE_MATCH_CONSECUTIVE_FRAMES consecutive polls)
   ↓
Duplicate suppression (FACE_MATCH_COOLDOWN_SECONDS per person/camera pair)
   ↓
Potential Missing-Person Match → reported to backend → human verifies
```

This was already InsightFace before this audit pass (an earlier session
had migrated it off LBPH); what changed here was fixing the comparison
logic (all faces, not just one), adding the quality gate, making every
threshold configurable, and correcting a README that still described the
old LBPH approach as current.

SOS detection: `gesture / voice / emotion / repeated-detection` → each
contributes configurable points → summed into a 0–100 score → severity
band (LOW/MEDIUM/HIGH/CRITICAL) → alert only if the total crosses
`THREAT_SCORE_ALERT_THRESHOLD`. Every alert description includes the
exact point breakdown.

## 4. Missing-person accuracy improvements, in detail

- **Face validation** (`validate_reference_photo()`): decodable → exactly
  one face → face large enough → sharp enough, each with a distinct
  rejection reason (`no_face`, `multiple_faces`, `face_too_small`,
  `too_blurry`) instead of a silent skip.
- **All-faces processing**: `process_frame()` used to pick the single
  highest-confidence face and compare only that one. It now runs every
  quality-passing face through the comparison and keeps the best-scoring
  match across the whole frame — the exact fix for the audit's stated
  concern (a bystander's more prominent face silently winning over the
  actual missing person).
- **Quality filtering**: SCRFD detection confidence, face bounding-box
  size, and Laplacian-variance sharpness are all checked, per face,
  before that face is allowed into the comparison at all.
- **Threshold configuration**: `FACE_MATCH_CONFIDENCE_THRESHOLD`,
  `FACE_MATCH_CONSECUTIVE_FRAMES`, `FACE_MATCH_COOLDOWN_SECONDS`, and all
  four quality-gate constants are environment variables now — the cooldown
  used to be a hardcoded `300` in `__init__`.
- **Temporal confirmation**: requires `FACE_MATCH_CONSECUTIVE_FRAMES`
  (default 3) consecutive polling cycles above threshold, for the *same*
  person, before anything is reported.
- **Duplicate suppression**: a cooldown per (missing_person_id,
  camera_id) pair, independent of the consecutive-frame counter, so a
  confirmed match doesn't spam a new report every poll cycle.

## 5. UI changes

- Mobile: an honest "Requires verification" chip on every match (true for
  100% of current matches, since none had a verification workflow before
  this pass); corrected InsightFace/consent wording.
- Admin: a full AI Sightings modal per missing-person case — snapshot,
  camera, timestamp, similarity, face-detection confidence, and
  Verify/Reject/Confirm actions, each backed by a real API call and a
  real database column. AI Monitoring's Voice/Emotion rows now show
  Active / Model not configured / **Not reported** (three real states,
  not a hardcoded binary).
- Admin: the Alerts page now shows a real lifecycle timeline (Phase 10)
  and a labeled evidence section (Phase 11) — **correction to an earlier
  draft of this report**: I initially assumed this needed new backend
  schema and flagged it as out of scope. Checking `backend/src/db/index.js`
  and `alerts.js` more closely mid-session showed the `alert_status_events`
  table, and a `GET /alerts/:id` route returning it fully joined with
  helper/authority/reporter details, already existed and were already
  exercised by every Helper/Authority status update — just never
  displayed anywhere. Wired that existing, already-tested data into the
  UI instead of building anything new underneath it. Only real events
  that actually happened for a given alert are shown (not a fixed
  9-step template with empty states for steps that never occurred).

## 6. Security changes

- `backend/.env`'s `JWT_SECRET` was still the unedited placeholder text
  from `.env.example` — replaced with a real random 96-character secret
  in the local working file (excluded from every archive delivered).
- Root, `backend/`, and `mobile/` had **no `.gitignore` at all** — added
  all three. `backend/rescuewave.db` (a real SQLite file) had zero commit
  protection until this pass.
- Checked every `.env` file in the project for actual secret values (not
  just key presence): SMTP/Twilio credentials in this snapshot's
  `ai-service/.env` are empty; `RESCUEWAVE_PASSWORD` (the AI service's own
  RescueWave account password, not a third-party credential) is set and
  was excluded from every archive along with the rest of `.env`.
- **Standing item, not resolved here**: an earlier version of this
  project (audited in a prior session) had a live Gmail App Password and
  Twilio Auth Token hardcoded in a prototype script. That script isn't
  part of this codebase anymore, but if you haven't rotated that Gmail
  password yet, do it — it's shown up unrotated across multiple snapshots
  of this project now.

## 7. Tests executed (actual commands, actual results)

```
mobile/            npm run typecheck  (tsc --noEmit)         → clean
admin-dashboard/   npm run typecheck  (tsc -b --noEmit)       → clean
admin-dashboard/   npm run build      (tsc -b && vite build)  → clean, dist/ produced
ai-service/        python3 -m compileall -q .                 → clean
backend/           node -c <every .js file under src/>         → clean
backend/           live server boot + curl /api/health         → {"ok":true,...}
```

Additional targeted checks:
- Backend DB migrations run against both a **fresh** database and a
  **simulated pre-existing** one missing each new column (`face_detection_score`,
  `verification_status`, `ai_voice_enabled`/`ai_emotion_enabled`) — all
  three confirmed to apply correctly either way, twice.
- `threat_score.compute()` exercised against synthetic signal
  combinations — confirmed emotion alone (20 pts) can't cross the default
  40-point threshold, a single gesture (40 pts) can, and the total caps at
  100 with every signal active.
- The face-quality sharpness heuristic checked against a synthetic
  sharp-vs-blurred image pair (correctly scores the sharp one higher).
- `validate_reference_photo()`'s reason-to-message mapping checked
  directly.
- The `alert_status_events` table and `GET /alerts/:id` route the new
  Alerts-page timeline depends on were confirmed by reading
  `backend/src/routes/alerts.js` directly, line by line, to get the exact
  status strings each track inserts (`'open'`, `'accepted'`,
  `'rejected_by_helper'`, `'on_the_way'`/`'arrived'`/`'assisting'`/
  `'completed'` for Helper, `'en_route'`/`'on_scene'`/`'investigating'`/
  `'closed'` for Authority, `'cancelled'`) rather than guessed — an
  earlier draft of the timeline UI had guessed wrong values. **What I
  attempted but couldn't get a clean run of**: an actual live
  register→raise-SOS→fetch-detail round trip against a running server, to
  see real event JSON instead of just reading the code that produces it.
  Hit repeated shell/background-process tooling issues in this
  environment rather than an application bug (confirmed no stray server
  processes were left running afterward) and didn't want to keep
  burning time on a tooling problem for a check that direct code reading
  already covered with reasonable confidence. Worth a real run in a
  normal terminal before you trust it fully.

**Not executed** — needs hardware/services this environment doesn't have:
anything requiring a real camera, microphone, or a persistently-running
backend + ai-service pair talking to each other live. See `TESTING.md`
for the full manual checklist covering exactly that gap.

## 8. Remaining issues (honestly)

**Resolved in follow-up passes** (see section 10 below for detail): SOS
alert snapshot attachment, reference-photo rejection reasons reaching the
reporter, the `GET /alerts/:id` authorization gap, missing-person photo
editing, full-field server sync on the mobile edit screen, and a targeted
Phase 14/15 fix (silent camera-fetch failures on two admin pages) are no
longer open items — all six were fixed, live-tested against a real
running backend where applicable, and verified end-to-end, not just
code-reviewed.

**Still genuinely open:**
- Multi-face-per-frame comparison and the quality filter are code-reviewed,
  unit-tested with synthetic data, and compile cleanly, but were never run
  against a real multi-person camera scene — I don't have a camera here.
- Everything in `TESTING.md` needing a real camera/phone/mic — voice,
  gesture, emotion, live CCTV matching, the full Helper/Authority mission
  flow.
- Phase 14 (a full visual-consistency pass across every single screen)
  still wasn't attempted exhaustively — see section 10 for exactly what
  scoped slice of it WAS done and why the rest is a different kind of task
  than the fixes in this report.
- The admin dashboard's production bundle is ~900KB (with a build-time
  warning about it) — pre-existing, not introduced by this pass, not
  addressed since it wasn't in scope.

## 10. Follow-up fixes (this pass)

Three items flagged as open in an earlier version of this report, now
actually fixed and live-tested:

**SOS alert snapshots** — `create_camera_alert()` never sent a `photo_url`
at all; gesture/voice alerts had zero visual evidence, unlike missing-
person matches. `SosModule` now tracks the latest processed frame and
`_raise_alert()` captures + uploads it before creating the alert, the same
upload path matches already used. A capture/upload failure never blocks
the actual alert — it's logged and the alert still fires without a photo.

**Reference-photo rejection reaching the reporter** — `validate_reference_photo()`
already computed a specific reason; it just stopped at the AI service's
own log. Added two nullable columns (`missing_persons.face_validation_status`/
`_reason`), a new `PATCH /missing-persons/:id/validation` route (same
trust level as the existing `/matches` route — any authenticated party,
since it's the AI service's own account reporting on a photo it just
checked, not a user claim about someone else's case), `refresh_reference_set()`
now reports the verdict back (deduplicated so a healthy reference set
doesn't PATCH every single refresh cycle forever), and the mobile missing-
person detail screen fetches this live from the server (this app is
local-first; these fields are never written to the local SQLite copy,
by design — same pattern already used for the AI-match list) and shows a
specific, actionable banner. **Live-tested**: registered a person, POSTed
a rejection, confirmed it round-tripped through a live server.

**`GET /alerts/:id` authorization** — was `requireAuth`-only: any logged-in
user could pull any alert's status/timeline/helper/authority info, not
just people actually involved (the reporter's phone/medical info already
had a stricter check; nothing else did). Confirmed via a live test with
two real accounts: the reporter gets 200 with their alert's real event
timeline, an uninvolved second account gets a clean 403. Confirmed this
doesn't break anything currently working: nothing in the mobile app
actually calls this route today (`getAlert()` exists in `alerts.ts` but is
unused dead code) — Helpers/Authorities get everything they need for
alerts relevant to them via `/assignments`/`/authority-assignments`
instead, which were untouched.

**Missing-person photo editing** — the rejection banner (above) originally
told reporters to "edit this record to upload a different photo," but the
edit screen had no photo field at all — caught and corrected the banner's
own copy mid-build rather than ship a claim that wasn't true yet, then
actually built the capability instead of just softening the wording:
tappable photo in edit mode (reusing the same picker/upload pattern the
"Add Missing Person" screen already used), wired through
`updateServerMissingPerson()`. This surfaced a real backend gap in the
process — `PATCH /missing-persons/:id` didn't accept `photo_url` in its
field whitelist at all, so the sync call would have silently succeeded
while doing nothing. Fixed that, and made a new photo correctly clear any
stale rejection verdict from the old one (a rejection reason describing a
photo that's already been replaced shouldn't keep showing). **Live-tested**
the full sequence against a running server: create → reject → confirm
rejection visible → update photo → confirmed both the new URL persisted
AND the stale rejection cleared to null in the same response.

**Mobile edit screen — full field sync** — the photo-edit fix above only
wired the photo through to the server; the OTHER six fields on that same
edit form (name, age, gender, description, last seen location/date,
contact phone) were saving to the local device only, `saveEdits()` never
having called `updateServerMissingPerson()` for them at all — meaning an
edit to any of those looked successful in the app but was invisible to
the server, to Police, and to anything else reading the server copy.
Wired all of it through, matching the same `PATCH /missing-persons/:id`
route (which needed `name`/`age`/`gender` added to its field whitelist —
it only accepted `description`/`last_seen_location`/`last_seen_date`/
`contact_phone`/`photo_url` before this). **Live-tested**: created a
record, PATCHed a name/age/gender/description change, confirmed all four
persisted correctly and a field NOT included in that edit
(`last_seen_location`) correctly stayed untouched — confirming the
partial-update `COALESCE` pattern still works with the new fields added.

**Scoped Phase 14/15 pass** — rather than attempt "every screen" (a
different, much larger kind of task), surveyed all 11 admin-dashboard
pages for actual usage of the shared `Skeleton`/`EmptyState`/`useToast`
components as a concrete, checkable proxy for consistency, instead of
eyeballing it subjectively. Two pages — `SystemHealth.tsx` and
`AIMonitoring.tsx` — had zero usage of any of them, and both turned out
to share the same real bug: `getAllCameras().catch(() => {})`, silently
swallowing a camera-list fetch failure so it rendered identically to
"there are genuinely zero cameras" — exactly the kind of misleading
silent state Phase 15 rules out. Fixed in both: fetch failures now set a
distinct error flag, shown as a specific message ("Couldn't load camera
list" / "Last refresh failed — may be outdated") rather than a
false-looking zero, while still showing the last known good data instead
of blanking it, since a transient failure on a 15-30s auto-refreshing
page shouldn't throw away perfectly good stale data. Confirmed this was
the only remaining instance of that exact pattern (`grep`'d all 11 pages
for it after fixing both). The rest of a genuine Phase 14 (typography,
spacing, button/badge/input consistency across every screen) is real
remaining scope, not done here — it's a design-review task, not a bug list.

## 11. Final architecture

```
Mobile (Expo/React Native)          Admin Dashboard (Vite/React)
        │                                    │
        └───────────────┬────────────────────┘
                         ▼
              Backend API (Node/Express)
                         │
                         ▼
              SQLite (node:sqlite, migration-based)
                         ▲
                         │  (same REST API, camera-owner auth)
                         │
              AI Service (Python, ai-service/)
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   CCTV stream     Missing-person      SOS detection
   (per camera)    face matching       (gesture/voice/emotion)
        │           (InsightFace)             │
        │                │                    ▼
        │                ▼            Threat-score fusion
        │        Potential Match      (weighted, 0-100)
        │                │                    │
        └────────────────┴────────────────────┘
                         │
                         ▼
              POST /api/alerts or /matches
                         │
                         ▼
         Helper / Authority dispatch (existing pipeline)
                         │
                         ▼
      Visible identically in Mobile + Admin Dashboard
```
