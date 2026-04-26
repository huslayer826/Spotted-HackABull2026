import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import { buildSearchableText } from "@/lib/analytics-prompts";
import { executeSnowflake, isSnowflakeConfigured } from "@/lib/snowflake";

type MongoDetectionEvent = {
  id?: string;
  ts?: string;
  trackId?: number;
  label?: string;
  confidence?: number;
  cameraId?: string;
  location?: string;
  bbox?: number[];
  createdAt?: Date;
  snowflakeSyncedAt?: Date;
};

function toTimestamp(value?: string | Date) {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export async function syncMongoToSnowflake(limit = 500) {
  if (!isMongoConfigured()) {
    return { ok: false, synced: 0, error: "MongoDB is not configured." };
  }

  if (!isSnowflakeConfigured()) {
    return { ok: false, synced: 0, error: "Snowflake is not configured." };
  }

  const collection = await getCollection<MongoDetectionEvent>("detection_events");
  const events = await collection
    .find({ snowflakeSyncedAt: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .toArray();

  if (events.length === 0) {
    return { ok: true, synced: 0 };
  }

  for (const event of events) {
    const eventId = event.id || event._id.toString();
    const timestamp = toTimestamp(event.ts || event.createdAt);
    const searchableText = buildSearchableText({
      ts: timestamp,
      label: event.label,
      confidence: event.confidence,
      cameraId: event.cameraId,
      location: event.location,
      trackId: event.trackId,
    });

    await executeSnowflake(
      `
        MERGE INTO detection_events target
        USING (
          SELECT
            ? AS event_id,
            TO_TIMESTAMP_TZ(?) AS ts,
            ? AS camera_id,
            ? AS location,
            ? AS track_id,
            ? AS label,
            ? AS confidence,
            PARSE_JSON(?) AS bbox,
            ? AS searchable_text,
            CURRENT_TIMESTAMP() AS synced_at
        ) source
        ON target.event_id = source.event_id
        WHEN MATCHED THEN UPDATE SET
          ts = source.ts,
          camera_id = source.camera_id,
          location = source.location,
          track_id = source.track_id,
          label = source.label,
          confidence = source.confidence,
          bbox = source.bbox,
          searchable_text = source.searchable_text,
          synced_at = source.synced_at
        WHEN NOT MATCHED THEN INSERT (
          event_id, ts, camera_id, location, track_id, label, confidence, bbox, searchable_text, synced_at
        ) VALUES (
          source.event_id, source.ts, source.camera_id, source.location, source.track_id,
          source.label, source.confidence, source.bbox, source.searchable_text, source.synced_at
        )
      `,
      [
        eventId,
        timestamp,
        event.cameraId || "camera-01",
        event.location || "Unknown",
        event.trackId ?? null,
        event.label || "Monitoring",
        event.confidence ?? 0,
        JSON.stringify(event.bbox || []),
        searchableText,
      ],
    );

    await collection.updateOne(
      { _id: event._id },
      { $set: { snowflakeSyncedAt: new Date() } },
    );
  }

  return { ok: true, synced: events.length };
}
