import { MongoClient } from "mongodb";
import snowflake from "snowflake-sdk";

const required = [
  "MONGODB_URI",
  "SNOWFLAKE_ACCOUNT",
  "SNOWFLAKE_USERNAME",
  "SNOWFLAKE_PASSWORD",
  "SNOWFLAKE_WAREHOUSE",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`);
    process.exit(1);
  }
}

const mongoDbName = process.env.MONGODB_DB || "spotter";
const snowflakeDatabase = process.env.SNOWFLAKE_DATABASE || "SPOTTER";
const snowflakeSchema = process.env.SNOWFLAKE_SCHEMA || "ANALYTICS";
const intervalMs = Number(process.env.SNOWFLAKE_SYNC_INTERVAL_MS || 300000);

function buildSearchableText(event) {
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

function connectSnowflake() {
  const connection = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: snowflakeDatabase,
    schema: snowflakeSchema,
    role: process.env.SNOWFLAKE_ROLE,
  });

  return new Promise((resolve, reject) => {
    connection.connect((error) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
}

function execute(connection, sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete(error, _statement, rows) {
        if (error) reject(error);
        else resolve(rows || []);
      },
    });
  });
}

async function syncOnce(mongo, snowflakeConnection) {
  const collection = mongo.db(mongoDbName).collection("detection_events");
  const events = await collection
    .find({ snowflakeSyncedAt: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500)
    .toArray();

  for (const event of events) {
    const eventId = event.id || event._id.toString();
    const timestamp = event.ts || event.createdAt?.toISOString() || new Date().toISOString();
    const searchableText = buildSearchableText({ ...event, ts: timestamp });

    await execute(
      snowflakeConnection,
      `
        MERGE INTO detection_events target
        USING (
          SELECT ? AS event_id, TO_TIMESTAMP_TZ(?) AS ts, ? AS camera_id, ? AS location,
                 ? AS track_id, ? AS label, ? AS confidence, PARSE_JSON(?) AS bbox,
                 ? AS searchable_text, CURRENT_TIMESTAMP() AS synced_at
        ) source
        ON target.event_id = source.event_id
        WHEN MATCHED THEN UPDATE SET
          ts = source.ts, camera_id = source.camera_id, location = source.location,
          track_id = source.track_id, label = source.label, confidence = source.confidence,
          bbox = source.bbox, searchable_text = source.searchable_text, synced_at = source.synced_at
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

    await collection.updateOne({ _id: event._id }, { $set: { snowflakeSyncedAt: new Date() } });
  }

  console.log(`[snowflake-sync] synced ${events.length} events`);
}

const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const snowflakeConnection = await connectSnowflake();
await mongo.connect();

async function loop() {
  try {
    await syncOnce(mongo, snowflakeConnection);
  } catch (error) {
    console.error("[snowflake-sync]", error);
  }
}

await loop();
setInterval(loop, intervalMs);
