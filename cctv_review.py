import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import time

import cv2

import main


DEFAULT_VIDEO = Path(__file__).resolve().parent / "side_by_side.mov"


DEFAULT_PROMPT = """You are reviewing a short retail CCTV event clip.

Decide whether the visible behavior is likely item concealment/shoplifting, normal handling, or unclear.

Return only valid JSON with this exact shape:
{
  "verdict": "likely_concealment" | "normal_handling" | "unclear",
  "confidence": 0.0,
  "person_description": "brief visual description",
  "object_description": "what object appears involved, if any",
  "evidence": ["concrete visible observations"],
  "missing_context": ["what cannot be confirmed from the clip"]
}

Use likely_concealment only if the clip shows an item being controlled by a person,
moved toward a pocket/bag/under clothing, and not visibly returned or held normally.
Do not treat ordinary browsing, picking up an item, comparing items, or reaching near a shelf
as shoplifting unless there is visible concealment evidence."""


def safe_stem(path):
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in Path(path).stem).strip("-") or "video"


def reset_camera_state(camera_id):
    camera_id = main.sanitize_camera_id(camera_id)
    with main.tracking_lock:
        for store in (main.item_tracks, main.person_tracks, main.person_track_buffers):
            for key in list(store.keys()):
                if key[0] == camera_id:
                    del store[key]
    with main.motion_lock:
        main.previous_analysis_gray.pop(camera_id, None)
    for key in list(main.track_buffers.keys()):
        if key[0] == camera_id:
            del main.track_buffers[key]
            main.track_labels.pop(key, None)


def weak_candidate_labels(detections):
    labels = []
    for detection in detections:
        if detection.get("kind") != "item":
            continue
        if detection.get("associated_person") is None:
            continue
        confidence = float(detection.get("confidence") or 0.0)
        motion_score = float(detection.get("motion_score") or 0.0)
        moving_frames = int(detection.get("moving_frames") or 0)
        max_displacement = float(detection.get("max_displacement") or 0.0)
        body_region = detection.get("body_region")
        class_name = detection.get("class_name", "item")
        if confidence < 0.10:
            continue

        body_interaction = body_region in {"upper", "middle", "legs"}
        movement_signal = motion_score >= 10.0 or moving_frames >= 1 or max_displacement >= 0.20
        pocket_signal = body_region in {"middle", "legs"} and (motion_score >= 5.0 or moving_frames >= 1)
        if body_interaction and (movement_signal or pocket_signal):
            labels.append(
                f"review_candidate: {class_name} near person #{detection.get('associated_person')} "
                f"{body_region} conf={confidence:.2f} motion={motion_score:.1f}"
            )
    return labels


def analyze_video(video_path, camera_id, sample_seconds, include_weak_candidates=True):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    stride = max(1, int(round(fps * sample_seconds)))
    frame_index = 0
    sampled = 0
    alert_samples = []
    candidate_samples = []
    progress_bucket = -1

    reset_camera_state(camera_id)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_index += 1
            if frame_index % stride != 1:
                continue

            sampled += 1
            detections = main.detect_people(frame, camera_id=camera_id)
            alert_detections = [
                detection
                for detection in detections
                if detection.get("kind") in {"concealment", "concealment-person"}
            ]
            if alert_detections:
                labels = sorted({detection.get("label", "alert") for detection in alert_detections})
                sample = {
                    "frame": frame_index,
                    "time_seconds": frame_index / fps,
                    "labels": labels,
                    "detections": alert_detections,
                    "source": "local_alert",
                }
                alert_samples.append(sample)
                candidate_samples.append(sample)
            elif include_weak_candidates:
                labels = weak_candidate_labels(detections)
                if labels:
                    candidate_samples.append(
                        {
                            "frame": frame_index,
                            "time_seconds": frame_index / fps,
                            "labels": labels,
                            "detections": [],
                            "source": "weak_candidate",
                        }
                    )

            if total_frames:
                progress = int(frame_index * 100 / total_frames)
                if progress // 10 != progress_bucket:
                    progress_bucket = progress // 10
                    print(
                        f"scan progress={progress}% frame={frame_index}/{total_frames} "
                        f"alerts={len(alert_samples)} candidates={len(candidate_samples)}",
                        flush=True,
                    )
    finally:
        cap.release()

    return {
        "fps": fps,
        "total_frames": total_frames,
        "sample_seconds": sample_seconds,
        "sampled_frames": sampled,
        "alert_samples": alert_samples,
        "candidate_samples": candidate_samples,
    }


def cluster_alerts(alert_samples, pre_seconds, post_seconds, merge_gap_seconds, min_alert_samples, max_clip_seconds):
    if not alert_samples:
        return []

    clusters = []
    current = None
    for sample in alert_samples:
        start = max(0.0, sample["time_seconds"] - pre_seconds)
        end = sample["time_seconds"] + post_seconds
        if current is None or start > current["end_seconds"] + merge_gap_seconds:
            if current is not None:
                clusters.append(current)
            current = {
                "start_seconds": start,
                "end_seconds": end,
                "alert_samples": [sample],
                "labels": set(sample["labels"]),
            }
        else:
            current["end_seconds"] = max(current["end_seconds"], end)
            current["alert_samples"].append(sample)
            current["labels"].update(sample["labels"])

    if current is not None:
        clusters.append(current)

    filtered = []
    for index, cluster in enumerate(clusters, start=1):
        if len(cluster["alert_samples"]) < min_alert_samples:
            continue
        start_seconds = cluster["start_seconds"]
        end_seconds = cluster["end_seconds"]
        if max_clip_seconds and end_seconds - start_seconds > max_clip_seconds:
            first_alert_seconds = cluster["alert_samples"][0]["time_seconds"]
            start_seconds = max(0.0, first_alert_seconds - pre_seconds)
            end_seconds = start_seconds + max_clip_seconds

        filtered.append(
            {
                "event_id": index,
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
                "duration_seconds": end_seconds - start_seconds,
                "alert_sample_count": len(cluster["alert_samples"]),
                "labels": sorted(cluster["labels"]),
                "first_alert_seconds": cluster["alert_samples"][0]["time_seconds"],
                "last_alert_seconds": cluster["alert_samples"][-1]["time_seconds"],
            }
        )
    return filtered


def draw_detections(frame, detections):
    colors = {
        "person": (0, 170, 255),
        "item": (255, 170, 0),
        "concealment": (0, 0, 220),
        "concealment-person": (0, 0, 220),
    }
    for detection in detections:
        kind = detection.get("kind", "item")
        if kind not in colors:
            continue
        x1, y1, x2, y2 = [int(detection[key]) for key in ("x1", "y1", "x2", "y2")]
        color = colors[kind]
        label = detection.get("label", kind)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        y_text = max(0, y1 - text_height - 8)
        cv2.rectangle(frame, (x1, y_text), (min(frame.shape[1] - 1, x1 + text_width + 8), y_text + text_height + 8), color, -1)
        cv2.putText(frame, label, (x1 + 4, y_text + text_height + 3), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)


def export_event_clip(video_path, event, output_dir, fps_hint, max_width, annotate):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video for export: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or fps_hint or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(1.0, max_width / float(width)) if max_width else 1.0
    out_width = int(width * scale)
    out_height = int(height * scale)
    out_width += out_width % 2
    out_height += out_height % 2

    start_frame = max(0, int(event["start_seconds"] * fps))
    end_frame = max(start_frame + 1, int(event["end_seconds"] * fps))
    output_path = output_dir / f"event_{event['event_id']:03d}_{event['start_seconds']:.1f}s_{event['end_seconds']:.1f}s.mp4"
    writer = cv2.VideoWriter(str(output_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (out_width, out_height))

    camera_id = f"export-{safe_stem(video_path)}-{event['event_id']}"
    reset_camera_state(camera_id)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    frame_index = start_frame

    try:
        while frame_index <= end_frame:
            ok, frame = cap.read()
            if not ok:
                break
            frame_index += 1
            if annotate:
                detections = main.detect_people(frame, camera_id=camera_id)
                has_alert = any(detection.get("kind") in {"concealment", "concealment-person"} for detection in detections)
                banner_color = (0, 0, 180) if has_alert else (0, 110, 180)
                banner_text = "LOCAL CANDIDATE EVENT" if has_alert else "LOCAL CONTEXT"
                cv2.rectangle(frame, (0, 0), (frame.shape[1], 54), banner_color, -1)
                cv2.putText(frame, banner_text, (18, 37), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
                draw_detections(frame, detections)
            if scale != 1.0:
                frame = cv2.resize(frame, (out_width, out_height))
            writer.write(frame)
    finally:
        cap.release()
        writer.release()

    return output_path


def wait_for_gemini_file(client, uploaded_file, timeout_seconds=120):
    deadline = time.time() + timeout_seconds
    file_name = uploaded_file.name
    while time.time() < deadline:
        current = client.files.get(name=file_name)
        state = getattr(current, "state", None)
        state_name = getattr(state, "name", str(state))
        if state_name == "ACTIVE":
            return current
        if state_name == "FAILED":
            raise RuntimeError(f"Gemini file processing failed for {file_name}")
        time.sleep(2)
    raise TimeoutError(f"Timed out waiting for Gemini to process {file_name}")


def review_with_gemini(clip_path, model_name, prompt):
    try:
        from google import genai
    except ImportError as exc:
        raise RuntimeError("Install google-genai to enable Gemini review: python -m pip install google-genai") from exc

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY or GOOGLE_API_KEY to enable Gemini review.")

    client = genai.Client(api_key=api_key)
    upload_error = None
    for _ in range(3):
        try:
            uploaded = client.files.upload(file=str(clip_path))
            break
        except Exception as exc:
            upload_error = exc
            time.sleep(2)
    else:
        raise upload_error

    uploaded = wait_for_gemini_file(client, uploaded)
    response = client.models.generate_content(model=model_name, contents=[uploaded, prompt])
    text = getattr(response, "text", "") or ""
    cleaned_text = text.strip()
    if cleaned_text.startswith("```"):
        cleaned_text = cleaned_text.removeprefix("```json").removeprefix("```").strip()
        cleaned_text = cleaned_text.removesuffix("```").strip()
    try:
        parsed = json.loads(cleaned_text)
    except json.JSONDecodeError:
        parsed = {"verdict": "parse_error", "confidence": 0.0, "raw_text": text}
    return parsed


def run(args):
    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        raise FileNotFoundError(video_path)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(args.output_dir).expanduser().resolve() / f"{safe_stem(video_path)}_{run_id}"
    clips_dir = output_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    camera_id = args.camera_id or f"scan-{safe_stem(video_path)}-{run_id}"
    scan = analyze_video(video_path, camera_id, args.sample_seconds)
    event_samples = scan["alert_samples"] if args.strict_alerts_only else scan["candidate_samples"]
    events = cluster_alerts(
        event_samples,
        pre_seconds=args.pre_seconds,
        post_seconds=args.post_seconds,
        merge_gap_seconds=args.merge_gap_seconds,
        min_alert_samples=args.min_alert_samples,
        max_clip_seconds=args.max_clip_seconds,
    )
    if args.max_events:
        events = sorted(events, key=lambda event: event["alert_sample_count"], reverse=True)[: args.max_events]
        events = sorted(events, key=lambda event: event["start_seconds"])

    manifest = {
        "video_path": str(video_path),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "fps": scan["fps"],
        "total_frames": scan["total_frames"],
        "sample_seconds": scan["sample_seconds"],
        "sampled_frames": scan["sampled_frames"],
        "alert_sample_count": len(scan["alert_samples"]),
        "candidate_sample_count": len(scan["candidate_samples"]),
        "event_count": len(events),
        "gemini_enabled": args.gemini,
        "events": [],
    }

    for event in events:
        clip_path = export_event_clip(
            video_path,
            event,
            clips_dir,
            fps_hint=scan["fps"],
            max_width=args.max_width,
            annotate=not args.raw_clips,
        )
        event_record = dict(event)
        event_record["clip_path"] = str(clip_path)
        if args.gemini:
            try:
                event_record["gemini_review"] = review_with_gemini(clip_path, args.gemini_model, DEFAULT_PROMPT)
            except Exception as exc:
                event_record["gemini_review_error"] = str(exc)
        manifest["events"].append(event_record)
        print(
            f"event {event['event_id']:03d}: {event['start_seconds']:.1f}s-{event['end_seconds']:.1f}s "
            f"alerts={event['alert_sample_count']} clip={clip_path}",
            flush=True,
        )

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"manifest={manifest_path}")
    print(
        f"events={len(events)} alert_samples={len(scan['alert_samples'])} "
        f"candidate_samples={len(scan['candidate_samples'])} sampled={scan['sampled_frames']}"
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Find CCTV shoplifting candidate events and optionally review clips with Gemini.")
    parser.add_argument(
        "video",
        nargs="?",
        default=str(DEFAULT_VIDEO),
        help=f"Path to the source CCTV video. Defaults to {DEFAULT_VIDEO.name}.",
    )
    parser.add_argument("--output-dir", default="review_outputs", help="Directory for manifests and event clips.")
    parser.add_argument("--camera-id", default=None, help="Stable camera ID for local tracking state.")
    parser.add_argument("--sample-seconds", type=float, default=0.5, help="Run local CV every N seconds while scanning.")
    parser.add_argument("--pre-seconds", type=float, default=5.0, help="Clip context before the first alert.")
    parser.add_argument("--post-seconds", type=float, default=5.0, help="Clip context after the last alert.")
    parser.add_argument("--merge-gap-seconds", type=float, default=4.0, help="Merge alert windows separated by this gap or less.")
    parser.add_argument("--min-alert-samples", type=int, default=3, help="Minimum alert samples required to export an event.")
    parser.add_argument("--max-events", type=int, default=10, help="Maximum events to export, ranked by alert sample count.")
    parser.add_argument("--max-clip-seconds", type=float, default=12.0, help="Maximum exported review clip duration per event.")
    parser.add_argument("--max-width", type=int, default=720, help="Resize exported clips to this max width. Use 0 to keep source size.")
    parser.add_argument("--raw-clips", action="store_true", help="Export raw clips without local boxes/banners.")
    parser.add_argument("--strict-alerts-only", action="store_true", help="Only export strict local concealment alerts, not weaker Gemini-review candidates.")
    parser.add_argument("--gemini", action="store_true", help="Send exported clips to Gemini. Requires GEMINI_API_KEY and google-genai.")
    parser.add_argument("--gemini-model", default="gemini-2.5-flash", help="Gemini model to use for clip review.")
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
