# Windows Notification Bridge

Lightweight Windows agent that forwards selected toast notifications from your laptop to your Android phone via [ntfy](https://ntfy.sh).

```
Windows toast → Local agent (Node.js + C# helper) → HTTPS → ntfy → Android
```

No custom backend, VPS, database server, or Electron UI.

## Architecture

| Layer | Technology | Role |
| --- | --- | --- |
| Business logic | Node.js + TypeScript | Config, filter, dedup, queue, ntfy client, startup |
| Windows listener | Small C# helper | `UserNotificationListener` poll → JSONL on stdout |
| Transport | ntfy HTTPS API | Push to phone |
| Phone | ntfy Android app | Receive pushes |

### Windows API

Uses the official WinRT API [`UserNotificationListener`](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener).

- Node.js cannot reliably bind this API across Node versions, and the live `NotificationChanged` event often requires MSIX package identity.
- v1 therefore uses a minimal C# helper that **polls** `GetNotificationsAsync` (~1s) and emits new toasts as JSON lines.
- Auto-start uses a **Task Scheduler ONLOGON task** in your interactive user session — **not** a classic Session 0 Windows Service (services cannot see user toasts).

## Prerequisites

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+
- [.NET SDK](https://dotnet.microsoft.com/) 10+ (for building the listener; targets `net10.0-windows`)
- [ntfy Android app](https://play.google.com/store/apps/details?id=io.heckel.ntfy) (or another ntfy client)

## Quick start

### 1. Configure ntfy

1. Install the ntfy app on your phone.
2. Create a **long, unguessable** topic name (treat it like a password).
3. Subscribe to that topic in the app.
4. Optional but recommended: use a private ntfy server + access token, or ntfy.sh access tokens.

### 2. Install dependencies and configure

```powershell
cd D:\pp\notifyurgent
npm install
copy .env.example .env
```

Edit `.env`:

```env
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=your-long-private-topic-here
NTFY_TOKEN=
NOTIFICATION_ALLOWLIST=Microsoft Teams,Zoho,Google Chrome,Microsoft Edge,Outlook
```

### 3. Build

```powershell
npm run build
```

This compiles TypeScript and publishes `win-listener/publish/WinListener.exe`.

### 4. Grant Windows notification access

1. Open **Settings → Privacy & security → Notifications**.
2. Enable access for apps that can read notifications / user notification listener access (wording varies by Windows build).
3. When the helper first runs, allow access if Windows prompts you.

### 5. Send a test push (no Teams required)

```powershell
npm run test-notification
```

Your phone should show **Notification Bridge Test**.

### 6. Development / simulated mode

```powershell
# Uses fake Teams/Chrome events; does not need the C# listener
$env:SIMULATE="true"
npm run dev
```

### 7. Live Windows notifications

```powershell
# Ensure SIMULATE=false in .env
npm start
```

Trigger a Teams / browser toast and confirm it arrives on your phone (subject to allowlist/filters).

## Install auto-start (logon task)

Build first, then:

```powershell
npm run install-service
```

This registers Task Scheduler task `NotificationBridge` (configurable via `SERVICE_TASK_NAME`) to run:

```text
node <project>\dist\index.js
```

at user logon, in your interactive session, with the project as the working directory (so `.env` is found).

Uninstall:

```powershell
npm run uninstall-service
```

> If registration fails, run the install command from an elevated PowerShell window.

## Filtering

- **Empty `NOTIFICATION_ALLOWLIST` forwards nothing** (safe default).
- Comma-separated app display names (partial match, case-insensitive).
- Optional blocklists and keyword filters:

```env
NOTIFICATION_ALLOWLIST=Microsoft Teams,Google Chrome
TITLE_BLOCK_KEYWORDS=update available,is ready
MESSAGE_BLOCK_KEYWORDS=
```

Example: ignore “Teams update available”, still send “Ahmed sent you a message”.

## Deduplication

Identical `source|title|message` within `NOTIFICATION_DEDUP_SECONDS` (default 10) is sent only once.

## Offline queue

If ntfy is unreachable, events go to a local JSONL file (`QUEUE_PATH`):

- Max size: `QUEUE_MAX_SIZE` (default 500)
- Max age: `QUEUE_MAX_AGE_HOURS` (default 24)
- Flushed automatically when connectivity returns

## Heartbeat

Default: **disabled**. When enabled with `HEARTBEAT_MODE=log`, the agent only writes a local log line (does not spam your phone). Set `HEARTBEAT_MODE=ntfy` only if you explicitly want phone heartbeats.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile TS + publish C# listener |
| `npm run dev` | Run with `tsx` (set `SIMULATE=true` for fake events) |
| `npm start` | Run compiled agent |
| `npm test` | Unit tests |
| `npm run test-notification` | One-shot ntfy ping |
| `npm run install-service` | Register logon Task Scheduler task |
| `npm run uninstall-service` | Remove logon task |

## Project structure

```text
src/                 TypeScript agent
win-listener/        C# UserNotificationListener helper
tests/               Unit tests
.env.example         Configuration template
```

## Future integrations

Sources implement `NotificationSource` and emit the same `NotificationEvent` model. Planned adapters (not in v1): Microsoft Graph (Teams), Zoho webhooks, CMS webhooks, Gmail/Graph email.

## Troubleshooting

### Test notification does not arrive

- Verify `NTFY_TOPIC` matches the phone subscription exactly.
- Confirm internet connectivity and `NTFY_SERVER` URL (HTTPS).
- If using a private server / protected topic, set `NTFY_TOKEN`.
- Check `logs/notification-bridge.log`.

### Windows listener exits with access denied

- Enable notification listener access in Windows Settings (Privacy → Notifications).
- Re-run `npm start` and accept any prompt.
- Confirm you are not running under Session 0 / LocalSystem.

### Teams / Zoho / Gmail not arriving

Your logs show **only Google Chrome** toasts reach Windows. Important facts:

- **Zoho Mail (web)** already worked once as `Google Chrome` + title `Zoho Mail`.
- **Gmail (web)** also appears as `Google Chrome` — enable Chrome site notifications for `mail.google.com`.
- **Teams desktop** must create a **Windows banner/Action Center toast**. If Teams only shows an in-app badge, this bridge cannot see it.

Checklist:

1. Windows **Settings → System → Notifications**
   - Notifications = On
   - Microsoft Teams = On (banners + show in notification center)
   - Google Chrome = On
2. **Teams** → Settings → Notifications → turn on banners / Windows notifications. Minimize Teams, then have someone message you (Teams often suppresses toasts while focused).
3. **Gmail in Chrome**: padlock icon → Site settings → Notifications → Allow.
4. **Zoho**: if web mail, same as Chrome. If a Zoho desktop app, run `npm run discover-apps` while a Zoho toast appears.
5. Diagnose:

```powershell
npm run dump-notifications   # what is currently in Action Center?
npm run discover-apps 90     # watch live for 90s while triggering Teams/Gmail/Zoho
```

If Teams banners flash on screen but `discover-apps` never prints Teams, Windows is not exposing those toasts to the listener API (app setting / Focus Assist / Teams version limitation).

### Listener executable not found

```powershell
npm run build:listener
```

Or set `LISTENER_PATH` to the full path of `WinListener.exe`.

### High CPU

- Increase `LISTENER_POLL_MS` (e.g. `2000`).
- Ensure only one agent instance is running.

### Queue growing

- Check ntfy connectivity / auth.
- Lower `QUEUE_MAX_SIZE` / `QUEUE_MAX_AGE_HOURS` if desired.
- Inspect `data/queue.jsonl`.

### Secrets in logs

Tokens and passwords are redacted by the logger. Never commit `.env`.

## Security notes

- Use an unguessable topic name.
- Prefer HTTPS (required by default URLs).
- Prefer token auth when the server supports it.
- The agent only makes **outbound** HTTPS requests; it does not open a public HTTP server.

## License

Private / personal use.
