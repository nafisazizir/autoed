# autoed

Local agent automations for macOS. A trigger (schedule, webhook, GitHub event, manual) starts an agent run using a coding-agent CLI that is already installed and logged in on the machine: **Claude Code** or **Devin CLI**. Runs use your existing subscriptions, never API credits or cloud sessions, and every run shows up in Devin Desktop.

Modelled on Devin's Automations UI (name, triggers, agent definition, notifications, limits, queueing), but it runs entirely on an always-on spare Mac.

See `SPEC.md` for the full design. This README covers using it.

## What it does

- **Triggers**: cron schedule (with timezone and presets), manual "Run now", authenticated local webhook, GitHub polling via `gh api` (no inbound port).
- **Backends**: Claude Code (`claude -p`) and Devin CLI (`devin -p`). Binaries are discovered at runtime; a missing one just shows as "not available".
- **Survives sleep and power-off**: the engine heartbeats every minute. On start it computes every fire it missed and applies the automation's catch-up policy (coalesce into one run, replay each, or skip).
- **Queue**: global concurrency cap (default 2), per-automation cap (default 1), optional rolling-window rate limit, and automatic requeue when a backend reports a subscription usage limit.
- **Visibility**: runs write `prompt.md`, `stdout.log`, `stderr.log`, `result.json` under `~/.autoed/runs/<id>/`. Sessions land in the CLIs' own stores, so Devin Desktop lists them. "Open in Devin Desktop" from the run page.
- **Web UI** on `http://127.0.0.1:4848`: automations, runs with live logs, backends, queue.
- **Notifications**: macOS notification, plus optional webhook (generic JSON, Slack, Telegram, ntfy) per automation or globally.
- **Security**: binds to localhost only. Agents get an allow-listed environment; `ANTHROPIC_API_KEY`, `CLAUDECODE` and friends are never forwarded, so Claude Code cannot silently bill API credits. Permission modes that skip prompts are flagged in the UI.

## Requirements

- macOS 14 or newer, Apple Silicon or Intel.
- [Bun](https://bun.sh) 1.1+ to run from source (the compiled binary has no dependencies).
- Claude Code and/or Devin CLI / Devin Desktop, each logged in once interactively.
- Optional: `gh` (GitHub triggers), `git` (worktree isolation), `terminal-notifier` (nicer notifications).

## Quick start (from source)

```sh
bun install
bun run doctor          # check binaries, logins, environment, power settings
bun run start           # builds the UI and starts the engine on http://127.0.0.1:4848
```

Create an automation in the UI, or from JSON:

```sh
bun src/index.ts add examples/nightly-dependency-review.json
bun src/index.ts run "Nightly dependency review" --wait
```

## Install on the spare Mac

1. Install Devin.app and/or Claude Code. Log in to each once. Optionally `gh auth login`.
2. Build a binary on any Mac and copy it over, or build on the spare Mac:
   ```sh
   bun install && bun run build      # dist/autoed-darwin-arm64 and dist/autoed-darwin-x64
   ```
3. On the spare Mac:
   ```sh
   ./autoed-darwin-arm64 doctor      # everything should be ✓ (pmset and auto-login are advisory)
   ./autoed-darwin-arm64 install     # copies itself to ~/.autoed/bin and loads a KeepAlive LaunchAgent
   ```
4. Keep the Mac awake and self-healing:
   ```sh
   sudo pmset -a sleep 0 disksleep 0 womp 1 autorestart 1
   ```
   Enable automatic login for the user in System Settings › Users & Groups, and "Start up automatically after a power failure" in Energy settings. The LaunchAgent starts the engine at login and restarts it if it dies.
5. Open `http://localhost:4848`. From another device, reach it over Tailscale (`http://<spare-mac-tailnet-name>:4848` works if you set `"host": "0.0.0.0"` in config, or keep it on localhost and use `tailscale serve`).

`autoed uninstall` removes the LaunchAgent. Engine logs are in `~/.autoed/logs/`.

Recommended: run under a dedicated macOS user on the spare Mac so an unattended agent cannot reach your personal files. Log both CLIs in under that user.

## CLI

```
autoed serve                     run the engine in the foreground
autoed doctor                    diagnostics with resolved paths and versions
autoed install | uninstall       LaunchAgent management
autoed status                    engine status
autoed list                      automations
autoed add <file.json>           create or update an automation from JSON (matched by name)
autoed run <name|id> [--wait]    trigger a run (through the engine, or in-process if it is not running)
autoed runs [name|id]            recent runs
autoed logs <run-id> [--stderr]  print a run's log
autoed cancel <run-id>
autoed open <run-id>             open the run's directory in Devin Desktop
```

## Configuration

Everything lives under `~/.autoed/` (override the whole directory with `AUTOED_HOME`). `~/.autoed/config.json` is optional:

```json
{
  "port": 4848,
  "host": "127.0.0.1",
  "globalMaxConcurrent": 2,
  "notifications": { "macos": true, "webhook": { "url": "https://ntfy.sh/topic", "template": "ntfy" } },
  "claude": { "binary": null, "models": ["opus", "sonnet", "haiku"], "defaultModel": "sonnet" },
  "devin": { "binary": null, "defaultModel": "swe-2-high" },
  "logRetentionDays": 30
}
```

Binary lookup order: `config` → `PATH` → `~/.local/bin` → `/opt/homebrew/bin` → `/usr/local/bin` → npm global bin (Claude) → bundled CLI inside Devin.app (Devin, located via `/Applications`, `~/Applications`, or Spotlight).

## Automation JSON

```json
{
  "name": "Issue triage",
  "backend": "claude",                 // "claude" | "devin"
  "model": "sonnet",                   // backend model id; Devin free tier is swe-2-high / -medium / -max
  "agent_mode": "acceptEdits",         // claude: acceptEdits|auto|dontAsk|plan|bypassPermissions  devin: accept-edits|auto|smart|dangerous
  "instructions": "…prompt template…",
  "working_dir": "~/Projects/app",
  "isolate_worktree": false,           // git worktree per run under ~/.autoed/worktrees
  "continue_session": false,           // --resume the last successful session
  "timeout_sec": 3600,
  "max_concurrent": 1,
  "rate_limit_count": 50, "rate_limit_window_sec": 3600,
  "catchup_policy": "coalesce",        // coalesce | replay | skip
  "notify": { "macos": true, "webhook": { "url": "…", "template": "slack" } },
  "metadata": { "team": "platform" },
  "mcp_config": { "mcpServers": {} },  // claude only
  "json_schema": null,                 // claude only, structured output
  "add_dirs": [],                      // claude only
  "sandbox": false,                    // devin only
  "triggers": [
    { "kind": "schedule", "config": { "cron": "0 9 * * 1-5", "tz": "Australia/Sydney" } },
    { "kind": "webhook" },
    { "kind": "github", "config": { "repo": "owner/name", "events": ["issue", "pull_request"], "intervalSec": 300, "filter": "needs-triage" } }
  ]
}
```

Prompt template variables: `{{trigger.kind}}`, `{{event.payload}}`, `{{event.occurred_at}}`, `{{catchup.missed_count}}`, `{{run.id}}`, `{{run.short_id}}`, `{{automation.name}}`, `{{automation.metadata}}`, `{{now}}`. The rendered prompt is saved to `runs/<id>/prompt.md`.

### Webhooks

Each webhook trigger gets an id and a secret (shown on the automation page). Send:

```sh
curl -X POST http://127.0.0.1:4848/hooks/<trigger-id> \
  -H "X-Autoed-Secret: <secret>" -H "content-type: application/json" \
  -d '{"anything": "you like"}'
```

or sign the body: `X-Autoed-Signature: sha256=<hmac-sha256 hex>` (GitHub's `X-Hub-Signature-256` is accepted too, so a GitHub webhook can point straight at a hook if you expose it). Bodies over 1 MB are rejected. The body and selected headers become `{{event.payload}}`.

To receive webhooks from the internet, expose the port yourself, for example `tailscale funnel 4848` or a Cloudflare Tunnel. Nothing in autoed listens publicly.

### Rate-limit handling

If a backend's output matches a usage-limit message, the run becomes `rate_limited` and is requeued at the reported reset time (or 30 minutes later). The matched line is stored in the run's error so the patterns in `src/backends/ratelimit.ts` can be tightened as real messages are observed.

## Development

```sh
bun run dev          # engine with file watching (UI is built once; rerun build:ui after UI edits, or use `vite ui` for HMR against the running engine)
bun test
bun run typecheck
bun run build        # compiled binaries in dist/
```

Layout: `src/engine.ts` (dispatch and run lifecycle), `src/scheduler.ts` (cron and catch-up), `src/runner.ts` (process groups, logs, timeouts), `src/backends/` (Claude and Devin adapters), `src/server/` (Hono API and embedded UI), `src/github.ts` (poller), `ui/` (React, built to one HTML file that is embedded in the binary).

The UI uses the [ziiz](https://ziiz.vercel.app) design system: Tailwind v4 with the `@nafisazizir/ziiz` theme, and components from the `@ziiz` shadcn registry in `ui/src/components/ui/` (add more with `bunx shadcn@latest add @ziiz/<name>`). Stick to ziiz vocabulary: ramp colors (`bg-gray-100`, `border-gray-alpha-400`), type roles (`text-label-14`, `text-heading-32`), and materials only on floating surfaces. Press D in the UI to toggle dark mode.
