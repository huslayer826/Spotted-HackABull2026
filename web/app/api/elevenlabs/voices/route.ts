import { NextResponse } from "next/server";

const ELEVENLABS_CREATE_VOICE_URL =
  "https://api.elevenlabs.io/v1/voices/add";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY on the server." },
      { status: 500 },
    );
  }

  const incomingForm = await request.formData();
  const name = incomingForm.get("name");
  const description = incomingForm.get("description");
  const removeBackgroundNoise = incomingForm.get("remove_background_noise");
  const files = incomingForm.getAll("files");

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Voice name is required." },
      { status: 400 },
    );
  }

  const audioFiles = files.filter((file): file is File => file instanceof File);

  if (audioFiles.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one voice sample." },
      { status: 400 },
    );
  }

  const elevenLabsForm = new FormData();
  elevenLabsForm.append("name", name.trim());

  if (typeof description === "string" && description.trim()) {
    elevenLabsForm.append("description", description.trim());
  }

  if (typeof removeBackgroundNoise === "string") {
    elevenLabsForm.append("remove_background_noise", removeBackgroundNoise);
  }

  audioFiles.forEach((file) => {
    elevenLabsForm.append("files[]", file, file.name);
  });

  const response = await fetch(ELEVENLABS_CREATE_VOICE_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: elevenLabsForm,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? payload.detail
        : "ElevenLabs rejected the voice creation request.";

    return NextResponse.json({ error: detail }, { status: response.status });
  }

  return NextResponse.json(payload);
}
