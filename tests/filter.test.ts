import { describe, expect, it } from "vitest";
import { filterNotification } from "../src/notification/notification.filter.js";
import type { NotificationEvent } from "../src/notification/notification.types.js";

function event(partial: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    source: "Microsoft Teams",
    title: "Microsoft Teams",
    message: "Ahmed sent you a message",
    priority: "high",
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

describe("notification filtering", () => {
  it("blocks everything when allowlist is empty", () => {
    const decision = filterNotification(event(), {
      allowlist: [],
      blocklist: [],
      titleBlockKeywords: [],
      messageBlockKeywords: [],
      titleAllowKeywords: [],
    });
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.reason).toContain("empty allowlist");
  });

  it("allows apps on the allowlist", () => {
    const decision = filterNotification(event(), {
      allowlist: ["Microsoft Teams", "Chrome"],
      blocklist: [],
      titleBlockKeywords: [],
      messageBlockKeywords: [],
      titleAllowKeywords: [],
    });
    expect(decision.allow).toBe(true);
  });

  it("blocks apps on the blocklist even if allowlisted", () => {
    const decision = filterNotification(event({ source: "Zoho" }), {
      allowlist: ["Zoho"],
      blocklist: ["Zoho"],
      titleBlockKeywords: [],
      messageBlockKeywords: [],
      titleAllowKeywords: [],
    });
    expect(decision.allow).toBe(false);
  });

  it("blocks title keywords such as update available", () => {
    const decision = filterNotification(
      event({ title: "Teams update available", message: "Click to update" }),
      {
        allowlist: ["Microsoft Teams"],
        blocklist: [],
        titleBlockKeywords: ["update available"],
        messageBlockKeywords: [],
        titleAllowKeywords: [],
      },
    );
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.reason).toContain("title block");
  });

  it("requires title allow keywords when configured", () => {
    const decision = filterNotification(event({ title: "Status" }), {
      allowlist: ["Microsoft Teams"],
      blocklist: [],
      titleBlockKeywords: [],
      messageBlockKeywords: [],
      titleAllowKeywords: ["message", "mention"],
    });
    expect(decision.allow).toBe(false);
  });
});
