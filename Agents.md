# SPOTTER - Agents.md

A handoff document for any AI agent or human dev working in this repo. Read
this before touching files. This file describes the current code, not the
larger product spec.

---

## 1. What This Is

SPOTTER is a retail-surveillance prototype that combines local computer vision,
a web dashboard, incident review controls, a manual 3D movement annotator, and
early MongoDB/Snowflake analytics plumbing.

The target production story is:

```text
RTSP / video file -> YOLOv8 -> local review / Gemma / Gemini
                  -> ElevenLabs voice deterrent
                  -> MongoDB event write
                  -> Snowflake analytics
                  -> dashboard / operator action
```

What is real in this repo today:

- `main.py` - the heavy local OpenCV/YOLO detector. It now contains the newer
  people-plus-item path (`detect_people`) and heuristic concealment logic. Do
  not edit casually.
- `backend/stream.py` - FastAPI live webcam stream. It runs YOLO tracking,
  optionally uses `video_model.pth`, serves MJPEG, keeps recent detections, and
  can write `detection_events`, `alerts`, and `cameras` to MongoDB.
- `web/` - Next.js dashboard. It still has fallback demo data, but it now reads
  Mongo-backed API routes when `MONGODB_URI` is configured.
- `web/components/IncidentReviewPanel.tsx` - operator review flow with camera
  context plus `Broadcast`, `False alarm`, and `Escalate` actions.
- `web/lib/alert-broadcast.ts` - Gemma prompt generation plus ElevenLabs TTS
  for the broadcast action.
- `serve_annotator.py`, `annotator.html`, `annotator.js`, `annotator.css` -
  local 3D movement annotator for manually placing people on the store scene
  against CCTV frames.
- `cctv_review.py` - offline saved-video scanner/exporter. It calls
  `main.detect_people`, clusters candidate alert moments, exports review clips,
  and can optionally ask Gemini for structured review.
- `3d analysis/gemini_identity_anchors.py` - Gemini-assisted cross-camera identity-anchor
  review. This is not the shoplifting verifier.
- `snowflake/` plus `web/scripts/sync-mongo-to-snowflake.mjs` - early Snowflake
  analytics schema, semantic model, and Mongo-to-Snowflake sync.

Still not implemented as a full production system:

- Auth/session gating.
- Mobile app and push notifications.
- Real RTSP/camera fleet management.
- A durable worker deployment for ETL.
- Complete Gemma/Gemini/ElevenLabs production orchestration.

---

## 2. Repo Layout

```text
New project/
├── Agents.md
├── README.md
├── main.py                         # heavy local detector; includes detect_people()
├── main.legacy-webcam-ui.js        # legacy browser/webcam UI artifact
├── yolov8n.pt                      # YOLOv8 nano weights
├── requirements.txt                # local CV / Gemini helper deps
├── gem.py                          # batch CNN+LSTM video classifier script
├── cctv_review.py                  # offline review clip scanner/exporter
├── 3d analysis/                    # offline track stitching and spatial analysis helpers
│   ├── gemini_identity_anchors.py  # Gemini identity matching helper
│   ├── overlay_track_ids.py        # identity/track overlay utility
│   ├── spatial_map_from_tracklets.py
│   ├── stitch_tracklets_overlay.py # video overlay/stitching utility
│   ├── render_2d_with_footage.py
│   └── render_middle_layout_2d_tracking.py
├── serve_annotator.py              # local server for annotator + frame endpoint
├── annotator.html/js/css           # 3D movement annotator
├── watch.html/js/css               # browser viewing/demo artifact
├── index.html/main.js/styles.css   # standalone browser artifact
├── sample_annotations.json         # named Saad/Kareem/Fares/Omar samples
├── annotated_outputs/              # generated videos/contact sheets/CSVs
├── review_outputs/                 # generated cctv_review clips/manifests
├── track_snapshots/                # generated person crop/snapshot artifacts
├── shop-threejs-clean/             # standalone Three.js store scene
│
├── backend/
│   ├── stream.py                   # FastAPI MJPEG + detections + Mongo writes
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                        # local secrets; do not commit
│
├── snowflake/
│   ├── schema.sql                  # detection_events + Cortex Search service
│   └── semantic_model.yaml          # Cortex Analyst semantic model
│
└── web/
    ├── app/
    │   ├── api/
    │   │   ├── alerts/route.ts
    │   │   ├── alerts/broadcast/route.ts
    │   │   ├── alerts/decision/route.ts
    │   │   ├── analytics/chat/route.ts
    │   │   ├── analytics/metrics/route.ts
    │   │   ├── analytics/query/route.ts
    │   │   ├── cameras/route.ts
    │   │   ├── db/health/route.ts
    │   │   ├── elevenlabs/voices/route.ts
    │   │   ├── events/route.ts
    │   │   ├── snowflake/health/route.ts
    │   │   ├── snowflake/sync/route.ts
    │   │   └── summary/route.ts
    │   └── dashboard/
    │       ├── page.tsx            # dashboard + incident review
    │       ├── cameras/page.tsx
    │       ├── alerts/page.tsx
    │       ├── events/page.tsx
    │       ├── analytics/page.tsx
    │       └── settings/page.tsx
    ├── components/
    │   ├── LidarScene.tsx          # Three.js store scene + demo tracks
    │   ├── LiveLidarView.tsx       # dashboard card + moving named dots
    │   ├── LiveCameraFeed.tsx      # MJPEG stream + offline state
    │   ├── IncidentReviewPanel.tsx # operator actions
    │   ├── AnalyticsBrain.tsx
    │   └── settings/ElevenLabsVoiceSettings.tsx
    ├── hooks/use-live-incident.ts
    ├── lib/
    │   ├── mongodb.ts
    │   ├── spotter-data.ts
    │   ├── alert-broadcast.ts
    │   ├── snowflake.ts
    │   ├── snowflake-sync.ts
    │   └── analytics-prompts.ts
    └── scripts/sync-mongo-to-snowflake.mjs
```

Generated artifacts are useful for demos, but do not treat them as source of
truth unless the user asks about a specific output.

---

## 3. Quickstart

### Frontend

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`.

The web app is currently on Next `16.x` / React `19.x` in `package.json`, even
though older notes may say Next 14. Trust `package.json`.

### YOLO Backend

```bash
cd backend
pip install -r requirements.txt
python stream.py
```

Backend endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness, device, classifier mode, Mongo status |
| `GET` | `/video_feed` | MJPEG annotated webcam stream |
| `GET` | `/detections?limit=25` | Recent in-memory detection events |

Useful env vars:

- `SPOTTER_CAMERA` - local camera index, default `0`.
- `SPOTTER_CAMERA_ID` - event camera id, default `camera-01`.
- `SPOTTER_CAMERA_LOCATION` - displayed location, default `Front aisle`.
- `MONGODB_URI` / `MONGODB_DB` - enables event/camera/alert persistence.

### 3D Movement Annotator

```bash
python serve_annotator.py
```

Open `http://127.0.0.1:53871/annotator.html`.

The annotator defaults to
`/Users/user/Downloads/cctv_gemini_anchor_full_04m00s_to_13m20s.mp4`. It does
not rely on browser-native video playback for the core loop; the server exposes
OpenCV-backed `/video_meta` and `/video_frame?t=...` endpoints so the UI can
request exact frames. It also supports `/downloads/...` range requests for local
files.

### Offline CCTV Review

`cctv_review.py` scans a saved video using `main.detect_people`, finds local
alert/candidate moments, clusters nearby timestamps, exports clips under
`review_outputs/`, and can optionally call Gemini for JSON review. Use this for
saved CCTV files, not the live webcam stream.

### Snowflake Sync

```bash
cd web
npm run sync:snowflake
```

Required env:

- `MONGODB_URI`
- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USERNAME`
- `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_WAREHOUSE`
- optional `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`, `SNOWFLAKE_ROLE`

Apply `snowflake/schema.sql` before relying on sync or Cortex Search.

---

## 4. Detection And Review Paths

There are several model/review paths. Keep them distinct:

| Path | Files | What it does |
| --- | --- | --- |
| Live local detection | `main.py`, `backend/stream.py` | YOLO person tracking. Optional CNN+LSTM if `video_model.pth` exists. |
| Item/concealment analysis | `main.py::detect_people` | People + item detection, association, motion/body-region heuristics, possible concealment events. |
| Offline review | `cctv_review.py` | Samples a saved video, calls `main.detect_people`, exports clips/manifests, optionally asks Gemini. |
| Batch classifier demo | `gem.py` | Iterates local normal/shoplift folders with CNN+LSTM. Paths may be machine-specific. |
| Cross-camera identity | `3d analysis/overlay_track_ids.py`, `3d analysis/gemini_identity_anchors.py` | Person identity continuity and Gemini identity correction. Not shoplifting verification. |
| Manual ground truth | `annotator.*`, `serve_annotator.py`, `sample_annotations.json` | Place named people (`Saad`, `Kareem`, `Fares`, `Omar`) in the 3D store scene and export movement samples. |

Important: `main.py` does not call Gemini. Gemini review lives in
`cctv_review.py` and `3d analysis/gemini_identity_anchors.py`, for different purposes.

---

## 5. Frontend Tour

### Stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- lucide-react.
- react-three-fiber / drei / three.
- MongoDB driver and Snowflake SDK on the server side.

### Dashboard Routes

| Path | File | Current status |
| --- | --- | --- |
| `/` | `web/app/page.tsx` | Redirects to `/dashboard`. |
| `/dashboard` | `web/app/dashboard/page.tsx` | Main view: LIDAR, alerts, activity, stats, incident review. |
| `/dashboard/cameras` | `web/app/dashboard/cameras/page.tsx` | Live MJPEG stream + detection ticker. |
| `/dashboard/alerts` | `web/app/dashboard/alerts/page.tsx` | Basic page / placeholder depending on current branch state. |
| `/dashboard/events` | `web/app/dashboard/events/page.tsx` | Basic page / placeholder depending on current branch state. |
| `/dashboard/analytics` | `web/app/dashboard/analytics/page.tsx` | Analytics surface with Snowflake-oriented components. |
| `/dashboard/settings` | `web/app/dashboard/settings/page.tsx` | Includes settings work such as ElevenLabs voice config. |

### Data Flow

- `web/lib/spotter-data.ts` defines shared types and fallback data.
- `web/app/api/alerts/route.ts` reads Mongo `alerts`, or returns fallback.
- `web/app/api/events/route.ts` reads Mongo `detection_events`, or returns empty fallback.
- `web/app/api/cameras/route.ts` reads Mongo `cameras`, or returns fallback.
- `web/app/api/summary/route.ts` computes counts/slices from Mongo, or returns fallback.
- `web/app/api/db/health/route.ts` pings Mongo.
- `web/app/api/snowflake/health/route.ts` pings Snowflake.
- `web/app/api/snowflake/sync/route.ts` triggers one Mongo-to-Snowflake sync.
- `web/app/api/analytics/metrics/route.ts` reads Snowflake aggregate metrics.
- `web/app/api/analytics/query/route.ts` asks Cortex Complete for read-only SQL,
  validates it, then executes it.
- `web/app/api/analytics/chat/route.ts` uses Cortex Search plus Cortex Complete
  to answer historical detection questions.
- `web/app/api/elevenlabs/voices/route.ts` creates an ElevenLabs voice from
  uploaded samples.
- `web/hooks/use-live-incident.ts` polls alerts/events and chooses the active incident.
- `IncidentReviewPanel` calls:
  - `/api/alerts/broadcast` for Gemma + ElevenLabs audio.
  - `/api/alerts/decision` for false-alarm/escalation status updates.

The dashboard is no longer purely mocked. It gracefully falls back when Mongo or
other services are not configured.

### LIDAR Demo State

`LiveLidarView.tsx` and `LidarScene.tsx` currently include named demo tracks for
`Saad`, `Kareem`, `Fares`, and `Omar` based on manual annotation samples. The
goal is a convincing live demo, not calibrated real-world camera geometry.

If the user complains that movement is wrong, inspect both files. There are
currently two visual layers:

- Three.js scene-level people in `LidarScene.tsx`.
- HTML overlay moving dots/labels in `LiveLidarView.tsx`.

Keep them consistent or remove one layer deliberately.

---

## 6. Design System And UI Rules

- Use Tailwind classes and existing tokens in `web/tailwind.config.ts`.
- Use `<Card>` and `<CardHeader>` for dashboard widgets.
- Keep the approved dashboard layout: left two-thirds LIDAR/stats/review, right
  rail alerts/activity. Do not simplify it into stacked rows unless asked.
- Use lucide icons for generic UI.
- Use `SpotterIcons.tsx` for event-type icons.
- Keep the four semantic alert colors in sync across:
  - `ActiveAlerts.tsx`
  - `RecentActivity.tsx`
  - `LiveLidarView.tsx`
  - `EventsSummary.tsx`
- Use `tabular-nums` for timestamps, counts, and percentages.
- Do not add emoji to source.
- Server components by default; add `"use client"` only for state/effects/refs or
  browser APIs.

---

## 7. Environment Files

Use examples, not committed secrets:

- `backend/.env.example`
- `web/.env.example`

Expected web env includes:

- `MONGODB_URI`, `MONGODB_DB`
- `NEXT_PUBLIC_STREAM_URL`
- `GEMMA_API_URL`, `GEMMA_MODEL`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- Snowflake variables listed above

Expected Python env includes:

- `MONGODB_URI`, `MONGODB_DB`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` for Gemini scripts
- camera vars listed in the backend quickstart

Never commit `.env` files.

---

## 8. Common Recipes

### Wire a Dashboard Widget to Real Data

Prefer the existing API route pattern:

1. Put shared types/fallbacks in `web/lib/spotter-data.ts`.
2. Add or extend a route under `web/app/api/.../route.ts`.
3. Have client widgets poll the local API if they need live updates.
4. Preserve fallback data so the demo still runs without Mongo.

### Add a New Event Type

1. Add the type to `AlertType` in `web/lib/spotter-data.ts`.
2. Add style/icon mappings in `ActiveAlerts.tsx`, `RecentActivity.tsx`, and any
   LIDAR/summary component that displays it.
3. Keep the palette to the existing semantic set unless the user explicitly
   approves a fifth severity.
4. Update Mongo write paths if the backend should emit the new type.

### Add Structured Detection Streaming

`backend/stream.py` currently exposes recent detections with polling
(`/detections`). If you need real streaming:

1. Add a queue or pub/sub list inside `backend/stream.py`.
2. Push `{ts, track_id, label, confidence, bbox}` after each YOLO/classifier update.
3. Expose an SSE endpoint such as `/detections/stream`.
4. Update `DetectionTicker.tsx` to use `EventSource`.

### Use Gemini for Shoplifting Review

Do not add Gemini calls to the live frame loop. Use `cctv_review.py` for saved
video review clips. That script is the right boundary for slower cloud reasoning.

### Use Gemini for Cross-Camera Identity

Use `3d analysis/gemini_identity_anchors.py`. It exports frames at selected timestamps and
asks Gemini to return canonical person descriptions and label corrections.

### Update the Annotator

Work in:

- `annotator.html`
- `annotator.js`
- `annotator.css`
- `serve_annotator.py`

The annotator uses Three.js directly from ESM URLs, not the Next app. It stores
samples in localStorage and can import/export JSON/CSV. Keep `sample_annotations.json`
aligned when changing the sample/demo identity set.

---

## 9. Things To Avoid

- Do not casually refactor `main.py`. It is the source of both live and offline
  CV behavior and has shared global tracking state.
- Do not confuse `analyze_frame()` / old people-only classifier paths with
  `detect_people()` / newer people-plus-item concealment analysis.
- Do not claim MongoDB, Snowflake, Gemma, Gemini, or ElevenLabs are active unless
  the relevant env vars are configured and the code path has been run.
- Do not treat manual LIDAR annotations as calibrated camera geometry.
- Do not edit generated artifacts in `annotated_outputs/`, `review_outputs/`,
  or `track_snapshots/` as if they are app source.
- Do not replace the dashboard with a landing page. This repo is currently an
  operator tool/demo, not marketing.

---

## 10. Build Verification

Before declaring frontend work done:

```bash
cd web
npx next build
```

For backend-only work:

```bash
cd backend
python stream.py
curl http://localhost:8000/health
```

For annotator work:

```bash
python serve_annotator.py
```

Then open `http://127.0.0.1:53871/annotator.html`, load `Sample`, scrub/play,
and verify exported JSON still contains `time`, `person_id`, `person_name`,
`x`, `z`, `dx`, `dz`, and speed fields.
