import type {
  FilterDecision,
  NotificationEvent,
} from "./notification.types.js";

export interface FilterConfig {
  allowlist: string[];
  blocklist: string[];
  titleBlockKeywords: string[];
  messageBlockKeywords: string[];
  titleAllowKeywords: string[];
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function matchesApp(name: string, patterns: string[]): boolean {
  return patterns.some(
    (p) =>
      name.toLowerCase() === p.toLowerCase() ||
      includesIgnoreCase(name, p),
  );
}

export function filterNotification(
  event: NotificationEvent,
  config: FilterConfig,
): FilterDecision {
  const source = event.source ?? "";
  const title = event.title ?? "";
  const message = event.message ?? "";

  if (config.blocklist.length > 0 && matchesApp(source, config.blocklist)) {
    return { allow: false, reason: `blocked app: ${source}` };
  }

  // Safe default: empty allowlist forwards nothing.
  if (config.allowlist.length === 0) {
    return { allow: false, reason: "empty allowlist" };
  }

  if (!matchesApp(source, config.allowlist)) {
    return { allow: false, reason: `app not in allowlist: ${source}` };
  }

  for (const kw of config.titleBlockKeywords) {
    if (includesIgnoreCase(title, kw)) {
      return { allow: false, reason: `title block keyword: ${kw}` };
    }
  }

  for (const kw of config.messageBlockKeywords) {
    if (includesIgnoreCase(message, kw)) {
      return { allow: false, reason: `message block keyword: ${kw}` };
    }
  }

  if (config.titleAllowKeywords.length > 0) {
    const matched = config.titleAllowKeywords.some((kw) =>
      includesIgnoreCase(title, kw),
    );
    if (!matched) {
      return { allow: false, reason: "title missing allow keyword" };
    }
  }

  return { allow: true };
}
