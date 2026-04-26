import { Card, CardHeader } from "./Card";
import { RunningIcon, JarIcon, BoxIcon, PersonIcon } from "./SpotterIcons";
import clsx from "clsx";

type AlertType = "theft" | "pocket" | "grab" | "person";

type Alert = {
  type: AlertType;
  title: string;
  location: string;
  time: string;
};

const ALERTS: Alert[] = [
  {
    type: "theft",
    title: "Theft Detected",
    location: "Back Alley",
    time: "10:24:32 PM",
  },
  {
    type: "pocket",
    title: "Item Pocketed",
    location: "Aisle 3",
    time: "10:23:45 PM",
  },
  {
    type: "grab",
    title: "Item Grabbed",
    location: "Aisle 1",
    time: "10:23:11 PM",
  },
  {
    type: "person",
    title: "Person Detected",
    location: "Entrance",
    time: "10:22:05 PM",
  },
];

const TYPE_STYLES: Record<
  AlertType,
  { border: string; iconWrap: string; icon: React.ReactNode }
> = {
  theft: {
    border: "border-l-crimson-500",
    iconWrap: "bg-crimson-500/10 text-crimson-500",
    icon: <RunningIcon className="h-4 w-4" />,
  },
  pocket: {
    border: "border-l-amber-400",
    iconWrap: "bg-amber-400/15 text-amber-500",
    icon: <JarIcon className="h-4 w-4" />,
  },
  grab: {
    border: "border-l-rust-400",
    iconWrap: "bg-rust-100 text-rust-500",
    icon: <BoxIcon className="h-4 w-4" />,
  },
  person: {
    border: "border-l-moss-500",
    iconWrap: "bg-moss-400/20 text-moss-600",
    icon: <PersonIcon className="h-4 w-4" />,
  },
};

function ThumbBg() {
  // Subtle warm-noise placeholder thumbnail
  return (
    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-ink-700 to-ink-900">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 40%, rgba(189,106,71,0.4), transparent 40%), radial-gradient(circle at 70% 60%, rgba(155,45,36,0.3), transparent 35%)",
        }}
      />
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-5 w-2 rounded-full bg-paper-200/40" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-paper-200/50" />
    </div>
  );
}

export function ActiveAlerts() {
  return (
    <Card>
      <CardHeader
        title="Active Alerts"
        action={
          <button className="text-[13px] font-medium text-rust-500 hover:text-rust-600">
            View all
          </button>
        }
      />
      <ul className="px-4 py-4 space-y-2">
        {ALERTS.map((a, i) => {
          const s = TYPE_STYLES[a.type];
          return (
            <li
              key={i}
              className={clsx(
                "flex items-center gap-3 rounded-lg border-l-4 bg-paper-100/60 hover:bg-paper-200/60 transition-colors px-3 py-2.5",
                s.border,
              )}
            >
              <div
                className={clsx(
                  "grid h-9 w-9 place-items-center rounded-lg shrink-0",
                  s.iconWrap,
                )}
              >
                {s.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink-900">
                  {a.title}
                </div>
                <div className="text-[12px] text-ink-500">
                  {a.location} · {a.time}
                </div>
              </div>
              <ThumbBg />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
