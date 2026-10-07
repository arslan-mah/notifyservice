import { getConfig } from "../config/config.js";
import { createLogger } from "../logging/logger.js";
import { normalizeSimulatedEvent } from "../notification/notification.normalize.js";
import { NtfyService } from "../ntfy/ntfy.service.js";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger({
    level: config.log.level,
    logDir: config.log.dir,
  });

  const ntfy = new NtfyService(config.ntfy, logger);
  const event = normalizeSimulatedEvent(
    {
      source: "Notification Bridge",
      title: "Notification Bridge Test",
      message: "Notification Bridge Test",
      priority: config.ntfy.priority,
      tags: ["test", "bell"],
    },
    config.ntfy.priority,
  );

  logger.info(
    { server: config.ntfy.server, topic: config.ntfy.topic },
    "sending test notification",
  );

  const result = await ntfy.publish(event, { maxRetries: 2 });
  if (!result.ok) {
    console.error(`Failed to send test notification: ${result.error}`);
    process.exit(1);
  }

  console.log("Test notification sent successfully. Check your phone.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
