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
SEQ_LEN = 16
CONF_THRESHOLD = 0.4
SKIP_FRAMES = 4

transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

track_buffers = defaultdict(lambda: deque(maxlen=SEQ_LEN))
track_labels  = defaultdict(lambda: ("Monitoring", (200, 200, 200)))

# -----------------------
# Webcam — change index if needed
# -----------------------
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    # -----------------------
    # Step 1: YOLO — detect & track persons only
    # -----------------------
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

            # Full frame into buffer (matches training data)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            track_buffers[tid].append(transform(rgb))

            # -----------------------
            # Step 2: CNN+LSTM inference
            # -----------------------
            if (len(track_buffers[tid]) == SEQ_LEN
                    and frame_count % SKIP_FRAMES == 0):

                clip = torch.stack(list(track_buffers[tid])).unsqueeze(0).to(device)

                with torch.no_grad():
                    logits = model(clip)
                    probs  = torch.softmax(logits, dim=1)[0]
                    pred   = torch.argmax(probs).item()
                    conf   = probs[pred].item()

                print(f"ID{tid} → Normal: {probs[0]:.2f} | Shoplifting: {probs[1]:.2f}")

                if pred == 1:
                    track_labels[tid] = (f"SHOPLIFTING {conf:.0%}", (0, 0, 220))
                else:
                    track_labels[tid] = (f"Normal {conf:.0%}", (0, 200, 0))

            # -----------------------
            # Step 3: Draw box + label per person
            # -----------------------
            label, color = track_labels[tid]

            # Bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 3)

            # Text background pill
            label_text = f"ID{tid}: {label}"
            (tw, th), _ = cv2.getTextSize(
                label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)
            cv2.rectangle(annotated,
                          (x1, y1 - th - 12),
                          (x1 + tw + 8, y1),
                          color, -1)
            cv2.putText(annotated, label_text,
                        (x1 + 4, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)

    # -----------------------
    # Step 4: Global status banner
    # -----------------------
    any_shoplifting = any(
        "SHOPLIFTING" in track_labels[tid][0] for tid in active_ids
    )

    if any_shoplifting:
        cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 60), (0, 0, 200), -1)
        cv2.putText(annotated, "!! SHOPLIFTING DETECTED !!",
                    (20, 42), cv2.FONT_HERSHEY_SIMPLEX,
                    1.2, (255, 255, 255), 3)
    elif active_ids:
        cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 60), (0, 140, 0), -1)
        cv2.putText(annotated, "All Clear",
                    (20, 42), cv2.FONT_HERSHEY_SIMPLEX,
                    1.2, (255, 255, 255), 3)
    else:
        cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 60), (50, 50, 50), -1)
        cv2.putText(annotated, "No persons detected",
                    (20, 42), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (200, 200, 200), 2)

    # -----------------------
    # Trim stale tracks
    # -----------------------
    for tid in list(track_buffers.keys()):
        if tid not in active_ids:
            del track_buffers[tid]
            del track_labels[tid]

    cv2.imshow("AI Security System", annotated)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()