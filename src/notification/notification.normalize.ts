import type { AppConfig } from "../config/config.js";
import type {
  NotificationEvent,
  WindowsRawNotification,
} from "./notification.types.js";

export function normalizeWindowsNotification(
  raw: WindowsRawNotification,
  defaultPriority: AppConfig["ntfy"]["priority"],
): NotificationEvent {
  const source = (raw.source || "Unknown App").trim();
  const rawTitle = (raw.title || source).trim();
  const message = (raw.message || rawTitle).trim();
  const timestamp =
    raw.timestamp && !Number.isNaN(Date.parse(raw.timestamp))
      ? new Date(raw.timestamp).toISOString()
      : new Date().toISOString();

  // Browser web apps (Gmail, Zoho Mail, CMS) all report source=Google Chrome.
  // Prefer the toast title (e.g. "Zoho Mail", "Gmail") as the phone title.
  const browser = /chrome|edge|firefox|brave/i.test(source);
  const title = browser && rawTitle && rawTitle !== source
    ? rawTitle
    : source === rawTitle
      ? source
      : `${source}: ${rawTitle}`;

  return {
    source,
    title,
    message,
    priority: defaultPriority,
    timestamp,
    tags: [sanitizeTag(source), sanitizeTag(rawTitle)].filter(
      (t, i, arr) => arr.indexOf(t) === i,
    ),
  };
}

export function normalizeSimulatedEvent(
  partial: Partial<NotificationEvent> &
    Pick<NotificationEvent, "source" | "title" | "message">,
  defaultPriority: AppConfig["ntfy"]["priority"],
): NotificationEvent {
  return {
    source: partial.source,
    title: partial.title,
    message: partial.message,
    priority: partial.priority ?? defaultPriority,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    url: partial.url,
    tags: partial.tags ?? [sanitizeTag(partial.source)],
  };
}

function sanitizeTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "app";
}
