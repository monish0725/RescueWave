# RescueWave Admin Dashboard

A desktop web dashboard for RescueWave admins — separate from the mobile
app, as specced. Built with Vite + React + TypeScript, calling the same
backend the mobile app uses.

## What's here

- **Dashboard** — live stats, a 14-day alert trend chart, category
  breakdown, and a real heatmap (Leaflet + OpenStreetMap) of actual alert
  locations.
- **Live Alerts & Reports** — every SOS and citizen report, filterable by
  status/source, with links to uploaded photo/video/voice evidence.
- **Users** — search/filter, promote or revoke admin access.
- **Helpers** / **Authorities** — review pending applications (approve/
  reject with a note), and see who's currently active.
- **CCTV Cameras** — the full registry with a map, clearly labeled
  "AI network: not yet connected" since no footage/AI is wired up.
- **Missing Persons** — active/found cases with photos and an honest
  `face_embedding_status` (stays "pending" — no fake embedding is
  generated; see backend README for why).
- **System Health** — a live backend ping plus a status list of which
  modules are actually active vs. not yet connected (AI CCTV detection,
  face embedding matching).

## Run it

```bash
cd admin-dashboard
cp .env.example .env      # already set to localhost:4000 — fine for local dev
npm install
npm run dev                # http://localhost:5173
```

Make sure the backend (`../backend`) is running first — see the root
README for that.

### Getting admin access

There's no signup here — log in with a regular RescueWave account (same
one the mobile app uses) that has admin access. To grant the first admin:

```bash
cd ../backend
node src/admin-cli.js make-admin you@example.com
```

Once you have one admin, you can promote others directly from the
dashboard's Users page instead of the CLI.

## Notes

- This talks to the exact same endpoints `backend/src/admin-cli.js` uses —
  approving a Helper application here has identical effect to approving it
  from the terminal. Neither is more "real" than the other.
- The heatmap and camera map use OpenStreetMap tiles (no Google Maps API
  key needed), consistent with the rest of the project.
- Build for production with `npm run build` (outputs to `dist/`); this is
  a static site, so it can be hosted anywhere (Netlify, Vercel, a plain
  nginx box) as long as it can reach your backend — set `VITE_API_URL`
  accordingly at build time.
