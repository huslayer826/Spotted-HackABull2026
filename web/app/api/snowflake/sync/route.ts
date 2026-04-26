import { NextResponse } from "next/server";
import { syncMongoToSnowflake } from "@/lib/snowflake-sync";

export async function POST() {
  const result = await syncMongoToSnowflake();
  return NextResponse.json(result);
}
