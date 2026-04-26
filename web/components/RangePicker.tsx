"use client";

import { useState } from "react";
import clsx from "clsx";

type Range = { id: "live" | "24h" | "7d" | "30d"; label: string; liveDot?: boolean };

const RANGES: readonly Range[] = [
  { id: "live", label: "Live", liveDot: true },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
];

type RangeId = Range["id"];

export function RangePicker() {
  const [active, setActive] = useState<RangeId>("live");
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-paper-50 border border-ink-900/5 p-1">
      {RANGES.map((r) => {
        const isActive = active === r.id;
        return (
          <button
            key={r.id}
            onClick={() => setActive(r.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-paper-200 text-ink-900"
                : "text-ink-500 hover:text-ink-900",
            )}
          >
            {r.liveDot && (
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  isActive ? "bg-rust-500 pulse-dot" : "bg-ink-400",
                )}
              />
            )}
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
