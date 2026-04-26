"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Maximize2, RefreshCw, WifiOff } from "lucide-react";

const STREAM_URL =
  process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/video_feed";

export function LiveCameraFeed() {
  const [bust, setBust] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(
          STREAM_URL.replace(/\/video_feed.*$/, "/health"),
          { cache: "no-store" },
        );
        if (!cancelled) setOnline(r.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-ink-900">
      {online === false ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center text-paper-200 max-w-md px-6">
            <WifiOff className="mx-auto h-8 w-8 text-paper-300/70" strokeWidth={1.6} />
            <div className="mt-3 text-[15px] font-medium text-paper-100">
              Stream offline
            </div>
            <p className="mt-1 text-[13px] text-paper-300/80 leading-relaxed">
              Start the YOLO backend with{" "}
              <code className="font-mono text-paper-100 bg-paper-50/10 rounded px-1.5 py-0.5 text-[12px]">
                python backend/stream.py
              </code>{" "}
              and refresh.
            </p>
            <button
              onClick={() => setBust((x) => x + 1)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-rust-500 px-3 py-1.5 text-[13px] font-medium text-paper-50 hover:bg-rust-600 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={bust}
          src={`${STREAM_URL}?t=${bust}`}
          alt="Live camera feed with YOLO detections"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Top-left: REC pill */}
      <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-ink-900/70 backdrop-blur-sm px-3 py-1.5 text-[11px] font-semibold tracking-wider text-paper-50">
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            online === false
              ? "bg-ink-400"
              : "bg-crimson-500 pulse-dot",
          )}
        />
        {online === false ? "OFFLINE" : "REC · LIVE"}
      </div>

      {/* Top-right: pipeline pill */}
      <div className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full bg-ink-900/70 backdrop-blur-sm px-3 py-1.5 text-[11px] font-mono tracking-wider text-paper-100">
        YOLOv8n · CNN+LSTM
      </div>

      {/* Bottom-right: full screen */}
      <button
        className="absolute bottom-4 right-4 grid h-9 w-9 place-items-center rounded-md bg-ink-900/70 backdrop-blur-sm text-paper-100 hover:bg-ink-900/90"
        aria-label="Fullscreen"
      >
        <Maximize2 className="h-4 w-4" strokeWidth={2} />
      </button>

      {/* Bottom-left: camera label */}
      <div className="absolute bottom-4 left-4 rounded-md bg-ink-900/70 backdrop-blur-sm px-3 py-1.5 text-paper-100">
        <div className="text-[11px] uppercase tracking-wider text-paper-300">
          Camera 01
        </div>
        <div className="text-[13px] font-medium">Webcam · Front aisle</div>
      </div>
    </div>
  );
}
