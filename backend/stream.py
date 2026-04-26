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
import threading
import time
import warnings
from collections import defaultdict, deque
from pathlib import Path
from typing import Generator, Optional

import cv2
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from ultralytics import YOLO

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parent.parent

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


def _annotate_loop(camera_index: int = 0) -> None:
    cap = cv2.VideoCapture(camera_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    if not cap.isOpened():
        print(f"[spotter] could not open camera {camera_index}")
        return

    track_buffers: dict[int, deque] = defaultdict(lambda: deque(maxlen=SEQ_LEN))
    track_labels: dict[int, tuple[str, tuple[int, int, int]]] = defaultdict(
        lambda: ("Monitoring", (200, 200, 200))
    )
    frame_count = 0

    global _latest_jpeg
    while not _stop.is_set():
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.05)
            continue

        frame_count += 1
        results = yolo_model.track(
            frame,
            persist=True,
            classes=[0],
            conf=CONF_THRESHOLD,
            imgsz=320,
            verbose=False,
        )[0]

        annotated = frame.copy()
        active_ids: set[int] = set()

        if results.boxes is not None and results.boxes.id is not None:
            boxes = results.boxes.xyxy.cpu().numpy().astype(int)
            track_ids = results.boxes.id.cpu().numpy().astype(int)
            active_ids = set(track_ids.tolist())

            for box, tid in zip(boxes, track_ids):
                x1, y1, x2, y2 = box

                # Sequence classification (only when CNN+LSTM is available)
                if video_model is not None and transform is not None:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    track_buffers[tid].append(transform(rgb))

                    if (
                        len(track_buffers[tid]) == SEQ_LEN
                        and frame_count % SKIP_FRAMES == 0
                    ):
                        clip = (
                            torch.stack(list(track_buffers[tid]))
                            .unsqueeze(0)
                            .to(device)
                        )
                        with torch.no_grad():
                            logits = video_model(clip)
                            probs = torch.softmax(logits, dim=1)[0]
                            pred = torch.argmax(probs).item()
                            conf = probs[pred].item()
                        if pred == 1:
                            track_labels[tid] = (
                                f"SHOPLIFTING {conf:.0%}",
                                (36, 45, 155),
                            )
                        else:
                            track_labels[tid] = (
                                f"Normal {conf:.0%}",
                                (95, 126, 90),
                            )
                else:
                    track_labels[tid] = ("Person", (95, 126, 90))

                label, color = track_labels[tid]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                label_text = f"ID{tid}: {label}"
                (tw, th), _ = cv2.getTextSize(
                    label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
                )
                cv2.rectangle(
                    annotated,
                    (x1, y1 - th - 10),
                    (x1 + tw + 10, y1),
                    color,
                    -1,
                )
                cv2.putText(
                    annotated,
                    label_text,
                    (x1 + 5, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (245, 238, 229),
                    2,
                )

        # Top status banner
        any_shoplifting = any(
            "SHOPLIFTING" in track_labels[tid][0] for tid in active_ids
        )
        if any_shoplifting:
            cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 56), (36, 45, 155), -1)
            cv2.putText(
                annotated,
                "!! SHOPLIFTING DETECTED !!",
                (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (245, 238, 229),
                2,
            )
        elif active_ids:
            cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 56), (95, 126, 90), -1)
            cv2.putText(
                annotated,
                "All Clear",
                (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.0,
                (245, 238, 229),
                2,
            )
        else:
            cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 56), (40, 36, 29), -1)
            cv2.putText(
                annotated,
                "No persons detected",
                (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (200, 200, 200),
                2,
            )

        # Trim stale tracks
        for tid in list(track_buffers.keys()):
            if tid not in active_ids:
                track_buffers.pop(tid, None)
                track_labels.pop(tid, None)

        ok_jpg, buf = cv2.imencode(
            ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 78]
        )
        if ok_jpg:
            with _lock:
                _latest_jpeg = buf.tobytes()

    cap.release()


def _start_capture() -> None:
    global _capture_thread
    if _capture_thread and _capture_thread.is_alive():
        return
    _stop.clear()
    camera_index = int(os.environ.get("SPOTTER_CAMERA", "0"))
    _capture_thread = threading.Thread(
        target=_annotate_loop,
        args=(camera_index,),
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
            "classifier": "cnn_lstm" if video_model is not None else "yolo_only",
        }
    )


@app.get("/video_feed")
def video_feed() -> StreamingResponse:
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
