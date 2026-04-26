"use client";

import dynamic from "next/dynamic";
import { Maximize2, User } from "lucide-react";
import { Card } from "./Card";
import { RunningIcon, JarIcon, BoxIcon, PersonIcon } from "./SpotterIcons";

const LidarScene = dynamic(() => import("./LidarScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-ink-400 text-sm">
      Loading scene...
    </div>
  ),
});

const LEGEND = [
  { label: "Grabbing off shelf", color: "bg-rust-400" },
  { label: "Pocketing item", color: "bg-amber-400" },
  { label: "Stealing", color: "bg-crimson-500" },
  { label: "Person", color: "bg-moss-500" },
];

type Marker = {
  x: number;
  y: number;
  type: "stealing" | "person" | "grabbing" | "pocketing";
};

const MARKERS: Marker[] = [
  { x: 22, y: 78, type: "grabbing" },
  { x: 32, y: 60, type: "person" },
  { x: 46, y: 38, type: "person" },
  { x: 38, y: 70, type: "pocketing" },
  { x: 56, y: 65, type: "grabbing" },
  { x: 62, y: 30, type: "person" },
  { x: 68, y: 50, type: "person" },
  { x: 78, y: 70, type: "stealing" },
];

const MARKER_COLORS: Record<Marker["type"], { ring: string; bg: string }> = {
  stealing: { ring: "ring-crimson-500/60", bg: "bg-crimson-500" },
  grabbing: { ring: "ring-rust-400/60", bg: "bg-rust-400" },
  pocketing: { ring: "ring-amber-400/60", bg: "bg-amber-400" },
  person: { ring: "ring-moss-500/60", bg: "bg-moss-500" },
};

function MarkerIcon({ type }: { type: Marker["type"] }) {
  const cls = "h-3.5 w-3.5 text-paper-50";
  switch (type) {
    case "stealing":
      return <RunningIcon className={cls} strokeWidth={2.2} />;
    case "grabbing":
      return <BoxIcon className={cls} strokeWidth={2.2} />;
    case "pocketing":
      return <JarIcon className={cls} strokeWidth={2.2} />;
    case "person":
      return <PersonIcon className={cls} strokeWidth={2.2} />;
  }
}

export function LiveLidarView() {
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
          <LidarScene />
        </div>

        {/* Legend (top-left) */}
        <div className="absolute top-4 left-4 rounded-lg bg-paper-50/85 backdrop-blur-sm border border-ink-900/5 px-3.5 py-3 shadow-soft">
          <ul className="space-y-1.5 text-[12.5px] text-ink-800">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${l.color}`}
                />
                {l.label}
              </li>
            ))}
          </ul>
        </div>

        {/* People in area (top-right) */}
        <div className="absolute top-4 right-4 rounded-lg bg-paper-50/85 backdrop-blur-sm border border-ink-900/5 px-4 py-2.5 shadow-soft">
          <div className="text-[11px] text-ink-500">People in area</div>
          <div className="mt-0.5 flex items-center gap-2">
            <User className="h-4 w-4 text-ink-700" strokeWidth={1.8} />
            <span className="text-2xl font-semibold tabular-nums text-ink-900">
              5
            </span>
          </div>
        </div>

        {/* Pin markers overlaid on the scene */}
        <div className="absolute inset-0 pointer-events-none">
          {MARKERS.map((m, i) => {
            const c = MARKER_COLORS[m.type];
            return (
              <div
                key={i}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`grid h-7 w-7 place-items-center rounded-full ring-4 ${c.ring} ${c.bg} shadow-[0_4px_10px_rgba(28,24,20,0.18)]`}
                  >
                    <MarkerIcon type={m.type} />
                  </div>
                  <div
                    className={`w-0.5 h-5 ${c.bg} opacity-80`}
                    style={{
                      maskImage:
                        "linear-gradient(to bottom, black 0, black 60%, transparent)",
                    }}
                  />
                  <div className={`h-2 w-2 rounded-full ${c.bg} opacity-70`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
