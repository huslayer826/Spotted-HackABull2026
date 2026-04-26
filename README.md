Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run the app:

```bash
python main.py
```

Run CCTV candidate-event review:

```bash
python cctv_review.py
```

By default this scans `side_by_side.mov` locally, clusters candidate events, and exports
short review clips plus a `manifest.json` under `review_outputs/`. Candidate events
include strict concealment alerts plus weaker review-worthy signals such as
item-near-hand/body movement.

To review a different file:

```bash
python cctv_review.py /path/to/cctv.mov
```

Optional Gemini review:

```bash
export GEMINI_API_KEY="..."
python cctv_review.py --gemini
```

Gemini is only used on exported candidate clips, not on every frame. Candidate clips default
to `5s` before and `5s` after the local trigger, capped at `12s`, so the review has
before/during/after context for pocket-level movements. Each review asks for
structured JSON: `likely_concealment`, `normal_handling`, or `unclear`, with evidence and
missing context.

Use `--strict-alerts-only` if you want the older conservative mode that only exports strict
local concealment alerts.

Notes:
- Open [http://localhost:8000](http://localhost:8000) for the realtime browser view.
- `yolov8n.pt` is included and enables live person detection/tracking.
- `video_model.pth` is not in this repo. Without it, the app runs in detection-only mode and will not emit shoplifting predictions.
- Person tracking now uses ByteTrack with camera-scoped local track IDs.
- Stable person tracks keep a short buffer of recent good crops, average their features, and save timestamped snapshots under `track_snapshots/<camera_id>/track_<id>/`.
