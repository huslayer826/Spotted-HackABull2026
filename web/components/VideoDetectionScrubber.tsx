"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";

const STREAM_BASE = (
  process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/video_feed"
).replace(/\/video_feed.*$/, "");

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function VideoDetectionScrubber() {
  const [time, setTime] = useState(60);
  const [duration, setDuration] = useState(540);
  const [loadedSrc, setLoadedSrc] = useState("");

  const frameSrc = useMemo(
    () => `${STREAM_BASE}/frame?t=${time.toFixed(1)}&b=${Math.round(time * 10)}`,
    [time],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const response = await fetch(`${STREAM_BASE}/video_meta`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled && typeof payload?.duration === "number" && payload.duration > 0) {
          setDuration(Math.round(payload.duration));
        }
      } catch {
        // Keep the known 9 minute demo default.
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-ink-900/10 bg-ink-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frameSrc}
          alt={`YOLO detections at ${formatTime(time)}`}
          className="block aspect-[3/2] w-full bg-ink-950 object-contain"
          onLoad={(event) => {
            setLoadedSrc(event.currentTarget.currentSrc);
          }}
        />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-ink-900/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-paper-50 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-crimson-500 pulse-dot" />
          YOLO frame scan
        </div>
        <div className="absolute right-4 top-4 rounded-full bg-ink-900/80 px-3 py-1.5 font-mono text-[11px] tracking-wide text-paper-100 backdrop-blur-sm">
          {formatTime(time)} / {formatTime(duration)}
        </div>
      </div>

      <div className="rounded-xl border border-ink-900/10 bg-paper-100 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">
              Scrub video and run YOLO at that timestamp
            </div>
            <div className="mt-0.5 text-[12px] text-ink-500">
              The demo opens at 1:00 so detections are visible immediately.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTime(60)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-900 px-3 text-[12px] font-semibold text-paper-50 hover:bg-ink-700"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Jump to 1:00
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-10 text-right font-mono text-[12px] text-ink-500">
            {formatTime(time)}
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.5}
            value={time}
            onChange={(event) => setTime(Number(event.target.value))}
            className="h-2 flex-1 accent-crimson-500"
            aria-label="Video timestamp"
          />
          <span className="w-10 font-mono text-[12px] text-ink-500">
            {formatTime(duration)}
          </span>
          <button
            type="button"
            onClick={() => setTime(0)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-900/10 bg-paper-50 text-ink-500 hover:bg-paper-200"
            aria-label="Reset to beginning"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        Loaded {loadedSrc}
      </div>
    </div>
  );
}
