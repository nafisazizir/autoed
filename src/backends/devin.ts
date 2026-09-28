import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import type { Automation, Run } from "../types.ts";
import type { Backend, BuildContext, BuiltCommand, Detection, ModelInfo, ParsedResult } from "./types.ts";
import { findDevinApp, isExecutable, runCapture, scrubbedEnv, whichSync } from "./discover.ts";
import { detectRateLimit } from "./ratelimit.ts";

const BUNDLED_REL = "Contents/Resources/app/extensions/windsurf/devin/bin/devin";

export function devinDataDir(): string {
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "devin", "cli");
}

export class DevinBackend implements Backend {
  readonly id = "devin" as const;
  readonly label = "Devin CLI";
  readonly agentModes = [
    { id: "accept-edits", label: "Accept edits (auto-approve workspace edits)" },
    { id: "auto", label: "Auto (read-only tools only)" },
    { id: "smart", label: "Smart (fast model judges safe actions)" },
    { id: "dangerous", label: "Dangerous (auto-approve all tools)", dangerous: true },
  ];
  readonly defaultAgentMode = "accept-edits";
  private binaryCache: string | null | undefined;
  private modelCache: { at: number; models: ModelInfo[] } | null = null;

  constructor(private cfg: Config, private cacheDir: string) {}
  get defaultModel() { return this.cfg.devin.defaultModel ?? "swe-2-high"; }

  async binary(): Promise<string | null> {
    if (this.binaryCache !== undefined) return this.binaryCache;
    const candidates = [this.cfg.devin.binary, whichSync("devin"), join(homedir(), ".local", "bin", "devin"), "/opt/homebrew/bin/devin", "/usr/local/bin/devin"];
    for (const c of candidates) if (isExecutable(c)) return (this.binaryCache = c);
    const app = await findDevinApp();
    if (app && isExecutable(join(app, BUNDLED_REL))) return (this.binaryCache = join(app, BUNDLED_REL));
    return (this.binaryCache = null);
  }
  invalidate() { this.binaryCache = undefined; this.modelCache = null; }

  async detect(): Promise<Detection> {
    const bin = await this.binary();
    if (!bin) return { ok: false, binary: null, version: null, loggedIn: null, note: "devin binary not found (config.devin.binary, PATH, ~/.local/bin, Devin.app bundle)" };
    const v = await runCapture([bin, "--version"], { timeoutMs: 15000 });
    const version = v.stdout.trim().split("\n")[0] || null;
    let loggedIn: boolean | null = null;
    try {
      const s = await runCapture([bin, "auth", "status"], { timeoutMs: 20000 });
      const txt = `${s.stdout}\n${s.stderr}`;
      loggedIn = s.code === 0 && !/not (logged|signed) in|unauthenticated|no credentials/i.test(txt);
    } catch { loggedIn = null; }
    return { ok: v.code === 0, binary: bin, version, loggedIn, note: loggedIn === false ? "run `devin auth login`" : undefined };
  }

  async listModels(force = false): Promise<ModelInfo[]> {
    const ttl = (this.cfg.modelCacheHours ?? 24) * 3600e3;
    if (!force && this.modelCache && Date.now() - this.modelCache.at < ttl) return this.modelCache.models;
    const cacheFile = join(this.cacheDir, "devin-models.json");
    if (!force && existsSync(cacheFile)) {
      try {
        const c = JSON.parse(await Bun.file(cacheFile).text());
        if (Date.now() - c.at < ttl) { this.modelCache = c; return c.models; }
      } catch {}
    }
    const bin = await this.binary();
    const fallback: ModelInfo[] = [
      { id: "swe-2-high", label: "SWE-2 High", free: true }, { id: "swe-2-medium", label: "SWE-2 Medium", free: true }, { id: "swe-2-max", label: "SWE-2 Max", free: true },
    ];
    if (!bin) return fallback;
    const r = await runCapture([bin, "models", "list", "--format", "json"], { timeoutMs: 30000 });
    let models: ModelInfo[] = [];
    try {
      const j = JSON.parse(r.stdout);
      for (const fam of j.families ?? []) for (const v of fam.variants ?? []) {
        const free = v.cost_tier === "Free";
        models.push({ id: v.model_uid, label: v.label ?? v.model_uid, free, note: free ? "Free" : (v.cost_tier ? `${v.cost_tier}${v.cost_summary ? ": " + v.cost_summary : ""}` : v.cost_summary) });
      }
    } catch { models = fallback; }
    if (!models.length) models = fallback;
    models.sort((a, b) => Number(b.free) - Number(a.free));
    this.modelCache = { at: Date.now(), models };
    try { await Bun.write(cacheFile, JSON.stringify(this.modelCache)); } catch {}
    return models;
  }

  newSessionId() { return null; }

  async buildCommand(run: Run, a: Automation, _prompt: string, ctx: BuildContext): Promise<BuiltCommand> {
    const bin = await this.binary();
    if (!bin) throw new Error("devin binary not found");
    const argv = [bin, "-p", "--prompt-file", ctx.promptPath];
    argv.push("--model", run.model ?? a.model ?? this.defaultModel);
    const mode = a.agent_mode || this.defaultAgentMode;
    argv.push("--permission-mode", mode);
    if (mode === "dangerous") ctx.warn("permission mode dangerous: the agent can run any command");
    argv.push("--respect-workspace-trust", "false");
    argv.push("--export", join(ctx.runDir, "transcript.atif.json"));
    if (a.sandbox) argv.push("--sandbox");
    for (const [k, on] of [["chrome", !!a.chrome], ["allowed_tools", !!a.allowed_tools], ["disallowed_tools", !!a.disallowed_tools]] as const) if (on) ctx.warn(`${k} is Claude-only and is ignored for devin`);
    if (ctx.resumeSessionId) argv.push("--resume", ctx.resumeSessionId);
    return { argv, env: scrubbedEnv(), cwd: run.worktree_path ?? run.working_dir };
  }

  async parseResult(run: Run, stdout: string, stderr: string, exitCode: number | null, ctx: BuildContext): Promise<ParsedResult> {
    // stdout is agent output: only scan it when the run failed, so a successful run mentioning "429" is not requeued.
    const rl = detectRateLimit("devin", exitCode === 0 ? stderr : `${stderr}\n${stdout.slice(-4000)}`);
    const sessionId = this.findSessionId(run) ?? (await this.sessionIdFromExport(join(ctx.runDir, "transcript.atif.json")));
    if (rl) return { ok: false, sessionId, rateLimited: rl, error: rl.message };
    const ok = exitCode === 0;
    const tail = stdout.trim().split("\n").slice(-40).join("\n");
    return { ok, sessionId, error: ok ? undefined : (stderr.trim().split("\n").slice(-5).join("\n") || `devin exited ${exitCode}`), summary: tail.slice(-2000) || undefined, result: undefined };
  }

  /** Newest session row for the run's cwd created at/after the run started. Devin stores created_at in Unix seconds. */
  findSessionId(run: Run): string | undefined {
    const dbPath = join(devinDataDir(), "sessions.db");
    if (!existsSync(dbPath) || !run.started_at) return undefined;
    try {
      const db = new Database(dbPath, { readonly: true });
      try {
        const since = Math.floor(new Date(run.started_at).getTime() / 1000) - 5;
        const cwd = run.worktree_path ?? run.working_dir;
        const row = db.query<{ id: string }, [string, string, number]>(
          "SELECT id FROM sessions WHERE (working_directory = ? OR working_directory = ?) AND created_at >= ? ORDER BY created_at DESC LIMIT 1"
        ).get(cwd, cwd.replace(/\/$/, ""), since);
        return row?.id;
      } finally { db.close(); }
    } catch { return undefined; }
  }

  private async sessionIdFromExport(path: string): Promise<string | undefined> {
    if (!existsSync(path)) return undefined;
    try {
      const j = JSON.parse(await Bun.file(path).text());
      return j.session_id ?? j.sessionId ?? j.id ?? j.metadata?.session_id ?? undefined;
    } catch { return undefined; }
  }

  async openInDesktop(run: Run) {
    const bin = await this.binary();
    const dir = run.worktree_path ?? run.working_dir;
    if (bin) await runCapture([bin, "desktop", dir], { timeoutMs: 15000 });
    else await runCapture(["open", "-b", "ai.cognition.devin", dir], { timeoutMs: 15000 });
  }
}
