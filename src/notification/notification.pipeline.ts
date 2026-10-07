import type { AppConfig } from "../config/config.js";
import type { AppLogger } from "../logging/logger.js";
import type { NtfyService } from "../ntfy/ntfy.service.js";
import type { NotificationQueue } from "../queue/notification.queue.js";
import { NotificationDeduper } from "./notification.dedup.js";
import { filterNotification } from "./notification.filter.js";
import type { NotificationEvent } from "./notification.types.js";

export class NotificationPipeline {
  private readonly deduper: NotificationDeduper;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
    private readonly ntfy: NtfyService,
    private readonly queue: NotificationQueue,
  ) {
    this.deduper = new NotificationDeduper({
      windowSeconds: config.dedupSeconds,
    });
  }

  start(): void {
    if (this.config.queue.enabled) {
      this.flushTimer = setInterval(() => {
        void this.flushQueue();
      }, this.config.queue.flushIntervalMs);
      // Kick once shortly after start.
      setTimeout(() => void this.flushQueue(), 2_000);
    }
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async handle(event: NotificationEvent): Promise<void> {
    const decision = filterNotification(event, this.config.filter);
    if (!decision.allow) {
      this.logger.info(
        { source: event.source, title: event.title, reason: decision.reason },
        "notification filtered",
      );
      return;
    }

    if (!this.deduper.shouldSend(event.source, event.title, event.message)) {
      this.logger.info(
        { source: event.source, title: event.title },
        "notification filtered",
      );
      this.logger.debug(
        { source: event.source, title: event.title },
        "duplicate within dedup window",
      );
      return;
    }

    await this.deliver(event);
  }

  private async deliver(event: NotificationEvent): Promise<void> {
    const result = await this.ntfy.publish(event);
    if (result.ok) {
      this.logger.info(
        { source: event.source, title: event.title, retried: result.retried },
        "notification sent",
      );
      return;
    }

    this.logger.error(
      {
        source: event.source,
        title: event.title,
        error: result.error,
        status: result.status,
      },
      "ntfy failure",
    );

    if (this.config.queue.enabled) {
      this.queue.enqueue(event);
    }
  }

  async flushQueue(): Promise<void> {
    if (this.flushing || !this.config.queue.enabled) return;
    this.flushing = true;
    try {
      const batch = this.queue.peekBatch(20);
      for (const item of batch) {
        // One attempt per flush cycle; NtfyService still has internal retries.
        const result = await this.ntfy.publish(item.event, { maxRetries: 1 });
        if (result.ok) {
          this.queue.remove(item.id);
          this.logger.info(
            { id: item.id, source: item.event.source },
            "notification sent",
          );
        } else {
          this.queue.incrementAttempts(item.id);
          this.logger.warn(
            { id: item.id, error: result.error, attempts: item.attempts + 1 },
            "queue flush failed; will retry later",
          );
          // Stop this cycle on first failure to avoid hammering while offline.
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
