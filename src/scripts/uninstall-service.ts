import { getConfig } from "../config/config.js";
import { uninstallStartupTask } from "../service/windows-startup.js";

async function main(): Promise<void> {
  const config = getConfig();
  console.log(`Uninstalling startup task "${config.serviceTaskName}"...`);
  try {
    await uninstallStartupTask({ taskName: config.serviceTaskName });
    console.log("Uninstalled successfully.");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error("Task may already be removed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
