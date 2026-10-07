import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/**
 * Runs the Windows listener for a short window and prints every toast
 * app name / title so you can fix NOTIFICATION_ALLOWLIST.
 *
 * Usage:
 *   npm run discover-apps
 *   npm run discover-apps -- 90
 *
 * While it runs, trigger Teams / Zoho notifications on Windows.
 */

function resolveListenerPath(): string {
  const candidates = [
    path.resolve("win-listener/publish/WinListener.exe"),
    path.resolve(
      "win-listener/bin/Release/net10.0-windows10.0.19041.0/win-x64/WinListener.exe",
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("WinListener.exe not found. Run npm run build:listener first.");
}

async function main(): Promise<void> {
  const seconds = Number(process.argv[2] ?? "60");
  const exe = resolveListenerPath();
  const seen = new Map<string, { title: string; message: string; count: number }>();

  console.log(`Listening for Windows toasts for ${seconds} seconds...`);
  console.log("Now trigger notifications from Microsoft Teams and Zoho on this PC.");
  console.log("Press Ctrl+C to stop early.\n");

  const child = spawn(exe, ["--poll-ms=500"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (!child.stdout) {
    throw new Error("Failed to open listener stdout");
  }

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        source?: string;
        title?: string;
        message?: string;
        id?: number;
      };
      if (parsed.type === "status" || parsed.type === "error") {
        console.log(`[listener] ${trimmed}`);
        return;
      }
      if (!parsed.source) return;

      const key = parsed.source;
      const prev = seen.get(key);
      if (prev) {
        prev.count += 1;
        prev.title = parsed.title ?? prev.title;
        prev.message = parsed.message ?? prev.message;
      } else {
        seen.set(key, {
          title: parsed.title ?? "",
          message: parsed.message ?? "",
          count: 1,
        });
      }

      console.log("---- toast captured ----");
      console.log(`  source : ${parsed.source}`);
      console.log(`  title  : ${parsed.title ?? ""}`);
      console.log(`  message: ${(parsed.message ?? "").slice(0, 120)}`);
      console.log(`  => add this to NOTIFICATION_ALLOWLIST in .env if missing\n`);
    } catch {
      console.log(`[raw] ${trimmed}`);
    }
  });

  child.stderr?.on("data", (buf: Buffer) => {
    const text = buf.toString("utf8").trim();
    if (text) console.error(`[stderr] ${text}`);
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), seconds * 1000);
    process.on("SIGINT", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  child.kill();
  console.log("\n========== SUMMARY ==========");
  if (seen.size === 0) {
    console.log("No Windows toast notifications were captured.");
    console.log("That usually means:");
    console.log("  1) Teams/Zoho are not sending Windows banners (enable in app settings)");
    console.log("  2) Windows Focus Assist / Do Not Disturb is on");
    console.log("  3) App notifications are disabled in Windows Settings → System → Notifications");
  } else {
    for (const [source, info] of seen) {
      console.log(`- "${source}" (x${info.count}) example title: ${info.title}`);
    }
    console.log("\nSuggested .env line:");
    console.log(
      `NOTIFICATION_ALLOWLIST=${["Google Chrome", "Microsoft Edge", ...seen.keys()].join(",")}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
