# RescueWave — National Safety Platform (Mobile App + Backend)

A personal safety companion app: Emergency SOS, emergency contacts, nearby
hospitals/police/fire stations, alert history, a notification center,
missing person reports (with photo), a first-aid medical guide, and a
profile with medical info — built to work **fully offline**, with a small
backend that only handles account login/signup.

The **Disaster** module from the original prototype has been excluded, as
requested. Camera-based AI detection (fall/gesture recognition, CCTV
integration) is intentionally **not implemented yet** — the Camera screen
gives a real, working camera preview and is structured so that module can be
plugged in later without reworking the app.

## Build roadmap (this is a multi-phase rebuild toward the full vision)

The full brief — Helpers module with live tracking, Authorities module,
in-app map routing, CCTV registration, missing-person face-embedding
pipeline, a separate Admin web dashboard — is too large to build honestly
in one pass without shipping half-wired screens. It's being built in
phases, each fully real before moving to the next:

- [x] **Phase 1 — Identity & UX overhaul** (this drop): new "National
      Safety Platform" design system (navy/crimson/gold), animated splash
      screen, redesigned Login/Signup with brand hero + social login entry
      points (honestly labeled "coming soon" — no fake auth), Home rebuilt
      as a real Emergency Dashboard (safety preparedness score, nearby
      shortcuts, emergency contacts widget, live stats, recent alerts).
- [x] **Phase 2 — Helpers module + live location**: Helper
      application/admin-review workflow, real Expo push notifications,
      server-side SOS dispatch to nearby available Helpers, full mission
      lifecycle (accept → on the way → arrived → assisting → completed),
      live location sharing (background) for both an active Helper mission
      and "Send Live Location" to an emergency contact via SMS, with a
      public no-login tracking page.
- [x] **Phase 3 — Authorities module + Report Incident overhaul** (this
      drop): Police/Hospital/Fire registration + admin review, an
      independent "Authority track" on every alert (a Helper and an
      Authority can both be engaged on the same SOS at once — see
      `backend/src/db/index.js` for why that's modeled as two separate
      tracks), case lifecycle (accept → en route → on scene → investigating
      → closed), category-based routing (medical→hospital, fire→fire
      dept, else→police). Report Incident rebuilt with the full category
      set (theft/harassment/accident/violence/fire/medical/suspicious
      activity/other) and real photo/video/voice-note evidence, uploaded to
      the backend's own disk storage (`backend/uploads/`, no paid cloud
      storage configured) and synced as a server-side report so
      Authorities (and, later, the Admin Dashboard) can see it. Push
      notifications now deep-link on tap — a Helper's "Emergency nearby"
      opens the assignments list, a reporter's "Helper/Authority update"
      opens that alert's status page (see `routeForNotification` in
      `app/(app)/_layout.tsx`).
- [x] **Phase 4 — Safe Route, CCTV registration, Missing Person prep**
      (this drop): in-app point-to-point routing on a real map
      (`react-native-maps` + OSRM for the path + Nominatim for destination
      search — no Google Maps subscription, you never leave the app), with
      a **Safety Score that's an honest infrastructure-proximity metric**
      (% of the route within 1.5km of a real police station or hospital,
      from live OpenStreetMap data) rather than a fabricated crime/AI risk
      number RescueWave has no data source for — street lighting and crowd
      level are shown as "not available yet" instead of invented. CCTV
      camera registration + management screens (name/address/GPS/indoor-
      outdoor/direction/coverage/Terms acceptance), clearly labeled
      "AI network: not yet connected" — registration only, no footage
      access. Missing Person reports gained a search radius field, GPS
      capture for last-seen location, and now sync to the backend (nearby
      Police get notified) with a `face_embedding_status` field that stays
      `pending` until a real face-recognition service exists — no fake
      embedding vector is generated.
- [x] **Phase 5 — Admin Web Dashboard** (this drop): a separate Vite +
      React + TypeScript app (`admin-dashboard/`) — Dashboard with live
      stats/trend/category charts and a real alert-location heatmap, Live
      Alerts & Reports (with evidence links), Users, Helper/Authority
      application review, CCTV registry with a map, Missing Persons, and
      System Health. Calls the exact same backend endpoints
      `admin-cli.js` uses, so approving an application from the dashboard
      or the terminal has identical effect.
- [x] **Phase 6 — AI CCTV Service** (this drop): a separate Python service
      (`ai-service/`, per "the AI runs on a separate Python server" from
      the original brief) doing two real things — missing-person face
      matching against camera feeds (InsightFace: SCRFD detection + ArcFace
      embeddings; see `ai-service/README.md`), and gesture/voice/emotion
      SOS detection adapted from an early prototype script, now raising
      real alerts through the existing dispatch pipeline
      (`source: 'camera_ai'`) instead of its own separate email/SMS.
      **Note**: that prototype script had a live Gmail App Password and
      Twilio Auth Token hardcoded in plaintext — neither was carried
      forward; rotate both if you haven't already.
- [x] **Phase 7 — Final audit** (this drop): a correctness/reliability
      pass across all four codebases, not new features. Missing-person AI:
      every quality-passing face in a frame is now compared (not just the
      most prominent one), reference photos are validated with a specific
      reason on rejection, all thresholds are env-configurable, and
      `tools/evaluate_face_matcher.py` gives you a real genuine/impostor
      threshold read from your own test photos instead of an invented
      accuracy number. SOS detection: replaced a hard "gesture AND
      emotion" gate with a transparent weighted threat score (see
      `ai-service/rescuewave_ai/sos/threat_score.py`) — voice alone can
      now alert if it's strong enough; emotion alone still can't. Admin
      dashboard: a real AI Sightings panel per missing-person case
      (Verify/Reject/Confirm actions — never set by the AI itself), and
      Voice/Emotion module status now reflects what the AI service
      actually reports via heartbeat instead of a hardcoded "off." Mobile:
      fixed camera-registration consent copy that had drifted out of sync
      with Phase 6 shipping (it still claimed footage is never accessed,
      which stopped being true the moment Phase 6 added `stream_url`).
      Three small, additive, migration-tested DB columns support this
      (`missing_person_matches.face_detection_score` /
      `.verification_status`, `cameras.ai_voice_enabled` /
      `.ai_emotion_enabled`) — no existing column changed shape, nothing
      removed.

## Architecture

```
rescuewave/
  backend/          Node.js + Express + SQLite (node:sqlite) + JWT
                     Auth, and the shared source of truth for anything more
                     than one person needs to see: SOS/report dispatch to
                     Helpers & Authorities, live location sharing, the CCTV
                     camera registry, and missing person records.
  mobile/            Expo (React Native + TypeScript) — Expo Router + NativeWind
                     Personal data (contacts, medical guide, settings, and a
                     full local copy of every alert/missing-person record)
                     lives in an on-device SQLite database via expo-sqlite,
                     so the app works with zero network access. SOS,
                     reports, and missing persons additionally sync to the
                     backend when there's connectivity, since Helpers,
                     Authorities and other family members need to see them.
  admin-dashboard/   Vite + React + TypeScript — a separate desktop web app,
                     not part of the mobile bundle, for admins to review
                     applications and monitor the network.
  ai-service/        Python — a separate service (per the original brief:
                     "the AI runs on a separate Python server") that reads
                     camera frames and talks back to the backend over the
                     same API everything else uses. Never embedded in the
                     mobile app or the backend process itself.
```

Why split it this way: the brief asked for the mobile app to be **fully
usable offline** for personal data, while Helper/Authority dispatch and
shared safety records inherently need a server both sides can see. The
Admin Dashboard is genuinely separate per the brief — it isn't a hidden
mobile screen, it's its own app hitting the same API.

## 1. Run the backend

```bash
cd backend
cp .env.example .env      # already done for you, but keep this in mind if you reset the project
npm install
npm start                  # http://localhost:4000
```

Health check: `curl http://localhost:4000/api/health`

There's no seed data — sign up for a new account from the app's Register
screen the first time you run it.

### Connecting the mobile app to the backend

`localhost` on your **phone** (Expo Go) is the phone itself, not your
computer. Find your computer's LAN IP (e.g. `192.168.1.24`) and set it in
`mobile/app.json`:

```json
"extra": { "apiUrl": "http://192.168.1.24:4000/api" }
```

Your phone and computer need to be on the same Wi-Fi network. If you're
using an emulator instead of a physical device: the Android emulator can
reach your machine at `http://10.0.2.2:4000/api`; the iOS simulator can use
`http://localhost:4000/api` directly.

## 2. Run the mobile app (Expo Go)

This project targets **Expo SDK 54** — make sure the Expo Go app installed
on your phone is also on SDK 54 (Expo Go only runs projects matching its
own SDK version; open Expo Go and check Profile → Settings if unsure).

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (Android/iOS) to run it on your
phone, or press `a` / `i` in the terminal for an emulator/simulator.

First run: register an account (email + password, no OTP/email verification
per the brief), then explore Home → SOS, Nearby, Alerts, Missing Persons,
Contacts, Medical Guide, Profile.

### Notes on real device permissions

- **Location** — used for SOS alerts and Nearby search. Grant "While Using
  the App" when prompted.
- **Notifications** — local notifications fire for SOS, missing person
  additions, and contact updates. Physical devices show these properly;
  the iOS Simulator doesn't render push/local notification banners the same
  way, so test this on Expo Go on a real phone if possible.
- **Camera / Photos** — used for missing-person photos and the phone's own
  Camera preview screen (no AI detection runs on the phone's own feed yet;
  registered CCTV cameras get real AI detection separately, see below).

## 3. Run the Admin Dashboard

```bash
cd admin-dashboard
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Log in with a RescueWave account that has admin access (grant the first
one via `node backend/src/admin-cli.js make-admin <email>`; promote others
from the dashboard's Users page after that). Full details in
`admin-dashboard/README.md`.

## 4. Run the AI CCTV service (optional)

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set RESCUEWAVE_EMAIL/PASSWORD to a real account
python main.py               # auto-discovers that account's cameras with a stream configured
```

For a quick local demo using the default `.env.example` credentials, create
the demo camera owner and a `webcam:0` camera first:

```bash
cd backend
node src/admin-cli.js ensure-ai-demo camowner@example.com change_me --camera
```

Register a camera with a Stream URL first (mobile app → "Register CCTV
Camera" → Advanced), `webcam:0` for a quick local test. Full details,
including the important note about credentials from an earlier prototype
script, in `ai-service/README.md`.

## What's real vs. what's a deliberate future hook

Per the brief ("no placeholder buttons, no fake screens, every button
works"), everything listed as a feature is fully wired to real data:

- **SOS**: real GPS capture + reverse geocoding, saved to local SQLite,
  fires a real local notification, shows in Alert History.
- **Nearby Hospitals/Police/Fire**: real results from the OpenStreetMap
  Overpass API (free, no API key) around your real current location, with
  working "Navigate" (opens Google Maps) and "Call" buttons.
- **Emergency Contacts, Missing Persons**: full CRUD (create/edit/delete),
  persisted in SQLite, missing-person photos via the real device camera or
  photo library.
- **Notification Center**: a real local log of everything that fired a
  notification, with read/unread state.
- **Medical Guide**: static, authored first-aid reference content (not
  "fake data" — it doesn't claim to be live).
- **Profile/Settings**: edits sync to the backend (name, phone, blood
  group, medical info), password change goes through the backend, "clear
  local data" and logout work for real.

The one deliberate exception is the **phone's own camera**, on the Camera
tab: it intentionally does NOT run fall/gesture/AI detection on the
phone's live feed. It's a real, working camera preview (permissions, live
viewfinder, front/back toggle) — not a fake screen — with a clearly
labeled panel explaining that phone-camera detection comes in a later
phase. See the comment at the top of `mobile/app/(app)/camera.tsx` for
exactly where to plug the model in later.

This is separate from **registered CCTV cameras** (My Cameras → Register
Camera), where AI detection is real and running today, via `ai-service/`
— see Phase 6/7 above. A camera owner opts in by providing a stream URL;
without one, that camera stays registration-only and no footage is ever
accessed, matching the terms shown at registration.

## Database schema (on-device, `mobile/src/db/database.ts`)

`contacts`, `alerts` (SOS + incident reports — SOS rows carry a
`server_alert_id` once dispatched to the backend), `missing_persons`,
`notifications`, `settings` — matches the tables asked for in the brief. A
`users` table isn't duplicated locally; the account record lives on the
backend and is cached in memory via `AuthContext`, with a SecureStore JWT.
Helper/mission/live-share data lives only on the backend (see below) since
it inherently involves more than one person.

## Backend API

Auth (unchanged from Phase 1):

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | name, email, password, phone? |
| POST | `/api/auth/login` | email, password |
| GET | `/api/auth/me` | current user (JWT required) |
| POST | `/api/auth/change-password` | currentPassword, newPassword |
| PATCH | `/api/users/me` | name?, phone?, blood_group?, medical_info? |

Helpers:

| Method | Path | Description |
|---|---|---|
| POST | `/api/helpers/apply` | Submit a Helper application |
| GET | `/api/helpers/me` | Your latest application + helper profile |
| PATCH | `/api/helpers/me/status` | available / busy / offline (approved helpers only) |
| POST | `/api/helpers/me/location` | Ping current lat/lng (approved helpers only) |
| GET | `/api/helpers/admin/applications?status=pending` | Admin: review queue |
| POST | `/api/helpers/admin/applications/:id/approve` | Admin: approve |
| POST | `/api/helpers/admin/applications/:id/reject` | Admin: reject |

Authorities (Police / Hospital / Fire):

| Method | Path | Description |
|---|---|---|
| POST | `/api/authorities/apply` | Submit an Authority (org) application |
| GET | `/api/authorities/me` | Your latest application + authority profile |
| POST | `/api/authorities/me/location` | Ping station lat/lng (approved authorities only) |
| GET | `/api/authorities/admin/applications?status=pending` | Admin: review queue |
| POST | `/api/authorities/admin/applications/:id/approve` \| `/reject` | Admin: review |

Alerts (server-side SOS + citizen reports + dual-track dispatch):

| Method | Path | Description |
|---|---|---|
| POST | `/api/alerts` | Raise an SOS or citizen report — routes to nearby Helpers and/or the relevant Authority type |
| GET | `/api/alerts/mine` | Your raised alerts |
| GET | `/api/alerts/assignments` | Helper: nearby open alerts + your current assignment |
| GET | `/api/alerts/authority-assignments` | Authority: cases matching your jurisdiction/type |
| GET | `/api/alerts/:id` | Full detail: timeline, assigned helper/authority, reporter (if involved) |
| POST | `/api/alerts/:id/accept` \| `/reject` | Helper responds to an assignment |
| POST | `/api/alerts/:id/status` | Helper updates mission status |
| POST | `/api/alerts/:id/authority/accept` | Authority accepts a case |
| POST | `/api/alerts/:id/authority/status` | Authority updates case status (incl. `closed`) |
| POST | `/api/alerts/:id/cancel` | Reporter cancels their own alert |

Live location sharing:

| Method | Path | Description |
|---|---|---|
| POST | `/api/live-shares` | Start a share (`helper_mission`, `authority_case` or `contact_share`) |
| POST | `/api/live-shares/:token/ping` | Post a location update |
| POST | `/api/live-shares/:token/stop` | Stop sharing |
| GET | `/share/:token` | **Public**, no login — live map page (Leaflet + OpenStreetMap, no API key) |

File uploads (photo/video/voice evidence):

| Method | Path | Description |
|---|---|---|
| POST | `/api/uploads` | Multipart upload (`file` field) → `{ url }`, served back from `/uploads/:filename` |

CCTV camera registry:

| Method | Path | Description |
|---|---|---|
| POST | `/api/cameras` | Register a camera you own (optional `stream_url` for the AI service) |
| GET | `/api/cameras/mine` | Your registered cameras |
| GET | `/api/cameras/mine/streaming` | Your cameras that have a `stream_url` set — used by `ai-service/` |
| GET | `/api/cameras/:id` | One camera's details |
| PATCH | `/api/cameras/:id` | Update details, active/inactive status, or `stream_url` |
| POST | `/api/cameras/:id/ai-heartbeat` | Called by the AI service on every successful frame read |
| DELETE | `/api/cameras/:id` | Remove a camera |

Missing persons:

| Method | Path | Description |
|---|---|---|
| POST | `/api/missing-persons` | Report a missing person — notifies nearby Police |
| GET | `/api/missing-persons/mine` | Your reports |
| GET | `/api/missing-persons?status=missing` | Public feed of active cases |
| PATCH | `/api/missing-persons/:id` | Update details or mark found (reporter only) |
| DELETE | `/api/missing-persons/:id` | Remove a report (reporter only) |
| POST | `/api/missing-persons/:id/matches` | AI service reports a camera face-match hit |
| GET | `/api/missing-persons/:id/matches` | Match timeline (reporter, admin, or a camera owner with a hit on it) |

Admin (used by `admin-dashboard/`, all admin-only):

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard summary counts |
| GET | `/api/admin/stats/categories` | Alert counts by category |
| GET | `/api/admin/stats/trend` | Alerts per day, last 14 days |
| GET | `/api/admin/users?role=&search=` | Browse all users |
| POST | `/api/admin/users/:id/make-admin` \| `/revoke-admin` | Grant/revoke admin |
| GET | `/api/admin/alerts?status=&source=&category=` | Every alert, filterable |
| GET | `/api/admin/cameras` | Every registered camera |
| GET | `/api/admin/missing-persons?status=` | Every missing person record |

Passwords are hashed with bcrypt; sessions are stateless JWTs stored in
`expo-secure-store` on the device. Every request re-checks the caller's
role/admin/helper-verified status fresh from the database (not from the
JWT), so a promotion (e.g. a Helper application being approved) takes
effect immediately without needing to log out and back in.

## Testing the Helper flow end-to-end

Helper applications can be reviewed either from the Admin Dashboard (Users
→ or Helpers page — see `admin-dashboard/README.md`) or the terminal;
both call the same backend endpoints, so neither is a stopgap for the
other:

```bash
cd backend
node src/admin-cli.js make-admin you@example.com   # do this once, after you register in the app
node src/admin-cli.js applications                 # list pending applications
node src/admin-cli.js approve <applicationId>       # or: reject <applicationId> "reason"
```

To see the whole loop: register two accounts in the app, apply as a Helper
from one of them (Profile → Become a Helper), approve it with the CLI, set
that account to "Available" in its new Helper Dashboard tab, then raise an
SOS from the other account. The Helper should get a push notification (or
see it appear in their assignments list on refresh) and can accept it,
walk through the mission status steps, and share their live location —
which the reporter can open from their SOS status screen.

## Known limitations (so nothing here overclaims)

- SOS is now **hybrid**: it's always saved locally first (works fully
  offline), and additionally dispatched to the backend to notify Helpers
  when there's connectivity. If the dispatch call fails, the app says so
  plainly rather than pretending Helpers were notified.
- Push notifications go through Expo's push service — they need a real
  device (or an EAS dev build), and won't fire from this sandboxed
  environment's own test runs; the send code is real, just unverified over
  this network.
- Sending the SMS in "Send Live Location" needs one tap to actually send —
  neither iOS nor Android let an app send SMS silently without being set as
  the default SMS app, which isn't appropriate to request here. The
  location updates themselves stream automatically once sharing starts.
- Background location requires the person to grant "Always"/background
  location permission. If they decline, `startLiveShare` fails outright with
  a clear error rather than silently starting a foreground-only share that
  would stop updating the moment they leave the app — given the safety
  stakes, a hard requirement felt more honest than a silent degradation.
- "Nearby" results (hospitals/police/fire, and Helper matching radius)
  depend on OpenStreetMap coverage and each Helper's last location ping.
- Safe Route uses OSRM's free public routing server and Nominatim's free
  public geocoder — both are shared community infrastructure with informal
  rate limits, fine for a project at this stage but not something to point
  heavy production traffic at without running your own instance.
- The Safety Score is walking-route infrastructure proximity (real OSM
  police/hospital data), not a crime prediction — it's labeled that way in
  the UI on purpose. Street lighting and crowd level are shown as "not
  available yet" rather than estimated.
- `react-native-maps` needs no API key for Expo Go testing (it uses Apple
  Maps on iOS, Google Maps on Android by default) — a standalone/EAS build
  would need a Google Maps API key added to `app.json` for Android.
- CCTV camera registration has no admin moderation step (unlike Helper/
  Authority applications) — anyone can register a camera, and separately,
  optionally, point the AI service at it via `stream_url`. There's no
  verification that a submitted stream URL is what it claims to be.
- Face matching (`ai-service/`) uses InsightFace (SCRFD + ArcFace) — see
  `ai-service/README.md` for real numbers and its actual remaining limits
  (low light, extreme angles, heavy occlusion, low-resolution CCTV crops
  are all still harder than a well-lit portrait comparison, same as any
  current face-recognition approach). Every match is temporally confirmed
  (several consecutive polling cycles) and cooldown-suppressed before
  it's even reported, and is always labeled a **potential match** —
  never "confirmed" — everywhere it surfaces (service logs, direct-alert
  emails, mobile, admin). `tools/evaluate_face_matcher.py` lets you
  generate a real precision/recall picture from your own labeled test
  photos; there is no accuracy percentage claimed anywhere in this
  project, on purpose — no properly labeled ground-truth dataset exists
  to compute one honestly.
- A reference photo that fails validation (no face / multiple faces /
  too small / too blurry) is rejected with a specific reason today. The
  AI service reports that verdict to the backend, and both the mobile app
  and admin dashboard surface it so the reporter can upload a better
  reference photo.
- The admin dashboard's AI Sightings verification workflow
  (Verify/Reject/Confirm on a potential match) is real and live. Marking
  a sighting "Confirmed" is a human decision that marks the case found and
  stops further AI camera matching for that record.
- The AI service's gesture/voice/emotion SOS detection was adapted from an
  earlier prototype script that had a live Gmail App Password and Twilio
  Auth Token hardcoded in plaintext. Neither was carried forward, but if
  you're working from that original file, rotate both immediately.
- Voice and emotion detection in the AI service are optional and need
  extra setup (a downloaded Vosk model; an already-trained emotion model
  this project doesn't ship or train) — gesture detection and face
  matching work without either.
- The Admin Dashboard (`admin-dashboard/`) and `admin-cli.js` are
  equally valid ways to review applications — both call the same
  endpoints. Neither is a stopgap for the other anymore; use whichever's
  convenient.
- The dashboard's heatmap/category charts read every alert in the
  database with no date-range limit beyond the trend chart's 14 days —
  fine at this scale, would want pagination/date filters at real volume.
