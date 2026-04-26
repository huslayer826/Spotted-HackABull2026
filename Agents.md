# SPOTTER — Agents.md

A handoff document for any AI agent (or human dev) who needs to read, run, or
extend this codebase. Read this **before** touching files. Skim the whole
thing first; the recipes near the bottom assume you've seen the layout.

The product spec (architecture, sponsor tracks, prompt templates, data model)
lives in the team's design doc — this file is strictly about the code in this
repo and how to work in it.

---

## 1. What this is

SPOTTER turns any existing camera into an AI security analyst. The full
production system is a 5-tier pipeline:

```
RTSP / video file → YOLOv8 → Gemma (local VLM) → Gemini (cloud video reasoning)
                          → ElevenLabs voice deterrent
                          → MongoDB event write
                          → Snowflake analytics ETL
                          → Mobile push
```

This repo currently contains:

- `main.py` + `yolov8n.pt` — the **detection prototype** (YOLOv8 + a CNN+LSTM
  shoplifting classifier). Runs against the local webcam and draws bounding
  boxes in an OpenCV window.
- `web/` — the **Next.js 14 web dashboard** (the SPOTTER UI you see in the
  designs).
- `backend/stream.py` — a **FastAPI shim** that wraps the detection prototype
  and exposes its annotated frames as an MJPEG HTTP stream the dashboard can
  embed.

Everything else from the spec (Gemma, Gemini, ElevenLabs, MongoDB, Snowflake,
Auth, mobile app) is **not yet implemented in this repo**. The dashboard
fakes that data with mocks today; the recipes in §7 explain where to swap
real data in.

---

## 2. Repo layout

```
hackabull2026/
├── Agents.md                  ← this file
├── README.md                  ← one-liner ("python main.py 2>/dev/null")
├── main.py                    ← original YOLO + CNN+LSTM webcam demo (do not edit casually)
├── yolov8n.pt                 ← YOLOv8 nano weights (~6 MB, committed)
│
├── backend/
│   ├── stream.py              ← FastAPI MJPEG wrapper of main.py's detection
│   └── requirements.txt
│
└── web/                       ← Next.js 14 App Router app
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts     ← design tokens (colors, fonts, shadows)
    ├── next.config.js
    ├── postcss.config.js
    ├── app/
    │   ├── layout.tsx         ← root layout, Inter / Fraunces / JetBrains Mono
    │   ├── page.tsx           ← redirects "/" → "/dashboard"
    │   ├── globals.css        ← palette CSS vars, paper-grain, lidar-grid, animations
    │   └── dashboard/
    │       ├── layout.tsx     ← Sidebar + TopBar shell
    │       ├── page.tsx       ← main dashboard (LIDAR + alerts + stats)
    │       ├── cameras/page.tsx     ← real YOLO live footage
    │       ├── alerts/page.tsx      ← <ComingSoon />
    │       ├── events/page.tsx      ← <ComingSoon />
    │       ├── analytics/page.tsx   ← <ComingSoon />
    │       └── settings/page.tsx    ← <ComingSoon />
    └── components/
        ├── Logo.tsx
        ├── Sidebar.tsx        ← nav with active-route highlighting
        ├── TopBar.tsx         ← search + notifications + admin chip
        ├── Card.tsx           ← <Card> + <CardHeader> primitives
        ├── SpotterIcons.tsx   ← inline SVG icons (RunningIcon, JarIcon, BoxIcon, PersonIcon, CameraDotIcon)
        ├── RangePicker.tsx    ← Live · 24H · 7D · 30D pill segmented control
        ├── LiveLidarView.tsx  ← 3D LIDAR card; pinned colored markers as HTML overlay
        ├── LidarScene.tsx     ← react-three-fiber scene (dynamic-imported, ssr:false)
        ├── ActiveAlerts.tsx   ← left-bordered alert cards w/ dark thumbnails
        ├── RecentActivity.tsx ← icon + title + "Nm ago" list
        ├── AlertsToday.tsx    ← 23 + ↑35% + SVG sparkline
        ├── EventsSummary.tsx  ← SVG donut chart
        ├── LiveCameraFeed.tsx ← <img> bound to backend MJPEG, with offline state
        ├── DetectionTicker.tsx← right-side detection log on the cameras page
        └── ComingSoon.tsx     ← shared placeholder for unbuilt routes
```

---

## 3. Quickstart

### Frontend

```bash
cd web
npm install
npm run dev          # http://localhost:3000  → redirects to /dashboard
```

### YOLO backend (only needed for the Cameras tab)

```bash
cd backend
pip install -r requirements.txt
python stream.py     # http://localhost:8000  (uvicorn)
```

The dashboard's Cameras tab polls `/health` on the backend every 4 seconds.
If the backend is down it shows a "Stream offline" state with a Retry button;
if it's up it embeds `/video_feed` as an MJPEG `<img>`.

Override the stream URL with `NEXT_PUBLIC_STREAM_URL` if you move the
backend off `localhost:8000`.

---

## 4. Frontend tour

### Stack
- **Next.js 14.2** (App Router, RSC)
- **Tailwind CSS 3.4** (custom palette, see §5)
- **TypeScript**
- **lucide-react** for line icons (and `components/SpotterIcons.tsx` for the
  custom theft / jar / box / person / camera glyphs)
- **react-three-fiber + drei + three** for the 3D LIDAR placeholder

### Routes
| Path | File | What it does |
|---|---|---|
| `/` | `app/page.tsx` | Server-side `redirect("/dashboard")` |
| `/dashboard` | `app/dashboard/page.tsx` | LIDAR view, alerts, stats |
| `/dashboard/cameras` | `app/dashboard/cameras/page.tsx` | Real YOLO footage + ticker |
| `/dashboard/alerts` | `…/alerts/page.tsx` | `<ComingSoon />` |
| `/dashboard/events` | `…/events/page.tsx` | `<ComingSoon />` |
| `/dashboard/analytics` | `…/analytics/page.tsx` | `<ComingSoon />` |
| `/dashboard/settings` | `…/settings/page.tsx` | `<ComingSoon />` |

The shell (sidebar + top bar) lives in `app/dashboard/layout.tsx` and applies
to every dashboard route automatically.

### Server vs client components
- **Pages** (`page.tsx`): server components by default. Compose layouts and
  pull data here once we have it (see recipes in §7).
- **Interactive components** carry `"use client"` at the top. The current
  client components are: `Sidebar`, `RangePicker`, `LiveLidarView` (because
  it dynamically imports a 3D canvas), `LidarScene`, `LiveCameraFeed`,
  `DetectionTicker`. Everything else renders server-side.

### State
There is no global state library. Each interactive component owns its own
`useState`. When real data is wired up, use either:
- Server components fetching at request time (RSC + `fetch`), or
- A SWR / React Query hook in the client component that needs it.

Don't reach for Redux/Zustand unless something forces it.

---

## 5. Design system

All design tokens live in **`web/tailwind.config.ts`**. Use Tailwind classes;
do not hardcode hex values in components.

### Palette
| Tailwind | Hex | Used for |
|---|---|---|
| `paper-50` | `#FBF7F2` | Card surfaces |
| `paper-100` | `#F5EEE5` | Page background |
| `paper-200` | `#EDE3D5` | Subtle hover, pill backgrounds |
| `paper-300` | `#E2D5C2` | Borders on warm surfaces |
| `ink-900` | `#1C1814` | Primary text |
| `ink-700` | `#3F362C` | Secondary text |
| `ink-500` | `#6B6055` | Muted text |
| `ink-400` | `#8C8175` | Placeholder, axis labels |
| `rust-100…700` | warm rust scale | Accent: brand, active nav, CTA, "Grabbed" alerts |
| `amber-400/500` | `#E2A24C` / `#D08B33` | "Pocketed" alerts |
| `moss-400…600` | muted greens | "Person detected", success |
| `crimson-500` | `#9B2D24` | "Theft" alerts (highest severity) |

The four semantic alert colors are intentional and the icons in
`SpotterIcons.tsx` are paired with them. Don't invent a fifth severity.

### Typography
- `font-sans` → Inter (UI text, numbers)
- `font-serif` → Fraunces (was used for the landing hero — currently only
  loaded in case we add a marketing route later; safe to delete from
  `app/layout.tsx` if you never reuse it)
- `font-mono` → JetBrains Mono (terminals, log lines, timestamps)

Set in `app/layout.tsx`. Tailwind exposes them as `font-sans / font-serif /
font-mono`.

### Custom utilities (in `app/globals.css`)
- `.paper-grain` — radial-dot grain over warm backgrounds (used on dashboard
  surface)
- `.lidar-grid` — cross-hatched grid (reserved for future 3D backgrounds)
- `.scroll-soft` — slim warm scrollbar, used on `DetectionTicker`
- `.cursor-blink` — blinking caret (was on the landing terminal)
- `.pulse-dot` — gentle scale/opacity pulse, used on live indicators

### Card primitive
Always wrap dashboard widgets in `<Card>` from `components/Card.tsx`:

```tsx
<Card>
  <CardHeader title="My widget" action={<button>…</button>} />
  <div className="px-6 pb-5">…</div>
</Card>
```

`<Card>` provides the rounded warm surface + 1px border + soft shadow. Do
not roll your own card.

### Icons
- **Lucide** for generic icons (Bell, Search, Maximize2, ArrowUp, etc.).
- **`components/SpotterIcons.tsx`** for the four event types and the camera
  glyph. To add a new event-type icon, add another inline SVG component
  there, then map it in `ActiveAlerts.tsx` / `RecentActivity.tsx` /
  `LiveLidarView.tsx`.

---

## 6. Backend tour (`backend/stream.py`)

### What it does
Imports YOLOv8 from ultralytics, opens the system webcam, runs detection +
tracking on every frame at 320 px, draws boxes + labels with OpenCV, and
serves the latest annotated JPEG over HTTP.

If `video_model.pth` (the CNN+LSTM shoplifting classifier from `main.py`)
is present at the repo root it will additionally classify each track as
`Normal` or `SHOPLIFTING`. If it's missing the backend logs that and falls
back to YOLO-only person detection, so the stream always works.

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | JSON: `{ ok, device, capture_alive, classifier }`. Polled by the dashboard to decide between live and "offline" UI. |
| GET | `/video_feed` | `multipart/x-mixed-replace; boundary=frame` MJPEG stream. Embed via `<img src="…">`. |

### Threading model
The capture + inference loop runs on a **single background thread** started
at FastAPI's `startup` event. It writes the latest JPEG bytes into a
process-global `_latest_jpeg` under a `threading.Lock`. The MJPEG generator
just yields whatever's currently in that slot, so consumers don't compete
for the camera and frames are dropped gracefully under back-pressure.

Camera index is `SPOTTER_CAMERA` env var (defaults to `0`).

---

## 7. What's mocked (and where to swap real data in)

Everything below renders from in-file constants. When real data is
available, replace these — file path + line range given.

| Widget | File | Where the mock data lives |
|---|---|---|
| Active Alerts list | `components/ActiveAlerts.tsx` | `const ALERTS` near top |
| Recent Activity list | `components/RecentActivity.tsx` | `const ITEMS` near top |
| Alerts Today number / sparkline | `components/AlertsToday.tsx` | `const POINTS` (24 hourly buckets) |
| Events Summary donut | `components/EventsSummary.tsx` | `const SLICES` |
| LIDAR markers + count | `components/LiveLidarView.tsx` | `const MARKERS`, "People in area" hardcoded `5` |
| Detection ticker rows | `components/DetectionTicker.tsx` | `const SAMPLES` + `setInterval` loop |
| Range picker (Live/24H/7D/30D) | `components/RangePicker.tsx` | Internal `useState` only — no fetch yet |
| Notifications badge ("3") | `components/TopBar.tsx` | Hardcoded |
| Admin chip ("Admin · admin@spotter.ai · K") | `components/TopBar.tsx` | Hardcoded |

The Cameras tab is **not** mocked — it's a real video stream from
`backend/stream.py` over MJPEG. Only the right-side `DetectionTicker` is
fake (it doesn't yet read from the backend).

---

## 8. Recipes — how to extend

### 8.1 Add a new dashboard page

1. Create `web/app/dashboard/<slug>/page.tsx`:
   ```tsx
   export default function MyPage() {
     return (
       <div className="space-y-6">
         <div>
           <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
             My Page
           </h1>
           <p className="text-[15px] text-ink-500 mt-1">Subtitle</p>
         </div>
         {/* widgets in <Card>s */}
       </div>
     );
   }
   ```
2. Add it to the `NAV` array in `components/Sidebar.tsx`. Pick an icon from
   `lucide-react`. Active-route highlighting works automatically.

That's it. No router config, no manifest.

### 8.2 Replace mocked alerts with real data from a backend

Two clean paths.

**A — Server component fetching at request time (recommended for paginated
lists):**

```tsx
// components/ActiveAlerts.tsx — drop "use client"
export async function ActiveAlerts() {
  const res = await fetch(`${process.env.API_URL}/events?limit=4&status=new`, {
    cache: "no-store",
  });
  const alerts = await res.json();
  // …render
}
```

Then `await <ActiveAlerts />` from the dashboard page (also a server
component).

**B — Client component with polling/WebSocket (recommended for live data):**

Add `"use client"`, wrap the existing render in a `useEffect` that opens a
`WebSocket("ws://localhost:8000/events/stream")` and pushes incoming events
into local state. The MJPEG approach for the camera tab is the same idea —
nothing in the UI needs to change beyond the data source.

### 8.3 Replace the LIDAR placeholder with real 3D data

`components/LidarScene.tsx` is the three.js scene. The current scene draws
a wireframe room with two rows of shelves and a point-cloud floor. To swap
in real data:

1. Keep `LiveLidarView.tsx` as the wrapper — it already provides the warm
   card surface, the legend, the "People in area" pill, and the
   HTML-overlay markers.
2. Replace the contents of `<SceneRig />` in `LidarScene.tsx` with whatever
   geometry your floor plan / point-cloud data produces.
3. The HTML markers in `LiveLidarView.tsx` are positioned with raw `%`
   coords. To make them follow real 3D positions, use drei's `<Html>` or
   project world coords to screen space inside the canvas.

### 8.4 Add a new event-type alert

1. Pick a color: a Tailwind token already in the palette (`crimson-500`,
   `rust-400`, `amber-400`, `moss-500`, …).
2. Add the icon to `components/SpotterIcons.tsx` (inline SVG, copy the
   shape of one of the existing ones).
3. Add a key to the `TYPE_STYLES` map in `components/ActiveAlerts.tsx`
   (border + iconWrap + icon).
4. If the new type also belongs in the LIDAR view, add it to
   `MARKER_COLORS` and `MarkerIcon` in `components/LiveLidarView.tsx`,
   and to the `LEGEND` array there.
5. If it belongs in Recent Activity, add a key to `ICON_FOR` in
   `components/RecentActivity.tsx`.

### 8.5 Wire up the detection ticker to the real YOLO backend

`backend/stream.py` doesn't yet emit a structured event stream — only the
MJPEG. To make `DetectionTicker.tsx` real:

1. In `stream.py`, on each frame after the YOLO loop, push a
   `{ts, track_id, label, confidence}` object into a `queue.Queue` shared
   with a new endpoint.
2. Add `GET /detections/stream` as a Server-Sent Events endpoint
   (`StreamingResponse` with `text/event-stream`).
3. Replace the `setInterval(tick, 1100)` block in `DetectionTicker.tsx`
   with `new EventSource("http://localhost:8000/detections/stream")` and
   push each parsed event into the existing `events` state.

The wire format is open — the component already understands
`Normal | Shoplifting | Monitoring` labels with confidences.

### 8.6 Add auth

When you're ready for real auth, do it in `app/dashboard/layout.tsx`:
gate the entire dashboard tree behind a session check (NextAuth's
`auth()` helper or your equivalent). The TopBar is the natural place to
read user info from the session and render the chip.

---

## 9. Conventions

- **Tailwind first.** No CSS modules, no styled-components. Custom utilities
  go in `app/globals.css` only when a Tailwind expression would be
  unreadable.
- **Numbers use `tabular-nums`** — counts, timestamps, percentages.
  Keeps tickers from jittering.
- **Card chrome is consistent.** `<Card>` + `<CardHeader>`. Padding inside
  is `px-6 py-5` for content, `px-6 pt-5 pb-4` when followed by a list.
- **Icons** are `h-4 w-4` (small), `h-5 w-5` (default), `h-[18px] w-[18px]`
  (sidebar) — see Sidebar.tsx for the established pattern.
- **No emoji** in source unless the user explicitly asks. Use Lucide or
  SpotterIcons.
- **Server components by default.** Add `"use client"` only when the
  component uses state, effects, refs, or browser-only APIs.
- **Mock data lives at the top of the component** that uses it (a `const`
  at module scope), never in a separate "data" folder. When real data
  lands, the swap is one local change.

---

## 10. Things deliberately out of scope (right now)

These come from the product spec but are **not in this repo yet** — don't
silently invent them, and don't reach for them when extending:

- Gemma local VLM (Ollama)
- Gemini 2.5 Pro confirmation calls
- ElevenLabs voice deterrent
- MongoDB Atlas events/cameras/GridFS
- Snowflake Cortex Search / Analyst / Complete
- ETL worker (Mongo → Snowflake)
- Auth (NextAuth / JWT)
- Mobile app (React Native + Expo)
- 3D coverage feature (floor-plan upload + Gemini spatial analysis)

When you implement any of these, follow the recipes above for where they
plug into the dashboard, and update §7 ("what's mocked") so the next agent
knows the data is real.

---

## 11. Don't break

- `main.py` and `yolov8n.pt` are the original detection prototype. Don't
  edit `main.py` unless explicitly asked — `backend/stream.py` is the place
  to add HTTP/streaming concerns.
- The four event-type colors (theft / pocket / grab / person) are
  load-bearing across `LiveLidarView`, `ActiveAlerts`, `RecentActivity`,
  and `EventsSummary`. Keep them in sync.
- The dashboard layout is a 3-col grid where the left 2/3 stacks LIDAR +
  stats and the right 1/3 stacks alerts + recent activity. Resist the urge
  to "simplify" it back to two stacked rows — the user has already
  reviewed and approved this layout.

---

## 12. Build verification

Before declaring work done:

```bash
cd web
npx next build       # must finish without TS errors
```

There are no tests in this repo yet. If you add interactive logic worth
testing, prefer Playwright (run against `npm run dev`) over unit tests of
React components — the components are mostly view code.
