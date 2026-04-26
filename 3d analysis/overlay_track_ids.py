from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import torch
from torchreid import models as reid_models
from torchvision import transforms
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = BASE_DIR / "yolov8n.pt"

COLORS = [
    (64, 132, 255),
    (62, 194, 126),
    (245, 166, 35),
    (220, 86, 86),
    (155, 89, 182),
    (40, 180, 200),
    (230, 105, 180),
    (140, 140, 140),
]

DEVICE = (
    "cuda" if torch.cuda.is_available()
    else "mps" if torch.backends.mps.is_available()
    else "cpu"
)
TRANSFORM = transforms.Compose(
    [
        transforms.ToPILImage(),
        transforms.Resize((256, 128)),
        transforms.ToTensor(),
    ]
)
FEATURE_EXTRACTOR = reid_models.build_model(name="osnet_x1_0", num_classes=1000, pretrained=True).to(DEVICE)
FEATURE_EXTRACTOR.eval()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render synced side-by-side videos with YOLO/ByteTrack person IDs.")
    parser.add_argument("--left", default="/Users/user/Downloads/IMG_6464_00000000.mov")
    parser.add_argument("--right", default="/Users/user/Downloads/IMG_4552_00003317.mov")
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--seconds", type=float, default=120.0)
    parser.add_argument("--output", default="/Users/user/Downloads/cctv_side_by_side_track_ids.mp4")
    parser.add_argument("--model", default=str(DEFAULT_MODEL))
    parser.add_argument("--conf", type=float, default=0.28)
    parser.add_argument("--reid-threshold", type=float, default=0.84)
    parser.add_argument("--memory-seconds", type=float, default=90.0)
    return parser.parse_args()


def open_video(path: str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {path}")
    return cap


def clip_box(frame, box):
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1 = max(0, min(w - 1, x1))
    y1 = max(0, min(h - 1, y1))
    x2 = max(x1 + 1, min(w, x2))
    y2 = max(y1 + 1, min(h, y2))
    return x1, y1, x2, y2


def crop_embedding(frame, box):
    x1, y1, x2, y2 = clip_box(frame, box)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 64 or crop.shape[1] < 24:
        return None
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    tensor = TRANSFORM(rgb).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        feature = FEATURE_EXTRACTOR(tensor)
        if isinstance(feature, tuple):
            feature = feature[0]
        feature = feature.flatten(1)
        feature = torch.nn.functional.normalize(feature, dim=1)
    return feature.squeeze(0).cpu().numpy()


def cosine(a, b):
    return float(np.dot(a, b) / ((np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8))


class AppearanceMemory:
    def __init__(self, threshold: float, memory_seconds: float):
        self.threshold = threshold
        self.memory_seconds = memory_seconds
        self.raw_to_person = {}
        self.people = {}
        self.next_person = 1
        self.active_this_frame = set()

    def begin_frame(self):
        self.active_this_frame.clear()

    def _name(self, person_id: int) -> str:
        names = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        if person_id <= len(names):
            return f"Person {names[person_id - 1]}"
        return f"Person {person_id}"

    def assign(self, raw_id: int, embedding, timestamp: float) -> tuple[int, str, float | None, bool]:
        if raw_id in self.raw_to_person:
            person_id = self.raw_to_person[raw_id]
            matched = False
            score = None
        else:
            person_id = None
            score = None
            matched = False
            if embedding is not None:
                best_id = None
                best_score = -1.0
                for candidate_id, person in self.people.items():
                    if candidate_id in self.active_this_frame:
                        continue
                    if timestamp - person["last_seen"] > self.memory_seconds:
                        continue
                    candidate_score = cosine(embedding, person["avg"])
                    if candidate_score > best_score:
                        best_id = candidate_id
                        best_score = candidate_score
                if best_id is not None and best_score >= self.threshold:
                    person_id = best_id
                    score = best_score
                    matched = True
            if person_id is None:
                person_id = self.next_person
                self.next_person += 1
            self.raw_to_person[raw_id] = person_id

        self.active_this_frame.add(person_id)

        if embedding is not None:
            person = self.people.get(person_id)
            if person is None:
                self.people[person_id] = {
                    "features": deque([embedding], maxlen=24),
                    "avg": embedding,
                    "last_seen": timestamp,
                }
            else:
                person["features"].append(embedding)
                person["avg"] = np.mean(np.stack(list(person["features"])), axis=0)
                person["avg"] = person["avg"] / (np.linalg.norm(person["avg"]) + 1e-8)
                person["last_seen"] = timestamp

        return person_id, self._name(person_id), score, matched


def draw_detections(frame, results, camera_label: str, memory: AppearanceMemory, timestamp: float):
    annotated = frame.copy()
    cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 52), (20, 20, 20), -1)
    cv2.putText(annotated, camera_label, (16, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)

    if results.boxes is None or results.boxes.id is None:
        return annotated

    boxes = results.boxes.xyxy.cpu().numpy()
    ids = results.boxes.id.cpu().numpy().astype(int)
    confs = results.boxes.conf.cpu().numpy()
    for box, track_id, conf in zip(boxes, ids, confs):
        x1, y1, x2, y2 = [int(v) for v in box.tolist()]
        embedding = crop_embedding(frame, (x1, y1, x2, y2))
        person_id, person_label, score, matched = memory.assign(int(track_id), embedding, timestamp)
        color = COLORS[int(person_id) % len(COLORS)]
        suffix = f" reID {score:.2f}" if matched and score is not None else ""
        label = f"{person_label} | raw {camera_label}-{track_id} {conf:.0%}{suffix}"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.72, 2)
        y_text = max(55, y1 - th - 12)
        cv2.rectangle(annotated, (x1, y_text), (min(annotated.shape[1] - 1, x1 + tw + 12), y_text + th + 12), color, -1)
        cv2.putText(annotated, label, (x1 + 6, y_text + th + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2)
        foot = (int((x1 + x2) / 2), y2)
        cv2.circle(annotated, foot, 7, color, -1)
    return annotated


def main() -> None:
    args = parse_args()
    caps = {
        "6464": open_video(args.left),
        "4552": open_video(args.right),
    }
    models = {
        "6464": YOLO(args.model),
        "4552": YOLO(args.model),
    }
    memories = {
        "6464": AppearanceMemory(args.reid_threshold, args.memory_seconds),
        "4552": AppearanceMemory(args.reid_threshold, args.memory_seconds),
    }
    fps = {cam: caps[cam].get(cv2.CAP_PROP_FPS) or 30.0 for cam in caps}
    out_fps = 30.0
    total = int(args.seconds * out_fps)
    target_w, target_h = 540, 960
    writer = cv2.VideoWriter(
        args.output,
        cv2.VideoWriter_fourcc(*"mp4v"),
        out_fps,
        (target_w * 2, target_h),
    )
    if not writer.isOpened():
        raise SystemExit(f"Could not create output: {args.output}")

    skip_extra = {cam: max(0, round(fps[cam] / out_fps) - 1) for cam in caps}
    for cam, cap in caps.items():
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(args.start * fps[cam]))

    for i in range(total):
        frames = {}
        timestamp = args.start + (i / out_fps)
        for memory in memories.values():
            memory.begin_frame()
        for cam, cap in caps.items():
            ok, frame = cap.read()
            if not ok:
                writer.release()
                raise SystemExit(f"Stopped early reading {cam} at output frame {i}")
            for _ in range(skip_extra[cam]):
                cap.grab()
            result = models[cam].track(frame, classes=[0], conf=args.conf, persist=True, tracker="bytetrack.yaml", verbose=False)[0]
            annotated = draw_detections(frame, result, cam, memories[cam], timestamp)
            frames[cam] = cv2.resize(annotated, (target_w, target_h), interpolation=cv2.INTER_AREA)

        combined = cv2.hconcat([frames["6464"], frames["4552"]])
        cv2.putText(combined, f"t={timestamp:05.1f}s", (470, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        writer.write(combined)
        if i and i % 900 == 0:
            print(f"rendered {i / out_fps:.0f}s/{args.seconds:.0f}s", flush=True)

    for cap in caps.values():
        cap.release()
    writer.release()
    print(f"wrote {args.output}", flush=True)


if __name__ == "__main__":
    main()
