import type { Alert } from "@/lib/spotter-data";

const DEFAULT_GEMMA_URL = "http://localhost:11434/api/chat";
const DEFAULT_GEMMA_MODEL = "gemma4";
const DEFAULT_ELEVEN_MODEL = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export type BroadcastResult = {
  message: string;
  audioBase64: string;
  contentType: string;
  model: string;
  voiceId: string;
};

function fallbackMessage(alert: Alert) {
  return `Security notice for ${alert.location}. Please return any unpaid merchandise and proceed to the nearest staff member for assistance.`;
}

function buildPrompt(alert: Alert) {
  return `
You are SPOTTER, an in-store security announcement system.
Generate one short voice announcement for a public speaker.
Constraints:
- 1 sentence only.
- Maximum 22 words.
- Calm, firm, non-accusatory.
- Do not mention AI, models, cameras, or surveillance.
- Do not include stage directions, quotes, prefixes, or markdown.

Alert:
Type: ${alert.type}
Title: ${alert.title}
Location: ${alert.location}
Time: ${alert.time}
`.trim();
}

function cleanGeneratedMessage(text: string, alert: Alert) {
  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^announcement:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallbackMessage(alert);
  return cleaned.split(/\n/)[0].slice(0, 220);
}

export async function generateAlertMessage(alert: Alert) {
  const url = process.env.GEMMA_API_URL || DEFAULT_GEMMA_URL;
  const model = process.env.GEMMA_MODEL || DEFAULT_GEMMA_MODEL;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You write short, safe retail security voice announcements.",
          },
          { role: "user", content: buildPrompt(alert) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemma returned ${response.status}`);
    }

    const payload = await response.json();
    const content =
      typeof payload?.message?.content === "string"
        ? payload.message.content
        : typeof payload?.response === "string"
          ? payload.response
          : "";

    return {
      message: cleanGeneratedMessage(content, alert),
      model,
      fallback: false,
    };
  } catch {
    return {
      message: fallbackMessage(alert),
      model,
      fallback: true,
    };
  }
}

export async function synthesizeAlertAudio(
  message: string,
): Promise<Pick<BroadcastResult, "audioBase64" | "contentType" | "voiceId">> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_ELEVEN_MODEL;
  const outputFormat =
    process.env.ELEVENLABS_OUTPUT_FORMAT || DEFAULT_OUTPUT_FORMAT;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY on the server.");
  }

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID on the server.");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: message,
        model_id: modelId,
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `ElevenLabs returned ${response.status}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return {
    audioBase64: audio.toString("base64"),
    contentType: response.headers.get("content-type") || "audio/mpeg",
    voiceId,
  };
}
