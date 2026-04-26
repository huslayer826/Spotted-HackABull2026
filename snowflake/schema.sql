CREATE DATABASE IF NOT EXISTS SPOTTER;
CREATE SCHEMA IF NOT EXISTS SPOTTER.ANALYTICS;

USE DATABASE SPOTTER;
USE SCHEMA ANALYTICS;

CREATE TABLE IF NOT EXISTS detection_events (
  event_id STRING NOT NULL,
  ts TIMESTAMP_TZ NOT NULL,
  camera_id STRING,
  location STRING,
  track_id NUMBER,
  label STRING,
  confidence FLOAT,
  bbox VARIANT,
  searchable_text STRING,
  synced_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (event_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  run_id STRING DEFAULT UUID_STRING(),
  started_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  finished_at TIMESTAMP_TZ,
  source STRING,
  records_synced NUMBER,
  status STRING,
  error STRING
);

CREATE OR REPLACE VIEW theft_frequency_by_location AS
SELECT
  location,
  COUNT(*) AS theft_count,
  MIN(ts) AS first_seen_at,
  MAX(ts) AS last_seen_at
FROM detection_events
WHERE label = 'Shoplifting'
GROUP BY location;

CREATE OR REPLACE VIEW hourly_detection_frequency AS
SELECT
  DATE_TRUNC('hour', ts) AS hour,
  location,
  label,
  COUNT(*) AS event_count,
  AVG(confidence) AS avg_confidence
FROM detection_events
GROUP BY hour, location, label;

CREATE OR REPLACE CORTEX SEARCH SERVICE spotter_analytics_search
  ON searchable_text
  ATTRIBUTES event_id, ts, camera_id, location, label, confidence
  WAREHOUSE = COMPUTE_WH
  TARGET_LAG = '5 minutes'
  AS (
    SELECT
      event_id,
      ts,
      camera_id,
      location,
      label,
      confidence,
      searchable_text
    FROM detection_events
    WHERE searchable_text IS NOT NULL
  );
