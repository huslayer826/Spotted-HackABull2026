"use client";

import { LiveLidarView } from "@/components/LiveLidarView";
import { ActiveAlertsList } from "@/components/ActiveAlerts";
import { RecentActivity } from "@/components/RecentActivity";
import { RangePicker } from "@/components/RangePicker";
import { IncidentReviewPanel } from "@/components/IncidentReviewPanel";
import { useLiveIncident } from "@/hooks/use-live-incident";

export default function DashboardPage() {
  const {
    alerts,
    incident,
    selectedAlertId,
    selectAlert,
    confirmIncident,
  } = useLiveIncident();

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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <LiveLidarView incident={incident} />
          <IncidentReviewPanel
            incident={incident}
            onConfirm={() => confirmIncident()}
          />
        </div>
        <div className="space-y-6">
          <ActiveAlertsList
            alerts={alerts}
            selectedAlertId={selectedAlertId}
            onSelectAlert={(alert) => selectAlert(alert.id)}
          />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
