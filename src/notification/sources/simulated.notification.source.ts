import type { AppConfig } from "../../config/config.js";
import type { AppLogger } from "../../logging/logger.js";
import { normalizeSimulatedEvent } from "../notification.normalize.js";
import type { NotificationEvent } from "../notification.types.js";
import type { NotificationSource } from "./notification.source.js";

/**
 * Development source that emits a few sample notifications, then keeps
 * the process alive so the rest of the pipeline can be exercised.
 */
export class SimulatedNotificationSource implements NotificationSource {
  readonly name = "simulated";
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async start(
    onEvent: (event: NotificationEvent) => void | Promise<void>,
  ): Promise<void> {
    this.logger.info("starting simulated notification source");

    const samples: Array<
      Partial<NotificationEvent> &
        Pick<NotificationEvent, "source" | "title" | "message">
    > = [
      {
        source: "Microsoft Teams",
        title: "Microsoft Teams",
        message: "Ahmed sent you a test message",
        priority: "high",
      },
      {
        source: "Microsoft Teams",
        title: "Microsoft Teams",
        message: "Teams update available",
        priority: "low",
      },
      {
        source: "Google Chrome",
        title: "My CMS",
        message: "New article awaiting review",
        priority: "high",
      },
    ];

    for (const sample of samples) {
      if (this.stopped) return;
      const event = normalizeSimulatedEvent(sample, this.config.ntfy.priority);
      this.logger.info(
        { source: event.source, title: event.title },
        "notification received",
      );
      await onEvent(event);
      await delay(500);
    }

    // Keep process alive in simulated mode.
    this.timer = setInterval(() => {
      this.logger.debug("simulated source heartbeat tick");
    }, 60_000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
