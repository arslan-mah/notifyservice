import fs from "node:fs";
import path from "node:path";
import pino, { type Logger } from "pino";

const SECRET_KEYS = ["token", "password", "authorization", "secret", "ntfy_token"];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEYS.some((s) => key.toLowerCase().includes(s))) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redact(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createLogger(options: {
  level: string;
  logDir: string;
}): Logger {
  fs.mkdirSync(options.logDir, { recursive: true });
  const logFile = path.join(options.logDir, "notification-bridge.log");

  const destination = pino.destination({
    dest: logFile,
    sync: false,
    mkdir: true,
  });

  // Simple size-based rotation check on startup / periodically via external tooling.
  // Keep a secondary rolling file via rename when file exceeds ~10 MB.
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > 10 * 1024 * 1024) {
      const rotated = path.join(
        options.logDir,
        `notification-bridge.${Date.now()}.log`,
      );
      fs.renameSync(logFile, rotated);
      pruneOldLogs(options.logDir, 10);
    }
  } catch {
    // file may not exist yet
  }

  return pino(
    {
      level: options.level,
      base: { app: "notification-bridge" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        log(object) {
          return redact(object as Record<string, unknown>);
        },
      },
    },
    pino.multistream([
      { stream: process.stdout },
      { stream: destination },
    ]),
  );
}

function pruneOldLogs(logDir: string, keep: number): void {
  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("notification-bridge.") && f.endsWith(".log"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(logDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(logDir, file.name));
    } catch {
      // ignore
    }
  }
}

export type AppLogger = Logger;
