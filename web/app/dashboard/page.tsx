import { LiveLidarView } from "@/components/LiveLidarView";
import { ActiveAlerts } from "@/components/ActiveAlerts";
import { RecentActivity } from "@/components/RecentActivity";
import { AlertsToday } from "@/components/AlertsToday";
import { EventsSummary } from "@/components/EventsSummary";
import { RangePicker } from "@/components/RangePicker";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Dashboard
          </h1>
          <p className="text-[15px] text-ink-500 mt-1">
            Real-time overview of your surveillance system
          </p>
        </div>
        <RangePicker />
      </div>

      {/* Main grid: left column stacks LIDAR + stats, right column stacks alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <LiveLidarView />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AlertsToday />
            <EventsSummary />
          </div>
        </div>
        <div className="space-y-6">
          <ActiveAlerts />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
