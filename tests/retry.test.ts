import { afterEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { NtfyService } from "../src/ntfy/ntfy.service.js";
import type { NotificationEvent } from "../src/notification/notification.types.js";

const event: NotificationEvent = {
  source: "Test",
  title: "Test",
  message: "hello",
  priority: "high",
  timestamp: new Date().toISOString(),
};

describe("ntfy retry behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on network failure then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("network down");
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const logger = pino({ level: "silent" });
    const service = new NtfyService(
      {
        server: "https://ntfy.sh",
        topic: "test-topic",
        token: "",
        priority: "high",
        timeoutMs: 1000,
        maxRetries: 5,
        retryBaseMs: 1,
        retryMaxMs: 5,
      },
      logger,
    );

    const result = await service.publish(event);
    expect(result.ok).toBe(true);
    expect(result.retried).toBe(2);
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable 4xx errors", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response("forbidden", { status: 403 });
      }),
    );

    const logger = pino({ level: "silent" });
    const service = new NtfyService(
      {
        server: "https://ntfy.sh",
        topic: "test-topic",
        token: "",
        priority: "high",
        timeoutMs: 1000,
        maxRetries: 5,
        retryBaseMs: 1,
        retryMaxMs: 5,
      },
      logger,
    );

    const result = await service.publish(event);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(calls).toBe(1);
  });
});
