"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
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

const DECISION_STATUS = {
  escalated: {
    label: "Escalated",
    className: "bg-amber-400 text-ink-900",
  },
  falsePositive: {
    label: "False positive",
    className: "bg-moss-500 text-white",
  },
} as const;

const ICON_OPTIONS: Array<{ type: AlertType; label: string }> = [
  { type: "theft", label: "Theft" },
  { type: "pocket", label: "Pocket" },
  { type: "grab", label: "Grab" },
  { type: "person", label: "Person" },
];

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
  const [falsePositiveIds, setFalsePositiveIds] = useState<Set<string>>(new Set());
  const [iconOverrides, setIconOverrides] = useState<Record<string, AlertType>>({});

  async function loadAlerts() {
    const response = await fetch("/api/alerts?limit=50", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.alerts)) {
      setAlerts(payload.alerts);
      setSource(payload.source || "api");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/alerts?limit=50", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!cancelled && Array.isArray(payload?.alerts)) {
        setAlerts(payload.alerts);
        setSource(payload.source || "api");
      }
    }
    load();
    const interval = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function applyDecision(alert: Alert, action: "escalate" | "dismiss") {
    setWorkingId(alert.id);
    try {
      const response = await fetch("/api/alerts/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Decision failed.");
      }
      const nextStatus = action === "escalate" ? "reviewing" : "resolved";
      setAlerts((current) =>
        (current.length ? current : fallbackAlerts).map((item) =>
          item.id === alert.id ? { ...item, status: nextStatus } : item,
        ),
      );
      if (action === "escalate") {
        setEscalatedIds((current) => new Set(current).add(alert.id));
        setFalsePositiveIds((current) => {
          const next = new Set(current);
          next.delete(alert.id);
          return next;
        });
      } else {
        setFalsePositiveIds((current) => new Set(current).add(alert.id));
        setEscalatedIds((current) => {
          const next = new Set(current);
          next.delete(alert.id);
          return next;
        });
      }
      if (payload?.source !== "local") {
        await loadAlerts();
      }
    } finally {
      setWorkingId(null);
    }
  }

  const baseAlerts = alerts.length ? alerts : fallbackAlerts;
  const allAlerts = baseAlerts.map((alert) => ({
    ...alert,
    type: iconOverrides[alert.id] || alert.type,
    status: falsePositiveIds.has(alert.id)
      ? ("resolved" as const)
      : escalatedIds.has(alert.id)
        ? ("reviewing" as const)
        : alert.status,
  }));
  const visibleAlerts =
    status === "all"
      ? allAlerts
      : allAlerts.filter((alert) => alert.status === status);
  const counts = useMemo(
    () => ({
      new: allAlerts.filter((alert) => alert.status === "new").length,
      reviewing: allAlerts.filter((alert) => alert.status === "reviewing").length,
      resolved: allAlerts.filter((alert) => alert.status === "resolved").length,
    }),
    [allAlerts],
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
                {visibleAlerts.map((alert) => {
                  const decision = falsePositiveIds.has(alert.id)
                    ? DECISION_STATUS.falsePositive
                    : escalatedIds.has(alert.id)
                      ? DECISION_STATUS.escalated
                      : null;

                  return (
                  <tr key={alert.id} className="bg-paper-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={clsx(
                              "grid h-8 w-8 place-items-center rounded-md",
                              TYPE_CLASS[alert.type],
                            )}
                          >
                            {TYPE_ICON[alert.type]}
                          </div>
                          <select
                            aria-label={`Icon for ${alert.title}`}
                            value={alert.type}
                            onChange={(event) =>
                              setIconOverrides((current) => ({
                                ...current,
                                [alert.id]: event.target.value as AlertType,
                              }))
                            }
                            className="h-8 rounded-md border border-ink-900/10 bg-paper-50 px-2 text-[11px] font-semibold text-ink-600 outline-none hover:border-ink-900/20 focus:border-rust-500"
                          >
                            {ICON_OPTIONS.map((option) => (
                              <option key={option.type} value={option.type}>
                                {option.label}
                              </option>
                            ))}
                          </select>
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
                          decision?.className || STATUS_CLASS[alert.status],
                        )}
                      >
                        {decision?.label || alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => applyDecision(alert, "dismiss")}
                          disabled={workingId === alert.id}
                          className={clsx(
                            "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold transition disabled:opacity-60",
                            falsePositiveIds.has(alert.id) || alert.status === "resolved"
                              ? "border-moss-500 bg-moss-500 text-white"
                              : "border-ink-900/10 bg-paper-50 text-ink-700 hover:bg-paper-100",
                          )}
                        >
                          {workingId === alert.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : falsePositiveIds.has(alert.id) || alert.status === "resolved" ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <CircleSlash className="h-3.5 w-3.5" />
                          )}
                          {falsePositiveIds.has(alert.id) || alert.status === "resolved"
                            ? "Marked false"
                            : "False positive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyDecision(alert, "escalate")}
                          disabled={workingId === alert.id}
                          className={clsx(
                            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition disabled:opacity-60",
                            escalatedIds.has(alert.id) || alert.status === "reviewing"
                              ? "bg-amber-400 text-ink-900"
                              : "bg-ink-900 text-paper-50 hover:bg-ink-700",
                          )}
                        >
                          {workingId === alert.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : escalatedIds.has(alert.id) || alert.status === "reviewing" ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Megaphone className="h-3.5 w-3.5" />
                          )}
                          {escalatedIds.has(alert.id) || alert.status === "reviewing"
                            ? "Escalated"
                            : "Escalate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
