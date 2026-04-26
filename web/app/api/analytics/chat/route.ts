import { NextResponse } from "next/server";
import { SPOTTER_SEMANTIC_HINT } from "@/lib/analytics-prompts";
import { executeSnowflake, isSnowflakeConfigured } from "@/lib/snowflake";

type SearchRow = {
  event_id?: string;
  ts?: string;
  location?: string;
  label?: string;
  confidence?: number;
  searchable_text?: string;
};

type SearchPreviewRow = {
  RESPONSE?: string;
  response?: string;
};

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
        answer:
          "Snowflake is not configured yet. Add Snowflake env vars, run the schema setup, and sync Mongo events before using the historical brain.",
        results: [],
      },
      { status: 503 },
    );
  }

  try {
    const previewRows = await executeSnowflake<SearchPreviewRow>(
      `
        SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
          'SPOTTER.ANALYTICS.SPOTTER_ANALYTICS_SEARCH',
          ?
        ) AS response
      `,
      [
        JSON.stringify({
          query: question,
          columns: [
            "event_id",
            "ts",
            "location",
            "label",
            "confidence",
            "searchable_text",
          ],
          limit: 8,
        }),
      ],
    );

    const response = previewRows[0]?.RESPONSE || previewRows[0]?.response || "{}";
    const parsed = JSON.parse(response) as { results?: SearchRow[] };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const context = results
      .map((row, index) => `${index + 1}. ${row.searchable_text || row.label || "Detection event"}`)
      .join("\n");

    const answerRows = await executeSnowflake<{ ANSWER?: string; answer?: string }>(
      `
        SELECT SNOWFLAKE.CORTEX.COMPLETE(
          'mistral-large2',
          CONCAT(
            ?,
            '\\n\\nUser question: ', ?,
            '\\n\\nRelevant historical detections:\\n', ?,
            '\\n\\nAnswer using only the provided detection history. Be concise.'
          )
        ) AS answer
      `,
      [SPOTTER_SEMANTIC_HINT, question, context || "No matching historical detections."],
    );

    return NextResponse.json({
      source: "snowflake-cortex-search",
      answer:
        answerRows[0]?.ANSWER ||
        answerRows[0]?.answer ||
        "No matching historical detections were found.",
      results,
    });
  } catch (error) {
    console.error("[analytics/chat] Snowflake query failed", error);
    return NextResponse.json(
      {
        source: "snowflake-error",
        answer:
          "Snowflake analytics is connected, but the Cortex chat query failed. Try the metrics view while this is being fixed.",
        results: [],
        error: errorMessage(error),
      },
      { status: 502 },
    );
  }
}
