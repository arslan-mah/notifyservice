import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "../src/config/config.js";

describe("configuration validation", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("requires NTFY_TOPIC", () => {
    expect(() =>
      loadConfig({
        NTFY_SERVER: "https://ntfy.sh",
        NTFY_TOPIC: "",
      } as NodeJS.ProcessEnv),
    ).toThrow(/NTFY_TOPIC/);
  });

  it("parses allowlist CSV and defaults", () => {
    const config = loadConfig({
      NTFY_SERVER: "https://ntfy.sh",
      NTFY_TOPIC: "my-private-topic",
      NOTIFICATION_ALLOWLIST: "Microsoft Teams, Chrome ,Edge",
      QUEUE_ENABLED: "true",
      HEARTBEAT_ENABLED: "false",
    } as NodeJS.ProcessEnv);

    expect(config.ntfy.topic).toBe("my-private-topic");
    expect(config.filter.allowlist).toEqual([
      "Microsoft Teams",
      "Chrome",
      "Edge",
    ]);
    expect(config.queue.enabled).toBe(true);
    expect(config.heartbeat.enabled).toBe(false);
    expect(config.ntfy.priority).toBe("high");
  });

  it("rejects invalid priority", () => {
    expect(() =>
      loadConfig({
        NTFY_TOPIC: "t",
        NTFY_PRIORITY: "urgent",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid configuration/);
  });

  it("strips trailing slash from server URL", () => {
    const config = loadConfig({
      NTFY_SERVER: "https://ntfy.sh/",
      NTFY_TOPIC: "topic",
    } as NodeJS.ProcessEnv);
    expect(config.ntfy.server).toBe("https://ntfy.sh");
  });
});
