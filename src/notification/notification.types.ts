export type NotificationPriority = "min" | "low" | "default" | "high" | "max";

export interface NotificationEvent {
  source: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  timestamp: string;
  url?: string;
  tags?: string[];
}

/** Raw toast payload emitted by the C# win-listener helper (JSONL). */
export interface WindowsRawNotification {
  id: number;
  source: string;
  title: string;
  message: string;
  timestamp: string;
  appId?: string;
}

export type FilterDecision =
  | { allow: true }
  | { allow: false; reason: string };

export interface QueuedNotification {
  id: string;
  event: NotificationEvent;
  enqueuedAt: string;
  attempts: number;
}
