import { getConfig } from "./config/config.js";
import { createLogger } from "./logging/logger.js";
import { NotificationPipeline } from "./notification/notification.pipeline.js";
import type { NotificationSource } from "./notification/sources/notification.source.js";
import { SimulatedNotificationSource } from "./notification/sources/simulated.notification.source.js";
import { WindowsNotificationSource } from "./notification/sources/windows.notification.source.js";
import { NtfyService } from "./ntfy/ntfy.service.js";
import { NotificationQueue } from "./queue/notification.queue.js";
import { normalizeSimulatedEvent } from "./notification/notification.normalize.js";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger({
    level: config.log.level,
    logDir: config.log.dir,
  });

  logger.info(
    {
      simulate: config.simulate,
      topic: config.ntfy.topic,
      server: config.ntfy.server,
      allowlist: config.filter.allowlist,
      queueEnabled: config.queue.enabled,
    },
    "application startup",
  );

  const ntfy = new NtfyService(config.ntfy, logger);
  const queue = new NotificationQueue(config.queue, logger);
  const pipeline = new NotificationPipeline(config, logger, ntfy, queue);
  pipeline.start();

  const source: NotificationSource = config.simulate
    ? new SimulatedNotificationSource(config, logger)
    : new WindowsNotificationSource(config, logger);

  let heartbeatTimer: NodeJS.Timeout | null = null;
  if (config.heartbeat.enabled) {
    heartbeatTimer = setInterval(() => {
      void (async () => {
        if (config.heartbeat.mode === "log") {
          logger.info(
            { queueSize: queue.size, source: source.name },
            "heartbeat",
          );
          return;
        }

        const event = normalizeSimulatedEvent(
          {
            source: "Notification Bridge",
            title: "Notification Bridge",
            message: "Agent heartbeat — still running",
            priority: "min",
            tags: ["heartbeat"],
          },
          "min",
        );
        await ntfy.publish(event, { maxRetries: 0 });
      })();
    }, config.heartbeat.intervalMs);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "application shutdown");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    pipeline.stop();
    await source.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await source.start((event) => pipeline.handle(event));
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
