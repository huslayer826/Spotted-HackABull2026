"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mic2,
  Square,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { Card, CardHeader } from "@/components/Card";

type VoiceResponse = {
  voice_id?: string;
  requires_verification?: boolean;
};

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: VoiceResponse }
  | { status: "error"; message: string };

export function ElevenLabsVoiceSettings() {
  const [voiceName, setVoiceName] = useState("");
  const [description, setDescription] = useState("");
  const [removeNoise, setRemoveNoise] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [recorderState, setRecorderState] = useState<
    "idle" | "recording" | "unsupported"
  >("idle");
  const [recorderError, setRecorderError] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const totalSampleSize = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );
  const samplePreviews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      samplePreviews.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [samplePreviews]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: "loading" });

    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("description", description);
    formData.append("remove_background_noise", String(removeNoise));
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/elevenlabs/voices", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setSubmitState({
        status: "error",
        message:
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to create the voice right now.",
      });
      return;
    }

    setSubmitState({ status: "success", data: payload });
  }

  function removeFile(fileName: string) {
    setFiles((currentFiles) =>
      currentFiles.filter((file) => file.name !== fileName),
    );
  }

  async function startRecording() {
    setRecorderError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecorderState("unsupported");
      setRecorderError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const recordingBlob = new Blob(recordedChunksRef.current, {
          type: mimeType,
        });
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        const recordedFile = new File(
          [recordingBlob],
          `recorded-voice-sample-${Date.now()}.${extension}`,
          { type: mimeType },
        );

        setFiles((currentFiles) => [...currentFiles, recordedFile]);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setRecorderState("idle");
      };

      recorder.start();
      setRecorderState("recording");
    } catch {
      setRecorderError("Microphone access was blocked or unavailable.");
      setRecorderState("idle");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Settings
          </h1>
          <p className="text-[15px] text-ink-500 mt-1">
            Configure voice alerts and create ElevenLabs custom voices.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)] gap-6">
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Mic2 className="h-5 w-5 text-rust-500" />
                Custom voice
              </span>
            }
          />

          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[13px] font-medium text-ink-700">
                  Voice name
                </span>
                <input
                  value={voiceName}
                  onChange={(event) => setVoiceName(event.target.value)}
                  className="w-full rounded-lg border border-ink-900/10 bg-paper-100 px-3 py-2.5 text-[15px] text-ink-900 outline-none transition focus:border-rust-500/60 focus:ring-2 focus:ring-rust-500/15"
                  placeholder="Front gate dispatcher"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-[13px] font-medium text-ink-700">
                  Sample cleanup
                </span>
                <button
                  type="button"
                  onClick={() => setRemoveNoise((value) => !value)}
                  className="flex h-[46px] w-full items-center justify-between rounded-lg border border-ink-900/10 bg-paper-100 px-3 text-left text-[15px] text-ink-900 transition hover:border-rust-500/30"
                  aria-pressed={removeNoise}
                >
                  <span>Background noise removal</span>
                  <span
                    className={`h-6 w-11 rounded-full p-0.5 transition ${
                      removeNoise ? "bg-rust-500" : "bg-ink-900/15"
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-paper-50 transition ${
                        removeNoise ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
              </label>
            </div>

            <label className="space-y-2 block">
              <span className="text-[13px] font-medium text-ink-700">
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[96px] w-full resize-y rounded-lg border border-ink-900/10 bg-paper-100 px-3 py-2.5 text-[15px] text-ink-900 outline-none transition focus:border-rust-500/60 focus:ring-2 focus:ring-rust-500/15"
                placeholder="Calm, clear voice for security alerts and visitor notifications."
              />
            </label>

            <div className="rounded-xl border border-ink-900/10 bg-paper-100 px-5 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-900">
                    Record a voice sample
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-ink-500">
                    Record at least 30 seconds in a quiet room for the best clone.
                  </p>
                </div>

                {recorderState === "recording" ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-[15px] font-medium text-paper-50 transition hover:bg-ink-700"
                  >
                    <Square className="h-4 w-4" />
                    Stop recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rust-500 px-4 text-[15px] font-medium text-paper-50 transition hover:bg-rust-500/90"
                  >
                    <Mic2 className="h-4 w-4" />
                    Start recording
                  </button>
                )}
              </div>

              {recorderState === "recording" && (
                <div className="mt-4 flex items-center gap-2 text-[13px] font-medium text-rust-500">
                  <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-rust-500" />
                  Recording microphone audio
                </div>
              )}

              {recorderError && (
                <div className="mt-4 rounded-lg border border-red-900/10 bg-red-50 px-4 py-3 text-[14px] text-red-900">
                  {recorderError}
                </div>
              )}
            </div>

            <label className="block rounded-xl border border-dashed border-ink-900/15 bg-paper-100 px-5 py-6 text-center transition hover:border-rust-500/40">
              <Upload className="mx-auto h-7 w-7 text-rust-500" />
              <span className="mt-3 block text-[15px] font-medium text-ink-900">
                Upload voice samples instead
              </span>
              <span className="mt-1 block text-[13px] text-ink-500">
                MP3, WAV, M4A, or WebM clips work best when they are clean and speech-only.
              </span>
              <input
                type="file"
                accept="audio/*"
                multiple
                className="sr-only"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
                required={files.length === 0}
              />
            </label>

            {files.length > 0 && (
              <div className="rounded-xl bg-paper-100 border border-ink-900/5">
                <div className="flex items-center justify-between gap-3 border-b border-ink-900/5 px-4 py-3">
                  <span className="text-[13px] font-medium text-ink-700">
                    {files.length} sample{files.length === 1 ? "" : "s"}
                  </span>
                  <span className="text-[12px] text-ink-500">
                    {(totalSampleSize / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <ul className="divide-y divide-ink-900/5">
                  {samplePreviews.map(({ file, url }) => (
                    <li
                      key={`${file.name}-${file.lastModified}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 space-y-2">
                        <span className="block min-w-0 truncate text-[14px] text-ink-700">
                          {file.name}
                        </span>
                        <audio
                          controls
                          src={url}
                          className="h-9 w-full max-w-[420px]"
                        />
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => removeFile(file.name)}
                          className="shrink-0 rounded-md p-1 text-ink-500 transition hover:bg-paper-200 hover:text-ink-900"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {submitState.status === "error" && (
              <div className="rounded-lg border border-red-900/10 bg-red-50 px-4 py-3 text-[14px] text-red-900">
                {submitState.message}
              </div>
            )}

            {submitState.status === "success" && (
              <div className="rounded-lg border border-green-900/10 bg-green-50 px-4 py-3 text-[14px] text-green-900">
                Voice created. Voice ID:{" "}
                <span className="font-mono">{submitState.data.voice_id}</span>
                {submitState.data.requires_verification
                  ? " Verification is required before use."
                  : ""}
              </div>
            )}

            <button
              type="submit"
              disabled={submitState.status === "loading"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rust-500 px-4 text-[15px] font-medium text-paper-50 transition hover:bg-rust-500/90 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {submitState.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              Create voice
            </button>
          </form>
        </Card>

        <Card className="self-start px-6 py-5">
          <div className="flex items-center gap-2 text-[18px] font-semibold text-ink-900">
            <CheckCircle2 className="h-5 w-5 text-rust-500" />
            API setup
          </div>
          <div className="mt-4 space-y-3 text-[14px] leading-6 text-ink-700">
            <p>
              Add <span className="font-mono">ELEVENLABS_API_KEY</span> to the
              web app environment before creating voices.
            </p>
            <p>
              The browser sends samples to this app, then the server forwards
              them to ElevenLabs so the key never ships to the frontend.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
