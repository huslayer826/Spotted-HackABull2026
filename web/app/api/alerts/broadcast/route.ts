import { NextResponse } from "next/server";
import {
  generateAlertMessage,
  synthesizeAlertAudio,
} from "@/lib/alert-broadcast";
import type { Alert } from "@/lib/spotter-data";

function isAlert(value: unknown): value is Alert {
  const alert = value as Partial<Alert>;
  return Boolean(
    alert &&
      typeof alert.id === "string" &&
      typeof alert.type === "string" &&
      typeof alert.title === "string" &&
      typeof alert.location === "string" &&
      typeof alert.time === "string",
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const alert = body?.alert;

  if (!isAlert(alert)) {
    return NextResponse.json(
      { error: "A complete alert object is required." },
      { status: 400 },
    );
  }

  try {
    const generated = await generateAlertMessage(alert);
    const audio = await synthesizeAlertAudio(generated.message);

    return NextResponse.json({
      ok: true,
      message: generated.message,
      model: generated.model,
      usedFallbackMessage: generated.fallback,
      ...audio,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to broadcast this alert.";
    const isMissingConfig =
      message.includes("ELEVENLABS_API_KEY") ||
      message.includes("ELEVENLABS_VOICE_ID");

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: isMissingConfig ? 503 : 502 },
    );
  }
}
