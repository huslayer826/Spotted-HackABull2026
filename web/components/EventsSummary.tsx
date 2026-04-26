"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "./Card";
import { fallbackSummary, type Summary } from "@/lib/spotter-data";

type Slice = { label: string; value: number; color: string; pct: number };

function Donut({ slices, size = 190 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const stroke = 28;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#EDE3D5"
        strokeWidth={stroke}
      />
      {slices.map((s, i) => {
        const len = total > 0 ? (s.value / total) * circ : 0;
        const dasharray = `${len} ${circ - len}`;
        const dashoffset = total > 0 ? -((acc / total) * circ) : 0;
        acc += s.value;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-ink-900"
        style={{ fontSize: 32, fontWeight: 600 }}
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        className="fill-ink-500"
        style={{ fontSize: 12 }}
      >
        Total
      </text>
    </svg>
  );
}

export function EventsSummary() {
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
    const interval = window.setInterval(loadSummary, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Card>
      <CardHeader title="Events Summary" />
      <div className="px-6 py-5 flex items-center gap-8">
        <Donut slices={summary.eventSlices} />
        <ul className="flex-1 space-y-3">
          {summary.eventSlices.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[14px] text-ink-800 flex-1">{s.label}</span>
              <span className="text-[14px] font-semibold text-ink-900 tabular-nums w-8 text-right">
                {s.value}
              </span>
              <span className="text-[12.5px] text-ink-500 tabular-nums w-12 text-right">
                ({s.pct}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
