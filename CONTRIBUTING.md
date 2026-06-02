# Contributing to SPOTTER

Thanks for taking a look at SPOTTER. This repo is an active prototype, so the best contributions are focused, reproducible, and clear about what is demo code versus production-ready behavior.

## Good first contribution areas

- Improve setup docs for the Python detector, FastAPI stream backend, or Next.js dashboard.
- Add tests around candidate-event clustering, alert decisions, and API route behavior.
- Harden file upload, path handling, and generated-artifact cleanup.
- Improve dashboard states for offline cameras, false alarms, escalations, and review outcomes.
- Make model assumptions, demo data, and missing assets easier to understand.

## Before opening a pull request

1. Keep generated outputs out of the commit. The repo ignores `review_outputs/`, `annotated_outputs/`, `track_snapshots/`, `.spotter_uploads/`, `.spotter_reviews/`, and common local env/build folders.
2. Do not commit secrets, API keys, video from private environments, or personally identifying footage.
3. Explain whether your change affects local CV processing, API routes, dashboard UI, or analytics sync.
4. Prefer small PRs with a clear before/after description.
5. Include screenshots or short notes for visible dashboard changes.

## Local checks

Python paths vary by feature, but a basic detector setup is:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

Backend setup:

```bash
cd backend
python -m pip install -r requirements.txt
python stream.py
```

Frontend setup:

```bash
cd web
npm install
npm run dev
```

If a check cannot run because a model file, camera, video sample, or environment variable is missing, say that in the PR.

## Review expectations

SPOTTER handles video-processing and alert workflows, so reviewers should pay close attention to:

- False positives and ambiguous evidence.
- Privacy-sensitive data flow.
- Path traversal, unsafe uploads, or accidental exposure of generated clips.
- Dependency changes in CV, API, or dashboard code.
- Any behavior that could be interpreted as an autonomous enforcement decision.

This project should stay human-review-first.