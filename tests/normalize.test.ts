import { describe, expect, it } from "vitest";
import {
  normalizeSimulatedEvent,
  normalizeWindowsNotification,
} from "../src/notification/notification.normalize.js";

describe("notification normalization", () => {
  it("normalizes a Windows raw notification", () => {
    const event = normalizeWindowsNotification(
      {
        id: 42,
        source: "Microsoft Teams",
        title: "Ahmed",
        message: "Hello there",
        timestamp: "2026-09-30T10:00:00.000Z",
      },
      "high",
    );

    expect(event).toMatchObject({
      source: "Microsoft Teams",
      title: "Microsoft Teams: Ahmed",
      message: "Hello there",
      priority: "high",
      timestamp: "2026-09-30T10:00:00.000Z",
    });
    expect(event.tags?.[0]).toBe("microsoft_teams");
  });

  it("uses browser toast title for Chrome web apps like Zoho/Gmail", () => {
    const event = normalizeWindowsNotification(
      {
        id: 7,
        source: "Google Chrome",
        title: "Zoho Mail",
        message: "New message from boss",
        timestamp: "2026-09-30T10:00:00.000Z",
      },
      "high",
    );
    expect(event.title).toBe("Zoho Mail");
    expect(event.message).toBe("New message from boss");
  });

  it("falls back when fields are missing", () => {
    const event = normalizeWindowsNotification(
      {
        id: 1,
        source: "",
        title: "",
        message: "",
        timestamp: "not-a-date",
      },
      "default",
    );

    expect(event.source).toBe("Unknown App");
    expect(event.title).toBe("Unknown App");
    expect(event.message).toBe("Unknown App");
    expect(Date.parse(event.timestamp)).not.toBeNaN();
  });

  it("normalizes simulated events", () => {
    const event = normalizeSimulatedEvent(
      {
        source: "Microsoft Teams",
        title: "Microsoft Teams",
        message: "Ahmed sent you a test message",
        priority: "high",
      },
      "default",
    );
    expect(event.priority).toBe("high");
    expect(event.message).toContain("Ahmed");
  });
});
