import { ArrowUp } from "lucide-react";
import { Card, CardHeader } from "./Card";

// Smoothed sparkline path roughly matching the design's curve.
const POINTS = [
  6, 8, 7, 10, 14, 11, 9, 12, 16, 28, 36, 30, 21, 17, 22, 14, 12, 19, 26, 18, 15, 12, 10, 9,
];

function buildPath(values: number[], width: number, height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const dx = width / (values.length - 1);
  const y = (v: number) =>
    height - 4 - ((v - min) / (max - min || 1)) * (height - 8);

  let d = `M 0 ${y(values[0]).toFixed(2)}`;
  for (let i = 1; i < values.length; i++) {
    const x0 = (i - 1) * dx;
    const x1 = i * dx;
    const cx = (x0 + x1) / 2;
    d += ` Q ${cx} ${y(values[i - 1])}, ${x1} ${y(values[i])}`;
  }
  return d;
}

const X_LABELS = ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"];

export function AlertsToday() {
  const W = 460;
  const H = 110;
  const path = buildPath(POINTS, W, H);

  return (
    <Card>
      <CardHeader title="Alerts Today" />
      <div className="px-6 pt-3 pb-5">
        <div className="flex items-center gap-3">
          <div className="text-[44px] font-semibold leading-none text-ink-900 tabular-nums">
            23
          </div>
          <span className="inline-flex items-center gap-0.5 rounded-md bg-rust-100 px-2 py-1 text-[12px] font-semibold text-rust-500">
            <ArrowUp className="h-3 w-3" strokeWidth={2.6} />
            35%
          </span>
        </div>
        <div className="mt-1 text-[12.5px] text-ink-500">vs yesterday</div>

        <div className="mt-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[110px]"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="alertsTodayFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#A04E2E" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#A04E2E" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${path} L ${W} ${H} L 0 ${H} Z`}
              fill="url(#alertsTodayFill)"
            />
            <path
              d={path}
              fill="none"
              stroke="#A04E2E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-2 flex justify-between text-[11px] text-ink-400">
            {X_LABELS.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
