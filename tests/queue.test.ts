import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import pino from "pino";
import { NotificationQueue } from "../src/queue/notification.queue.js";
import type { NotificationEvent } from "../src/notification/notification.types.js";

const event: NotificationEvent = {
  source: "Microsoft Teams",
  title: "Teams",
  message: "Hello",
  priority: "high",
  timestamp: new Date().toISOString(),
};

describe("notification queue", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  function makeQueue(overrides: Partial<{ maxSize: number; maxAgeHours: number }> = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nb-queue-"));
    dirs.push(dir);
    const logger = pino({ level: "silent" });
    return new NotificationQueue(
      {
        enabled: true,
        maxSize: overrides.maxSize ?? 3,
        maxAgeHours: overrides.maxAgeHours ?? 24,
        path: path.join(dir, "queue.jsonl"),
      },
      logger,
    );
  }

  it("enqueues and peeks items", () => {
    const queue = makeQueue();
    const item = queue.enqueue(event);
    expect(item).not.toBeNull();
    expect(queue.size).toBe(1);
    expect(queue.peekBatch(10)).toHaveLength(1);
  });

  it("drops oldest when exceeding max size", () => {
    const queue = makeQueue({ maxSize: 2 });
    queue.enqueue({ ...event, message: "1" });
    queue.enqueue({ ...event, message: "2" });
    queue.enqueue({ ...event, message: "3" });
    expect(queue.size).toBe(2);
    const batch = queue.peekBatch(10);
    expect(batch[0]?.event.message).toBe("2");
    expect(batch[1]?.event.message).toBe("3");
  });

  it("removes items after successful flush tracking", () => {
    const queue = makeQueue();
    const item = queue.enqueue(event)!;
    queue.remove(item.id);
    expect(queue.size).toBe(0);
  });
});
