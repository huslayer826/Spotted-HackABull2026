import { Card, CardHeader } from "./Card";

type Slice = { label: string; value: number; color: string; pct: number };

const SLICES: Slice[] = [
  { label: "Theft", value: 12, color: "#9B2D24", pct: 9 },
  { label: "Pocketing", value: 28, color: "#E2A24C", pct: 22 },
  { label: "Grabbing", value: 36, color: "#BD6A47", pct: 28 },
  { label: "Other", value: 52, color: "#7B9971", pct: 41 },
];

const TOTAL = SLICES.reduce((s, x) => s + x.value, 0);

function Donut({ size = 190 }: { size?: number }) {
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
      {SLICES.map((s, i) => {
        const len = (s.value / TOTAL) * circ;
        const dasharray = `${len} ${circ - len}`;
        const dashoffset = -((acc / TOTAL) * circ);
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
        {TOTAL}
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
  return (
    <Card>
      <CardHeader title="Events Summary" />
      <div className="px-6 py-5 flex items-center gap-8">
        <Donut />
        <ul className="flex-1 space-y-3">
          {SLICES.map((s) => (
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
