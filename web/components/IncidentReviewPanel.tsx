"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Loader2,
  Radio,
  Volume2,
} from "lucide-react";
import clsx from "clsx";
import { Card, CardHeader } from "@/components/Card";
import { LiveCameraFeed } from "@/components/LiveCameraFeed";
import type { LiveIncident } from "@/lib/spotter-data";

type Decision = "broadcast" | "dismiss" | "escalate";

export function IncidentReviewPanel({
  incident,
  onConfirm,
}: {
  incident: LiveIncident;
  onConfirm?: () => void;
}) {
  const [pending, setPending] = useState<Decision | null>(null);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  const alert = incident.alert;

  async function decide(action: Decision) {
    if (!alert) return;
    setPending(action);
    setStatus(null);

    try {
      if (action === "broadcast") {
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
        setStatus({ type: "success", message: payload.message || "Broadcast sent." });
        return;
      }

      const response = await fetch("/api/alerts/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Decision failed.");
      }
      setStatus({
        type: "success",
        message:
          action === "dismiss"
            ? "Marked as false alarm."
            : "Escalated for staff review.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to apply decision.",
      });
    } finally {
      setPending(null);
    }
  }

  function confirmAlert() {
    if (!alert) return;
    onConfirm?.();
    setStatus({
      type: "success",
      message: "Target lock active. The reticle is following the live track on the LIDAR view.",
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-crimson-500" />
            Incident Review
          </span>
        }
        action={
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-crimson-500">
            <span className="h-1.5 w-1.5 rounded-full bg-crimson-500 pulse-dot" />
            live
          </span>
        }
      />

      <div className="px-5 py-4 space-y-4">
        {alert ? (
          <>
            <LiveCameraFeed incident={incident} compact />
            <div className="rounded-lg bg-paper-100 border border-ink-900/5 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold text-ink-900">
                    {alert.title}
                  </div>
                  <div className="mt-1 text-[12.5px] leading-5 text-ink-500">
                    Camera {alert.cameraId || incident.event?.cameraId || "camera-01"} ·{" "}
                    Track ID{alert.trackId || incident.event?.trackId || 1} ·{" "}
                    {alert.location}
                  </div>
                </div>
                {incident.confirmed && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-crimson-500 px-2.5 py-1 text-[12px] font-semibold text-paper-50">
                    <Crosshair className="h-3.5 w-3.5" />
                    Target locked
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <DecisionButton
                label={incident.confirmed ? "Locked" : "Lock target"}
                icon={<Crosshair className="h-4 w-4" />}
                active={false}
                disabled={incident.confirmed}
                onClick={confirmAlert}
                variant="confirm"
              />
              <DecisionButton
                label="Broadcast"
                icon={<Volume2 className="h-4 w-4" />}
                active={pending === "broadcast"}
                onClick={() => decide("broadcast")}
              />
              <DecisionButton
                label="False alarm"
                icon={<CheckCircle2 className="h-4 w-4" />}
                active={pending === "dismiss"}
                onClick={() => decide("dismiss")}
              />
              <DecisionButton
                label="Escalate"
                icon={<Radio className="h-4 w-4" />}
                active={pending === "escalate"}
                onClick={() => decide("escalate")}
              />
            </div>

            {status && (
              <div
                className={clsx(
                  "rounded-lg px-4 py-3 text-[13px] leading-5",
                  status.type === "success"
                    ? "bg-moss-400/15 text-moss-700"
                    : "bg-red-50 text-red-900",
                )}
              >
                {status.message}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg bg-paper-100 px-4 py-6 text-center text-[14px] text-ink-500">
            Waiting for a live incident.
          </div>
        )}
      </div>
    </Card>
  );
}

function DecisionButton({
  label,
  icon,
  active,
  disabled = false,
  onClick,
  variant = "default",
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "confirm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active || disabled}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition disabled:cursor-not-allowed",
        variant === "confirm"
          ? "bg-crimson-500 text-paper-50 hover:bg-crimson-600 disabled:bg-moss-600 disabled:opacity-100"
          : "bg-ink-900 text-paper-50 hover:bg-ink-700 disabled:opacity-70",
      )}
    >
      {active ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
