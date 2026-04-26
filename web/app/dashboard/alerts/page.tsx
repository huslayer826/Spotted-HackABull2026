"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader } from "@/components/Card";
import { BoxIcon, JarIcon, PersonIcon, RunningIcon } from "@/components/SpotterIcons";
import { fallbackAlerts, type Alert, type AlertType } from "@/lib/spotter-data";

const TYPE_ICON: Record<AlertType, React.ReactNode> = {
  theft: <RunningIcon className="h-4 w-4" />,
  pocket: <JarIcon className="h-4 w-4" />,
  grab: <BoxIcon className="h-4 w-4" />,
  person: <PersonIcon className="h-4 w-4" />,
};

const TYPE_CLASS: Record<AlertType, string> = {
  theft: "bg-crimson-500/15 text-crimson-500",
  pocket: "bg-amber-400/15 text-amber-600",
  grab: "bg-rust-100 text-rust-500",
  person: "bg-moss-400/20 text-moss-600",
};

const STATUS_CLASS: Record<Alert["status"], string> = {
  new: "bg-crimson-500 text-white",
  reviewing: "bg-amber-400 text-ink-900",
  resolved: "bg-moss-500 text-white",
};

type Metric = {
  label: string;
  value: number;
  Icon: LucideIcon;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [source, setSource] = useState("loading");
  const [status, setStatus] = useState<Alert["status"] | "all">("all");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set());

  function applyLocalEscalations(nextAlerts: Alert[]) {
    const updatedAlerts = nextAlerts.map((alert) =>
      escalatedIds.has(alert.id) ? { ...alert, status: "reviewing" as const } : alert,
    );
    return status === "all"
      ? updatedAlerts
      : updatedAlerts.filter((alert) => alert.status === status);
  }

  async function loadAlerts() {
    const query = status === "all" ? "" : `&status=${status}`;
    const response = await fetch(`/api/alerts?limit=50${query}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.alerts)) {
      setAlerts(applyLocalEscalations(payload.alerts));
      setSource(payload.source || "api");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const query = status === "all" ? "" : `&status=${status}`;
      const response = await fetch(`/api/alerts?limit=50${query}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!cancelled && Array.isArray(payload?.alerts)) {
        setAlerts(applyLocalEscalations(payload.alerts));
        setSource(payload.source || "api");
      }
    }
    load();
    const interval = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [status, escalatedIds]);

  async function escalate(alert: Alert) {
    setWorkingId(alert.id);
    try {
      const response = await fetch("/api/alerts/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, action: "escalate" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Escalation failed.");
      }
      setAlerts((current) =>
        current.map((item) =>
          item.id === alert.id ? { ...item, status: "reviewing" } : item,
        ),
      );
      setEscalatedIds((current) => {
        const next = new Set(current);
        next.add(alert.id);
        return next;
      });
      if (payload?.source !== "local") {
        await loadAlerts();
      }
    } finally {
      setWorkingId(null);
    }
  }

  const visibleAlerts = alerts.length ? alerts : fallbackAlerts;
  const counts = useMemo(
    () => ({
      new: alerts.filter((alert) => alert.status === "new").length,
      reviewing: alerts.filter((alert) => alert.status === "reviewing").length,
      resolved: alerts.filter((alert) => alert.status === "resolved").length,
    }),
    [alerts],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Alerts
          </h1>
          <p className="mt-1 text-[15px] text-ink-500">
            Review live theft signals and operator decisions
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-ink-900/5 bg-paper-50 px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-moss-500 pulse-dot" />
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-700">
            {source}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {([
          { label: "New", value: counts.new, Icon: AlertTriangle },
          { label: "Reviewing", value: counts.reviewing, Icon: Megaphone },
          { label: "Resolved", value: counts.resolved, Icon: ShieldCheck },
        ] satisfies Metric[]).map(({ label, value, Icon }) => (
          <Card key={label} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                  {label}
                </div>
                <div className="mt-1 text-[30px] font-semibold tabular-nums text-ink-900">
                  {value}
                </div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-paper-200 text-rust-500">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Review queue"
          action={
            <div className="inline-flex rounded-lg border border-ink-900/5 bg-paper-100 p-1">
              {(["all", "new", "reviewing", "resolved"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-[12.5px] font-semibold capitalize transition",
                    status === option
                      ? "bg-ink-900 text-paper-50"
                      : "text-ink-500 hover:text-ink-900",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-4 pb-4 pt-4">
          <div className="overflow-hidden rounded-lg border border-ink-900/5">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-paper-100 text-[11px] uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Alert</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Camera</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-900/5">
                {visibleAlerts.map((alert) => (
                  <tr key={alert.id} className="bg-paper-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            "grid h-8 w-8 place-items-center rounded-md",
                            TYPE_CLASS[alert.type],
                          )}
                        >
                          {TYPE_ICON[alert.type]}
                        </div>
                        <div>
                          <div className="font-semibold text-ink-900">{alert.title}</div>
                          <div className="text-[12px] text-ink-500">
                            Track {alert.trackId ?? "unknown"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{alert.location}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-500">
                      {alert.cameraId || "camera-01"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-ink-500">
                      {alert.time}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                          STATUS_CLASS[alert.status],
                        )}
                      >
                        {alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => escalate(alert)}
                          disabled={workingId === alert.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[12px] font-semibold text-paper-50 disabled:opacity-60"
                        >
                          {workingId === alert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
                          Escalate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
