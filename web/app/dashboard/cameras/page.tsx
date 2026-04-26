import { MonitorPlay } from "lucide-react";
import { RandomTestDataPlayer } from "@/components/RandomTestDataPlayer";

const TRAINED_VIDEOS = [
  {
    title: "Shoplifting 3",
    source: "/trained-data/shoplifting-3.mp4",
    poster: "/trained-data/shoplifting-3.jpg",
    duration: "11.2s",
  },
  {
    title: "Shoplifting 4",
    source: "/trained-data/shoplifting-4.mp4",
    poster: "/trained-data/shoplifting-4.jpg",
    duration: "11.4s",
  },
  {
    title: "Shoplifting 6",
    source: "/trained-data/shoplifting-6.mp4",
    poster: "/trained-data/shoplifting-6.jpg",
    duration: "11.1s",
  },
  {
    title: "Shoplifting 8",
    source: "/trained-data/shoplifting-8.mp4",
    poster: "/trained-data/shoplifting-8.jpg",
    duration: "10.5s",
  },
];

export default function CamerasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Random Test Data
          </h1>
          <p className="text-[15px] text-ink-500 mt-1">
            Review the four sample clips used for random playback testing
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-paper-50 border border-ink-900/5 px-3.5 py-1.5">
          <MonitorPlay className="h-4 w-4 text-rust-500" />
          <span className="text-[12px] font-semibold tracking-wider text-ink-700">
            4 CLIPS
          </span>
        </div>
      </div>

      <RandomTestDataPlayer videos={TRAINED_VIDEOS} />
    </div>
  );
}
