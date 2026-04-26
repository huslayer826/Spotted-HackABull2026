import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const REPO_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");
const DEMO_VIDEO = path.join(REPO_ROOT, "side_by_side.mov");

export async function GET(request: NextRequest) {
  const fileStat = await stat(DEMO_VIDEO);
  const range = request.headers.get("range");

  if (range) {
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number.parseInt(startText, 10);
    const end = endText ? Number.parseInt(endText, 10) : fileStat.size - 1;
    const chunkSize = end - start + 1;
    const stream = createReadStream(DEMO_VIDEO, { start, end });

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
        "Content-Type": "video/quicktime",
      },
    });
  }

  const stream = createReadStream(DEMO_VIDEO);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(fileStat.size),
      "Content-Type": "video/quicktime",
    },
  });
}
