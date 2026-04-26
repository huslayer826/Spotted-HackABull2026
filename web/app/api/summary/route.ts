import { NextResponse } from "next/server";
import { getCollection, isMongoConfigured } from "@/lib/mongodb";
import { fallbackSummary, type Alert, type DetectionEvent } from "@/lib/spotter-data";

const COLORS: Record<string, string> = {
  theft: "#9B2D24",
  pocket: "#E2A24C",
  grab: "#BD6A47",
  person: "#7B9971",
  other: "#7B9971",
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json({ source: "fallback", summary: fallbackSummary });
  }

  try {
    const alerts =
      await getCollection<Alert & { createdAt?: Date; type?: string }>("alerts");
    const events = await getCollection<DetectionEvent & { createdAt?: Date }>(
      "detection_events",
    );

    const today = startOfToday();
    const alertsToday = await alerts.countDocuments({ createdAt: { $gte: today } });
    const peopleInArea = await events.distinct("trackId", {
      createdAt: { $gte: new Date(Date.now() - 30_000) },
    });

    const grouped = await alerts
      .aggregate<{ _id: string; value: number }>([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: "$type", value: { $sum: 1 } } },
        { $sort: { value: -1 } },
      ])
      .toArray();

    const total = grouped.reduce((sum, item) => sum + item.value, 0);
    const eventSlices =
      total > 0
        ? grouped.map((item) => ({
            label: item._id || "other",
            value: item.value,
            color: COLORS[item._id] || COLORS.other,
            pct: Math.round((item.value / total) * 100),
          }))
        : fallbackSummary.eventSlices;

    return NextResponse.json({
      source: "mongodb",
      summary: {
        ...fallbackSummary,
        alertsToday,
        peopleInArea: peopleInArea.length,
        eventSlices,
      },
    });
  } catch (error) {
    console.error("[summary] MongoDB read failed", error);
    return NextResponse.json({ source: "fallback", summary: fallbackSummary });
  }
}
