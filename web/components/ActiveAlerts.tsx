"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "./Card";
import { RunningIcon, JarIcon, BoxIcon, PersonIcon } from "./SpotterIcons";
import { Loader2, Volume2 } from "lucide-react";
import clsx from "clsx";
import { fallbackAlerts, type Alert, type AlertType } from "@/lib/spotter-data";

const TYPE_STYLES: Record<
  AlertType,
  { border: string; iconWrap: string; icon: React.ReactNode }
> = {
  theft: {
    border: "border-l-crimson-500",
    iconWrap: "bg-crimson-500/10 text-crimson-500",
    icon: <RunningIcon className="h-4 w-4" />,
  },
  pocket: {
    border: "border-l-amber-400",
    iconWrap: "bg-amber-400/15 text-amber-500",
    icon: <JarIcon className="h-4 w-4" />,
  },
  grab: {
    border: "border-l-rust-400",
    iconWrap: "bg-rust-100 text-rust-500",
    icon: <BoxIcon className="h-4 w-4" />,
  },
  person: {
    border: "border-l-moss-500",
    iconWrap: "bg-moss-400/20 text-moss-600",
    icon: <PersonIcon className="h-4 w-4" />,
  },
};

function ThumbBg() {
  // Subtle warm-noise placeholder thumbnail
  return (
    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-ink-700 to-ink-900">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 40%, rgba(189,106,71,0.4), transparent 40%), radial-gradient(circle at 70% 60%, rgba(155,45,36,0.3), transparent 35%)",
        }}
      />
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 h-5 w-2 rounded-full bg-paper-200/40" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-paper-200/50" />
    </div>
  );
}

export function ActiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>(fallbackAlerts);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [broadcastStatus, setBroadcastStatus] = useState<
    { id: string; message: string; type: "success" | "error" } | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAlerts() {
      const response = await fetch("/api/alerts?limit=4&status=new", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!cancelled && Array.isArray(payload?.alerts)) {
        setAlerts(payload.alerts.length ? payload.alerts : fallbackAlerts);
      }
    }

    loadAlerts();
    const interval = window.setInterval(loadAlerts, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function broadcastAlert(alert: Alert) {
    setBroadcastingId(alert.id);
    setBroadcastStatus(null);

    try {
      const response = await fetch("/api/alerts/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.audioBase64) {
        throw new Error(payload?.error || "Broadcast failed.");
      }

      const audio = new Audio(
        `data:${payload.contentType || "audio/mpeg"};base64,${payload.audioBase64}`,
      );
      await audio.play();
      setBroadcastStatus({
        id: alert.id,
        type: "success",
        message: payload.message || "Broadcast sent.",
      });
    } catch (error) {
      setBroadcastStatus({
        id: alert.id,
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to broadcast this alert.",
      });
    } finally {
      setBroadcastingId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Active Alerts"
        action={
          <button className="text-[13px] font-medium text-rust-500 hover:text-rust-600">
            View all
          </button>
        }
      />
      <ul className="px-4 py-4 space-y-2">
        {alerts.map((a, i) => {
          const s = TYPE_STYLES[a.type] || TYPE_STYLES.person;
          return (
            <li key={a.id || i}>
              <div
                className={clsx(
                  "flex items-center gap-3 rounded-lg border-l-4 bg-paper-100/60 hover:bg-paper-200/60 transition-colors px-3 py-2.5",
                  s.border,
                )}
              >
                <div
                  className={clsx(
                    "grid h-9 w-9 place-items-center rounded-lg shrink-0",
                    s.iconWrap,
                  )}
                >
                  {s.icon}
                </div>
                <button
                  type="button"
                  onClick={() => broadcastAlert(a)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Broadcast ${a.title}`}
                >
                  <div className="text-[14px] font-semibold text-ink-900">
                    {a.title}
                  </div>
                  <div className="text-[12px] text-ink-500">
                    {a.location} · {a.time}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => broadcastAlert(a)}
                  disabled={broadcastingId === a.id}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-rust-500 transition hover:bg-rust-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Generate and broadcast voice alert for ${a.title}`}
                  title="Generate and broadcast voice alert"
                >
                  {broadcastingId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <ThumbBg />
              </div>
              {broadcastStatus?.id === a.id && (
                <div
                  className={clsx(
                    "mt-1 rounded-md px-3 py-2 text-[12px] leading-5",
                    broadcastStatus.type === "success"
                      ? "bg-moss-400/15 text-moss-700"
                      : "bg-red-50 text-red-900",
                  )}
                >
                  {broadcastStatus.message}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ActiveAlertsList({
  alerts,
  selectedAlertId,
  onSelectAlert,
}: {
  alerts: Alert[];
  selectedAlertId?: string | null;
  onSelectAlert?: (alert: Alert) => void;
}) {
  return (
    <Card>
      <CardHeader title="Active Alerts" action={<button className="text-[13px] font-medium text-rust-500 hover:text-rust-600">View all</button>} />
      <ul className="px-4 py-4 space-y-2">
        {alerts.map((a, i) => {
          const s = TYPE_STYLES[a.type] || TYPE_STYLES.person;
          const selected = selectedAlertId === a.id;
          return (
            <li key={a.id || i}>
              <button
                type="button"
                onClick={() => onSelectAlert?.(a)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg border-l-4 bg-paper-100/60 hover:bg-paper-200/60 transition-colors px-3 py-2.5 text-left",
                  s.border,
                  selected && "ring-2 ring-crimson-500/30 bg-crimson-500/5",
                )}
              >
                <div className={clsx("grid h-9 w-9 place-items-center rounded-lg shrink-0", s.iconWrap)}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-ink-900">{a.title}</div>
                  <div className="text-[12px] text-ink-500">
                    {a.location} · {a.time}
                  </div>
                </div>
                <ThumbBg />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
