import { NextResponse } from "next/server";
import { executeSnowflake, isSnowflakeConfigured } from "@/lib/snowflake";

type TheftByLocationRow = {
  LOCATION: string;
  THEFT_COUNT: number;
};

type HourlyRow = {
  HOUR: string;
  EVENT_COUNT: number;
};

export async function GET() {
  if (!isSnowflakeConfigured()) {
    return NextResponse.json({
      source: "fallback",
      metrics: {
        theftByLocation: [],
        hourlyEvents: [],
      },
    });
  }

  try {
    const theftByLocation = await executeSnowflake<TheftByLocationRow>(`
      SELECT location, COUNT(*) AS theft_count
      FROM detection_events
      WHERE label = 'Shoplifting'
        AND ts >= DATEADD(day, -30, CURRENT_TIMESTAMP())
      GROUP BY location
      ORDER BY theft_count DESC
      LIMIT 12
    `);

    const hourlyEvents = await executeSnowflake<HourlyRow>(`
      SELECT DATE_TRUNC('hour', ts) AS hour, COUNT(*) AS event_count
      FROM detection_events
      WHERE ts >= DATEADD(day, -7, CURRENT_TIMESTAMP())
      GROUP BY hour
      ORDER BY hour
    `);

    return NextResponse.json({
      source: "snowflake",
      metrics: {
        theftByLocation,
        hourlyEvents,
      },
    });
  } catch (error) {
    console.error("[analytics/metrics] Snowflake query failed", error);
    return NextResponse.json(
      {
        source: "snowflake-error",
        metrics: {
          theftByLocation: [],
          hourlyEvents: [],
        },
        error:
          error instanceof Error
            ? error.message
            : "Unexpected analytics metrics error.",
      },
      { status: 502 },
    );
  }
}
