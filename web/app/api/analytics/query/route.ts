import { NextResponse } from "next/server";
import { SPOTTER_SEMANTIC_HINT } from "@/lib/analytics-prompts";
import { executeSnowflake, isSnowflakeConfigured } from "@/lib/snowflake";

const ALLOWED_SELECT = /^\s*(with|select)\b/i;
const FORBIDDEN_SQL = /\b(insert|update|delete|merge|drop|alter|create|copy|put|get|grant|revoke|truncate)\b/i;

function fallbackSql(question: string) {
  const q = question.toLowerCase();
  if (q.includes("theft") && (q.includes("aisle") || q.includes("location"))) {
    return `
      SELECT location, COUNT(*) AS theft_count
      FROM detection_events
      WHERE label = 'Shoplifting'
      GROUP BY location
      ORDER BY theft_count DESC
      LIMIT 20
    `;
  }

  if (q.includes("hour") || q.includes("frequency") || q.includes("trend")) {
    return `
      SELECT DATE_TRUNC('hour', ts) AS hour, COUNT(*) AS event_count
      FROM detection_events
      GROUP BY hour
      ORDER BY hour
      LIMIT 200
    `;
  }

  return `
    SELECT ts, camera_id, location, track_id, label, confidence
    FROM detection_events
    ORDER BY ts DESC
    LIMIT 50
  `;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected analytics error.";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  if (!isSnowflakeConfigured()) {
    return NextResponse.json(
      {
        source: "fallback",
        sql: fallbackSql(question),
        rows: [],
        note: "Snowflake is not configured yet.",
      },
      { status: 503 },
    );
  }

  try {
    const sqlRows = await executeSnowflake<{ SQL_TEXT?: string; sql_text?: string }>(
      `
        SELECT SNOWFLAKE.CORTEX.COMPLETE(
          'mistral-large2',
          CONCAT(
            ?, '\\n\\nConvert this user request to one read-only Snowflake SQL SELECT over detection_events. ',
            'Return SQL only, no markdown. User request: ', ?
          )
        ) AS sql_text
      `,
      [SPOTTER_SEMANTIC_HINT, question],
    );

    const sql = (sqlRows[0]?.SQL_TEXT || sqlRows[0]?.sql_text || fallbackSql(question))
      .replace(/```sql|```/gi, "")
      .trim();

    if (!ALLOWED_SELECT.test(sql) || FORBIDDEN_SQL.test(sql)) {
      return NextResponse.json(
        { error: "Generated SQL was not a safe read-only query.", sql },
        { status: 400 },
      );
    }

    const rows = await executeSnowflake(sql);
    return NextResponse.json({ source: "snowflake-cortex-complete", sql, rows });
  } catch (error) {
    console.error("[analytics/query] Snowflake query failed", error);
    const sql = fallbackSql(question);
    try {
      const rows = await executeSnowflake(sql);
      return NextResponse.json({
        source: "snowflake-fallback-sql",
        sql,
        rows,
        warning: errorMessage(error),
      });
    } catch (fallbackError) {
      return NextResponse.json(
        {
          source: "snowflake-error",
          sql,
          rows: [],
          error: errorMessage(fallbackError),
          warning: errorMessage(error),
        },
        { status: 502 },
      );
    }
  }
}
