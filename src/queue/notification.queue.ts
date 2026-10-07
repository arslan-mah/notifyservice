import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppLogger } from "../logging/logger.js";
import type {
  NotificationEvent,
  QueuedNotification,
} from "../notification/notification.types.js";

export interface QueueConfig {
  enabled: boolean;
  maxSize: number;
  maxAgeHours: number;
  path: string;
}

/**
 * Simple local JSONL persistent queue for offline / failed ntfy publishes.
 */
export class NotificationQueue {
  private items: QueuedNotification[] = [];
  private loaded = false;

  constructor(
    private readonly config: QueueConfig,
    private readonly logger: AppLogger,
  ) {}

  get size(): number {
    this.ensureLoaded();
    return this.items.length;
  }

  enqueue(event: NotificationEvent): QueuedNotification | null {
    if (!this.config.enabled) {
      return null;
    }

    this.ensureLoaded();
    this.pruneExpired();

    while (this.items.length >= this.config.maxSize) {
      const dropped = this.items.shift();
      this.logger.warn(
        { droppedId: dropped?.id, source: dropped?.event.source },
        "queue operation: dropped oldest (max size)",
      );
    }

    const item: QueuedNotification = {
      id: randomUUID(),
      event,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    };
    this.items.push(item);
    this.persist();
    this.logger.info(
      { id: item.id, source: event.source, queueSize: this.items.length },
      "queue operation: enqueued",
    );
    return item;
  }

  peekBatch(limit: number): QueuedNotification[] {
    this.ensureLoaded();
    this.pruneExpired();
    return this.items.slice(0, limit);
  }

  remove(id: string): void {
    this.ensureLoaded();
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length !== before) {
      this.persist();
      this.logger.info({ id, queueSize: this.items.length }, "queue operation: removed");
    }
  }

  incrementAttempts(id: string): void {
    this.ensureLoaded();
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.attempts += 1;
      this.persist();
    }
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!fs.existsSync(this.config.path)) {
        this.items = [];
        return;
      }
      const raw = fs.readFileSync(this.config.path, "utf8");
      this.items = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as QueuedNotification);
      this.pruneExpired();
      this.logger.info({ queueSize: this.items.length }, "queue operation: loaded");
    } catch (err) {
      this.logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "queue operation: load failed",
      );
      this.items = [];
    }
  }

  private pruneExpired(): void {
    const maxAgeMs = this.config.maxAgeHours * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    const before = this.items.length;
    this.items = this.items.filter((item) => {
      const ts = Date.parse(item.enqueuedAt);
      return Number.isNaN(ts) || ts >= cutoff;
    });
    if (this.items.length !== before) {
      this.logger.info(
        { removed: before - this.items.length, queueSize: this.items.length },
        "queue operation: pruned expired",
      );
      this.persist();
    }
  }

  private persist(): void {
    const dir = path.dirname(this.config.path);
    fs.mkdirSync(dir, { recursive: true });
    const body = this.items.map((i) => JSON.stringify(i)).join("\n");
    const tmp = `${this.config.path}.tmp`;
    fs.writeFileSync(tmp, body ? `${body}\n` : "", "utf8");
    fs.renameSync(tmp, this.config.path);
  }
}
