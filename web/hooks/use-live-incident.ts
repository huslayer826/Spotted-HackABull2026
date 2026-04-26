"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fallbackAlerts,
  type Alert,
  type DetectionEvent,
  type LiveIncident,
} from "@/lib/spotter-data";

function isIncidentEvent(event: DetectionEvent) {
  return event.label === "Shoplifting";
}

function alertFromEvent(event: DetectionEvent): Alert {
  return {
    id: `alert-${event.id}`,
    type: "theft",
    title: "Theft Detected",
    location: event.location,
    time: new Date(event.ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
    status: "new",
    cameraId: event.cameraId,
    trackId: event.trackId,
    eventId: event.id,
  };
}

export function useLiveIncident() {
  const [alerts, setAlerts] = useState<Alert[]>(fallbackAlerts);
  const [reviewAlerts, setReviewAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [confirmedAlertId, setConfirmedAlertId] = useState<string | null>(null);

  function ingestReviewAlerts(nextReviewAlerts: Alert[]) {
    setReviewAlerts(nextReviewAlerts);
    setAlerts((currentAlerts) => [
      ...nextReviewAlerts,
      ...currentAlerts.filter(
        (alert) =>
          !nextReviewAlerts.some(
            (reviewAlert) => reviewAlert.id === alert.id,
          ),
      ),
    ]);
    setSelectedAlertId(nextReviewAlerts[0]?.id || null);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [alertsResponse, eventsResponse] = await Promise.all([
        fetch("/api/alerts?limit=8&status=new", { cache: "no-store" }),
        fetch("/api/events?limit=20", { cache: "no-store" }),
      ]);
      const [alertsPayload, eventsPayload] = await Promise.all([
        alertsResponse.json().catch(() => null),
        eventsResponse.json().catch(() => null),
      ]);

      if (cancelled) return;

      const nextEvents = Array.isArray(eventsPayload?.events)
        ? eventsPayload.events
        : [];
      const eventAlerts = nextEvents.filter(isIncidentEvent).map(alertFromEvent);
      const dbAlerts = Array.isArray(alertsPayload?.alerts)
        ? alertsPayload.alerts
        : [];
      const nextAlerts = [...reviewAlerts, ...eventAlerts, ...dbAlerts];

      setEvents(nextEvents);
      setAlerts(nextAlerts.length ? nextAlerts : fallbackAlerts);
    }

    load();
    const interval = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [reviewAlerts]);

  const incident = useMemo<LiveIncident>(() => {
    const alert =
      alerts.find((candidate) => candidate.id === selectedAlertId) ||
      alerts.find((candidate) => candidate.type === "theft") ||
      alerts[0] ||
      null;
    const event =
      events.find(
        (candidate) =>
          candidate.id === alert?.eventId ||
          (candidate.trackId === alert?.trackId &&
            candidate.cameraId === alert?.cameraId),
      ) ||
      events.find(isIncidentEvent) ||
      null;

    return {
      alert,
      event,
      confirmed: Boolean(alert?.id && confirmedAlertId === alert.id),
    };
  }, [alerts, events, selectedAlertId, confirmedAlertId]);

  function selectAlert(alertId: string | null) {
    setSelectedAlertId(alertId);
  }

  function confirmIncident(alertId?: string) {
    setConfirmedAlertId(alertId || incident.alert?.id || null);
  }

  return {
    alerts,
    events,
    incident,
    selectedAlertId,
    confirmedAlertId,
    selectAlert,
    confirmIncident,
    setAlerts,
    ingestReviewAlerts,
  };
}
