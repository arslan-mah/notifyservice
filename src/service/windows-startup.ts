import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const TASK_NAME_DEFAULT = "NotificationBridge";

function projectRoot(): string {
  // src/service -> ../../ when compiled to dist/service, or from scripts
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/service or src/service
  return path.resolve(here, "../..");
}

export function getNodeExecutable(): string {
  return process.execPath;
}

export function getAgentEntry(): string {
  const root = projectRoot();
  const distEntry = path.join(root, "dist", "index.js");
  return distEntry;
}

export async function installStartupTask(options: {
  taskName?: string;
  workingDirectory?: string;
}): Promise<void> {
  const taskName = options.taskName ?? TASK_NAME_DEFAULT;
  const cwd = options.workingDirectory ?? projectRoot();
  const node = getNodeExecutable();
  const entry = getAgentEntry();

  // Remove existing task if present (ignore errors).
  try {
    await execFileAsync("schtasks", ["/Delete", "/TN", taskName, "/F"]);
  } catch {
    // not present
  }

  // Create logon trigger task that runs only when the user is logged on.
  // /SC ONLOGON + /RL LIMITED keeps it in the interactive user session.
  const tr = `"${node}" "${entry}"`;
  await execFileAsync("schtasks", [
    "/Create",
    "/TN",
    taskName,
    "/TR",
    tr,
    "/SC",
    "ONLOGON",
    "/RL",
    "LIMITED",
    "/F",
  ]);

  // Set working directory via PowerShell (schtasks /TR alone does not set StartIn).
  const ps = `
$task = Get-ScheduledTask -TaskName '${taskName.replace(/'/g, "''")}';
$action = New-ScheduledTaskAction -Execute '${node.replace(/'/g, "''")}' -Argument '"${entry.replace(/'/g, "''")}"' -WorkingDirectory '${cwd.replace(/'/g, "''")}';
Set-ScheduledTask -TaskName '${taskName.replace(/'/g, "''")}' -Action $action -Trigger $task.Triggers -Settings $task.Settings -Principal $task.Principal | Out-Null
`;
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    ps,
  ]);
}

export async function uninstallStartupTask(options: {
  taskName?: string;
}): Promise<void> {
  const taskName = options.taskName ?? TASK_NAME_DEFAULT;
  await execFileAsync("schtasks", ["/Delete", "/TN", taskName, "/F"]);
}
