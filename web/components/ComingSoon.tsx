import { Card } from "./Card";
import { Construction } from "lucide-react";

export function ComingSoon({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
        <p className="text-[15px] text-ink-500 mt-1">{blurb}</p>
      </div>

      <Card>
        <div className="px-8 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-paper-200 text-rust-500">
            <Construction className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="mt-5 text-[18px] font-semibold text-ink-900">
            Coming soon
          </div>
          <p className="mt-1.5 max-w-md mx-auto text-[14px] text-ink-500">
            This view is on the roadmap. While we build it, head over to the
            Dashboard for the live LIDAR view, or to Cameras for the YOLO feed.
          </p>
        </div>
      </Card>
    </div>
  );
}
