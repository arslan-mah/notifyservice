import type { NotificationEvent } from "../notification.types.js";

/**
 * Pluggable notification source. Future Teams/Zoho/CMS/email adapters
 * should implement this and emit NotificationEvent.
 */
export interface NotificationSource {
  readonly name: string;
  start(onEvent: (event: NotificationEvent) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
