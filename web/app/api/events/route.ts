import { NextResponse } from "next/server";
import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import {
  normalizeDetectionEvent,
  serializeDoc,
  type DetectionEvent,
} from "@/lib/spotter-data";

async function readStreamEvents(limit: number) {
  const streamBase =
    process.env.NEXT_PUBLIC_STREAM_URL || "http://localhost:8000/video_feed";
  const response = await fetch(
    `${streamBase.replace(/\/video_feed.*$/, "")}/detections?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.events)
    ? payload.events.map(normalizeDetectionEvent)
    : [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 100);

  if (!isMongoConfigured()) {
    try {
      const events = await readStreamEvents(limit);
      return NextResponse.json({ source: "stream", events });
    } catch {
      // Keep the demo usable without the Python stream process.
    }
    return NextResponse.json({ source: "fallback", events: [] });
  }

  try {
    const collection = await getCollection<DetectionEvent & { createdAt?: Date }>(
      "detection_events",
    );
    const events = await collection
      .find({})
      .sort({ createdAt: -1, ts: -1, _id: -1 })
      .limit(limit)
      .toArray();

    if (events.length === 0) {
      const streamEvents = await readStreamEvents(limit).catch(() => []);
      if (streamEvents.length > 0) {
        return NextResponse.json({ source: "stream", events: streamEvents });
      }
    }

    return NextResponse.json({
      source: "mongodb",
      events: events.map((event) => normalizeDetectionEvent(serializeDoc(event))),
    });
  } catch {
    const events = await readStreamEvents(limit).catch(() => []);
    return NextResponse.json({
      source: "stream",
      events,
    });
  }
}
