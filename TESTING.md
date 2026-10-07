# RescueWave — Testing Checklist (final-audit Phase 19)

None of this was run from the environment this audit was performed in —
no camera, no phone, no microphone, no persistent network to a live
deployment. What COULD be verified from here (compilation, type
-checking, a live backend boot, database migrations against real SQLite
files, and unit-level logic checks) was — see each subproject's own
README for exactly what and the actual commands/output. This document is
the checklist for the parts that need real hardware/devices, which is
most of the actual user-facing behavior.

Check items off as you run them. Where something fails, note the actual
error next to it — don't just re-check a box.

## Authentication

- [ ] Register a new account (mobile)
- [ ] Login with correct credentials
- [ ] Login with an incorrect password — should fail with a clear error, not crash
- [ ] Logout — token cleared, protected screens redirect to Login
- [ ] Open a protected route (e.g. `/alerts`) with an expired/invalid token — should redirect to Login, not show stale/empty data silently
- [ ] Admin dashboard: same login flow, using an account promoted via `admin-cli.js make-admin`
- [ ] Admin dashboard: log in as a NON-admin account — should be rejected, not shown an empty dashboard

## Missing Person — reporting

- [ ] Submit a report with a valid single-face photo
- [ ] Submit a report with a photo containing NO face — confirm you get a specific rejection reason, not a silent failure or a generic error (see `ai-service/rescuewave_ai/face_matcher.py: validate_reference_photo()` — this validation currently runs when the AI service next refreshes its reference set, not synchronously at upload time; see the root README's Known Limitations for why)
- [ ] Submit a report with a photo containing MULTIPLE faces — same check
- [ ] Submit a report with a blurry photo — same check
- [ ] Submit a report with a very dark photo — same check
- [ ] Submit a report with a heavily-angled/rotated face — same check

## Missing Person — CCTV matching (needs ai-service running against a real or test stream)

- [ ] A registered missing person's face appears on a camera the AI service is watching — confirm a potential match is eventually reported (allow for `FACE_MATCH_CONSECUTIVE_FRAMES` × `FACE_MATCH_POLL_SECONDS` — several seconds by default, not instant)
- [ ] A different, non-matching person appears on camera — confirm NO match is reported
- [ ] MULTIPLE people appear in frame at once, one of them the missing person, standing further back/smaller than the others — confirm the missing person still gets compared and matched (this is the specific Phase 3.2 fix; a bystander with a more prominent face should not crowd them out)
- [ ] The same match keeps appearing frame after frame — confirm only ONE alert/report is raised, not one per frame (temporal confirmation + cooldown — `FACE_MATCH_CONSECUTIVE_FRAMES` / `FACE_MATCH_COOLDOWN_SECONDS`)
- [ ] Admin dashboard → Missing Persons → a case with a reported match → "View AI Sightings" → confirm the match appears with camera name, similarity, timestamp
- [ ] From that panel: "Mark as Verified" → confirm the badge updates and persists after a page refresh
- [ ] "Reject Match" → same check
- [ ] "Mark as Confirmed Sighting" → same check, and confirm the missing person's own case `status` did NOT automatically change to "found" (that's a separate, deliberate admin action — see the root README)

## CCTV cameras

- [ ] Register a camera with a valid stream URL (or `webcam:0` for a local test) — confirm it appears in "My Cameras" and the admin Cameras page
- [ ] Register a camera with an invalid/unreachable stream URL — confirm the AI service logs a clear connection failure and keeps retrying rather than crashing
- [ ] Start the AI service against a registered camera — confirm `ai_status` flips to "connected" and `ai_last_seen_at` updates, in both the mobile app's My Cameras screen and the admin Cameras page (they should never disagree — both read the same heartbeat)
- [ ] Stop the camera's actual video source while the AI service keeps running — confirm the dashboard eventually shows it as stale/offline again (not permanently stuck "Active")
- [ ] Stop the AI service entirely — confirm both mobile and admin show the camera as not actively monitored after the heartbeat goes stale (default: 2 minutes)
- [ ] Restart the AI service — confirm heartbeat resumes without needing to re-register the camera

## SOS / emergency detection

- [ ] Manual SOS from the mobile app — confirm it appears in Alert History and (if a Helper is set up) triggers a push notification
- [ ] Perform a supported gesture (open palm / fist / Universal Signal for Help / the 4-step SOS sequence) in front of a camera the AI service is watching — confirm a `source: 'camera_ai'` alert is raised, and its description includes the threat-score breakdown (e.g. `Threat Score 40/100 (MEDIUM) — Gesture 40/40`)
- [ ] Say a trigger word ("help", "emergency", etc. — see `VOICE_KEYWORDS` in `voice_detector.py`) near a camera with `VOSK_MODEL_PATH` configured — confirm an alert is raised
- [ ] With an emotion model configured, show a distressed expression WITHOUT any gesture or voice trigger — confirm NO alert is raised (emotion alone is capped at `THREAT_WEIGHT_EMOTION` points, below the default 40-point alert threshold, by design — see `ai-service/rescuewave_ai/sos/threat_score.py`)
- [ ] Combine two weaker signals (e.g. voice + distress emotion) that individually wouldn't cross the threshold — confirm they DO combine to trigger an alert if their sum crosses `THREAT_SCORE_ALERT_THRESHOLD`
- [ ] Trigger the same gesture repeatedly within the cooldown window (`SOS_COOLDOWN_SECONDS`) — confirm only one alert is raised, not one per detection
- [ ] SOS with location services denied/unavailable — confirm the app handles this without crashing (check what actually gets sent as the alert's location)
- [ ] Assign a Helper to an SOS — confirm status progresses through the mission lifecycle and the reporter sees live updates
- [ ] Assign an Authority to the same SOS — confirm both tracks can progress independently (see the root README's note on why Helper/Authority are modeled as two separate tracks)
- [ ] Resolve/close an alert — confirm its status updates everywhere it's shown (mobile, admin)

## Settings & Help / Support (Phase 5)

- [ ] Settings → Log Out — confirmation dialog appears; confirming clears the stored auth token, unregisters the push token, and returns you to Login; the back button from Login must not reveal any protected screen
- [ ] Settings → Log Out — cancel the dialog, confirm you're still logged in and nothing was cleared
- [ ] Settings → Clear Local Data — confirmation dialog explicitly names what's removed (contacts, alert history, missing-person records, notifications) and states your account/server-synced data is unaffected; confirming actually empties those local tables and the relevant screens show their empty states afterward
- [ ] Settings → notification toggle — turning it off actually stops local SOS/notify calls from producing a system notification; turning it on requests OS notification permission if not already granted
- [ ] Settings → Change Password — wrong current password shows an inline error, not a crash; success closes the modal and both fields clear
- [ ] Help & Support → each FAQ expands/collapses on tap
- [ ] Help & Support → Email Support opens the device's mail composer addressed to support@rescuewave.app
- [ ] Help & Support → Call Emergency Services dials 112 (matches the number used on the SOS screen and Home quick-dial — all three now read from one shared constant)
- [ ] Help & Support → offline FAQ correctly distinguishes what's viewable offline (contacts, already-saved local records) from what needs a connection (SOS Helper notification, missing-person sync to Police/AI matching, login, profile sync)
- [ ] About RescueWave → offline claim matches the same local-vs-server distinction as the Help & Support FAQ

## Admin dashboard — general

- [ ] Alerts page: filter by status, source (`manual_sos` / `citizen_report` / `camera_ai`), category — confirm results actually narrow, and a `camera_ai` alert's full description (including any threat-score breakdown) is visible
- [ ] Cameras page: confirm the map renders real camera pins, and clicking one shows the same AI status as the table below it
- [ ] AI Monitoring page: confirm Voice/Emotion module status shows "Not reported" (not a false "Offline") until at least one active camera's AI service has sent a heartbeat with that flag included — see `ai-service/main.py`'s heartbeat call
- [ ] Helpers/Authorities: approve and reject an application from the dashboard — confirm it has the identical effect as doing the same thing via `admin-cli.js` (same underlying endpoint)
- [ ] Analytics: confirm every number shown corresponds to something you can independently verify by counting real records — there should be no "AI Accuracy" metric anywhere, by design (see Phase 12 of the audit prompt this checklist comes from)

## Notes for whoever runs this

- Several items above need `ai-service/` actually running against a real camera (or `webcam:0`) with `insightface`/`ultralytics`-class dependencies installed — see `ai-service/README.md`'s setup section.
- Voice/emotion tests need `VOSK_MODEL_PATH`/`EMOTION_MODEL_PATH` configured — both are optional and the system should degrade gracefully (not crash) if left unset. Testing "it degrades gracefully" IS a valid test on its own even without those models.
- If any checklist item fails, please note the exact error/behavior rather than just marking it failed — several of the fixes in this audit pass were themselves found by looking closely at what an error actually said, not just that one occurred.
