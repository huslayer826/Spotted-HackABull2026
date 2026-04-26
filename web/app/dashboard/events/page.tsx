"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Activity, Camera, Crosshair, Search, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { DetectionTicker } from "@/components/DetectionTicker";
import type { DetectionEvent } from "@/lib/spotter-data";

const LABEL_CLASS: Record<DetectionEvent["label"], string> = {
  Shoplifting: "bg-crimson-500/15 text-crimson-500",
  Normal: "bg-moss-400/20 text-moss-600",
  Monitoring: "bg-paper-200 text-ink-500",
  Person: "bg-moss-400/20 text-moss-600",
};

type Metric = {
  name: string;
  value: number;
  Icon: LucideIcon;
};

function fmt(ts: string) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime())
    ? ts
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
}

export default function EventsPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [source, setSource] = useState("loading");
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState<DetectionEvent["label"] | "all">("all");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const response = await fetch("/api/events?limit=100", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!cancelled && Array.isArray(payload?.events)) {
        setEvents(payload.events);
        setSource(payload.source || "api");
      }
    }

    loadEvents();
    const interval = window.setInterval(loadEvents, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesLabel = label === "all" || event.label === label;
      const haystack = [
        event.id,
        event.label,
        event.cameraId,
        event.location,
        String(event.trackId),
      ]
        .join(" ")
        .toLowerCase();
      return matchesLabel && (!needle || haystack.includes(needle));
    });
  }, [events, label, query]);

  const stats = useMemo(() => {
    const tracks = new Set(events.map((event) => `${event.cameraId}:${event.trackId}`));
    return {
      total: events.length,
      shoplifting: events.filter((event) => event.label === "Shoplifting").length,
      tracks: tracks.size,
    };
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Events
          </h1>
          <p className="mt-1 text-[15px] text-ink-500">
            Raw detection stream from MongoDB or the live YOLO backend
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-ink-900/5 bg-paper-50 px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-moss-500 pulse-dot" />
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-700">
            {source}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {([
          { name: "Events", value: stats.total, Icon: Activity },
          { name: "Shoplifting", value: stats.shoplifting, Icon: Crosshair },
          { name: "Tracked IDs", value: stats.tracks, Icon: Camera },
        ] satisfies Metric[]).map(({ name, value, Icon }) => (
          <Card key={name} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                  {name}
                </div>
                <div className="mt-1 text-[30px] font-semibold tabular-nums text-ink-900">
                  {value}
                </div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-paper-200 text-rust-500">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Detection events"
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search"
                    className="h-8 w-40 rounded-md border border-ink-900/10 bg-paper-50 pl-8 pr-3 text-[12.5px] outline-none transition focus:border-rust-400"
                  />
                </div>
                <select
                  value={label}
                  onChange={(event) =>
                    setLabel(event.target.value as DetectionEvent["label"] | "all")
                  }
                  className="h-8 rounded-md border border-ink-900/10 bg-paper-50 px-2.5 text-[12.5px] font-medium text-ink-700 outline-none"
                >
                  <option value="all">All labels</option>
                  <option value="Shoplifting">Shoplifting</option>
                  <option value="Person">Person</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>
            }
          />
          <div className="px-4 pb-4 pt-4">
            <div className="overflow-hidden rounded-lg border border-ink-900/5">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-paper-100 text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Label</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Track</th>
                    <th className="px-4 py-3 font-semibold">Confidence</th>
                    <th className="px-4 py-3 font-semibold">BBox</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-900/5">
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="bg-paper-50">
                      <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-ink-500">
                        {fmt(event.ts)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                            LABEL_CLASS[event.label],
                          )}
                        >
                          {event.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-800">{event.location}</div>
                        <div className="font-mono text-[12px] text-ink-500">
                          {event.cameraId}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-ink-700">
                        ID{event.trackId.toString().padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-ink-700">
                        {Math.round(event.confidence * 100)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-500">
                        {event.bbox?.length ? event.bbox.join(", ") : "-"}
                      </td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="bg-paper-50 px-4 py-10 text-center text-[13px] text-ink-500">
                        Waiting for detection events.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Live ticker" />
          <DetectionTicker />
        </Card>
      </div>
    </div>
  );
}
