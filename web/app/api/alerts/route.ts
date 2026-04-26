import { NextResponse } from "next/server";
import type { Filter } from "mongodb";
import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import {
  alertFromDetectionEvent,
  fallbackAlerts,
  normalizeAlert,
  normalizeDetectionEvent,
  serializeDoc,
  type Alert,
  type DetectionEvent,
} from "@/lib/spotter-data";

async function readStreamAlertEvents(limit: number) {
  const streamBase =
    process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/video_feed";
  const response = await fetch(
    `${streamBase.replace(/\/video_feed.*$/, "")}/detections?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.events)
    ? payload.events
        .map(normalizeDetectionEvent)
        .filter((event: DetectionEvent) => event.label === "Shoplifting")
        .map(alertFromDetectionEvent)
    : [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 10), 50);
  const status = searchParams.get("status");

  if (!isMongoConfigured()) {
    const streamAlerts = await readStreamAlertEvents(limit).catch(() => []);
    return NextResponse.json({
      source: streamAlerts.length ? "stream" : "fallback",
      alerts: streamAlerts.length ? streamAlerts : fallbackAlerts.slice(0, limit),
    });
  }

  try {
    type AlertDocument = Alert & { createdAt?: Date };
    const query: Filter<AlertDocument> =
      status === "new" || status === "reviewing" || status === "resolved"
        ? { status }
        : {};
    const collection = await getCollection<AlertDocument>("alerts");
    const alerts = await collection
      .find(query)
      .sort({ createdAt: -1, ts: -1, _id: -1 })
      .limit(limit)
      .toArray();

    if (alerts.length === 0 && (!status || status === "new")) {
      const events = await getCollection<DetectionEvent & { createdAt?: Date }>(
        "detection_events",
      );
      const eventAlerts = await events
        .find({ label: "Shoplifting" })
        .sort({ createdAt: -1, ts: -1, _id: -1 })
        .limit(limit)
        .toArray();

      if (eventAlerts.length > 0) {
        return NextResponse.json({
          source: "mongodb-events",
          alerts: eventAlerts
            .map((event) => normalizeDetectionEvent(serializeDoc(event)))
            .map(alertFromDetectionEvent),
        });
      }

      const streamAlerts = await readStreamAlertEvents(limit).catch(() => []);
      if (streamAlerts.length > 0) {
        return NextResponse.json({ source: "stream", alerts: streamAlerts });
      }
    }

    return NextResponse.json({
      source: "mongodb",
      alerts: alerts.map((alert) => normalizeAlert(serializeDoc(alert))),
    });
  } catch {
    return NextResponse.json({
      source: "fallback",
      alerts: fallbackAlerts.slice(0, limit),
    });
  }
}
