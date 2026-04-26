import { NextResponse } from "next/server";
import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import { fallbackCameras, serializeDoc, type Camera } from "@/lib/spotter-data";

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json({ source: "fallback", cameras: fallbackCameras });
  }

  const collection = await getCollection<Camera & { createdAt?: Date }>("cameras");
  const cameras = await collection.find({}).sort({ name: 1 }).toArray();

  return NextResponse.json({
    source: "mongodb",
    cameras: cameras.length ? cameras.map(serializeDoc) : fallbackCameras,
  });
}
