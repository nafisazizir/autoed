# autoed — local agent automations for macOS

Status: draft v0.1 (2026-09-25)
Owner: Nafis

## 1. Summary

autoed is a local macOS app that manages **automations**: a trigger (schedule, webhook, GitHub event, manual) that starts an **agent run** using a coding-agent CLI already installed and logged in on the machine. It is modelled on Devin's Automations UI (name, triggers, agent definition, notifications, limits, queueing) but runs entirely on an always-on spare Mac.

autoed manages automations and runs. It does **not** render agent sessions. Sessions are viewed in Devin Desktop, which already lists both Devin CLI sessions and Claude Code sessions (verified, see §4).

### Goals

- Zero marginal cost: every run uses an existing subscription (Claude Code, Devin). Never API credits, never cloud sessions.
- Any agent, any model: pick backend + model per automation. Default Devin model is the free SWE-2 family.
- Survives sleep and power-off: missed runs are queued locally and executed when the Mac is back.
- Every run is visible and resumable in Devin Desktop.

### Portability requirement

autoed must run on **any macOS machine**, not just the one it was designed on. Development happens on the work Mac, deployment is on the spare Mac. Therefore:

- No hard-coded user paths. Everything derives from `$HOME`, `os.homedir()`, or config.
- Binaries are discovered at runtime, in order: explicit path in `config.json`, `PATH`, known install locations (Claude: `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, npm global bin; Devin: `~/.local/bin/devin`, `/opt/homebrew/bin/devin`, the bundled binary inside `/Applications/Devin.app`). Missing binaries degrade that backend to "not available" instead of crashing the engine.
- Storage locations are the CLIs' documented defaults resolved from `$HOME` and `$XDG_DATA_HOME`, not literal paths copied from one machine.
- Universal build: Apple Silicon and Intel. Minimum macOS 14 (Sonoma). No dependency on Xcode, Homebrew, or a specific shell.
- `autoed doctor` reports every detected path and version so a fresh machine can be verified before the first run.
- Nothing in the repo references a specific hostname, username, or project folder. Test fixtures use temp directories.

### Non-goals

- Hosting agents in the cloud, Devin cloud sessions, ACU spend.
- Replacing the GitHub Actions self-hosted runner. It is ignored.
- A chat/session UI. Devin Desktop is the session viewer.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Deployment | Always-on spare Mac, not the work Mac |
| Backends | Devin CLI (local), Claude Code CLI. Both via subprocess |
| Cloud | None. Devin API is out of scope |
| Devin model | Default `swe-2-high` (cost tier Free). Model remains selectable, paid tiers shown with a warning |
| Session visibility | Runs must appear in Devin Desktop (verified for both backends) |
| Existing GitHub runner | Not used |

## 3. Assumed defaults (change these if wrong)

These questions were not answered yet. The spec assumes the following so implementation can start.

| Question | Assumed default |
|---|---|
| Where runs execute | Each automation has a fixed working directory. Optional "isolated worktree per run" flag (git worktree under `~/.autoed/worktrees/<run-id>`), off by default |
| Separate macOS user for the agent | Recommended, not required. Spec works either way |
| Catch-up policy after power-off | Schedule triggers: coalesce all missed fires into one run. Event triggers: replay every missed event |
| Triggers in v1 | Schedule, Manual, local Webhook. GitHub polling via `gh` in v1.1. Public webhook exposure via Tailscale Funnel is optional and documented, not built in |
| Remote management | Web UI bound to localhost, reachable from other devices over Tailscale. No auth in v1 beyond network isolation |
| "Done" definition | Process exit. Structured result optional via JSON schema |
| Notifications | macOS notification always. Optional generic webhook (Slack, Telegram, ntfy) per automation |
| Concurrency | Global max 2 running. Per-automation max 1. Extra events queue |
| Session continuity | Fresh session per run. Optional "continue previous session" flag per automation |

## 4. Verified facts about the backends

Verified on the development Mac on 2026-09-25 (macOS 26.6.2, Claude Code 2.1.282, Devin.app installed). Paths below are the CLIs' defaults; autoed resolves them at runtime per §1 Portability, never as literals.

### 4.1 Claude Code

- Headless: `claude -p "<prompt>" --output-format json` prints one JSON result and exits. `--output-format stream-json` streams events.
- Useful flags: `--session-id <uuid>`, `--name <display name>`, `--model`, `--agent`, `--mcp-config`, `--permission-mode`, `--permission-prompts none`, `--json-schema`, `--resume <id>`, `--add-dir`, `--allowedTools <rules...>`, `--disallowedTools <rules...>` (e.g. `"Bash(git log:*)"`), `--chrome` (Claude in Chrome integration), `--max-budget-usd` (irrelevant on subscription).
- Auth: the CLI reads the OAuth login from the macOS login keychain item "Claude Code-credentials". No key handling by autoed. If `ANTHROPIC_API_KEY` is present in the environment, the CLI silently bills API credits instead. autoed must launch with a scrubbed environment.
- Sessions are written to `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- Nested launch: Claude Code refuses to start inside another Claude Code session unless `CLAUDECODE` is unset. autoed unsets it defensively.
- Result JSON includes `session_id`, `is_error`, `stop_reason`, `terminal_reason`, `permission_denials`, `usage`, `total_cost_usd` (notional list price, not a charge on subscription).

### 4.2 Devin CLI

- Devin Desktop bundles the CLI at `<Devin.app>/Contents/Resources/app/extensions/windsurf/devin/bin/devin`. Desktop itself runs it as `devin acp`. A separately installed `devin` on PATH is optional. autoed prefers a configured path, then PATH, then the bundled binary, and locates Devin.app via `mdfind "kMDItemCFBundleIdentifier == 'ai.cognition.devin'"` or the standard `/Applications` and `~/Applications` locations rather than assuming one path.
- Headless: `devin -p "<prompt>"` or `devin --prompt-file <file> -p`. Flags: `--model`, `--permission-mode auto|accept-edits|smart|dangerous`, `--sandbox`, `--resume <id>`, `--continue`, `--export [path]` (ATIF transcript), `--respect-workspace-trust false` (required in print mode for a directory not yet trusted), `--config <path>`.
- Model list: `devin models list --format json` returns families and variants with `cost_tier` (`Free` for swe-2-high, swe-2-medium, swe-2-max) and `cost_summary` for paid ones. autoed populates its model picker from this and caches it.
- Sessions live in `~/.local/share/devin/cli/sessions.db` (SQLite, table `sessions` with id, working_directory, model, agent_mode, title, metadata). Desktop and CLI share this store, so headless runs appear in Desktop automatically. `devin list --format json` lists sessions for the current directory.
- Auth: `devin auth` login, stored by the CLI. autoed handles nothing.
- ACP sub-agents exist (`devin acp --agent-type review|summarizer`) and can be a later "agent type" option.

### 4.3 Devin Desktop visibility (verified)

- Devin CLI runs: visible because of the shared SQLite store.
- Claude Code runs: Desktop's "Claude Agent" connector is `@agentclientprotocol/claude-agent-acp`, which implements `session/list` by calling the Claude Agent SDK's `listSessions` over the on-disk `~/.claude/projects` files, filtered by folder. A test `claude -p --session-id <uuid> --name automation-visibility-test` run in `~/Documents/personal/ziiz` appeared in Desktop's sidebar with that name and full transcript, with no extra work.
- Consequence: autoed only needs to run the CLI in the automation's working directory. "Open in Devin Desktop" is `devin desktop <path>` or the bundled binary with the path argument.

## 5. Architecture

```
┌──────────────────────────── spare Mac (user session, auto-login) ────────────────────────────┐
│                                                                                              │
│  launchd LaunchAgent (KeepAlive)                                                             │
│      └── autoed engine (single long-lived process)                                           │
│              ├── HTTP server  : web UI + JSON API + local webhook receiver (127.0.0.1:4848)  │
│              ├── scheduler    : cron evaluation, catch-up, heartbeat                         │
│              ├── queue        : SQLite-backed run queue, concurrency limits                  │
│              ├── runner       : spawns backend adapters, captures logs, enforces timeouts    │
│              ├── pollers      : GitHub (gh api) [v1.1], file watcher [later]                 │
│              └── notifier     : macOS notification, outbound webhooks                        │
│                                                                                              │
│  ~/.autoed/                                                                                  │
│      autoed.db        SQLite: automations, triggers, runs, events, settings                  │
│      runs/<id>/       stdout.log, stderr.log, result.json, prompt.md                         │
│      worktrees/<id>/  optional isolated checkouts                                            │
│      config.json      port, global limits, notification defaults                             │
│                                                                                              │
│  Devin Desktop (session viewer)   ~/.local/share/devin/cli/sessions.db   ~/.claude/projects  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Why one engine process instead of one launchd job per automation: launchd cannot express "coalesce missed fires", per-automation concurrency, or a shared global cap. launchd's only job is keeping the engine alive and starting it at login.

### 5.1 Tech stack (proposal)

- Runtime: Bun (single binary distribution, built-in SQLite, fast startup). Node 22 + better-sqlite3 is an acceptable substitute.
- Language: TypeScript end to end.
- API/UI server: Hono. UI: React + Vite, served as static files by the engine.
- Cron parsing: `croner` (handles timezones and next-run computation).
- Process control: Bun.spawn / child_process with process groups so a timeout kills the whole tree.
- Packaging: `bun build --compile` producing separate `darwin-arm64` and `darwin-x64` binaries plus a LaunchAgent plist. Optional menu bar wrapper later (Tauri or SwiftUI shell) is out of v1.
- Config: `~/.autoed/config.json` overrides every path and port. Environment variable `AUTOED_HOME` relocates the whole data directory.

## 6. Data model

```sql
automations (
  id TEXT PK, name TEXT, enabled INT, created_at, updated_at,
  backend TEXT,             -- 'claude' | 'devin'
  model TEXT,               -- backend-specific id, e.g. 'swe-2-high', 'opus'
  agent_mode TEXT,          -- devin permission mode or claude permission mode
  agent_profile TEXT,       -- claude --agent name, optional
  instructions TEXT,        -- the prompt template
  working_dir TEXT,
  isolate_worktree INT,     -- 0/1
  continue_session INT,     -- 0/1: pass --resume last successful session
  mcp_config TEXT,          -- JSON, claude --mcp-config; devin uses its own config
  timeout_sec INT,          -- wall clock per run, default 3600
  max_concurrent INT,       -- per-automation, default 1
  rate_limit_count INT, rate_limit_window_sec INT,   -- like Devin's "50 per 1 hour"
  catchup_policy TEXT,      -- 'coalesce' | 'replay' | 'skip'
  notify TEXT,              -- JSON: { macos: true, webhook: {url, template} }
  metadata TEXT,            -- JSON key-value, like Devin's Metadata
  json_schema TEXT, add_dirs TEXT,   -- claude only: --json-schema, --add-dir (JSON string[])
  sandbox INT,              -- devin only: --sandbox
  chrome INT,               -- claude only: --chrome (Claude in Chrome integration)
  allowed_tools TEXT, disallowed_tools TEXT   -- claude only: JSON string[] of permission rules, --allowedTools / --disallowedTools
)

triggers (
  id TEXT PK, automation_id FK, kind TEXT,   -- 'schedule' | 'webhook' | 'github' | 'manual'
  config TEXT,                               -- schedule: {cron, tz}; webhook: {secret}; github: {repo, events[], filter}
  enabled INT
)

events (                                     -- every trigger firing, before it becomes a run
  id TEXT PK, trigger_id FK, automation_id FK, occurred_at, payload TEXT,
  status TEXT                                -- 'queued' | 'coalesced' | 'dispatched' | 'dropped'
)

runs (
  id TEXT PK, automation_id FK, event_id FK,
  status TEXT,        -- see §7
  queued_at, started_at, finished_at,
  backend TEXT, model TEXT, session_id TEXT,  -- session id in the backend's own store
  working_dir TEXT, worktree_path TEXT,
  exit_code INT, error TEXT, result_json TEXT,
  attempt INT, next_attempt_at              -- for rate-limit requeue
)

settings ( key TEXT PK, value TEXT )        -- global_max_concurrent, last_heartbeat_at, port, ...
```

## 7. Run lifecycle

```
queued ──▶ starting ──▶ running ──▶ succeeded
   │           │           │
   │           │           ├──▶ failed        (non-zero exit, is_error, crash)
   │           │           ├──▶ timed_out     (killed after timeout_sec)
   │           │           └──▶ cancelled     (user)
   │           └──▶ failed (spawn error, missing binary, untrusted dir)
   └──▶ rate_limited ──(next_attempt_at)──▶ queued
```

Rate-limit handling: if the backend output matches its usage-limit message (Claude: "usage limit" / reset time in stderr or result; Devin: equivalent), the run moves to `rate_limited` with `next_attempt_at` set to the reported reset time, or +30 min if none is parseable. This is not a failure and does not consume the automation's rate-limit budget.

Dispatch loop (every 5 s and on every state change):

1. Promote `rate_limited` runs whose `next_attempt_at` has passed back to `queued`.
2. While `running < global_max_concurrent`: pick the oldest `queued` run whose automation has `running < max_concurrent` and whose rolling-window count is under its rate limit. Start it.

## 8. Scheduler and catch-up

- The engine writes `last_heartbeat_at` every 60 s.
- Each schedule trigger stores `next_fire_at`. The scheduler fires it when `now >= next_fire_at`, records an event, advances `next_fire_at`.
- **Sleep**: macOS suspends the process. On resume the loop sees `now` past several `next_fire_at` values. This is the same path as power-off below, so no special case.
- **Power-off / crash**: on startup, for each enabled schedule trigger, compute all fire times between `last_heartbeat_at` and `now`. Apply the automation's `catchup_policy`:
  - `coalesce` (default): create one event marked "catch-up, N missed fires".
  - `replay`: one event per missed fire.
  - `skip`: none, just advance `next_fire_at`.
- Webhook and GitHub events are durable the moment they are received, so they are never lost while the engine is running. Events that arrive while the Mac is off are lost for local webhooks (the sender gets a connection error) and are recovered for GitHub by the poller, which stores a cursor (last seen event id / updated_at) per trigger.
- Spare-Mac setup (documented in README): `sudo pmset -a sleep 0 disksleep 0 womp 1 autorestart 1`, enable auto-login for the automation user, Energy Saver "Start up automatically after a power failure".

## 9. Backend adapter interface

```ts
interface Backend {
  id: 'claude' | 'devin'
  detect(): Promise<{ ok: boolean; binary: string; version: string; loggedIn: boolean }>
  listModels(): Promise<Array<{ id: string; label: string; free: boolean; note?: string }>>
  buildCommand(run: Run, automation: Automation, prompt: string): { argv: string[]; env: Record<string,string>; cwd: string }
  parseResult(stdout: string, stderr: string, exitCode: number): { ok: boolean; sessionId?: string; error?: string; rateLimited?: { retryAt?: Date }; result?: unknown }
  openInDesktop(run: Run): Promise<void>
}
```

### 9.1 Claude adapter

```
argv: claude -p --output-format json
        --session-id <run.session_id (uuid generated by autoed)>
        --name "<automation.name> #<run.short_id>"
        [--model <model>] [--agent <profile>] [--mcp-config <path>]
        --permission-mode <agent_mode>            # default 'acceptEdits'; 'bypassPermissions' opt-in with warning
        --permission-prompts none
        [--json-schema <schema>] [--resume <last_session_id>]   # resume only when continue_session=1
        [--add-dir ...] [--allowedTools <rule>...] [--disallowedTools <rule>...] [--chrome]
prompt: passed on stdin (avoids argv length limits and shell quoting)
env:    minimal PATH, HOME, USER, LANG, TMPDIR. Explicitly NOT forwarded: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, CLAUDE_CODE_OAUTH_TOKEN, CLAUDECODE, CLAUDE_CODE_ENTRYPOINT
models: fixed list from settings (opus, sonnet, haiku aliases) plus free text; there is no subscription-scoped model listing command
```

Session id is generated by autoed, so the run row can point at the on-disk session before the process finishes.

### 9.2 Devin adapter

```
binary: config.devin.binary, else `devin` on PATH, else bundled binary inside the located Devin.app (§4.2)
argv:   devin -p --prompt-file <run_dir>/prompt.md
          --model <model>                          # default swe-2-high
          --permission-mode <agent_mode>           # default 'accept-edits'; 'dangerous' opt-in with warning
          --respect-workspace-trust false
          --export <run_dir>/transcript.atif.json
          [--sandbox] [--resume <last_session_id>]   # chrome/allowed_tools/disallowed_tools are ignored with a run warning
cwd:    working_dir (or worktree)
models: `devin models list --format json`, cached 24 h; `cost_tier == 'Free'` marked free
session id: read after exit from sessions.db (newest row with matching working_directory and created_at >= run.started_at) or from the export file
```

### 9.3 Prompt template

`instructions` is a template with variables: `{{trigger.kind}}`, `{{event.payload}}` (JSON), `{{event.occurred_at}}`, `{{catchup.missed_count}}`, `{{run.id}}`, `{{automation.name}}`. The rendered prompt is saved to `runs/<id>/prompt.md` for audit.

## 10. Triggers

| Kind | v1 | Config | Notes |
|---|---|---|---|
| Schedule | yes | cron expression, timezone, catch-up policy | 5-field cron plus presets (hourly, daily at HH:MM, weekdays) |
| Manual | yes | none | "Run now" button and `POST /api/automations/:id/run` |
| Webhook | yes | per-trigger secret | `POST /hooks/<trigger-id>` with `X-Autoed-Secret` header or HMAC. Payload becomes `event.payload`. Public exposure via Tailscale Funnel or Cloudflare Tunnel is the user's choice, documented |
| GitHub | v1.1 | repo, event types (issue, issue_comment, pull_request, pr_review, push, check_run), optional filters | Poller uses `gh api` every N minutes with a cursor, so no inbound port is required. Requires `gh auth login` on the Mac |
| File watcher | later | path, glob | fs events, debounced |

## 11. Notifications

- macOS: `osascript -e 'display notification ...'` or `terminal-notifier` if installed. Click opens the run in the web UI.
- Webhook: POST JSON `{ automation, run, status, session_id, summary, desktop_url }` to a URL, with a simple template for Slack/Telegram/ntfy bodies.
- Triggered on: succeeded, failed, timed_out, rate_limited (once per run), and "catch-up executed".

## 12. Web UI

Mirrors Devin's create-automation form so it feels familiar.

- **Automations list**: name, backend/model chip, next run, last run status, enabled toggle, Run now.
- **Create/Edit**: Name. Triggers (add trigger menu: Schedule, Webhook, GitHub, Manual). Agent definition: Backend, Model (free tier badge), Agent mode, Instructions, Working directory, MCPs (Claude only), Advanced: isolate worktree, continue session, timeout, concurrency, rate limit, catch-up policy, metadata, notifications.
- **Runs**: filterable table. Run detail: status timeline, rendered prompt, stdout/stderr tail with live streaming, result JSON, "Open in Devin Desktop", "Retry", "Cancel".
- **Backends page**: detection status per backend (binary, version, logged in), model cache refresh, environment check (warns if `ANTHROPIC_API_KEY` is set anywhere in the login environment).
- **Queue page**: queued and rate-limited runs, global and per-automation counters.

## 13. Security

- Bind to `127.0.0.1` only. Remote access is via Tailscale, which provides device identity. No public bind in v1.
- Webhook endpoints require a per-trigger secret. Reject bodies over 1 MB.
- Run environment is allow-listed, never inherited. Secrets an automation needs are stored in the macOS keychain via `security` and injected by name, not stored in `autoed.db`.
- Agent permission modes that skip prompts (`bypassPermissions`, `dangerous`) require an explicit toggle with a warning, exactly like Devin's advanced section.
- Recommended: run the engine under a dedicated macOS user on the spare Mac so an unattended agent cannot reach personal files. Both CLIs are logged in once under that user.
- Logs may contain repo contents. `~/.autoed` is `0700`.

## 14. Installation (spare Mac)

1. Install Devin.app and Claude Code. Log in to both interactively once. Optionally `gh auth login`.
2. `autoed install` copies the binary to `~/.autoed/bin`, writes `~/Library/LaunchAgents/ai.autoed.engine.plist` (RunAtLoad, KeepAlive, StandardOut/ErrorPath under `~/.autoed/logs`), and loads it.
3. `autoed doctor` checks: macOS version and CPU architecture, binaries found (with resolved paths and versions), logins valid, no API key in environment, pmset sleep settings, auto-login enabled, port free, Devin.app located.
4. Open `http://localhost:4848` (or over Tailscale).

## 15. Milestones

1. **M1 Engine core**: SQLite schema, scheduler with catch-up, queue and concurrency, Claude and Devin adapters, CLI (`autoed run <automation>`), run logs on disk. No UI. Verify runs show in Devin Desktop. Acceptance: clone the repo on the spare Mac, run `autoed doctor`, run one automation, with zero edits to the code.
2. **M2 Web UI**: automations CRUD, runs view with live logs, backends page, macOS notifications.
3. **M3 Triggers**: webhook receiver with secrets, GitHub poller, outbound webhook notifications.
4. **M4 Hardening**: rate-limit detection and requeue, worktree isolation, keychain secrets, `autoed doctor`, LaunchAgent installer, docs for Tailscale exposure.

## 16. Open questions

1. Confirm the assumed defaults in §3, especially catch-up policy and concurrency caps.
2. Dedicated macOS user on the spare Mac: yes or no?
3. Which notification channel do you actually read: macOS, Slack, Telegram, ntfy, email?
4. Which GitHub repos and events matter first, to shape the poller filters?
5. Should Devin ACP agent types (review, summarizer) be exposed as "agent type" options in v1?
6. Exact wording of the Claude and Devin usage-limit messages, to make rate-limit detection reliable. Capture the next time either limit is hit.
7. Devin CLI billing on your Cognition plan: confirm local SWE-2 runs stay free at automation volumes.
