import { describe, expect, it } from "vitest";
import { buildNtfyHeaders } from "../src/ntfy/ntfy.service.js";
import type { NotificationEvent } from "../src/notification/notification.types.js";

const baseEvent: NotificationEvent = {
  source: "Microsoft Teams",
  title: "Microsoft Teams",
  message: "Ahmed sent you a message",
  priority: "high",
  timestamp: "2026-09-30T10:00:00.000Z",
  tags: ["microsoft_teams", "bell"],
  url: "https://teams.microsoft.com",
};

describe("ntfy payload generation", () => {
  it("builds headers without auth when token is missing", () => {
    const headers = buildNtfyHeaders(baseEvent);
    expect(headers.Title).toBe("Microsoft Teams");
    expect(headers.Priority).toBe("high");
    expect(headers.Tags).toBe("microsoft_teams,bell");
    expect(headers.Click).toBe("https://teams.microsoft.com");
    expect(headers.Authorization).toBeUndefined();
  });

  it("includes Bearer token when configured", () => {
    const headers = buildNtfyHeaders(baseEvent, "secret-token");
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("falls back title to source", () => {
    const headers = buildNtfyHeaders({ ...baseEvent, title: "" });
    expect(headers.Title).toBe("Microsoft Teams");
  });
});
