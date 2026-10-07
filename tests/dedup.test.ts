import { describe, expect, it, vi } from "vitest";
import { NotificationDeduper } from "../src/notification/notification.dedup.js";

describe("notification deduplication", () => {
  it("sends the first occurrence", () => {
    const deduper = new NotificationDeduper({ windowSeconds: 10 });
    expect(
      deduper.shouldSend("Microsoft Teams", "Teams", "Ahmed sent you a message"),
    ).toBe(true);
  });

  it("suppresses duplicates within the window", () => {
    let now = 1_000_000;
    const deduper = new NotificationDeduper({
      windowSeconds: 10,
      now: () => now,
    });

    expect(
      deduper.shouldSend("Microsoft Teams", "Teams", "Ahmed sent you a message"),
    ).toBe(true);
    now += 5_000;
    expect(
      deduper.shouldSend("Microsoft Teams", "Teams", "Ahmed sent you a message"),
    ).toBe(false);
  });

  it("allows the same notification after the window expires", () => {
    let now = 1_000_000;
    const deduper = new NotificationDeduper({
      windowSeconds: 10,
      now: () => now,
    });

    expect(deduper.shouldSend("A", "B", "C")).toBe(true);
    now += 10_001;
    expect(deduper.shouldSend("A", "B", "C")).toBe(true);
  });

  it("treats keys case-insensitively", () => {
    const deduper = new NotificationDeduper({
      windowSeconds: 10,
      now: () => 1000,
    });
    expect(deduper.shouldSend("Teams", "Hi", "Msg")).toBe(true);
    expect(deduper.shouldSend("TEAMS", "hi", "MSG")).toBe(false);
  });

  it("makeKey is stable", () => {
    expect(NotificationDeduper.makeKey("A", "B", "C")).toBe(
      NotificationDeduper.makeKey("a", "b", "c"),
    );
    vi.useRealTimers();
  });
});
