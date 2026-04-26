"use client";

import { Card } from "@/components/Card";

type TestVideo = {
  title: string;
  source: string;
  poster: string;
  duration: string;
};

type RandomTestDataPlayerProps = {
  videos: TestVideo[];
};

export function RandomTestDataPlayer({ videos }: RandomTestDataPlayerProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {videos.map((video) => (
        <Card key={video.source} className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-ink-900/5">
            <div>
              <h3 className="text-[18px] font-semibold text-ink-900 leading-tight">
                {video.title}
              </h3>
            </div>
            <span className="text-[12px] font-mono text-ink-500 tabular-nums">
              {video.duration}
            </span>
          </div>
          <div className="bg-ink-900">
            <video
              className="block w-full aspect-video bg-ink-900 object-contain"
              src={video.source}
              poster={video.poster}
              controls
              autoPlay
              muted
              loop
              preload="metadata"
              playsInline
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
