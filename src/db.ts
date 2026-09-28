import { Database } from "bun:sqlite";
import type { Automation, AutomationInput, Event, Run, RunStatus, Trigger, TriggerKind } from "./types.ts";
import { newId, newSecret, nowIso } from "./ids.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  backend TEXT NOT NULL, model TEXT, agent_mode TEXT, agent_profile TEXT,
  instructions TEXT NOT NULL DEFAULT '', working_dir TEXT NOT NULL,
  isolate_worktree INTEGER NOT NULL DEFAULT 0, continue_session INTEGER NOT NULL DEFAULT 0,
  mcp_config TEXT, timeout_sec INTEGER NOT NULL DEFAULT 3600, max_concurrent INTEGER NOT NULL DEFAULT 1,
  rate_limit_count INTEGER, rate_limit_window_sec INTEGER,
  catchup_policy TEXT NOT NULL DEFAULT 'coalesce', notify TEXT, metadata TEXT,
  json_schema TEXT, add_dirs TEXT, sandbox INTEGER NOT NULL DEFAULT 0,
  chrome INTEGER NOT NULL DEFAULT 0, allowed_tools TEXT, disallowed_tools TEXT
);
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
  next_fire_at TEXT, cursor TEXT
);
CREATE INDEX IF NOT EXISTS idx_triggers_automation ON triggers(automation_id);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, trigger_id TEXT, automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL, payload TEXT, status TEXT NOT NULL, kind TEXT NOT NULL, missed_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_automation ON events(automation_id, occurred_at);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  event_id TEXT, status TEXT NOT NULL,
  queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  backend TEXT NOT NULL, model TEXT, session_id TEXT,
  working_dir TEXT NOT NULL, worktree_path TEXT,
  exit_code INTEGER, error TEXT, result_json TEXT,
  attempt INTEGER NOT NULL DEFAULT 1, next_attempt_at TEXT, pid INTEGER, summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_automation ON runs(automation_id, queued_at);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
`;
/** Additive column migrations for databases created before a column existed: [table, column, definition]. */
const MIGRATIONS: Array<[string, string, string]> = [
  ["automations", "chrome", "INTEGER NOT NULL DEFAULT 0"],
  ["automations", "allowed_tools", "TEXT"],
  ["automations", "disallowed_tools", "TEXT"],
];

export class Db {
  readonly sqlite: Database;
  constructor(path: string) {
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.sqlite.exec(SCHEMA);
    this.migrate();
  }
  private migrate() {
    for (const [table, col, def] of MIGRATIONS) {
      const cols = this.sqlite.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
      if (!cols.some((c) => c.name === col)) this.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  }
  close() { this.sqlite.close(); }

  // ---- settings ----
  getSetting(key: string): string | null {
    const row = this.sqlite.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ?? null;
  }
  setSetting(key: string, value: string) {
    this.sqlite.query("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
  }

  // ---- automations ----
  listAutomations(): Automation[] {
    return this.sqlite.query<Automation, []>("SELECT * FROM automations ORDER BY name COLLATE NOCASE").all();
  }
  getAutomation(id: string): Automation | null {
    return this.sqlite.query<Automation, [string]>("SELECT * FROM automations WHERE id = ?").get(id) ?? null;
  }
  findAutomation(nameOrId: string): Automation | null {
    return this.getAutomation(nameOrId)
      ?? this.sqlite.query<Automation, [string]>("SELECT * FROM automations WHERE name = ? COLLATE NOCASE").get(nameOrId)
      ?? null;
  }
  createAutomation(input: AutomationInput): Automation {
    const id = newId();
    const now = nowIso();
    const cols = this.automationColumns(input);
    this.sqlite.query(`INSERT INTO automations (id, created_at, updated_at, ${Object.keys(cols).join(",")})
      VALUES (?, ?, ?, ${Object.keys(cols).map(() => "?").join(",")})`).run(id, now, now, ...Object.values(cols));
    this.replaceTriggers(id, input.triggers ?? []);
    return this.getAutomation(id)!;
  }
  updateAutomation(id: string, input: Partial<AutomationInput>): Automation {
    const existing = this.getAutomation(id);
    if (!existing) throw new Error(`automation ${id} not found`);
    const cols = this.automationColumns(input, true);
    if (Object.keys(cols).length) {
      this.sqlite.query(`UPDATE automations SET updated_at = ?, ${Object.keys(cols).map((k) => `${k} = ?`).join(",")} WHERE id = ?`)
        .run(nowIso(), ...Object.values(cols), id);
    }
    if (input.triggers) this.replaceTriggers(id, input.triggers);
    return this.getAutomation(id)!;
  }
  deleteAutomation(id: string) { this.sqlite.query("DELETE FROM automations WHERE id = ?").run(id); }

  private automationColumns(input: Partial<AutomationInput>, partial = false): Record<string, string | number | null> {
    const c: Record<string, string | number | null> = {};
    const has = (k: keyof AutomationInput) => !partial || input[k] !== undefined;
    if (has("name")) c.name = req(input.name, "name");
    if (has("enabled")) c.enabled = input.enabled === false ? 0 : 1;
    if (has("backend")) {
      const b = req(input.backend, "backend");
      if (b !== "claude" && b !== "devin") throw new Error(`backend must be 'claude' or 'devin'`);
      c.backend = b;
    }
    if (has("model")) c.model = input.model || null;
    if (has("agent_mode")) c.agent_mode = input.agent_mode || null;
    if (has("agent_profile")) c.agent_profile = input.agent_profile || null;
    if (has("instructions")) c.instructions = input.instructions ?? "";
    if (has("working_dir")) c.working_dir = req(input.working_dir, "working_dir");
    if (has("isolate_worktree")) c.isolate_worktree = input.isolate_worktree ? 1 : 0;
    if (has("continue_session")) c.continue_session = input.continue_session ? 1 : 0;
    if (has("mcp_config")) c.mcp_config = jsonOrNull(input.mcp_config);
    if (has("timeout_sec")) c.timeout_sec = clampInt(input.timeout_sec, 3600, 10, 60 * 60 * 24 * 7);
    if (has("max_concurrent")) c.max_concurrent = clampInt(input.max_concurrent, 1, 1, 50);
    if (has("rate_limit_count")) c.rate_limit_count = input.rate_limit_count ? clampInt(input.rate_limit_count, 0, 1, 100000) : null;
    if (has("rate_limit_window_sec")) c.rate_limit_window_sec = input.rate_limit_window_sec ? clampInt(input.rate_limit_window_sec, 0, 1, 60 * 60 * 24 * 30) : null;
    if (has("catchup_policy")) {
      const p = input.catchup_policy ?? "coalesce";
      if (!["coalesce", "replay", "skip"].includes(p)) throw new Error("catchup_policy must be coalesce|replay|skip");
      c.catchup_policy = p;
    }
    if (has("notify")) c.notify = jsonOrNull(input.notify);
    if (has("metadata")) c.metadata = jsonOrNull(input.metadata);
    if (has("json_schema")) c.json_schema = jsonOrNull(input.json_schema);
    if (has("add_dirs")) c.add_dirs = input.add_dirs?.length ? JSON.stringify(input.add_dirs) : null;
    if (has("sandbox")) c.sandbox = input.sandbox ? 1 : 0;
    if (has("chrome")) c.chrome = input.chrome ? 1 : 0;
    if (has("allowed_tools")) c.allowed_tools = toolList(input.allowed_tools, "allowed_tools");
    if (has("disallowed_tools")) c.disallowed_tools = toolList(input.disallowed_tools, "disallowed_tools");
    return c;
  }

  // ---- triggers ----
  listTriggers(automationId?: string): Trigger[] {
    return automationId
      ? this.sqlite.query<Trigger, [string]>("SELECT * FROM triggers WHERE automation_id = ? ORDER BY rowid").all(automationId)
      : this.sqlite.query<Trigger, []>("SELECT * FROM triggers ORDER BY rowid").all();
  }
  getTrigger(id: string): Trigger | null {
    return this.sqlite.query<Trigger, [string]>("SELECT * FROM triggers WHERE id = ?").get(id) ?? null;
  }
  replaceTriggers(automationId: string, triggers: NonNullable<AutomationInput["triggers"]>) {
    const existing = new Map(this.listTriggers(automationId).map((t) => [t.id, t]));
    const keep = new Set<string>();
    const tx = this.sqlite.transaction(() => {
      for (const t of triggers) {
        const kind = t.kind as TriggerKind;
        if (!["schedule", "webhook", "github", "manual"].includes(kind)) throw new Error(`unknown trigger kind ${kind}`);
        const cfg = { ...(t.config ?? {}) } as Record<string, unknown>;
        if (kind === "webhook" && !cfg.secret) cfg.secret = newSecret();
        if (kind === "schedule" && typeof cfg.cron !== "string") throw new Error("schedule trigger needs config.cron");
        const enabled = t.enabled === false ? 0 : 1;
        const prev = t.id ? existing.get(t.id) : undefined;
        if (prev) {
          const cfgChanged = prev.config !== JSON.stringify(cfg);
          this.sqlite.query("UPDATE triggers SET kind=?, config=?, enabled=?, next_fire_at = CASE WHEN ? THEN NULL ELSE next_fire_at END WHERE id=?")
            .run(kind, JSON.stringify(cfg), enabled, cfgChanged ? 1 : 0, prev.id);
          keep.add(prev.id);
        } else {
          const id = t.id ?? newId();
          this.sqlite.query("INSERT INTO triggers (id, automation_id, kind, config, enabled) VALUES (?,?,?,?,?)")
            .run(id, automationId, kind, JSON.stringify(cfg), enabled);
          keep.add(id);
        }
      }
      for (const id of existing.keys()) if (!keep.has(id)) this.sqlite.query("DELETE FROM triggers WHERE id = ?").run(id);
    });
    tx();
  }
  setTriggerNextFire(id: string, at: string | null) { this.sqlite.query("UPDATE triggers SET next_fire_at = ? WHERE id = ?").run(at, id); }
  setTriggerCursor(id: string, cursor: string | null) { this.sqlite.query("UPDATE triggers SET cursor = ? WHERE id = ?").run(cursor, id); }

  // ---- events ----
  createEvent(e: { trigger_id: string | null; automation_id: string; kind: TriggerKind; payload?: unknown; status?: Event["status"]; missed_count?: number; occurred_at?: string }): Event {
    const id = newId();
    this.sqlite.query("INSERT INTO events (id, trigger_id, automation_id, occurred_at, payload, status, kind, missed_count) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, e.trigger_id, e.automation_id, e.occurred_at ?? nowIso(), e.payload === undefined ? null : JSON.stringify(e.payload), e.status ?? "queued", e.kind, e.missed_count ?? 0);
    return this.getEvent(id)!;
  }
  getEvent(id: string): Event | null { return this.sqlite.query<Event, [string]>("SELECT * FROM events WHERE id = ?").get(id) ?? null; }
  setEventStatus(id: string, status: Event["status"]) { this.sqlite.query("UPDATE events SET status = ? WHERE id = ?").run(status, id); }
  listEvents(automationId?: string, limit = 100): Event[] {
    return automationId
      ? this.sqlite.query<Event, [string, number]>("SELECT * FROM events WHERE automation_id = ? ORDER BY occurred_at DESC LIMIT ?").all(automationId, limit)
      : this.sqlite.query<Event, [number]>("SELECT * FROM events ORDER BY occurred_at DESC LIMIT ?").all(limit);
  }

  // ---- runs ----
  createRun(r: { automation_id: string; event_id: string | null; backend: Run["backend"]; model: string | null; working_dir: string; session_id?: string | null }): Run {
    const id = newId();
    this.sqlite.query("INSERT INTO runs (id, automation_id, event_id, status, queued_at, backend, model, working_dir, session_id) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, r.automation_id, r.event_id, "queued", nowIso(), r.backend, r.model, r.working_dir, r.session_id ?? null);
    return this.getRun(id)!;
  }
  getRun(id: string): Run | null { return this.sqlite.query<Run, [string]>("SELECT * FROM runs WHERE id = ?").get(id) ?? null; }
  updateRun(id: string, patch: Partial<Run>) {
    const keys = Object.keys(patch).filter((k) => k !== "id");
    if (!keys.length) return;
    this.sqlite.query(`UPDATE runs SET ${keys.map((k) => `${k} = ?`).join(",")} WHERE id = ?`)
      .run(...keys.map((k) => (patch as any)[k] ?? null), id);
  }
  listRuns(opts: { automation_id?: string; status?: RunStatus | RunStatus[]; limit?: number; offset?: number } = {}): Run[] {
    const where: string[] = []; const args: (string | number)[] = [];
    if (opts.automation_id) { where.push("automation_id = ?"); args.push(opts.automation_id); }
    if (opts.status) {
      const s = Array.isArray(opts.status) ? opts.status : [opts.status];
      where.push(`status IN (${s.map(() => "?").join(",")})`); args.push(...s);
    }
    const sql = `SELECT * FROM runs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY queued_at DESC LIMIT ? OFFSET ?`;
    return this.sqlite.query<Run, any[]>(sql).all(...args, opts.limit ?? 100, opts.offset ?? 0);
  }
  countRuns(status: RunStatus[], automationId?: string): number {
    const sql = `SELECT COUNT(*) AS n FROM runs WHERE status IN (${status.map(() => "?").join(",")})${automationId ? " AND automation_id = ?" : ""}`;
    const args: string[] = [...status]; if (automationId) args.push(automationId);
    return this.sqlite.query<{ n: number }, string[]>(sql).get(...args)?.n ?? 0;
  }
  countRunsStartedSince(automationId: string, sinceIso: string): number {
    return this.sqlite.query<{ n: number }, [string, string]>("SELECT COUNT(*) AS n FROM runs WHERE automation_id = ? AND started_at >= ?").get(automationId, sinceIso)?.n ?? 0;
  }
  oldestQueuedRuns(): Run[] {
    return this.sqlite.query<Run, []>("SELECT * FROM runs WHERE status = 'queued' ORDER BY queued_at ASC").all();
  }
  lastSuccessfulSession(automationId: string): string | null {
    return this.sqlite.query<{ session_id: string }, [string]>("SELECT session_id FROM runs WHERE automation_id = ? AND status = 'succeeded' AND session_id IS NOT NULL ORDER BY finished_at DESC LIMIT 1").get(automationId)?.session_id ?? null;
  }
  lastRun(automationId: string): Run | null {
    return this.sqlite.query<Run, [string]>("SELECT * FROM runs WHERE automation_id = ? ORDER BY queued_at DESC LIMIT 1").get(automationId) ?? null;
  }
  /** Runs left in starting/running from a previous engine process cannot be recovered. */
  failOrphanedRuns(reason: string): number {
    const r = this.sqlite.query("UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE status IN ('starting','running')").run(reason, nowIso());
    return r.changes;
  }
}

function req<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) throw new Error(`${name} is required`);
  return v;
}
function toolList(v: unknown, name: string): string | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.some((t) => typeof t !== "string")) throw new Error(`${name} must be an array of strings`);
  const tools = v.map((t: string) => t.trim()).filter(Boolean);
  return tools.length ? JSON.stringify(tools) : null;
}
function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") { JSON.parse(v); return v; }
  return JSON.stringify(v);
}
function clampInt(v: unknown, dflt: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : dflt;
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
