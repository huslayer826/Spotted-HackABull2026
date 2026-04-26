import { Card, CardHeader } from "./Card";
import { RunningIcon, JarIcon, BoxIcon, PersonIcon, CameraDotIcon } from "./SpotterIcons";

type Item = {
  icon: "theft" | "pocket" | "grab" | "person" | "camera";
  title: string;
  location: string;
  ago: string;
};

const ITEMS: Item[] = [
  {
    icon: "theft",
    title: "Theft Detected",
    location: "Back Alley",
    ago: "2m ago",
  },
  {
    icon: "pocket",
    title: "Item Pocketed",
    location: "Aisle 3",
    ago: "3m ago",
  },
  {
    icon: "grab",
    title: "Item Grabbed",
    location: "Aisle 1",
    ago: "5m ago",
  },
  {
    icon: "person",
    title: "Person Detected",
    location: "Entrance",
    ago: "7m ago",
  },
  {
    icon: "camera",
    title: "Camera Online",
    location: "Lobby",
    ago: "8m ago",
  },
];

const ICON_FOR: Record<Item["icon"], React.ReactNode> = {
  theft: <RunningIcon className="h-4 w-4 text-crimson-500" />,
  pocket: <JarIcon className="h-4 w-4 text-amber-500" />,
  grab: <BoxIcon className="h-4 w-4 text-rust-500" />,
  person: <PersonIcon className="h-4 w-4 text-moss-600" />,
  camera: <CameraDotIcon className="h-4 w-4 text-ink-700" />,
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader title="Recent Activity" />
      <ul className="px-5 py-4 space-y-3">
        {ITEMS.map((it, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-paper-100">
              {ICON_FOR[it.icon]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-ink-900 leading-tight">
                {it.title}
              </div>
              <div className="text-[12px] text-ink-500">{it.location}</div>
            </div>
            <span className="text-[12px] text-ink-500 shrink-0 tabular-nums">
              {it.ago}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
