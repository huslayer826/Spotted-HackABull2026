# SPOTTER

SPOTTER is a public retail-safety prototype for reviewing video events with local computer vision, operator review tools, and dashboard analytics. It started as a hackathon project and is being maintained as a practical codebase for experimenting with safer, reviewable video-processing workflows.

The core idea is simple: keep heavy frame processing local, surface only candidate events for review, and make the maintainer/operator workflow auditable enough that false positives can be inspected instead of blindly trusted.

## What is in the repo

- Local YOLOv8/OpenCV detection and tracking in `main.py`.
- FastAPI MJPEG backend in `backend/stream.py` with recent detections and optional MongoDB writes.
- Next.js/React dashboard in `web/` for cameras, alerts, events, analytics, and operator review.
- Offline CCTV candidate-event review in `cctv_review.py`, including review clip export and optional Gemini review for bounded clips.
- 3D/manual movement annotation utilities under `3d analysis/` and the annotator files.
- Early MongoDB-to-Snowflake analytics plumbing under `snowflake/` and `web/scripts/`.

## Project status

This is an active prototype, not a production surveillance product. Some paths use demo or fallback data, model assets are intentionally limited, and production concerns such as auth, durable workers, RTSP fleet management, and deployment hardening are not complete.

That said, the repository contains working code across the CV backend and web dashboard, plus merged collaborator pull requests and documentation for future contributors.

## Architecture

```text
Camera or video file
  -> local YOLO/OpenCV detection
  -> candidate event clustering
  -> operator dashboard and review clips
  -> optional LLM review on exported clips only
  -> MongoDB event records
  -> optional Snowflake analytics sync
```

The intended safety posture is to avoid sending full raw video streams to external APIs. Optional model review is scoped to exported candidate clips after local filtering.

## Quickstart

### Local Python detector

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

Open [http://localhost:8000](http://localhost:8000) for the realtime browser view when the local server is running.

### CCTV candidate-event review

```bash
python cctv_review.py
```

By default this scans `side_by_side.mov`, clusters candidate events, and exports short review clips plus a `manifest.json` under `review_outputs/`.

Review a different file:

```bash
python cctv_review.py /path/to/cctv.mov
```

Optional Gemini review:

```bash
export GEMINI_API_KEY="..."
python cctv_review.py --gemini
```

Gemini is only used on exported candidate clips, not every frame. Candidate clips include before/during/after context and request structured JSON labels: `likely_concealment`, `normal_handling`, or `unclear`.

Use `--strict-alerts-only` for the older conservative mode that exports only strict local concealment alerts.

### FastAPI stream backend

```bash
cd backend
python -m pip install -r requirements.txt
python stream.py
```

Useful endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend/device/model status |
| `GET` | `/video_feed` | MJPEG annotated camera stream |
| `GET` | `/detections?limit=25` | Recent in-memory detection events |

### Web dashboard

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Configuration notes

- `yolov8n.pt` is included and enables live person detection/tracking.
- `video_model.pth` is not included. Without it, the app can run in detection-only mode.
- Generated review artifacts belong in ignored folders such as `review_outputs/`, `annotated_outputs/`, and `track_snapshots/`.
- Secrets should stay in local `.env` files. The repo includes example env files where relevant.

## Maintainer workflow

Good follow-up work for maintainers and contributors includes:

- Add regression tests around candidate-event clustering and alert decisions.
- Harden upload and file-path handling for review video workflows.
- Keep detector behavior reproducible with documented model/version assumptions.
- Improve dashboard states for offline cameras, false alarms, and escalation.
- Expand privacy and security review before any deployment beyond local demos.

## Responsible use

SPOTTER should be treated as a review aid, not an autonomous accusation system. Human review, clear evidence, privacy constraints, and false-positive handling are required before any real-world use.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for responsible disclosure notes.
