import os
from ultralytics import YOLO
import cv2
import torch
import torch.nn as nn
from torchvision import transforms, models
from torchvision.models import ResNet18_Weights
from collections import deque, defaultdict
import warnings
warnings.filterwarnings("ignore", category=UserWarning)

# -----------------------
# Paths
# -----------------------
BASE_DIR = "/Users/Fares/Desktop/camera_detection/"   # root folder
SHOPLIFT_DIR = os.path.join(BASE_DIR, "shoplift")
NORMAL_DIR   = os.path.join(BASE_DIR, "normal")

video_files = []

# Collect videos with labels
for f in os.listdir(SHOPLIFT_DIR):
    if f.endswith((".mp4", ".avi", ".mov")):
        video_files.append((os.path.join(SHOPLIFT_DIR, f), "SHOPLIFTING"))

for f in os.listdir(NORMAL_DIR):
    if f.endswith((".mp4", ".avi", ".mov")):
        video_files.append((os.path.join(NORMAL_DIR, f), "NORMAL"))

# -----------------------
# Models
# -----------------------
yolo_model = YOLO("yolov8n.pt")

device = (
    "cuda" if torch.cuda.is_available()
    else "mps" if torch.backends.mps.is_available()
    else "cpu"
)
print(f"Using device: {device}")

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

model = VideoModel().to(device)
model.load_state_dict(torch.load("video_model.pth", map_location=device))
model.eval()

# -----------------------
# Config
# -----------------------
SEQ_LEN            = 16
CONF_THRESHOLD     = 0.4
SKIP_FRAMES        = 4
SHOPLIFT_MIN_CONF  = 0.60
SHOPLIFT_MIN_HITS  = 2

transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

# -----------------------
# Run on each video
# -----------------------
for video_path, label_name in video_files:
    print(f"\nProcessing: {video_path} ({label_name})")

    cap = cv2.VideoCapture(video_path)

    track_buffers     = defaultdict(lambda: deque(maxlen=SEQ_LEN))
    track_labels      = defaultdict(lambda: ("Monitoring", (200, 200, 200)))
    track_hit_counts  = defaultdict(int)

    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        results = yolo_model.track(
            frame,
            persist=True,
            classes=[0],
            conf=CONF_THRESHOLD,
            imgsz=320,
            verbose=False
        )[0]

        annotated = frame.copy()
        active_ids = set()

        if results.boxes is not None and results.boxes.id is not None:
            boxes     = results.boxes.xyxy.cpu().numpy().astype(int)
            track_ids = results.boxes.id.cpu().numpy().astype(int)
            active_ids = set(track_ids.tolist())

            for box, tid in zip(boxes, track_ids):
                x1, y1, x2, y2 = box

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                track_buffers[tid].append(transform(rgb))

                if (len(track_buffers[tid]) == SEQ_LEN
                        and frame_count % SKIP_FRAMES == 0):

                    clip = torch.stack(list(track_buffers[tid])).unsqueeze(0).to(device)

                    with torch.no_grad():
                        logits = model(clip)
                        probs  = torch.softmax(logits, dim=1)[0]
                        pred   = torch.argmax(probs).item()
                        conf   = probs[pred].item()

                    if pred == 1 and conf >= SHOPLIFT_MIN_CONF:
                        track_hit_counts[tid] += 1
                    else:
                        track_hit_counts[tid] = 0

                    if track_hit_counts[tid] >= SHOPLIFT_MIN_HITS:
                        track_labels[tid] = (f"SHOPLIFTING {conf:.0%}", (0, 0, 220))
                    elif pred == 0:
                        track_labels[tid] = (f"Normal {conf:.0%}", (0, 200, 0))
                    else:
                        track_labels[tid] = (f"Suspicious... {conf:.0%}", (0, 165, 255))

                label, color = track_labels[tid]
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)
                cv2.putText(annotated, f"ID{tid}: {label}",
                            (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

        # Overlay ground truth label
        cv2.putText(annotated, f"GT: {label_name}",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 0), 3)

        cv2.imshow("AI Security System", annotated)

        key = cv2.waitKey(1) & 0xFF
        if key == 27:  # ESC = quit everything
            cap.release()
            cv2.destroyAllWindows()
            exit()
        elif key == ord('n'):  # press 'n' to skip video
            break

    cap.release()

cv2.destroyAllWindows()
