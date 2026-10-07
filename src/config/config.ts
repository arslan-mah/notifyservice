import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import type { NotificationPriority } from "../notification/notification.types.js";

loadDotenv();

const prioritySchema = z.enum(["min", "low", "default", "high", "max"]);

function csvList(value: string | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const envSchema = z.object({
  NTFY_SERVER: z.string().url().default("https://ntfy.sh"),
  NTFY_TOPIC: z.string().min(1, "NTFY_TOPIC is required"),
  NTFY_TOKEN: z.string().optional().default(""),
  NTFY_PRIORITY: prioritySchema.default("high"),
  NTFY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  NTFY_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
  NTFY_RETRY_BASE_MS: z.coerce.number().int().positive().default(1_000),
  NTFY_RETRY_MAX_MS: z.coerce.number().int().positive().default(30_000),

  NOTIFICATION_ALLOWLIST: z.string().optional().default(""),
  NOTIFICATION_BLOCKLIST: z.string().optional().default(""),
  TITLE_BLOCK_KEYWORDS: z.string().optional().default(""),
  MESSAGE_BLOCK_KEYWORDS: z.string().optional().default(""),
  TITLE_ALLOW_KEYWORDS: z.string().optional().default(""),
  NOTIFICATION_DEDUP_SECONDS: z.coerce.number().int().positive().default(10),

  QUEUE_ENABLED: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false" && v !== "0"),
  QUEUE_MAX_SIZE: z.coerce.number().int().positive().default(500),
  QUEUE_MAX_AGE_HOURS: z.coerce.number().positive().default(24),
  QUEUE_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  QUEUE_PATH: z.string().optional().default("./data/queue.jsonl"),

  LISTENER_POLL_MS: z.coerce.number().int().positive().default(1_000),
  LISTENER_PATH: z.string().optional().default(""),
  SIMULATE: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") {
        // `npm run dev` defaults to simulated notifications.
        if (process.env.npm_lifecycle_event === "dev") return true;
        return false;
      }
      return v.toLowerCase() === "true" || v === "1";
    }),

  HEARTBEAT_ENABLED: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v.toLowerCase() === "true" || v === "1"),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  HEARTBEAT_MODE: z.enum(["log", "ntfy"]).default("log"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_DIR: z.string().optional().default("./logs"),

  SERVICE_TASK_NAME: z.string().optional().default("NotificationBridge"),
});

export type AppConfig = {
  ntfy: {
    server: string;
    topic: string;
    token: string;
    priority: NotificationPriority;
    timeoutMs: number;
    maxRetries: number;
    retryBaseMs: number;
    retryMaxMs: number;
  };
  filter: {
    allowlist: string[];
    blocklist: string[];
    titleBlockKeywords: string[];
    messageBlockKeywords: string[];
    titleAllowKeywords: string[];
  };
  dedupSeconds: number;
  queue: {
    enabled: boolean;
    maxSize: number;
    maxAgeHours: number;
    flushIntervalMs: number;
    path: string;
  };
  listener: {
    pollMs: number;
    path: string;
  };
  simulate: boolean;
  heartbeat: {
    enabled: boolean;
    intervalMs: number;
    mode: "log" | "ntfy";
  };
  log: {
    level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    dir: string;
  };
  serviceTaskName: string;
};

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }

  const e = parsed.data;
  const server = e.NTFY_SERVER.replace(/\/+$/, "");

  return {
    ntfy: {
      server,
      topic: e.NTFY_TOPIC,
      token: e.NTFY_TOKEN ?? "",
      priority: e.NTFY_PRIORITY,
      timeoutMs: e.NTFY_TIMEOUT_MS,
      maxRetries: e.NTFY_MAX_RETRIES,
      retryBaseMs: e.NTFY_RETRY_BASE_MS,
      retryMaxMs: e.NTFY_RETRY_MAX_MS,
    },
    filter: {
      allowlist: csvList(e.NOTIFICATION_ALLOWLIST),
      blocklist: csvList(e.NOTIFICATION_BLOCKLIST),
      titleBlockKeywords: csvList(e.TITLE_BLOCK_KEYWORDS),
      messageBlockKeywords: csvList(e.MESSAGE_BLOCK_KEYWORDS),
      titleAllowKeywords: csvList(e.TITLE_ALLOW_KEYWORDS),
    },
    dedupSeconds: e.NOTIFICATION_DEDUP_SECONDS,
    queue: {
      enabled: e.QUEUE_ENABLED,
      maxSize: e.QUEUE_MAX_SIZE,
      maxAgeHours: e.QUEUE_MAX_AGE_HOURS,
      flushIntervalMs: e.QUEUE_FLUSH_INTERVAL_MS,
      path: path.resolve(e.QUEUE_PATH),
    },
    listener: {
      pollMs: e.LISTENER_POLL_MS,
      path: e.LISTENER_PATH,
    },
    simulate: e.SIMULATE,
    heartbeat: {
      enabled: e.HEARTBEAT_ENABLED,
      intervalMs: e.HEARTBEAT_INTERVAL_MS,
      mode: e.HEARTBEAT_MODE,
    },
    log: {
      level: e.LOG_LEVEL,
      dir: path.resolve(e.LOG_DIR),
    },
    serviceTaskName: e.SERVICE_TASK_NAME,
  };
}

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

/** Reset cached config (for tests). */
export function resetConfigCache(): void {
  cached = null;
}
