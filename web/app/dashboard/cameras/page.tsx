import { Card, CardHeader } from "@/components/Card";
import { DetectionTicker } from "@/components/DetectionTicker";
import { CameraDotIcon } from "@/components/SpotterIcons";
import { VideoDetectionScrubber } from "@/components/VideoDetectionScrubber";

export default function CamerasPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Cameras
          </h1>
          <p className="text-[15px] text-ink-500 mt-1">
            Real footage analyzed by YOLO in real time
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-paper-50 border border-ink-900/5 px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rust-500 pulse-dot" />
          <span className="text-[12px] font-semibold tracking-wider text-ink-700">
            STREAMING
          </span>
        </div>
      </div>

      {/* Feed + ticker */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-start justify-between px-6 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-rust-100 text-rust-500">
                  <CameraDotIcon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[18px] font-semibold text-ink-900 leading-tight">
                    Camera 01 · Side-by-side MOV
                  </h3>
                  <div className="text-[12.5px] text-ink-500">
                    Side-by-side demo · local video source
                  </div>
                </div>
              </div>
              <div className="text-[12px] font-mono text-ink-500 tabular-nums">
                native frame · YOLO live
              </div>
            </div>
            <div className="px-4 pb-4">
              <VideoDetectionScrubber />
            </div>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader
              title="Detection feed"
              action={
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-moss-500 pulse-dot" />
                  live
                </span>
              }
            />
            <DetectionTicker />
          </Card>
        </div>
      </div>
    </div>
  );
}
