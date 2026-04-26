from __future__ import annotations

import argparse
import json
import mimetypes
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import cv2


ROOT = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"


class AnnotatorHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        clean_path = unquote(parsed.path)
        if clean_path == "/video_meta":
            self.serve_video_meta(parsed.query)
            return
        if clean_path == "/video_frame":
            self.serve_video_frame(parsed.query)
            return
        if clean_path.startswith("/downloads/"):
            self.serve_download(clean_path, send_body=True)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        clean_path = unquote(self.path.split("?", 1)[0].split("#", 1)[0])
        if clean_path.startswith("/downloads/"):
            self.serve_download(clean_path, send_body=False)
            return
        super().do_HEAD()

    def video_path_from_query(self, query: str) -> Path:
        params = parse_qs(query)
        name = Path(params.get("name", ["cctv_gemini_anchor_full_04m00s_to_13m20s.mp4"])[0]).name
        return DOWNLOADS / name

    def serve_video_meta(self, query: str) -> None:
        path = self.video_path_from_query(query)
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            self.send_error(404, "Video not readable")
            return
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        cap.release()
        payload = json.dumps({
            "name": path.name,
            "fps": fps,
            "frames": frames,
            "duration": frames / fps if fps else 0,
            "width": width,
            "height": height,
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def serve_video_frame(self, query: str) -> None:
        params = parse_qs(query)
        path = self.video_path_from_query(query)
        try:
            timestamp = max(0.0, float(params.get("t", ["0"])[0]))
        except ValueError:
            timestamp = 0.0
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            self.send_error(404, "Video not readable")
            return
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_index = max(0, int(round(timestamp * fps)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            self.send_error(404, "Frame not readable")
            return
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 86])
        if not ok:
            self.send_error(500, "Frame encode failed")
            return
        payload = encoded.tobytes()
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def translate_path(self, path: str) -> str:
        clean_path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if clean_path.startswith("/downloads/"):
            name = Path(clean_path.removeprefix("/downloads/")).name
            return str(DOWNLOADS / name)
        return str(ROOT / clean_path.lstrip("/"))

    def serve_download(self, clean_path: str, send_body: bool) -> None:
        name = Path(clean_path.removeprefix("/downloads/")).name
        path = DOWNLOADS / name
        if not path.is_file():
            self.send_error(404, "File not found")
            return

        size = path.stat().st_size
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        range_header = self.headers.get("Range")

        if not range_header:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            if not send_body:
                return
            with path.open("rb") as f:
                shutil.copyfileobj(f, self.wfile)
            return

        try:
            unit, raw_range = range_header.split("=", 1)
            if unit.strip() != "bytes":
                raise ValueError
            start_text, end_text = raw_range.split("-", 1)
            if start_text:
                start = int(start_text)
                end = int(end_text) if end_text else size - 1
            else:
                suffix = int(end_text)
                start = max(0, size - suffix)
                end = size - 1
            if start < 0 or end >= size or start > end:
                raise ValueError
        except ValueError:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        if not send_body:
            return

        with path.open("rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the SPOTTER movement annotator and local Downloads videos.")
    parser.add_argument("--port", type=int, default=53871)
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), AnnotatorHandler)
    print(f"annotator: http://127.0.0.1:{args.port}/annotator.html", flush=True)
    print("default video: /Users/user/Downloads/cctv_gemini_anchor_full_04m00s_to_13m20s.mp4", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
