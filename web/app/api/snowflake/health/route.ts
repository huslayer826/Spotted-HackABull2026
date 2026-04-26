import { NextResponse } from "next/server";
import {
  isSnowflakeConfigured,
  pingSnowflake,
  snowflakeConfigError,
} from "@/lib/snowflake";

export async function GET() {
  if (!isSnowflakeConfigured()) {
    return NextResponse.json(snowflakeConfigError(), { status: 503 });
  }

  try {
    const ok = await pingSnowflake();
    return NextResponse.json({ configured: true, ok });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        ok: false,
        error:
          error instanceof Error ? error.message : "Snowflake ping failed.",
      },
      { status: 500 },
    );
  }
}
