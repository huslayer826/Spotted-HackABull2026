"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { DetectionEvent } from "@/lib/spotter-data";

function fmt(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DetectionTicker() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const response = await fetch("/api/events?limit=14", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!cancelled && Array.isArray(payload?.events)) {
        setEvents(payload.events);
      }
    }

    loadEvents();
    const id = window.setInterval(loadEvents, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="px-5 py-4 max-h-[420px] overflow-y-auto scroll-soft">
      <ul className="space-y-1.5 font-mono text-[12.5px] leading-6">
        {events.map((e, index) => {
          const colorByLabel: Record<DetectionEvent["label"], string> = {
            Shoplifting: "text-crimson-500",
            Normal: "text-moss-600",
            Monitoring: "text-ink-400",
            Person: "text-moss-600",
          };
          const tagBg: Record<DetectionEvent["label"], string> = {
            Shoplifting: "bg-crimson-500/15 text-crimson-500",
            Normal: "bg-moss-400/20 text-moss-600",
            Monitoring: "bg-paper-200 text-ink-500",
            Person: "bg-moss-400/20 text-moss-600",
          };
          return (
            <li key={e.id || index} className="flex items-start gap-2.5">
              <span className="text-ink-400 tabular-nums">{fmt(e.ts)}</span>
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
        {events.length === 0 && (
          <li className="text-ink-400">Waiting for MongoDB detection events...</li>
        )}
      </ul>
    </div>
  );
}
