"""SPOTTER live YOLO MJPEG stream.

Wraps the detection logic from main.py and exposes it as an HTTP MJPEG stream
that the Next.js frontend embeds via a plain <img src=...> tag.

Endpoints:
    GET /health      → simple liveness probe (used by the frontend to decide
                       between rendering the stream or the offline state).
    GET /video_feed  → multipart/x-mixed-replace MJPEG stream of annotated
                       webcam frames.

Run with:
    pip install fastapi uvicorn opencv-python ultralytics torch torchvision
    python backend/stream.py

Notes:
- main.py loads a custom video_model.pth (CNN+LSTM) which may not exist on
  every dev machine. We try to load it, and fall back gracefully to YOLO-only
  detection so the stream still works.
- We open the webcam lazily so importing this module doesn't grab the camera.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import warnings
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional

import cv2
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, JSONResponse
from ultralytics import YOLO

try:
    from pymongo import MongoClient
except Exception:
    MongoClient = None

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import main

# -----------------------
# Models
# -----------------------
YOLO_WEIGHTS = ROOT / "yolov8n.pt"
VIDEO_MODEL_WEIGHTS = ROOT / "video_model.pth"

device = (
    "cuda" if torch.cuda.is_available()
    else "mps" if torch.backends.mps.is_available()
    else "cpu"
)
print(f"[spotter] device: {device}")

yolo_model = YOLO(str(YOLO_WEIGHTS))

video_model = None
transform = None
SEQ_LEN = 16
SKIP_FRAMES = 4

if VIDEO_MODEL_WEIGHTS.exists():
    try:
        import torch.nn as nn
        from torchvision import transforms, models
        from torchvision.models import ResNet18_Weights

        class VideoModel(nn.Module):
            def __init__(self):
                super().__init__()
                base = models.resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
                self.cnn = nn.Sequential(*list(base.children())[:-1])
                self.lstm = nn.LSTM(512, 256, batch_first=True)
                self.fc = nn.Linear(256, 2)

            def forward(self, x):
                B, T, C, H, W = x.shape
                x = x.view(B * T, C, H, W)
                feats = self.cnn(x).view(B, T, 512)
                out, _ = self.lstm(feats)
                return self.fc(out[:, -1, :])

        video_model = VideoModel().to(device)
        video_model.load_state_dict(torch.load(VIDEO_MODEL_WEIGHTS, map_location=device))
        video_model.eval()
        transform = transforms.Compose(
            [
                transforms.ToPILImage(),
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
            ]
        )
        print("[spotter] CNN+LSTM classifier loaded")
    except Exception as e:
        print(f"[spotter] CNN+LSTM unavailable, YOLO-only mode: {e}")
        video_model = None
else:
    print("[spotter] video_model.pth not found, YOLO-only mode")

# -----------------------
# Camera + inference loop
# -----------------------
CONF_THRESHOLD = 0.4

_lock = threading.Lock()
_latest_jpeg: Optional[bytes] = None
_capture_thread: Optional[threading.Thread] = None
_stop = threading.Event()
_recent_events: deque[dict[str, Any]] = deque(maxlen=100)


# -----------------------
# MongoDB
# -----------------------
MONGODB_URI = os.environ.get("MONGODB_URI")
MONGODB_DB = os.environ.get("MONGODB_DB", "spotter")
CAMERA_ID = os.environ.get("SPOTTER_CAMERA_ID", "camera-01")
CAMERA_LOCATION = os.environ.get("SPOTTER_CAMERA_LOCATION", "Front aisle")
DEFAULT_VIDEO_SOURCE = ROOT / "side_by_side.mov"
VIDEO_SOURCE = os.environ.get("SPOTTER_VIDEO_PATH")
USE_VIDEO_SOURCE = bool(VIDEO_SOURCE) or DEFAULT_VIDEO_SOURCE.exists()
CAPTURE_SOURCE: int | str = (
    str(Path(VIDEO_SOURCE).expanduser()) if VIDEO_SOURCE else str(DEFAULT_VIDEO_SOURCE)
) if USE_VIDEO_SOURCE else int(os.environ.get("SPOTTER_CAMERA", "0"))

mongo_db = None
if MONGODB_URI and MongoClient is not None:
    try:
        mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=2500)
        mongo_client.admin.command("ping")
        mongo_db = mongo_client[MONGODB_DB]
        mongo_db.cameras.update_one(
            {"id": CAMERA_ID},
            {
                "$set": {
                    "id": CAMERA_ID,
                    "name": "Camera 01",
                    "location": CAMERA_LOCATION,
                    "status": "online",
                    "device": f"/dev/video{os.environ.get('SPOTTER_CAMERA', '0')}",
                    "updatedAt": datetime.now(timezone.utc),
                },
                "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
        print(f"[spotter] MongoDB connected: {MONGODB_DB}")
    except Exception as e:
        print(f"[spotter] MongoDB unavailable: {e}")
        mongo_db = None
elif not MONGODB_URI:
    print("[spotter] MONGODB_URI not set, MongoDB writes disabled")
else:
    print("[spotter] pymongo not installed, MongoDB writes disabled")


def _store_detection_event(event: dict[str, Any]) -> None:
    public_event = {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in event.items()
        if key != "_id"
    }
    with _lock:
        _recent_events.appendleft(public_event)

    if mongo_db is None:
        return

    try:
        mongo_db.detection_events.insert_one(dict(event))
        if event["label"] == "Shoplifting":
            mongo_db.alerts.insert_one(
                {
                    "id": f"alert-{event['id']}",
                    "type": "theft",
                    "title": "Shoplifting Detected",
                    "location": event["location"],
                    "time": datetime.fromisoformat(event["ts"]).strftime("%I:%M:%S %p"),
                    "status": "new",
                    "cameraId": event["cameraId"],
                    "trackId": event["trackId"],
                    "eventId": event["id"],
                    "createdAt": event["createdAt"],
                    "updatedAt": event["createdAt"],
                }
            )
    except Exception as e:
        print(f"[spotter] MongoDB write failed: {e}")


def _draw_detection(frame, detection: dict[str, Any]) -> None:
    colors = {
        "person": (0, 170, 255),
        "item": (255, 170, 0),
        "concealment": (0, 0, 220),
        "concealment-person": (0, 0, 220),
    }
    kind = detection.get("kind", "person")
    color = colors.get(kind, (95, 126, 90))
    x1, y1, x2, y2 = [int(detection[key]) for key in ("x1", "y1", "x2", "y2")]
    label = str(detection.get("label") or kind)

    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    y_text = max(0, y1 - th - 10)
    cv2.rectangle(
        frame,
        (x1, y_text),
        (min(frame.shape[1] - 1, x1 + tw + 10), y_text + th + 10),
        color,
        -1,
    )
    cv2.putText(
        frame,
        label,
        (x1 + 5, y_text + th + 4),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (245, 238, 229),
        2,
    )


def _event_from_detection(
    detection: dict[str, Any],
    label: str,
    confidence: float,
) -> dict[str, Any]:
    now = time.time()
    created_at = datetime.now(timezone.utc)
    track_id = int(detection.get("track_id") or detection.get("associated_person") or 0)
    return {
        "id": f"{CAMERA_ID}-{track_id}-{int(now * 1000)}",
        "ts": created_at.isoformat(),
        "trackId": track_id,
        "label": label,
        "confidence": confidence,
        "cameraId": CAMERA_ID,
        "location": CAMERA_LOCATION,
        "bbox": [
            int(detection.get("x1", 0)),
            int(detection.get("y1", 0)),
            int(detection.get("x2", 0)),
            int(detection.get("y2", 0)),
        ],
        "createdAt": created_at,
    }


def _annotate_frame(frame: Any, detections: list[dict[str, Any]], banner_text: str) -> bytes:
    annotated = frame.copy()
    alert_detections = [
        detection for detection in detections
        if detection.get("kind") in {"concealment", "concealment-person"}
    ]

    for detection in detections:
        _draw_detection(annotated, detection)

    banner_color = (0, 0, 190) if alert_detections else (0, 110, 180)
    cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 58), banner_color, -1)
    cv2.putText(
        annotated,
        banner_text,
        (18, 39),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.86,
        (245, 238, 229),
        2,
    )
    ok_jpg, buf = cv2.imencode(
        ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
    )
    if not ok_jpg:
        raise RuntimeError("Could not encode annotated frame")
    return buf.tobytes()


def _read_video_frame_at(seconds: float) -> tuple[Any, float, int, int]:
    if not isinstance(CAPTURE_SOURCE, str):
        raise RuntimeError("Frame scrubbing requires a video source")

    cap = cv2.VideoCapture(CAPTURE_SOURCE)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source {CAPTURE_SOURCE}")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        duration = total_frames / fps
        safe_seconds = max(0.0, min(seconds, max(0.0, duration - (1.0 / fps))))
        frame_index = int(round(safe_seconds * fps))
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"Could not read frame at {safe_seconds:.1f}s")
        return frame, safe_seconds, total_frames, int(round(fps))
    finally:
        cap.release()


def _annotate_loop(source: int | str = CAPTURE_SOURCE) -> None:
    cap = cv2.VideoCapture(source)
    if isinstance(source, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not cap.isOpened():
        print(f"[spotter] could not open capture source {source}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_delay = 1.0 / max(1.0, min(fps, 30.0))
    last_event_at_by_key: dict[tuple[int, str], float] = {}
    frame_count = 0

    global _latest_jpeg
    while not _stop.is_set():
        frame_started_at = time.time()
        ok, frame = cap.read()
        if not ok:
            if isinstance(source, str):
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                main.reset_camera_state(CAMERA_ID) if hasattr(main, "reset_camera_state") else None
                continue
            time.sleep(0.05)
            continue

        frame_count += 1
        detections = main.detect_people(frame, camera_id=CAMERA_ID)
        active_people = [
            detection for detection in detections
            if detection.get("kind") in {"person", "concealment-person"}
        ]
        alert_detections = [
            detection for detection in detections
            if detection.get("kind") in {"concealment", "concealment-person"}
        ]

        now = time.time()
        for detection in detections:
            kind = detection.get("kind")
            if kind not in {"person", "concealment", "concealment-person"}:
                continue
            label = "Shoplifting" if kind in {"concealment", "concealment-person"} else "Person"
            confidence = float(detection.get("confidence") or (0.72 if label == "Shoplifting" else 1.0))
            track_id = int(detection.get("track_id") or detection.get("associated_person") or 0)
            event_key = (track_id, label)
            if now - last_event_at_by_key.get(event_key, 0) < (2.0 if label == "Shoplifting" else 6.0):
                continue
            _store_detection_event(_event_from_detection(detection, label, confidence))
            last_event_at_by_key[event_key] = now

        banner_text = (
            "POSSIBLE CONCEALMENT - YOLO LIVE"
            if alert_detections
            else "TRACKING PEOPLE - YOLO LIVE"
            if active_people
            else "NO PERSONS DETECTED - YOLO LIVE"
        )
        jpeg = _annotate_frame(frame, detections, banner_text)
        with _lock:
            _latest_jpeg = jpeg
        elapsed = time.time() - frame_started_at
        if elapsed < frame_delay:
            time.sleep(frame_delay - elapsed)

    cap.release()


def _start_capture() -> None:
    global _capture_thread
    if _capture_thread and _capture_thread.is_alive():
        return
    _stop.clear()
    _capture_thread = threading.Thread(
        target=_annotate_loop,
        args=(CAPTURE_SOURCE,),
        daemon=True,
    )
    _capture_thread.start()


def _frame_generator() -> Generator[bytes, None, None]:
    boundary = b"--frame"
    last_id = 0
    while True:
        with _lock:
            jpeg = _latest_jpeg
        if jpeg is None:
            time.sleep(0.05)
            continue
        # Only push new frames
        new_id = id(jpeg)
        if new_id == last_id:
            time.sleep(0.02)
            continue
        last_id = new_id
        yield (
            boundary
            + b"\r\nContent-Type: image/jpeg\r\nContent-Length: "
            + str(len(jpeg)).encode()
            + b"\r\n\r\n"
            + jpeg
            + b"\r\n"
        )


# -----------------------
# FastAPI app
# -----------------------
app = FastAPI(title="SPOTTER YOLO Stream")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _on_startup() -> None:
    _start_capture()


@app.on_event("shutdown")
def _on_shutdown() -> None:
    _stop.set()


@app.get("/health")
def health() -> JSONResponse:
    alive = _capture_thread is not None and _capture_thread.is_alive()
    return JSONResponse(
        {
            "ok": True,
            "device": device,
            "capture_alive": alive,
            "source": str(CAPTURE_SOURCE),
            "classifier": "cnn_lstm" if video_model is not None else "yolo_only",
            "mongodb": mongo_db is not None,
        }
    )


@app.get("/detections")
def detections(limit: int = 25) -> JSONResponse:
    limit = max(1, min(limit, 100))
    with _lock:
        events = list(_recent_events)[:limit]
    return JSONResponse({"events": events})


@app.get("/frame")
def frame_at(t: float = 60.0) -> Response:
    frame, seconds, _total_frames, fps = _read_video_frame_at(t)
    scrub_camera_id = f"{CAMERA_ID}-scrub"
    detections = main.detect_people(frame, camera_id=scrub_camera_id)
    jpeg = _annotate_frame(
        frame,
        detections,
        f"YOLO DETECTION @ {seconds:05.1f}s - {len(detections)} OBJECTS",
    )
    return Response(
        content=jpeg,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Spotter-Time": f"{seconds:.2f}",
            "X-Spotter-Fps": str(fps),
            "X-Spotter-Detections": str(len(detections)),
        },
    )


@app.get("/video_meta")
def video_meta() -> JSONResponse:
    if not isinstance(CAPTURE_SOURCE, str):
        return JSONResponse({"source": str(CAPTURE_SOURCE), "duration": 0, "fps": 0})
    cap = cv2.VideoCapture(CAPTURE_SOURCE)
    if not cap.isOpened():
        return JSONResponse({"source": str(CAPTURE_SOURCE), "duration": 0, "fps": 0})
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        return JSONResponse(
            {
                "source": str(CAPTURE_SOURCE),
                "duration": total_frames / fps if fps else 0,
                "fps": fps,
                "totalFrames": total_frames,
            }
        )
    finally:
        cap.release()


@app.get("/video_feed")
def video_feed() -> StreamingResponse:
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
