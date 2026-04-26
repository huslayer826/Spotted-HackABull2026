"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type DetectionEvent = {
  id: number;
  ts: string;
  trackId: number;
  label: "Normal" | "Shoplifting" | "Monitoring";
  confidence: number;
};

const SAMPLES: Omit<DetectionEvent, "id" | "ts">[] = [
  { trackId: 1, label: "Monitoring", confidence: 0 },
  { trackId: 2, label: "Monitoring", confidence: 0 },
  { trackId: 1, label: "Normal", confidence: 0.91 },
  { trackId: 2, label: "Normal", confidence: 0.87 },
  { trackId: 3, label: "Monitoring", confidence: 0 },
  { trackId: 1, label: "Normal", confidence: 0.94 },
  { trackId: 3, label: "Shoplifting", confidence: 0.78 },
  { trackId: 3, label: "Shoplifting", confidence: 0.84 },
  { trackId: 2, label: "Normal", confidence: 0.92 },
  { trackId: 1, label: "Normal", confidence: 0.96 },
];

function fmt(d: Date) {
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DetectionTicker() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);

  useEffect(() => {
    let i = 0;
    let nextId = 1;
    const tick = () => {
      const sample = SAMPLES[i % SAMPLES.length];
      setEvents((prev) => {
        const ev = { id: nextId++, ts: fmt(new Date()), ...sample };
        return [ev, ...prev].slice(0, 14);
      });
      i++;
    };
    tick();
    const id = setInterval(tick, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="px-5 py-4 max-h-[420px] overflow-y-auto scroll-soft">
      <ul className="space-y-1.5 font-mono text-[12.5px] leading-6">
        {events.map((e) => {
          const colorByLabel: Record<DetectionEvent["label"], string> = {
            Shoplifting: "text-crimson-500",
            Normal: "text-moss-600",
            Monitoring: "text-ink-400",
          };
          const tagBg: Record<DetectionEvent["label"], string> = {
            Shoplifting: "bg-crimson-500/15 text-crimson-500",
            Normal: "bg-moss-400/20 text-moss-600",
            Monitoring: "bg-paper-200 text-ink-500",
          };
          return (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="text-ink-400 tabular-nums">{e.ts}</span>
              <span className="text-ink-500 tabular-nums">
                ID{e.trackId.toString().padStart(2, "0")}
              </span>
              <span
                className={clsx(
                  "inline-block rounded px-1.5 text-[10.5px] font-semibold tracking-wide self-center",
                  tagBg[e.label],
                )}
              >
                {e.label.toUpperCase()}
              </span>
              <span
                className={clsx("flex-1 tabular-nums", colorByLabel[e.label])}
              >
                {e.label === "Monitoring"
                  ? "buffering frames..."
                  : `${(e.confidence * 100).toFixed(0)}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
