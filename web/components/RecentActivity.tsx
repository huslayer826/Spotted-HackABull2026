"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "./Card";
import { RunningIcon, JarIcon, BoxIcon, PersonIcon, CameraDotIcon } from "./SpotterIcons";
import { fallbackAlerts, timeAgo, type RecentActivityItem } from "@/lib/spotter-data";

const FALLBACK_ITEMS: RecentActivityItem[] = fallbackAlerts.map((alert, index) => ({
  id: alert.id,
  icon: alert.type,
  title: alert.title,
  location: alert.location,
  ago: `${index + 2}m ago`,
}));

const ICON_FOR: Record<RecentActivityItem["icon"], React.ReactNode> = {
  theft: <RunningIcon className="h-4 w-4 text-crimson-500" />,
  pocket: <JarIcon className="h-4 w-4 text-amber-500" />,
  grab: <BoxIcon className="h-4 w-4 text-rust-500" />,
  person: <PersonIcon className="h-4 w-4 text-moss-600" />,
  camera: <CameraDotIcon className="h-4 w-4 text-ink-700" />,
};

export function RecentActivity() {
  const [items, setItems] = useState<RecentActivityItem[]>(FALLBACK_ITEMS);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      const response = await fetch("/api/events?limit=5", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (cancelled || !Array.isArray(payload?.events) || payload.events.length === 0) {
        return;
      }

      setItems(
        payload.events.map((event: any) => ({
          id: event.id || event._id,
          icon: event.label === "Shoplifting" ? "theft" : "person",
          title:
            event.label === "Shoplifting"
              ? "Shoplifting Detected"
              : `${event.label || "Person"} Detected`,
          location: event.location || event.cameraId || "Camera",
          ago: event.createdAt ? timeAgo(new Date(event.createdAt)) : event.ts,
        })),
      );
    }

    loadActivity();
    const interval = window.setInterval(loadActivity, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Card>
      <CardHeader title="Recent Activity" />
      <ul className="px-5 py-4 space-y-3">
        {items.map((it, i) => (
          <li key={it.id || i} className="flex items-center gap-3">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-paper-100">
              {ICON_FOR[it.icon] || ICON_FOR.person}
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
