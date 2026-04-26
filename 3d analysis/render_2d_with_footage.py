from __future__ import annotations

import argparse
from pathlib import Path

import cv2


def parse_args():
    parser = argparse.ArgumentParser(description="Compose real CCTV footage side-by-side with the 2D tracking map.")
    parser.add_argument("--left", default="/Users/user/Downloads/IMG_6464_00000000.mov")
    parser.add_argument("--right", default="/Users/user/Downloads/IMG_4552_00003317.mov")
    parser.add_argument("--map", default="/Users/user/Downloads/middle_30s_gemini_labeled_2d_tracking.mp4")
    parser.add_argument("--start", type=float, default=393.0)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--output", default="/Users/user/Downloads/middle_30s_footage_plus_2d_map.mp4")
    return parser.parse_args()


def open_video(path):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"Could not open {path}")
    return cap


def main():
    args = parse_args()
    cap6464 = open_video(args.left)
    cap4552 = open_video(args.right)
    capmap = open_video(args.map)

    fps6464 = cap6464.get(cv2.CAP_PROP_FPS) or 60.0
    fps4552 = cap4552.get(cv2.CAP_PROP_FPS) or 30.0
    map_fps = capmap.get(cv2.CAP_PROP_FPS) or 5.0
    out_fps = 5.0
    total = int(args.seconds * out_fps)

    out_w, out_h = 1920, 720
    writer = cv2.VideoWriter(args.output, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (out_w, out_h))
    if not writer.isOpened():
        raise SystemExit(f"Could not create {args.output}")

    for i in range(total):
        t = args.start + i / out_fps
        cap6464.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps6464))
        cap4552.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps4552))
        capmap.set(cv2.CAP_PROP_POS_FRAMES, int((i / out_fps) * map_fps))
        ok1, f1 = cap6464.read()
        ok2, f2 = cap4552.read()
        okm, fm = capmap.read()
        if not (ok1 and ok2 and okm):
            break

        f1 = cv2.resize(f1, (300, 533), interpolation=cv2.INTER_AREA)
        f2 = cv2.resize(f2, (300, 533), interpolation=cv2.INTER_AREA)
        footage = cv2.hconcat([f1, f2])
        footage = cv2.copyMakeBorder(footage, 46, 141, 20, 20, cv2.BORDER_CONSTANT, value=(245, 245, 242))
        cv2.putText(footage, f"real synced footage  t={t:05.1f}s", (28, 31), cv2.FONT_HERSHEY_SIMPLEX, 0.78, (30, 30, 30), 2, cv2.LINE_AA)
        cv2.putText(footage, "6464", (36, 74), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(footage, "4552", (336, 74), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

        map_panel = cv2.resize(fm, (1280, 720), interpolation=cv2.INTER_AREA)
        combined = cv2.hconcat([footage, map_panel])
        writer.write(combined)

    for cap in [cap6464, cap4552, capmap]:
        cap.release()
    writer.release()
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
