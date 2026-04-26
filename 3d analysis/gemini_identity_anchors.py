from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import cv2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ask Gemini to verify cross-camera person identity anchors.")
    parser.add_argument("--video", default="/Users/user/Downloads/cctv_global_people_full.mp4")
    parser.add_argument("--times", default="306,423,483,600,720")
    parser.add_argument("--output-dir", default="/Users/user/Downloads/gemini_identity_anchors")
    parser.add_argument("--model", default="gemini-2.5-pro")
    return parser.parse_args()


def wait_for_gemini_file(client, uploaded):
    name = uploaded.name
    for _ in range(60):
        current = client.files.get(name=name)
        state = getattr(current, "state", None)
        state_name = getattr(state, "name", str(state))
        if state_name == "ACTIVE":
            return current
        if state_name == "FAILED":
            raise RuntimeError(f"Gemini file processing failed: {name}")
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for Gemini file: {name}")


def export_frame(video_path: Path, time_sec: float, output_path: Path) -> None:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise SystemExit(f"Could not open {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(time_sec * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"Could not read frame at {time_sec}s")
    cv2.imwrite(str(output_path), frame)


def review_frame(client, model_name: str, image_path: Path, time_sec: float) -> dict:
    uploaded = client.files.upload(file=str(image_path))
    uploaded = wait_for_gemini_file(client, uploaded)
    prompt = f"""
You are correcting person identity labels in a side-by-side CCTV demo frame at t={time_sec:.1f}s.

The left half is camera 6464 and the right half is camera 4552. Boxes already have labels like
"Person A | raw 4552-1125", but the labels may be wrong.

Task:
1. Identify each visible human by stable visual description: clothing, body position, glasses/hair if visible.
2. Decide which left-camera people and right-camera people are the same actual person.
3. Return only JSON. Do not include markdown.

Schema:
{{
  "time_sec": {time_sec:.1f},
  "people": [
    {{
      "canonical_person": "short stable name like gray shirt man",
      "description": "clothing and position",
      "observations": [
        {{"camera": "6464", "shown_label": "Person X", "raw_id": "6464-123 or unknown"}},
        {{"camera": "4552", "shown_label": "Person Y", "raw_id": "4552-456 or unknown"}}
      ],
      "confidence": 0.0
    }}
  ],
  "label_corrections": [
    {{"canonical_person": "gray shirt man", "wrong_label": "Person F", "should_match_label": "Person D", "reason": "same gray shirt person"}}
  ],
  "uncertain": ["anything ambiguous"]
}}
"""
    response = client.models.generate_content(model=model_name, contents=[uploaded, prompt])
    text = (getattr(response, "text", "") or "").strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip().removesuffix("```").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"time_sec": time_sec, "parse_error": True, "raw_text": text}


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("Set GEMINI_API_KEY")
    try:
        from google import genai
    except ImportError as exc:
        raise SystemExit("Install genai") from exc

    video_path = Path(args.video).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    client = genai.Client(api_key=api_key)
    times = [float(value.strip()) for value in args.times.split(",") if value.strip()]
    results = []

    for time_sec in times:
        frame_path = output_dir / f"frame_{time_sec:.1f}s.jpg"
        export_frame(video_path, time_sec, frame_path)
        print(f"reviewing {frame_path}", flush=True)
        result = review_frame(client, args.model, frame_path, time_sec)
        results.append(result)
        (output_dir / f"frame_{time_sec:.1f}s.gemini.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

    manifest = {
        "video": str(video_path),
        "model": args.model,
        "times": times,
        "results": results,
    }
    manifest_path = output_dir / "identity_anchor_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {manifest_path}", flush=True)


if __name__ == "__main__":
    main()
