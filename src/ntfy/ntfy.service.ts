import type { AppConfig } from "../config/config.js";
import type { AppLogger } from "../logging/logger.js";
import type {
  NotificationEvent,
  NotificationPriority,
} from "../notification/notification.types.js";

const PRIORITY_MAP: Record<NotificationPriority, string> = {
  min: "min",
  low: "low",
  default: "default",
  high: "high",
  max: "max",
};

export interface NtfyPublishResult {
  ok: boolean;
  status?: number;
  error?: string;
  retried: number;
}

export interface NtfyPayloadHeaders {
  Title: string;
  Priority: string;
  Tags?: string;
  Click?: string;
  Authorization?: string;
}

export function buildNtfyHeaders(
  event: NotificationEvent,
  token?: string,
): NtfyPayloadHeaders {
  const headers: NtfyPayloadHeaders = {
    Title: event.title || event.source,
    Priority: PRIORITY_MAP[event.priority] ?? "default",
  };

  if (event.tags && event.tags.length > 0) {
    headers.Tags = event.tags.join(",");
  }

  if (event.url) {
    headers.Click = event.url;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NtfyService {
  constructor(
    private readonly config: AppConfig["ntfy"],
    private readonly logger: AppLogger,
  ) {}

  get topicUrl(): string {
    return `${this.config.server}/${this.config.topic}`;
  }

  async publish(
    event: NotificationEvent,
    options?: { maxRetries?: number },
  ): Promise<NtfyPublishResult> {
    const maxRetries = options?.maxRetries ?? this.config.maxRetries;
    let attempt = 0;
    let lastError = "";

    while (attempt <= maxRetries) {
      try {
        const result = await this.publishOnce(event);
        if (result.ok) {
          if (attempt > 0) {
            this.logger.info(
              { source: event.source, attempt },
              "ntfy publish succeeded after retry",
            );
          }
          return { ok: true, status: result.status, retried: attempt };
        }

        lastError = result.error ?? `HTTP ${result.status}`;
        const retryable = !result.status || result.status >= 500 || result.status === 429;

        if (!retryable || attempt >= maxRetries) {
          this.logger.error(
            { source: event.source, status: result.status, error: lastError, attempt },
            "ntfy failure",
          );
          return {
            ok: false,
            status: result.status,
            error: lastError,
            retried: attempt,
          };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt >= maxRetries) {
          this.logger.error(
            { source: event.source, error: lastError, attempt },
            "ntfy failure",
          );
          return { ok: false, error: lastError, retried: attempt };
        }
      }

      const delay = Math.min(
        this.config.retryBaseMs * 2 ** attempt,
        this.config.retryMaxMs,
      );
      this.logger.warn(
        { source: event.source, attempt, delayMs: delay, error: lastError },
        "ntfy retry",
      );
      await sleep(delay);
      attempt += 1;
    }

    return { ok: false, error: lastError || "unknown", retried: attempt };
  }

  async publishOnce(
    event: NotificationEvent,
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    const headers = buildNtfyHeaders(event, this.config.token || undefined);
    const requestHeaders: Record<string, string> = {
      Title: headers.Title,
      Priority: headers.Priority,
    };
    if (headers.Tags) requestHeaders.Tags = headers.Tags;
    if (headers.Click) requestHeaders.Click = headers.Click;
    if (headers.Authorization) {
      requestHeaders.Authorization = headers.Authorization;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.topicUrl, {
        method: "POST",
        headers: requestHeaders,
        body: event.message || event.title || event.source,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          ok: false,
          status: response.status,
          error: text.slice(0, 200) || response.statusText,
        };
      }

      return { ok: true, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  }
}
