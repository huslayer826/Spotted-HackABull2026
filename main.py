from collections import defaultdict, deque
from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import time
import warnings

import cv2
from flask import Flask, Response, jsonify, request, send_from_directory
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms
from torchvision.models import ResNet18_Weights
from ultralytics import YOLO

warnings.filterwarnings("ignore", category=UserWarning)

BASE_DIR = Path(__file__).resolve().parent
YOLO_WEIGHTS_PATH = BASE_DIR / "yolov8n.pt"
VIDEO_MODEL_PATH = BASE_DIR / "video_model.pth"
TRACK_SNAPSHOT_DIR = BASE_DIR / "track_snapshots"

SEQ_LEN = 16
CONF_THRESHOLD = 0.4
OBJECT_CONF_THRESHOLD = 0.10
SKIP_FRAMES = 4
FRAME_WIDTH = 960
FRAME_HEIGHT = 540
STREAM_BOUNDARY = b"--frame"
PERSON_CLASS_ID = 0
ITEM_CLASS_IDS = {
    24, 26, 28, 39, 41, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 67, 73
}
PRIORITY_ITEM_NAMES = {"cell phone", "bottle", "cup", "handbag", "backpack", "book"}
TRACK_BUFFER_MIN = 8
TRACK_BUFFER_MAX = 30
STABLE_TRACK_MIN_FRAMES = 8
TRACK_SNAPSHOT_COOLDOWN_SECONDS = 2.0

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

device = (
    "cuda" if torch.cuda.is_available()
    else "mps" if torch.backends.mps.is_available()
    else "cpu"
)

yolo_model = YOLO(str(YOLO_WEIGHTS_PATH))
camera_person_models = {}
camera_person_models_lock = threading.Lock()


class VideoModel(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
        self.cnn = nn.Sequential(*list(base.children())[:-1])
        self.lstm = nn.LSTM(512, 256, batch_first=True)
        self.fc = nn.Linear(256, 2)

    def forward(self, x):
        batch, frames, channels, height, width = x.shape
        x = x.view(batch * frames, channels, height, width)
        feats = self.cnn(x).view(batch, frames, 512)
        out, _ = self.lstm(feats)
        return self.fc(out[:, -1, :])


model = None
classifier_enabled = VIDEO_MODEL_PATH.exists()
if classifier_enabled:
    model = VideoModel().to(device)
    model.load_state_dict(torch.load(VIDEO_MODEL_PATH, map_location=device))
    model.eval()

transform = transforms.Compose(
    [
        transforms.ToPILImage(),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
    ]
)

feature_extractor = nn.Sequential(*list(models.resnet18(weights=ResNet18_Weights.IMAGENET1K_V1).children())[:-1]).to(device)
feature_extractor.eval()

track_buffers = defaultdict(lambda: deque(maxlen=SEQ_LEN))
track_labels = defaultdict(lambda: ("Monitoring", (160, 160, 160)))
status_lock = threading.Lock()
motion_lock = threading.Lock()
previous_analysis_gray = {}
tracking_lock = threading.Lock()
item_tracks = {}
next_item_track_id = 1
person_tracks = {}
next_person_track_id = 1
person_track_buffers = {}
PERSON_TRACK_TTL_SECONDS = 2.5
ALERT_HOLD_SECONDS = 8.0
latest_status = {
    "mode": "classification" if classifier_enabled else "detection-only",
    "banner": "booting",
    "active_tracks": 0,
    "camera": "initializing",
    "updated_at": None,
}


def update_status(**fields):
    with status_lock:
        latest_status.update(fields)
        latest_status["updated_at"] = datetime.now(timezone.utc).isoformat()


def sanitize_camera_id(camera_id):
    normalized = str(camera_id or "camera-01").strip().lower()
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in normalized) or "camera-01"


def get_person_model(camera_id):
    camera_id = sanitize_camera_id(camera_id)
    with camera_person_models_lock:
        model = camera_person_models.get(camera_id)
        if model is None:
            model = YOLO(str(YOLO_WEIGHTS_PATH))
            camera_person_models[camera_id] = model
        return model


def clip_box_to_frame(box, frame_shape):
    frame_height, frame_width = frame_shape[:2]
    x1, y1, x2, y2 = box
    ix1 = max(0, min(frame_width - 1, int(x1)))
    iy1 = max(0, min(frame_height - 1, int(y1)))
    ix2 = max(ix1 + 1, min(frame_width, int(x2)))
    iy2 = max(iy1 + 1, min(frame_height, int(y2)))
    return ix1, iy1, ix2, iy2


def extract_person_crop(frame, box):
    ix1, iy1, ix2, iy2 = clip_box_to_frame(box, frame.shape)
    crop = frame[iy1:iy2, ix1:ix2]
    return crop, (ix1, iy1, ix2, iy2)


def is_good_person_crop(crop, confidence):
    if crop.size == 0:
        return False
    height, width = crop.shape[:2]
    return confidence >= CONF_THRESHOLD and width >= 32 and height >= 64


def compute_person_feature(crop):
    rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    tensor = transform(rgb_crop).unsqueeze(0).to(device)
    with torch.no_grad():
        vector = feature_extractor(tensor).flatten(1)
        vector = torch.nn.functional.normalize(vector, dim=1)
    return vector.squeeze(0).cpu()


def person_track_key(camera_id, track_id):
    return (sanitize_camera_id(camera_id), int(track_id))


def item_track_key(camera_id, track_id):
    return (sanitize_camera_id(camera_id), int(track_id))


def save_track_snapshot(camera_id, track_id, crop, averaged_feature, timestamp):
    camera_id = sanitize_camera_id(camera_id)
    timestamp_label = timestamp.strftime("%Y%m%dT%H%M%S%fZ")
    track_dir = TRACK_SNAPSHOT_DIR / camera_id / f"track_{track_id}"
    track_dir.mkdir(parents=True, exist_ok=True)
    image_path = track_dir / f"{timestamp_label}.jpg"
    meta_path = track_dir / f"{timestamp_label}.json"
    cv2.imwrite(str(image_path), crop)
    metadata = {
        "camera_id": camera_id,
        "track_id": int(track_id),
        "timestamp": timestamp.isoformat(),
        "image_path": str(image_path.relative_to(BASE_DIR)),
        "feature_dim": int(averaged_feature.shape[0]),
        "feature": averaged_feature.tolist(),
    }
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def update_person_track_buffer(camera_id, track_id, person, crop, timestamp):
    key = person_track_key(camera_id, track_id)
    now = time.time()
    with tracking_lock:
        state = person_track_buffers.get(key)
        if state is None:
            state = {
                "camera_id": sanitize_camera_id(camera_id),
                "track_id": int(track_id),
                "feature_history": deque(maxlen=TRACK_BUFFER_MAX),
                "crop_history": deque(maxlen=TRACK_BUFFER_MAX),
                "last_seen": now,
                "frames_seen": 0,
                "last_snapshot_at": 0.0,
                "avg_feature": None,
            }
            person_track_buffers[key] = state

        state["last_seen"] = now
        state["frames_seen"] += 1
        person["frames_seen"] = state["frames_seen"]

        good_crop = is_good_person_crop(crop, person["confidence"])
        person["good_crop"] = good_crop
        person["stable"] = False
        if not good_crop:
            return

        feature = compute_person_feature(crop)
        state["feature_history"].append(feature)
        state["crop_history"].append(
            {
                "timestamp": timestamp,
                "crop": crop.copy(),
                "confidence": person["confidence"],
                "box": (person["x1"], person["y1"], person["x2"], person["y2"]),
            }
        )
        history_size = len(state["feature_history"])
        if history_size < TRACK_BUFFER_MIN:
            return

        stacked = torch.stack(list(state["feature_history"]))
        averaged_feature = torch.nn.functional.normalize(stacked.mean(dim=0, keepdim=True), dim=1).squeeze(0).cpu()
        state["avg_feature"] = averaged_feature
        person["stable"] = state["frames_seen"] >= STABLE_TRACK_MIN_FRAMES
        person["feature_buffer_size"] = history_size

        if person["stable"] and now - state["last_snapshot_at"] >= TRACK_SNAPSHOT_COOLDOWN_SECONDS:
            save_track_snapshot(camera_id, track_id, crop, averaged_feature, timestamp)
            state["last_snapshot_at"] = now


def prune_person_track_buffers(active_track_keys):
    now = time.time()
    with tracking_lock:
        for key in list(person_track_buffers.keys()):
            state = person_track_buffers[key]
            if key not in active_track_keys and now - state["last_seen"] > PERSON_TRACK_TTL_SECONDS:
                del person_track_buffers[key]


def prune_person_alert_tracks(active_track_keys):
    now = time.time()
    with tracking_lock:
        for key in list(person_tracks.keys()):
            track = person_tracks[key]
            if key not in active_track_keys and now - track["last_seen"] > PERSON_TRACK_TTL_SECONDS:
                del person_tracks[key]


def draw_clean_box(frame, x1, y1, x2, y2, color):
    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
    cv2.addWeighted(overlay, 0.14, frame, 0.86, 0, frame)

    thickness = 3
    corner = max(16, min(x2 - x1, y2 - y1) // 5)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    cv2.line(frame, (x1, y1), (x1 + corner, y1), color, thickness)
    cv2.line(frame, (x1, y1), (x1, y1 + corner), color, thickness)

    cv2.line(frame, (x2, y1), (x2 - corner, y1), color, thickness)
    cv2.line(frame, (x2, y1), (x2, y1 + corner), color, thickness)

    cv2.line(frame, (x2, y2), (x2 - corner, y2), color, thickness)
    cv2.line(frame, (x2, y2), (x2, y2 - corner), color, thickness)

    cv2.line(frame, (x1, y2), (x1 + corner, y2), color, thickness)
    cv2.line(frame, (x1, y2), (x1, y2 - corner), color, thickness)


def bbox_iou(box_a, box_b):
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = area_a + area_b - inter_area
    if denom <= 0:
        return 0.0
    return inter_area / denom


def person_concealment_zone(person):
    px1, py1, px2, py2 = person["x1"], person["y1"], person["x2"], person["y2"]
    person_width = px2 - px1
    person_height = py2 - py1
    return {
        "left": px1 + person_width * 0.12,
        "right": px2 - person_width * 0.12,
        "top": py1 + person_height * 0.52,
        "bottom": py1 + person_height * 0.92,
    }


def person_hand_zones(person):
    px1, py1, px2, py2 = person["x1"], person["y1"], person["x2"], person["y2"]
    person_width = px2 - px1
    person_height = py2 - py1
    mid_y_top = py1 + person_height * 0.42
    mid_y_bottom = py1 + person_height * 0.92
    arm_margin = person_width * 0.22
    return [
        {
            "left": px1 - arm_margin,
            "right": px1 + person_width * 0.34,
            "top": mid_y_top,
            "bottom": mid_y_bottom,
        },
        {
            "left": px2 - person_width * 0.34,
            "right": px2 + arm_margin,
            "top": mid_y_top,
            "bottom": mid_y_bottom,
        },
    ]


def classify_person_region(person, item):
    item_center_y = (item["y1"] + item["y2"]) / 2
    py1 = person["y1"]
    py2 = person["y2"]
    person_height = max(1.0, py2 - py1)
    normalized_y = (item_center_y - py1) / person_height
    if normalized_y < 0.26:
        return "head"
    if normalized_y < 0.52:
        return "upper"
    if normalized_y < 0.76:
        return "middle"
    return "legs"


def item_inside_zone(item, zone):
    item_center_x = (item["x1"] + item["x2"]) / 2
    item_center_y = (item["y1"] + item["y2"]) / 2
    return (
        zone["left"] <= item_center_x <= zone["right"]
        and zone["top"] <= item_center_y <= zone["bottom"]
    )


def box_center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def normalized_center_distance(box_a, box_b):
    ax, ay = box_center(box_a)
    bx, by = box_center(box_b)
    aw = max(1.0, box_a[2] - box_a[0])
    ah = max(1.0, box_a[3] - box_a[1])
    bw = max(1.0, box_b[2] - box_b[0])
    bh = max(1.0, box_b[3] - box_b[1])
    scale = max(1.0, (aw + ah + bw + bh) / 4.0)
    return (((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5) / scale


def normalized_displacement(box_a, box_b):
    ax, ay = box_center(box_a)
    bx, by = box_center(box_b)
    reference_height = max(1.0, box_a[3] - box_a[1], box_b[3] - box_b[1])
    return (((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5) / reference_height


def assign_item_tracks(items, camera_id="camera-01"):
    global next_item_track_id

    now = time.time()
    camera_id = sanitize_camera_id(camera_id)
    with tracking_lock:
        for key in list(item_tracks.keys()):
            if key[0] != camera_id:
                continue
            if now - item_tracks[key]["last_seen"] > 1.8:
                del item_tracks[key]

        unmatched_track_ids = {key for key in item_tracks.keys() if key[0] == camera_id}

        for item in items:
            item_box = (item["x1"], item["y1"], item["x2"], item["y2"])
            best_track_key = None
            best_iou = 0.0
            best_distance = None

            for track_key in unmatched_track_ids:
                track = item_tracks[track_key]
                if track["class_name"] != item["class_name"]:
                    continue
                score = bbox_iou(item_box, track["box"])
                distance = normalized_center_distance(item_box, track["box"])
                if score > best_iou or (
                    score > 0.05 and best_iou <= 0.05 and (best_distance is None or distance < best_distance)
                ) or (
                    best_iou <= 0.05 and distance < 2.2 and (best_distance is None or distance < best_distance)
                ):
                    best_iou = score
                    best_distance = distance
                    best_track_key = track_key

            if best_track_key is None or (best_iou < 0.22 and (best_distance is None or best_distance >= 2.2)):
                local_track_id = next_item_track_id
                next_item_track_id += 1
                best_track_key = item_track_key(camera_id, local_track_id)
                item_tracks[best_track_key] = {
                    "box": item_box,
                    "first_box": item_box,
                    "class_name": item["class_name"],
                    "last_seen": now,
                    "frames_seen": 0,
                    "moving_frames": 0,
                    "max_displacement": 0.0,
                    "was_inside_zone": False,
                    "ever_visible_outside": False,
                    "last_associated_person_box": None,
                    "last_near_hand": False,
                    "missing_since": None,
                }

            track = item_tracks[best_track_key]
            movement = normalized_displacement(item_box, track["box"])
            total_displacement = normalized_displacement(item_box, track["first_box"])
            if movement > 0.10:
                track["moving_frames"] += 1
            track["max_displacement"] = max(track["max_displacement"], total_displacement)
            track["box"] = item_box
            track["last_seen"] = now
            track["frames_seen"] += 1
            track["missing_since"] = None
            item["moving_frames"] = track["moving_frames"]
            item["max_displacement"] = track["max_displacement"]
            item["track_id"] = best_track_key[1]
            unmatched_track_ids.discard(best_track_key)

        for track_key in unmatched_track_ids:
            track = item_tracks.get(track_key)
            if track is not None and track["missing_since"] is None:
                track["missing_since"] = now

    return items


def assign_person_tracks(people, camera_id="camera-01"):
    global next_person_track_id

    now = time.time()
    camera_id = sanitize_camera_id(camera_id)
    with tracking_lock:
        for key in list(person_tracks.keys()):
            if key[0] != camera_id:
                continue
            if now - person_tracks[key]["last_seen"] > PERSON_TRACK_TTL_SECONDS:
                del person_tracks[key]

        unmatched_track_ids = {key for key in person_tracks.keys() if key[0] == camera_id}

        for person in people:
            person_box = (person["x1"], person["y1"], person["x2"], person["y2"])
            best_track_key = None
            best_score = 0.0

            for track_key in unmatched_track_ids:
                score = bbox_iou(person_box, person_tracks[track_key]["box"])
                if score > best_score:
                    best_score = score
                    best_track_key = track_key

            if best_track_key is None or best_score < 0.28:
                local_track_id = next_person_track_id
                next_person_track_id += 1
                best_track_key = person_track_key(camera_id, local_track_id)
                person_tracks[best_track_key] = {
                    "box": person_box,
                    "last_seen": now,
                    "frames_seen": 0,
                    "alert_until": 0.0,
                    "alert_reason": None,
                }

            track = person_tracks[best_track_key]
            track["box"] = person_box
            track["last_seen"] = now
            track["frames_seen"] += 1
            person["track_id"] = best_track_key[1]
            person["alert_active"] = track["alert_until"] > now
            person["alert_reason"] = track["alert_reason"]
            unmatched_track_ids.discard(best_track_key)

    return people


def open_camera():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    if not cap.isOpened():
        update_status(camera="permission-required", banner="camera unavailable")
        raise RuntimeError("Could not open webcam 0.")
    update_status(camera="online")
    return cap


def analyze_frame(frame, frame_count, camera_id="camera-00"):
    camera_id = sanitize_camera_id(camera_id)
    results = get_person_model(camera_id).track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[0],
        conf=CONF_THRESHOLD,
        imgsz=640,
        verbose=False,
    )[0]

    annotated = frame.copy()
    active_ids = set()
    active_track_keys = set()
    timestamp = datetime.now(timezone.utc)

    if results.boxes is not None and results.boxes.id is not None:
        boxes = results.boxes.xyxy.cpu().numpy().astype(int)
        track_ids = results.boxes.id.cpu().numpy().astype(int)
        active_ids = set(track_ids.tolist())

        for box, tid in zip(boxes, track_ids):
            x1, y1, x2, y2 = box
            crop, _ = extract_person_crop(frame, (x1, y1, x2, y2))
            if is_good_person_crop(crop, 1.0):
                track_buffers[(camera_id, tid)].append(transform(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)))

            person = {
                "x1": float(x1),
                "y1": float(y1),
                "x2": float(x2),
                "y2": float(y2),
                "confidence": 1.0,
                "track_id": int(tid),
            }
            update_person_track_buffer(camera_id, tid, person, crop, timestamp)
            active_track_keys.add(person_track_key(camera_id, tid))

            if (
                classifier_enabled
                and len(track_buffers[(camera_id, tid)]) == SEQ_LEN
                and frame_count % SKIP_FRAMES == 0
            ):
                clip = torch.stack(list(track_buffers[(camera_id, tid)])).unsqueeze(0).to(device)
                with torch.no_grad():
                    logits = model(clip)
                    probs = torch.softmax(logits, dim=1)[0]
                    pred = torch.argmax(probs).item()
                    conf = probs[pred].item()

                if pred == 1:
                    track_labels[(camera_id, tid)] = (f"SHOPLIFTING {conf:.0%}", (0, 0, 220))
                else:
                    track_labels[(camera_id, tid)] = (f"Normal {conf:.0%}", (0, 190, 0))
            elif not classifier_enabled:
                label = f"Person #{tid}"
                if person.get("stable"):
                    label = f"Stable #{tid} ({person.get('feature_buffer_size', 0)})"
                track_labels[(camera_id, tid)] = (label, (0, 170, 255))

            _, color = track_labels[(camera_id, tid)]
            draw_clean_box(annotated, x1, y1, x2, y2, color)

    any_shoplifting = classifier_enabled and any(
        "SHOPLIFTING" in track_labels[(camera_id, tid)][0] for tid in active_ids
    )

    if any_shoplifting:
        banner = "shoplifting detected"
        banner_color = (0, 0, 200)
        banner_text = "!! SHOPLIFTING DETECTED !!"
    elif active_ids and classifier_enabled:
        banner = "all clear"
        banner_color = (0, 140, 0)
        banner_text = "All Clear"
    elif active_ids:
        banner = "tracking people"
        banner_color = (0, 110, 180)
        banner_text = "Tracking people (classifier offline)"
    else:
        banner = "idle"
        banner_color = (50, 50, 50)
        banner_text = "No persons detected"

    cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 60), banner_color, -1)
    cv2.putText(
        annotated,
        banner_text,
        (20, 42),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0 if not any_shoplifting else 1.2,
        (255, 255, 255),
        2 if not any_shoplifting else 3,
    )

    for key in list(track_buffers.keys()):
        if key[0] == camera_id and key[1] not in active_ids:
            del track_buffers[key]
            track_labels.pop(key, None)

    prune_person_track_buffers(active_track_keys)
    prune_person_alert_tracks(active_track_keys)

    update_status(
        banner=banner,
        active_tracks=len(active_ids),
        classifier="online" if classifier_enabled else "offline",
        camera=camera_id,
    )
    return annotated


def frame_stream():
    cap = open_camera()
    frame_count = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                update_status(camera="read-failure", banner="camera read failure")
                continue

            frame_count += 1
            annotated = analyze_frame(frame, frame_count, camera_id="camera-00")
            ok, buffer = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82]
            )
            if not ok:
                continue

            payload = buffer.tobytes()
            yield (
                STREAM_BOUNDARY
                + b"\r\nContent-Type: image/jpeg\r\nContent-Length: "
                + str(len(payload)).encode("ascii")
                + b"\r\n\r\n"
                + payload
                + b"\r\n"
            )
    finally:
        cap.release()
        update_status(camera="offline")


def detect_people(frame, camera_id="camera-01"):
    global previous_analysis_gray
    camera_id = sanitize_camera_id(camera_id)

    item_results = yolo_model(
        frame,
        classes=[PERSON_CLASS_ID, *sorted(ITEM_CLASS_IDS)],
        conf=OBJECT_CONF_THRESHOLD,
        imgsz=640,
        verbose=False,
    )[0]
    person_results = get_person_model(camera_id).track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[PERSON_CLASS_ID],
        conf=CONF_THRESHOLD,
        imgsz=640,
        verbose=False,
    )[0]

    detections = []
    people = []
    items = []
    frame_height, frame_width = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    class_names = yolo_model.names
    with motion_lock:
        previous_gray = previous_analysis_gray.get(camera_id)
        if previous_gray is None or previous_gray.shape != gray.shape:
            motion_map = np.full_like(gray, 255)
        else:
            motion_map = cv2.absdiff(gray, previous_gray)
        previous_analysis_gray[camera_id] = gray

    active_track_keys = set()
    timestamp = datetime.now(timezone.utc)

    if person_results.boxes is not None and person_results.boxes.id is not None:
        person_boxes = person_results.boxes.xyxy.cpu().numpy().astype(float)
        person_confs = person_results.boxes.conf.cpu().numpy().astype(float)
        person_track_ids = person_results.boxes.id.cpu().numpy().astype(int)
        for box, conf, track_id in zip(person_boxes, person_confs, person_track_ids):
            x1, y1, x2, y2 = box.tolist()
            box_width = max(0.0, x2 - x1)
            box_height = max(0.0, y2 - y1)
            box_area = box_width * box_height

            ix1, iy1, ix2, iy2 = clip_box_to_frame((x1, y1, x2, y2), frame.shape)
            motion_crop = motion_map[iy1:iy2, ix1:ix2]
            motion_score = float(motion_crop.mean()) if motion_crop.size else 0.0
            lower_frame_bias = y2 / frame_height

            if box_area < frame_width * frame_height * 0.02:
                continue
            if y2 < frame_height * 0.62:
                continue
            if motion_score < 6.0 and lower_frame_bias < 0.78:
                continue

            person = {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "confidence": conf,
                "motion_score": motion_score,
                "kind": "person",
                "track_id": int(track_id),
                "label": f"Person #{int(track_id)} {conf:.0%}",
            }
            crop, _ = extract_person_crop(frame, (x1, y1, x2, y2))
            update_person_track_buffer(camera_id, track_id, person, crop, timestamp)
            active_track_keys.add(person_track_key(camera_id, track_id))
            with tracking_lock:
                track = person_tracks.get(person_track_key(camera_id, track_id))
                if track is None:
                    track = {
                        "box": (x1, y1, x2, y2),
                        "last_seen": time.time(),
                        "frames_seen": 0,
                        "alert_until": 0.0,
                        "alert_reason": None,
                    }
                    person_tracks[person_track_key(camera_id, track_id)] = track
                track["box"] = (x1, y1, x2, y2)
                track["last_seen"] = time.time()
                track["frames_seen"] += 1
                person["alert_active"] = track["alert_until"] > time.time()
                person["alert_reason"] = track["alert_reason"]
            if person.get("stable"):
                person["label"] = f"Person #{int(track_id)} stable"
            people.append(person)

    if item_results.boxes is not None:
        boxes = item_results.boxes.xyxy.cpu().numpy().astype(float)
        confs = item_results.boxes.conf.cpu().numpy().astype(float)
        class_ids = item_results.boxes.cls.cpu().numpy().astype(int)
        for box, conf, class_id in zip(boxes, confs, class_ids):
            if class_id == PERSON_CLASS_ID:
                continue
            x1, y1, x2, y2 = box.tolist()
            box_width = max(0.0, x2 - x1)
            box_height = max(0.0, y2 - y1)
            box_area = box_width * box_height
            class_name = str(class_names.get(class_id, class_id))

            min_item_area = 0.00045 if class_name in PRIORITY_ITEM_NAMES else 0.0015
            if box_area < frame_width * frame_height * min_item_area:
                continue
            if y2 < frame_height * 0.35:
                continue
            if conf < (0.10 if class_name in PRIORITY_ITEM_NAMES else 0.18):
                continue

            ix1, iy1, ix2, iy2 = clip_box_to_frame((x1, y1, x2, y2), frame.shape)
            motion_crop = motion_map[iy1:iy2, ix1:ix2]
            motion_score = float(motion_crop.mean()) if motion_crop.size else 0.0

            items.append(
                {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": conf,
                    "motion_score": motion_score,
                    "kind": "item",
                    "class_name": class_name,
                    "label": f"{class_name} {conf:.0%}",
                }
            )

    people.sort(
        key=lambda detection: (detection["y2"] - detection["y1"]) * (detection["x2"] - detection["x1"]),
        reverse=True,
    )
    items = assign_item_tracks(items, camera_id=camera_id)
    synthetic_alerts = []

    for item in items:
        item_center_x = (item["x1"] + item["x2"]) / 2
        item_center_y = (item["y1"] + item["y2"]) / 2
        nearest_person = None
        nearest_distance = None

        for person in people:
            px1, py1, px2, py2 = person["x1"], person["y1"], person["x2"], person["y2"]
            if not (px1 <= item_center_x <= px2 and py1 <= item_center_y <= py2):
                continue

            person_center_x = (px1 + px2) / 2
            person_center_y = (py1 + py2) / 2
            distance = (item_center_x - person_center_x) ** 2 + (item_center_y - person_center_y) ** 2
            if nearest_distance is None or distance < nearest_distance:
                nearest_distance = distance
                nearest_person = person

        if nearest_person is None:
            item["associated_person"] = None
            item["concealment_risk"] = False
            with tracking_lock:
                track = item_tracks.get(item_track_key(camera_id, item["track_id"]))
                if track is not None:
                    track["ever_visible_outside"] = True
            continue

        px1, py1, px2, py2 = (
            nearest_person["x1"],
            nearest_person["y1"],
            nearest_person["x2"],
            nearest_person["y2"],
        )
        zone = person_concealment_zone(nearest_person)
        inside_concealment_zone = item_inside_zone(item, zone)
        near_hand_zone = any(item_inside_zone(item, hand_zone) for hand_zone in person_hand_zones(nearest_person))
        body_region = classify_person_region(nearest_person, item)

        item["associated_person"] = nearest_person.get("track_id")
        item["body_region"] = body_region

        with tracking_lock:
            track = item_tracks.get(item_track_key(camera_id, item["track_id"]))
            if track is not None:
                if not inside_concealment_zone:
                    track["ever_visible_outside"] = True

                track["last_associated_person_box"] = (
                    nearest_person["x1"],
                    nearest_person["y1"],
                    nearest_person["x2"],
                    nearest_person["y2"],
                )
                track["last_near_hand"] = near_hand_zone or track["last_near_hand"]
                item_has_interaction = (
                    near_hand_zone
                    and (
                        (item["motion_score"] >= 12.0 and track["moving_frames"] >= 1)
                        or track["moving_frames"] >= 2
                    )
                )
                concealment_transition = (
                    inside_concealment_zone
                    and body_region in {"middle", "legs"}
                    and track["ever_visible_outside"]
                    and not track["was_inside_zone"]
                    and track["frames_seen"] >= 3
                    and item_has_interaction
                )
                track["was_inside_zone"] = inside_concealment_zone
            else:
                concealment_transition = False

        item["concealment_risk"] = concealment_transition
        item["label"] = f"{item['class_name']} #{item['track_id']} {body_region} {item['confidence']:.0%}"
        if concealment_transition:
            item["kind"] = "concealment"
            item["label"] = f"Possible concealment: {item['class_name']} #{item['track_id']}"
            with tracking_lock:
                person_track = person_tracks.get(person_track_key(camera_id, nearest_person["track_id"]))
                if person_track is not None:
                    person_track["alert_until"] = time.time() + ALERT_HOLD_SECONDS
                    person_track["alert_reason"] = item["label"]

    now = time.time()
    with tracking_lock:
        for track_key, track in item_tracks.items():
            if track_key[0] != camera_id:
                continue
            track_id = track_key[1]
            if track["missing_since"] is None:
                continue
            if now - track["missing_since"] > 1.2:
                continue
            if not track["ever_visible_outside"]:
                continue
            if track["last_associated_person_box"] is None:
                continue

            associated_person = None
            best_iou = 0.0
            for person in people:
                iou = bbox_iou(
                    (
                        person["x1"],
                        person["y1"],
                        person["x2"],
                        person["y2"],
                    ),
                    track["last_associated_person_box"],
                )
                if iou > best_iou:
                    best_iou = iou
                    associated_person = person

            if associated_person is None or best_iou < 0.22:
                continue

            person_zone = person_concealment_zone(associated_person)
            last_center_x, last_center_y = box_center(track["box"])
            vanished_near_torso = (
                person_zone["left"] <= last_center_x <= person_zone["right"]
                and person_zone["top"] <= last_center_y <= person_zone["bottom"]
            )

            if not track["last_near_hand"]:
                continue
            if not (track["was_inside_zone"] or vanished_near_torso):
                continue
            if track["frames_seen"] < 3:
                continue
            if track["moving_frames"] < 2:
                continue

            alert_label = f"Possible concealment: {track['class_name']} #{track_id}"
            person_track = person_tracks.get(person_track_key(camera_id, associated_person["track_id"]))
            if person_track is not None:
                person_track["alert_until"] = now + ALERT_HOLD_SECONDS
                person_track["alert_reason"] = alert_label

            synthetic_alerts.append(
                {
                    "x1": associated_person["x1"],
                    "y1": associated_person["y1"],
                    "x2": associated_person["x2"],
                    "y2": associated_person["y2"],
                    "confidence": 0.51,
                    "kind": "concealment",
                    "label": alert_label,
                }
            )

    active_person_alerts = []
    with tracking_lock:
        for person in people:
            person_track = person_tracks.get(person_track_key(camera_id, person["track_id"]))
            if person_track is None:
                continue
            if person_track["alert_until"] > now:
                person["kind"] = "concealment-person"
                person["label"] = person_track["alert_reason"] or f"Alert person #{person['track_id']}"
                person["alert_active"] = True
                active_person_alerts.append(person)

    detections.extend(people)
    detections.extend(items)
    detections.extend(synthetic_alerts)

    update_status(
        banner="possible concealment" if any(item.get("concealment_risk") for item in items) or synthetic_alerts or active_person_alerts else "tracking people" if people else "idle",
        active_tracks=len(people),
        classifier="online" if classifier_enabled else "offline",
        camera=camera_id,
    )
    prune_person_track_buffers(active_track_keys)
    prune_person_alert_tracks(active_track_keys)
    return detections


@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/watch")
def watch():
    return send_from_directory(BASE_DIR, "watch.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(BASE_DIR, "styles.css")


@app.get("/main.js")
def script():
    return send_from_directory(BASE_DIR, "main.js")


@app.get("/watch.css")
def watch_styles():
    return send_from_directory(BASE_DIR, "watch.css")


@app.get("/watch.js")
def watch_script():
    return send_from_directory(BASE_DIR, "watch.js")


@app.get("/video_feed")
def video_feed():
    return Response(
        frame_stream(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/analyze_frame")
def analyze_browser_frame():
    payload = request.get_data()
    if not payload:
        return jsonify({"error": "empty frame payload"}), 400
    camera_id = sanitize_camera_id(request.headers.get("X-Camera-Id") or request.args.get("camera_id") or "camera-01")

    np_frame = np.frombuffer(payload, dtype=np.uint8)
    frame = cv2.imdecode(np_frame, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"error": "invalid image payload"}), 400

    detections = detect_people(frame, camera_id=camera_id)
    return jsonify(
        {
            "detections": detections,
            "frame_width": int(frame.shape[1]),
            "frame_height": int(frame.shape[0]),
            "camera_id": camera_id,
        }
    )


@app.get("/status")
def status():
    with status_lock:
        return jsonify(latest_status)


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "device": device, "mode": latest_status["mode"]})


if __name__ == "__main__":
    print(f"Using device: {device}")
    if classifier_enabled:
        print(f"Loaded video classifier weights from {VIDEO_MODEL_PATH.name}")
    else:
        print(
            "video_model.pth not found; starting realtime detection-only web viewer."
        )

    print("Open http://localhost:8000 to view the live stream.")
    app.run(host="localhost", port=8000, debug=False, threaded=True, use_reloader=False)
