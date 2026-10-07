import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { AppConfig } from "../../config/config.js";
import type { AppLogger } from "../../logging/logger.js";
import { normalizeWindowsNotification } from "../notification.normalize.js";
import type { NotificationEvent, WindowsRawNotification } from "../notification.types.js";
import type { NotificationSource } from "./notification.source.js";

function resolveListenerPath(configured: string): string {
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const candidates = [
    path.resolve("win-listener/publish/WinListener.exe"),
    path.resolve(
      "win-listener/bin/Release/net10.0-windows10.0.19041.0/win-x64/WinListener.exe",
    ),
    path.resolve("win-listener/bin/Release/net10.0-windows10.0.19041.0/WinListener.exe"),
    path.resolve(
      "win-listener/bin/Release/net8.0-windows10.0.19041.0/win-x64/WinListener.exe",
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Windows listener executable not found. Run `npm run build:listener` first, or set LISTENER_PATH.",
  );
}

export class WindowsNotificationSource implements NotificationSource {
  readonly name = "windows";
  private child: ChildProcess | null = null;
  private stopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async start(
    onEvent: (event: NotificationEvent) => void | Promise<void>,
  ): Promise<void> {
    const exe = resolveListenerPath(this.config.listener.path);
    this.logger.info({ exe, pollMs: this.config.listener.pollMs }, "starting Windows listener");

    const child = spawn(exe, [`--poll-ms=${this.config.listener.pollMs}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    if (!child.stdout || !child.stderr) {
      throw new Error("Windows listener stdout/stderr pipes were not created");
    }

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      void this.handleLine(line, onEvent);
    });

    child.stderr.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8").trim();
      if (text) {
        this.logger.warn({ stderr: text }, "Windows API helper stderr");
      }
    });

    child.on("error", (err) => {
      this.logger.error(
        { error: err.message },
        "Windows API error: failed to start listener",
      );
    });

    child.on("exit", (code, signal) => {
      this.logger.warn({ code, signal }, "Windows listener exited");
      this.child = null;
      if (!this.stopping) {
        this.logger.info("restarting Windows listener in 5s");
        setTimeout(() => {
          if (!this.stopping) {
            void this.start(onEvent).catch((err) => {
              this.logger.error(
                { error: err instanceof Error ? err.message : String(err) },
                "Windows listener restart failed",
              );
            });
          }
        }, 5_000);
      }
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.child && !this.child.killed) {
      this.child.kill();
      this.child = null;
    }
  }

  private async handleLine(
    line: string,
    onEvent: (event: NotificationEvent) => void | Promise<void>,
  ): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed) as
        | WindowsRawNotification
        | { type: string; message?: string; status?: string };

      if ("type" in parsed && parsed.type === "status") {
        this.logger.info({ status: parsed }, "Windows listener status");
        return;
      }

      if ("type" in parsed && parsed.type === "error") {
        this.logger.error(
          { message: parsed.message },
          "Windows API error",
        );
        return;
      }

      const raw = parsed as WindowsRawNotification;
      if (typeof raw.id !== "number" || !raw.source) {
        this.logger.warn({ line: trimmed }, "ignored malformed listener line");
        return;
      }

      const event = normalizeWindowsNotification(raw, this.config.ntfy.priority);
      this.logger.info(
        { source: event.source, title: event.title },
        "notification received",
      );
      await onEvent(event);
    } catch (err) {
      this.logger.warn(
        {
          line: trimmed.slice(0, 200),
          error: err instanceof Error ? err.message : String(err),
        },
        "failed to parse listener output",
      );
    }
  }
}
