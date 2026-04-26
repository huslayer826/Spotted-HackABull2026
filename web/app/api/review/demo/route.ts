import { readFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const REPO_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");
const REVIEW_DIR = path.join(REPO_ROOT, ".spotter_reviews");
const DEMO_VIDEO = path.join(REPO_ROOT, "side_by_side.mov");

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

function runDemoReview() {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.env.SPOTTER_PYTHON || "python3",
      [
        "cctv_review.py",
        DEMO_VIDEO,
        "--output-dir",
        REVIEW_DIR,
        "--camera-id",
        "demo-side-by-side",
        "--max-events",
        "3",
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
          stderr.trim() || stdout.trim() || `Demo review exited with ${code}`,
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

export async function POST() {
  try {
    const result = await runDemoReview();
    const manifestPath = parseManifestPath(result.stdout);

    if (!manifestPath) {
      return NextResponse.json(
        {
          error: "Demo review completed but no manifest was produced.",
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
        id: `demo-side-by-side-${event.event_id}`,
        type: alertTypeFor(event),
        title:
          verdict === "likely_concealment"
            ? "Gemini Confirmed Concealment"
            : verdict === "normal_handling"
              ? "Gemini Marked Normal Handling"
              : "Gemini Review Candidate",
        location: `Side-by-side demo · ${event.start_seconds.toFixed(1)}s`,
        time: new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }),
        status: "new",
        cameraId: "demo-side-by-side",
        trackId: event.event_id,
        eventId: `demo-event-${event.event_id}`,
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
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Demo review failed.",
      },
      { status: 500 },
    );
  }
}
