"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Crosshair, Maximize2, Radar, User } from "lucide-react";
import { Card } from "./Card";
import { fallbackSummary, type LiveIncident, type Summary } from "@/lib/spotter-data";

const LidarScene = dynamic(() => import("./LidarScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-ink-400 text-sm">
      Loading scene...
    </div>
  ),
});

const LEGEND = [
  { label: "Saad", color: "#ff7a1a" },
  { label: "Kareem", color: "#2f80ed" },
  { label: "Fares", color: "#39a852" },
  { label: "Omar", color: "#d08b33" },
];

function describeActivity(incident?: LiveIncident) {
  const alertType = incident?.alert?.type;
  const label = incident?.event?.label;

  if (alertType === "pocket") return "Possible item concealment";
  if (alertType === "grab") return "Product interaction near shelf";
  if (alertType === "theft" || label === "Shoplifting") return "Suspected theft behavior";
  if (label === "Person") return "Moving through monitored zone";
  if (label === "Monitoring") return "Under observation";
  return "Tracking live movement";
}

function confidenceText(incident?: LiveIncident) {
  if (typeof incident?.event?.confidence !== "number") return "live";
  return `${Math.round(incident.event.confidence * 100)}%`;
}

export function LiveLidarView({ incident }: { incident?: LiveIncident }) {
  const [summary, setSummary] = useState<Summary>(fallbackSummary);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const response = await fetch("/api/summary", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!cancelled && payload?.summary) {
        setSummary(payload.summary);
      }
    }

    loadSummary();
    const interval = window.setInterval(loadSummary, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <h3 className="text-[18px] font-semibold text-ink-900">
          Live LIDAR View
        </h3>
        <button className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rust-500 hover:text-rust-600">
          View full screen <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>

      <div className="relative mx-4 mb-4 aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-b from-paper-200/60 to-paper-100">
        {/* Three.js canvas */}
        <div className="absolute inset-0">
          <LidarScene incident={incident} />
        </div>

        {incident?.alert && (
          <div className="absolute left-3 top-3 max-w-[min(21rem,calc(100%-1.5rem))] rounded-lg bg-paper-50/90 px-3 py-2.5 text-ink-900 shadow-soft backdrop-blur-sm border border-ink-900/10">
            <div className="flex items-center gap-2">
              {incident.confirmed ? (
                <Crosshair className="h-3.5 w-3.5 text-crimson-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-rust-500" />
              )}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                {incident.confirmed ? "Target lock active" : "Alert awaiting confirm"}
              </div>
            </div>
            <div className="mt-1 text-[13px] font-semibold">
              ID{incident.alert.trackId ?? incident.event?.trackId ?? 1} · {incident.alert.location}
            </div>
            {incident.confirmed && (
              <div className="mt-1 grid gap-1 text-[12px] leading-4 text-ink-600">
                <span>{describeActivity(incident)}</span>
                <span>
                  Camera {incident.alert.cameraId || incident.event?.cameraId || "camera-01"} · Confidence {confidenceText(incident)}
                </span>
              </div>
            )}
          </div>
        )}

        {incident?.confirmed && incident.alert && (
          <div className="absolute bottom-3 right-3 hidden md:block max-w-[19rem] rounded-lg bg-ink-900/88 px-4 py-3 text-paper-50 shadow-soft backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-paper-200">
                Target acquired
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-crimson-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                <Radar className="h-3 w-3" />
                locked
              </span>
            </div>
            <div className="mt-1 text-[14px] font-semibold">
              {describeActivity(incident)}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-paper-200">
              Following Track ID{incident.alert.trackId ?? incident.event?.trackId ?? 1} through {incident.alert.location}. Reticle stays attached to their live map position.
            </div>
          </div>
        )}

        {/* Legend (top-left) */}
        <div className="absolute bottom-3 left-3 hidden md:block rounded-lg bg-paper-50/85 backdrop-blur-sm border border-ink-900/5 px-3 py-2.5 shadow-soft">
          <ul className="space-y-1.5 text-[12.5px] text-ink-800">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                {l.label}
              </li>
            ))}
          </ul>
        </div>

        {/* People in area (top-right) */}
        <div className="absolute top-3 right-3 hidden sm:block rounded-lg bg-paper-50/85 backdrop-blur-sm border border-ink-900/5 px-4 py-2.5 shadow-soft">
          <div className="text-[11px] text-ink-500">People in area</div>
          <div className="mt-0.5 flex items-center gap-2">
            <User className="h-4 w-4 text-ink-700" strokeWidth={1.8} />
            <span className="text-2xl font-semibold tabular-nums text-ink-900">
              {Math.max(summary.peopleInArea, LEGEND.length)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
