import { NextResponse } from "next/server";
import { ObjectId, type Filter } from "mongodb";
import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import type { Alert } from "@/lib/spotter-data";

const ACTION_TO_STATUS = {
  dismiss: "resolved",
  escalate: "reviewing",
  review: "reviewing",
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const alertId = typeof body?.alertId === "string" ? body.alertId : "";
  const action = body?.action as keyof typeof ACTION_TO_STATUS;
  const status = ACTION_TO_STATUS[action];

  if (!alertId || !status) {
    return NextResponse.json(
      { error: "alertId and a valid action are required." },
      { status: 400 },
    );
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ ok: true, source: "local", status });
  }

  try {
    type AlertDocument = Alert & { updatedAt?: Date };
    const collection = await getCollection<AlertDocument>("alerts");
    const query: Filter<AlertDocument> = ObjectId.isValid(alertId)
      ? { $or: [{ id: alertId }, { _id: new ObjectId(alertId) }] }
      : { id: alertId };
    const result = await collection.updateOne(query, {
      $set: { status, updatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      source: "mongodb",
      status,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    console.error("[alerts/decision] MongoDB update failed", error);
    return NextResponse.json({
      ok: true,
      source: "local",
      status,
      warning: "MongoDB unavailable; decision was applied only in the local UI session.",
    });
  }
}
