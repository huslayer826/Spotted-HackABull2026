import type { Document, WithId } from "mongodb";

export type DetectionLabel = "Normal" | "Shoplifting" | "Monitoring" | "Person";
export type AlertType = "theft" | "pocket" | "grab" | "person";

export type DetectionEvent = {
  id: string;
  ts: string;
  trackId: number;
  label: DetectionLabel;
  confidence: number;
  cameraId: string;
  location: string;
  bbox?: number[];
};

export type Alert = {
  id: string;
  type: AlertType;
  title: string;
  location: string;
  time: string;
  status: "new" | "reviewing" | "resolved";
  cameraId?: string;
  trackId?: number;
  eventId?: string;
};

export type RecentActivityItem = {
  id: string;
  icon: AlertType | "camera";
  title: string;
  location: string;
  ago: string;
};

export type Summary = {
  alertsToday: number;
  alertsDeltaPct: number;
  sparkline: number[];
  eventSlices: Array<{ label: string; value: number; color: string; pct: number }>;
  peopleInArea: number;
  markers: Array<{
    x: number;
    y: number;
    type: "stealing" | "person" | "grabbing" | "pocketing";
  }>;
};

export type Camera = {
  id: string;
  name: string;
  location: string;
  status: "online" | "offline";
  streamUrl?: string;
  device?: string;
};

export const fallbackAlerts: Alert[] = [
  {
    id: "sample-theft",
    type: "theft",
    title: "Theft Detected",
    location: "Back Alley",
    time: "10:24:32 PM",
    status: "new",
    cameraId: "camera-01",
    trackId: 1,
    eventId: "sample-theft-event",
  },
  {
    id: "sample-pocket",
    type: "pocket",
    title: "Item Pocketed",
    location: "Aisle 3",
    time: "10:23:45 PM",
    status: "new",
    cameraId: "camera-01",
    trackId: 2,
    eventId: "sample-pocket-event",
  },
  {
    id: "sample-grab",
    type: "grab",
    title: "Item Grabbed",
    location: "Aisle 1",
    time: "10:23:11 PM",
    status: "new",
    cameraId: "camera-01",
    trackId: 3,
    eventId: "sample-grab-event",
  },
  {
    id: "sample-person",
    type: "person",
    title: "Person Detected",
    location: "Entrance",
    time: "10:22:05 PM",
    status: "new",
    cameraId: "camera-01",
    trackId: 1,
    eventId: "sample-person-event",
  },
];

export type LiveIncident = {
  alert: Alert | null;
  event: DetectionEvent | null;
  confirmed: boolean;
};

export const fallbackSummary: Summary = {
  alertsToday: 23,
  alertsDeltaPct: 35,
  sparkline: [
    6, 8, 7, 10, 14, 11, 9, 12, 16, 28, 36, 30, 21, 17, 22, 14, 12, 19, 26,
    18, 15, 12, 10, 9,
  ],
  eventSlices: [
    { label: "Theft", value: 12, color: "#9B2D24", pct: 9 },
    { label: "Pocketing", value: 28, color: "#E2A24C", pct: 22 },
    { label: "Grabbing", value: 36, color: "#BD6A47", pct: 28 },
    { label: "Other", value: 52, color: "#7B9971", pct: 41 },
  ],
  peopleInArea: 5,
  markers: [
    { x: 22, y: 78, type: "grabbing" },
    { x: 32, y: 60, type: "person" },
    { x: 46, y: 38, type: "person" },
    { x: 38, y: 70, type: "pocketing" },
    { x: 56, y: 65, type: "grabbing" },
    { x: 62, y: 30, type: "person" },
    { x: 68, y: 50, type: "person" },
    { x: 78, y: 70, type: "stealing" },
  ],
};

export const fallbackCameras: Camera[] = [
  {
    id: "camera-01",
    name: "Camera 01",
    location: "Front aisle",
    status: "online",
    device: "/dev/video0",
  },
];

export function serializeDoc<T extends Document>(doc: WithId<T>) {
  return {
    ...doc,
    _id: doc._id.toString(),
  };
}

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function eventLabel(value: unknown): DetectionLabel {
  return value === "Shoplifting" ||
    value === "Normal" ||
    value === "Monitoring" ||
    value === "Person"
    ? value
    : "Monitoring";
}

export function alertTypeFromLabel(label: unknown): AlertType {
  if (label === "Shoplifting") return "theft";
  if (label === "Item Pocketed" || label === "Pocketing") return "pocket";
  if (label === "Item Grabbed" || label === "Grab") return "grab";
  return "person";
}

export function titleFromLabel(label: unknown) {
  if (label === "Shoplifting") return "Shoplifting Detected";
  if (label === "Person") return "Person Detected";
  if (typeof label === "string" && label.trim()) return `${label} Detected`;
  return "Detection Event";
}

export function normalizeDetectionEvent(raw: any): DetectionEvent {
  const ts = asDate(raw?.ts || raw?.createdAt).toISOString();
  const id =
    typeof raw?.id === "string"
      ? raw.id
      : typeof raw?._id === "string"
        ? raw._id
        : `${raw?.cameraId || "camera"}-${raw?.trackId || 0}-${ts}`;

  return {
    id,
    ts,
    trackId: asNumber(raw?.trackId),
    label: eventLabel(raw?.label),
    confidence: asNumber(raw?.confidence),
    cameraId: typeof raw?.cameraId === "string" ? raw.cameraId : "camera-01",
    location: typeof raw?.location === "string" ? raw.location : "Unknown",
    bbox: Array.isArray(raw?.bbox) ? raw.bbox.map((value: unknown) => asNumber(value)) : undefined,
  };
}

export function alertFromDetectionEvent(event: DetectionEvent): Alert {
  const date = asDate(event.ts);
  return {
    id: `alert-${event.id}`,
    type: alertTypeFromLabel(event.label),
    title: titleFromLabel(event.label),
    location: event.location,
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
    status: event.label === "Shoplifting" ? "new" : "reviewing",
    cameraId: event.cameraId,
    trackId: event.trackId,
    eventId: event.id,
  };
}

export function normalizeAlert(raw: any): Alert {
  const date = asDate(raw?.time || raw?.createdAt || raw?.updatedAt);
  const type =
    raw?.type === "theft" ||
    raw?.type === "pocket" ||
    raw?.type === "grab" ||
    raw?.type === "person"
      ? raw.type
      : alertTypeFromLabel(raw?.label);
  const status =
    raw?.status === "new" ||
    raw?.status === "reviewing" ||
    raw?.status === "resolved"
      ? raw.status
      : "new";

  return {
    id:
      typeof raw?.id === "string"
        ? raw.id
        : typeof raw?._id === "string"
          ? raw._id
          : `alert-${date.getTime()}`,
    type,
    title:
      typeof raw?.title === "string" && raw.title.trim()
        ? raw.title
        : titleFromLabel(raw?.label || type),
    location: typeof raw?.location === "string" ? raw.location : "Unknown",
    time:
      typeof raw?.time === "string" && raw.time.trim()
        ? raw.time
        : date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          }),
    status,
    cameraId: typeof raw?.cameraId === "string" ? raw.cameraId : undefined,
    trackId: typeof raw?.trackId === "number" ? raw.trackId : undefined,
    eventId: typeof raw?.eventId === "string" ? raw.eventId : undefined,
  };
}

export function timeAgo(date: Date) {
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
