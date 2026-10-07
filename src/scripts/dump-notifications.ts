import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

/** Lists whatever is currently in the Windows Action Center. */

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
  const exe = resolveListenerPath();
  console.log("Dumping current Windows Action Center toasts...\n");

  const child = spawn(exe, ["--dump"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  if (!child.stdout) throw new Error("No stdout");

  const rows: Array<{ source: string; title: string; message: string; appId?: string }> = [];
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
        appId?: string;
      };
      if (parsed.type) {
        console.log(`[listener] ${trimmed}`);
        return;
      }
      if (parsed.source) {
        rows.push({
          source: parsed.source,
          title: parsed.title ?? "",
          message: parsed.message ?? "",
          appId: parsed.appId,
        });
      }
    } catch {
      console.log(trimmed);
    }
  });

  child.stderr?.on("data", (b: Buffer) => {
    const t = b.toString("utf8").trim();
    if (t) console.error(t);
  });

  await new Promise<void>((resolve) => child.on("exit", () => resolve()));

  if (rows.length === 0) {
    console.log("Action Center is empty (no toast notifications currently stored).");
    console.log("If Teams/Gmail banners flash but nothing appears here, Windows is not");
    console.log("keeping them as Action Center toasts — enable banners + Action Center");
    console.log("for that app in Windows Settings → System → Notifications.");
    return;
  }

  for (const row of rows) {
    console.log("----");
    console.log(`source : ${row.source}`);
    console.log(`title  : ${row.title}`);
    console.log(`message: ${row.message.slice(0, 160)}`);
    if (row.appId) console.log(`appId  : ${row.appId}`);
  }
  console.log("\nUnique sources:");
  console.log([...new Set(rows.map((r) => r.source))].map((s) => `- ${s}`).join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
