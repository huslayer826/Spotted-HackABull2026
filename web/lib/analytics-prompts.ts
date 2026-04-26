export const SPOTTER_SEMANTIC_HINT = `
You are querying SPOTTER retail surveillance analytics.
Use only Snowflake table ANALYTICS.DETECTION_EVENTS unless the caller provides a different model.
Important fields:
- EVENT_ID: unique detection event id
- TS: event timestamp
- CAMERA_ID and LOCATION: camera and store area / aisle
- TRACK_ID: local person track id inside one camera
- LABEL: Person, Normal, Monitoring, or Shoplifting
- CONFIDENCE: model confidence from 0 to 1
- BBOX: object bounding box JSON
- SEARCHABLE_TEXT: denormalized incident sentence for Cortex Search
Common metrics:
- theft frequency means count where LABEL = 'Shoplifting'
- aisle means LOCATION
- people count can use count distinct TRACK_ID grouped by CAMERA_ID or LOCATION
`.trim();

export function buildSearchableText(event: {
  ts?: string;
  label?: string;
  confidence?: number;
  cameraId?: string;
  location?: string;
  trackId?: number;
}) {
  const confidence =
    typeof event.confidence === "number"
      ? `${Math.round(event.confidence * 100)}% confidence`
      : "unknown confidence";

  return [
    `${event.label || "Detection"} event`,
    `at ${event.location || "unknown location"}`,
    `on ${event.cameraId || "unknown camera"}`,
    `track ${event.trackId ?? "unknown"}`,
    `with ${confidence}`,
    event.ts ? `at ${event.ts}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
