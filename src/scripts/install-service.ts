import { getConfig } from "../config/config.js";
import {
  getAgentEntry,
  installStartupTask,
} from "../service/windows-startup.js";
import fs from "node:fs";

async function main(): Promise<void> {
  const config = getConfig();
  const entry = getAgentEntry();

  if (!fs.existsSync(entry)) {
    console.error(
      `Built entry not found: ${entry}\nRun \`npm run build\` first.`,
    );
    process.exit(1);
  }

  console.log(`Installing startup task "${config.serviceTaskName}"...`);
  console.log(
    "Note: This registers a Task Scheduler ONLOGON task in your user session.",
  );
  console.log(
    "It is NOT a Session 0 Windows Service (required so toast notifications are visible).",
  );

  await installStartupTask({
    taskName: config.serviceTaskName,
    workingDirectory: process.cwd(),
  });

  console.log("Installed successfully.");
  console.log(
    `The agent will start automatically at next logon as task: ${config.serviceTaskName}`,
  );
  console.log(
    "You can also start it now with: npm start  (after ensuring .env is configured)",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(
    "Tip: run this from an elevated PowerShell/CMD if Task Scheduler denies permission.",
  );
  process.exit(1);
});
