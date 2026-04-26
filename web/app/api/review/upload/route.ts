import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const REPO_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");
const UPLOAD_DIR = path.join(REPO_ROOT, ".spotter_uploads");
const REVIEW_DIR = path.join(REPO_ROOT, ".spotter_reviews");

type ReviewEvent = {
  event_id: number;
  start_seconds: number;
  end_seconds: number;
  alert_sample_count: number;
  labels: string[];
  clip_path: string;
  gemini_review?: {
    verdict?: string;
    confidence?: number;
    evidence?: string[];
    object_description?: string;
    person_description?: string;
    missing_context?: string[];
  };
  gemini_review_error?: string;
};

function extensionFor(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext && ext.length <= 8 ? ext : ".mp4";
}

function runReview(videoPath: string, runId: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.env.SPOTTER_PYTHON || "python3",
      [
        "cctv_review.py",
        videoPath,
        "--output-dir",
        REVIEW_DIR,
        "--camera-id",
        `upload-${runId}`,
        "--gemini",
      ],
      {
        cwd: REPO_ROOT,
        env: process.env,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          stderr.trim() || stdout.trim() || `Review process exited with ${code}`,
        ),
      );
    });
  });
}

function parseManifestPath(output: string) {
  const match = output.match(/manifest=(.+)/);
  return match?.[1]?.trim();
}

function alertTypeFor(event: ReviewEvent) {
  const verdict = event.gemini_review?.verdict;
  const joinedLabels = event.labels.join(" ").toLowerCase();
  if (verdict === "normal_handling") return "person";
  if (joinedLabels.includes("pocket")) return "pocket";
  if (joinedLabels.includes("grab")) return "grab";
  return "theft";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("video");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a video file." }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await mkdir(REVIEW_DIR, { recursive: true });

  const runId = randomUUID();
  const uploadPath = path.join(UPLOAD_DIR, `${runId}${extensionFor(file.name)}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(uploadPath, bytes);

  try {
    const result = await runReview(uploadPath, runId);
    const manifestPath = parseManifestPath(result.stdout);

    if (!manifestPath) {
      return NextResponse.json(
        {
          error: "Review completed but no manifest was produced.",
          stdout: result.stdout,
          stderr: result.stderr,
        },
        { status: 500 },
      );
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    const events = Array.isArray(manifest.events)
      ? (manifest.events as ReviewEvent[])
      : [];

    const alerts = events.map((event) => {
      const review = event.gemini_review;
      const verdict = review?.verdict || "local_candidate";
      const confidence =
        typeof review?.confidence === "number"
          ? Math.round(review.confidence * 100)
          : null;

      return {
        id: `review-${runId}-${event.event_id}`,
        type: alertTypeFor(event),
        title:
          verdict === "likely_concealment"
            ? "Gemini Confirmed Concealment"
            : verdict === "normal_handling"
              ? "Gemini Marked Normal Handling"
              : "Gemini Review Candidate",
        location: `Uploaded CCTV · ${event.start_seconds.toFixed(1)}s`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }),
        status: "new",
        cameraId: `upload-${runId}`,
        trackId: event.event_id,
        eventId: `review-event-${runId}-${event.event_id}`,
        review: {
          verdict,
          confidence,
          evidence: review?.evidence || [],
          objectDescription: review?.object_description || "",
          personDescription: review?.person_description || "",
          missingContext: review?.missing_context || [],
          error: event.gemini_review_error || "",
          clipPath: event.clip_path,
        },
      };
    });

    return NextResponse.json({
      runId,
      manifestPath,
      summary: {
        sampledFrames: manifest.sampled_frames,
        alertSamples: manifest.alert_sample_count,
        candidateSamples: manifest.candidate_sample_count,
        eventCount: manifest.event_count,
        geminiEnabled: manifest.gemini_enabled,
      },
      alerts,
      events,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Review failed.",
      },
      { status: 500 },
    );
  }
}
