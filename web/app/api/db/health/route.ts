import { NextResponse } from "next/server";
import { getDb, isMongoConfigured, mongoConfigError } from "@/lib/mongodb";

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json(mongoConfigError(), { status: 503 });
  }

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ configured: true, ok: true, db: db.databaseName });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        ok: false,
        error: error instanceof Error ? error.message : "MongoDB ping failed.",
      },
      { status: 500 },
    );
  }
}
