import { EventEmitter } from "node:events";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Backends } from "./backends/index.ts";
import { type Config, type Paths, VERSION } from "./config.ts";
import { Db } from "./db.ts";
import { GithubPoller } from "./github.ts";
import { nowIso } from "./ids.ts";
import { Notifier } from "./notify.ts";
import { startRun, type LiveHandle } from "./runner.ts";
import { Scheduler, type FireRequest } from "./scheduler.ts";
import { renderPrompt } from "./template.ts";
import type { Automation, Event, Run, RunStatus, TriggerKind } from "./types.ts";
import { createWorktree, removeWorktree } from "./worktree.ts";

export interface EngineEvents {
  run: (run: Run) => void;                                   // any run state change
  log: (runId: string, stream: "stdout" | "stderr", line: string) => void;
  automation: (a: Automation | { id: string; deleted: true }) => void;
  engine: (msg: string) => void;
}

export class Engine extends EventEmitter {
  readonly db: Db;
  readonly backends: Backends;
  readonly scheduler: Scheduler;
  readonly notifier: Notifier;
  readonly github: GithubPoller;
  private live = new Map<string, LiveHandle>();
  private liveAutomation = new Map<string, string>(); // runId -> automationId
  private timers: ReturnType<typeof setInterval>[] = [];
  private dispatching = false;
  private stopped = false;
  readonly startedAt = nowIso();

  constructor(readonly cfg: Config, readonly paths: Paths) {
    super();
    this.db = new Db(paths.db);
    this.backends = new Backends(cfg, paths.cache);
    this.scheduler = new Scheduler(this.db, (m) => this.log(`scheduler: ${m}`));
    this.notifier = new Notifier(cfg, (m) => this.log(`notify: ${m}`));
    this.github = new GithubPoller(this, (m) => this.log(`github: ${m}`));
  }

  log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    this.emit("engine", line);
  }

  get webUrl() { return `http://${this.cfg.host === "0.0.0.0" ? "localhost" : this.cfg.host}:${this.cfg.port}`; }
  get globalMax() { return Number(this.db.getSetting("global_max_concurrent") ?? this.cfg.globalMaxConcurrent); }

  async start() {
    this.log(`autoed ${VERSION} starting, home=${this.paths.home}`);
    const orphaned = this.db.failOrphanedRuns("engine restarted while run was in progress");
    if (orphaned) this.log(`marked ${orphaned} orphaned run(s) as failed`);
    for (const req of this.scheduler.startup()) this.handleFires(req);
    this.scheduler.heartbeat();
    this.timers.push(setInterval(() => this.scheduler.heartbeat(), this.cfg.heartbeatSec * 1000));
    this.timers.push(setInterval(() => this.tick(), Math.min(this.cfg.dispatchIntervalSec, 30) * 1000));
    this.timers.push(setInterval(() => this.pruneRunDirs(), 6 * 3600e3));
    this.github.start();
    this.tick();
  }

  async stop() {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.github.stop();
    for (const [id, h] of this.live) { this.log(`stopping run ${id}`); h.cancel("cancelled"); }
    await Promise.race([new Promise((r) => setTimeout(r, 12000)), (async () => { while (this.live.size) await new Promise((r) => setTimeout(r, 200)); })()]);
    this.db.close();
  }

  private tick() {
    if (this.stopped) return;
    try { for (const req of this.scheduler.tick()) this.handleFires(req); } catch (e) { this.log(`scheduler tick failed: ${(e as Error).message}`); }
    void this.dispatch();
  }

  // ---- events ----

  private handleFires(req: FireRequest) {
    const { trigger, automation, fireTimes } = req;
    const policy = automation.catchup_policy;
    if (fireTimes.length > 1 && policy === "skip") {
      this.log(`${automation.name}: skipped ${fireTimes.length} missed fire(s) (catch-up policy: skip)`);
      this.db.createEvent({ trigger_id: trigger.id, automation_id: automation.id, kind: "schedule", status: "dropped", missed_count: fireTimes.length, payload: { fire_times: fireTimes.map((d) => d.toISOString()) } });
      return;
    }
    if (fireTimes.length > 1 && policy === "coalesce") {
      this.log(`${automation.name}: coalescing ${fireTimes.length} missed fire(s) into one run`);
      this.enqueueEvent(automation, { trigger_id: trigger.id, kind: "schedule", missed_count: fireTimes.length, payload: { fire_times: fireTimes.map((d) => d.toISOString()), catchup: true } });
      return;
    }
    for (const t of fireTimes) this.enqueueEvent(automation, { trigger_id: trigger.id, kind: "schedule", payload: { fire_time: t.toISOString(), catchup: fireTimes.length > 1 }, occurred_at: t.toISOString() });
  }

  /** Records an event and creates its run (queued). Returns the run. */
  enqueueEvent(automation: Automation, e: { trigger_id: string | null; kind: TriggerKind; payload?: unknown; missed_count?: number; occurred_at?: string }): Run {
    const event = this.db.createEvent({ automation_id: automation.id, status: "queued", ...e });
    const run = this.createRunForEvent(automation, event);
    this.db.setEventStatus(event.id, "dispatched");
    void this.dispatch();
    return run;
  }

  private createRunForEvent(a: Automation, event: Event | null): Run {
    const backend = this.backends.get(a.backend);
    const run = this.db.createRun({ automation_id: a.id, event_id: event?.id ?? null, backend: a.backend, model: a.model ?? backend.defaultModel, working_dir: a.working_dir, session_id: backend.newSessionId() });
    this.emit("run", run);
    return run;
  }

  runNow(automationOrId: string | Automation, payload?: unknown): Run {
    const a = typeof automationOrId === "string" ? this.db.findAutomation(automationOrId) : automationOrId;
    if (!a) throw new Error(`automation not found: ${automationOrId}`);
    return this.enqueueEvent(a, { trigger_id: null, kind: "manual", payload: payload ?? { source: "manual" } });
  }

  retry(runId: string): Run {
    const old = this.db.getRun(runId); if (!old) throw new Error("run not found");
    const a = this.db.getAutomation(old.automation_id); if (!a) throw new Error("automation not found");
    const event = old.event_id ? this.db.getEvent(old.event_id) : null;
    const run = this.createRunForEvent(a, event);
    this.db.updateRun(run.id, { attempt: old.attempt + 1 });
    void this.dispatch();
    return this.db.getRun(run.id)!;
  }

  cancel(runId: string): Run {
    const run = this.db.getRun(runId); if (!run) throw new Error("run not found");
    const h = this.live.get(runId);
    if (h) { h.cancel("cancelled"); return run; }
    if (run.status === "queued" || run.status === "rate_limited") {
      this.db.updateRun(runId, { status: "cancelled", finished_at: nowIso() });
      const updated = this.db.getRun(runId)!; this.emit("run", updated); return updated;
    }
    return run;
  }

  isLive(runId: string) { return this.live.has(runId); }
  liveHandle(runId: string) { return this.live.get(runId); }

  // ---- dispatch ----

  async dispatch() {
    if (this.dispatching || this.stopped) return;
    this.dispatching = true;
    try {
      const now = new Date();
      // 1. promote rate-limited runs whose retry time has passed
      for (const r of this.db.listRuns({ status: "rate_limited", limit: 1000 })) {
        if (!r.next_attempt_at || new Date(r.next_attempt_at) <= now) {
          this.db.updateRun(r.id, { status: "queued", next_attempt_at: null, attempt: r.attempt + 1 });
          this.emit("run", this.db.getRun(r.id)!);
        }
      }
      // 2. start queued runs while capacity allows
      const skippedAutomations = new Set<string>();
      for (const r of this.db.oldestQueuedRuns()) {
        if (this.live.size >= this.globalMax) break;
        if (skippedAutomations.has(r.automation_id)) continue;
        const a = this.db.getAutomation(r.automation_id);
        if (!a) { this.db.updateRun(r.id, { status: "failed", error: "automation deleted", finished_at: nowIso() }); continue; }
        const runningForA = [...this.liveAutomation.values()].filter((id) => id === a.id).length;
        if (runningForA >= a.max_concurrent) { skippedAutomations.add(a.id); continue; }
        if (a.rate_limit_count && a.rate_limit_window_sec) {
          const since = new Date(now.getTime() - a.rate_limit_window_sec * 1000).toISOString();
          if (this.db.countRunsStartedSince(a.id, since) >= a.rate_limit_count) { skippedAutomations.add(a.id); continue; }
        }
        await this.launch(r, a);
      }
    } catch (e) { this.log(`dispatch failed: ${(e as Error).message}`); }
    finally { this.dispatching = false; }
  }

  private async launch(run0: Run, a: Automation) {
    const backend = this.backends.get(a.backend);
    const runDir = join(this.paths.runs, run0.id);
    this.db.updateRun(run0.id, { status: "starting", started_at: nowIso() });
    this.live.set(run0.id, { child: null as any, cancel: () => {}, onLine: () => () => {} }); // reserve the slot
    this.liveAutomation.set(run0.id, a.id);
    this.emit("run", this.db.getRun(run0.id)!);
    try {
      let worktree: string | null = null;
      if (a.isolate_worktree) { worktree = await createWorktree(this.paths.worktrees, a.working_dir, run0.id); this.db.updateRun(run0.id, { worktree_path: worktree }); }
      const run = this.db.getRun(run0.id)!;
      const event = run.event_id ? this.db.getEvent(run.event_id) : null;
      const trigger = event?.trigger_id ? this.db.getTrigger(event.trigger_id) : null;
      const prompt = renderPrompt(a.instructions, { run, automation: a, event, trigger });
      const resumeSessionId = a.continue_session ? this.db.lastSuccessfulSession(a.id) : null;
      const { handle, done, ctx } = await startRun({
        backend, run, automation: a, prompt, runDir, resumeSessionId,
        onStarted: (pid, argv) => { this.db.updateRun(run.id, { status: "running", pid }); this.emit("run", this.db.getRun(run.id)!); this.log(`run ${run.id} (${a.name}) started pid=${pid}: ${argv.slice(0, 3).join(" ")} …`); },
      });
      this.live.set(run.id, handle);
      handle.onLine((stream, line) => this.emit("log", run.id, stream, line));
      void done.then(async (out) => {
        try {
          const parsed = await backend.parseResult(this.db.getRun(run.id)!, out.stdout, out.stderr, out.exitCode, ctx);
          let status: RunStatus; let error: string | null = null; let next_attempt_at: string | null = null;
          if (out.cancelled) status = "cancelled";
          else if (out.timedOut) { status = "timed_out"; error = `killed after ${a.timeout_sec}s`; }
          else if (parsed.rateLimited) { status = "rate_limited"; error = parsed.rateLimited.message; next_attempt_at = (parsed.rateLimited.retryAt ?? new Date(Date.now() + 30 * 60e3)).toISOString(); }
          else if (parsed.ok) status = "succeeded";
          else { status = "failed"; error = parsed.error ?? `exit ${out.exitCode}`; }
          if (out.warnings.length) error = [error, ...out.warnings.map((w) => `warning: ${w}`)].filter(Boolean).join("\n") || null;
          const resultJson = parsed.result !== undefined ? JSON.stringify(parsed.result) : null;
          if (resultJson) await Bun.write(join(runDir, "result.json"), resultJson);
          this.db.updateRun(run.id, { status, error, exit_code: out.exitCode, finished_at: status === "rate_limited" ? null : nowIso(), session_id: parsed.sessionId ?? run.session_id, result_json: resultJson, summary: parsed.summary ?? null, next_attempt_at, pid: null });
          if (worktree && status !== "rate_limited") { try { await removeWorktree(a.working_dir, worktree); } catch (e) { this.log(`worktree cleanup failed: ${(e as Error).message}`); } }
          const final = this.db.getRun(run.id)!;
          this.log(`run ${run.id} (${a.name}) ${status}${error ? ": " + error.split("\n")[0] : ""}`);
          this.emit("run", final);
          await this.notifyFor(a, final, event);
        } catch (e) {
          this.db.updateRun(run.id, { status: "failed", error: `post-processing failed: ${(e as Error).message}`, finished_at: nowIso(), pid: null });
          this.emit("run", this.db.getRun(run.id)!);
        } finally { this.live.delete(run.id); this.liveAutomation.delete(run.id); void this.dispatch(); }
      });
    } catch (e) {
      this.live.delete(run0.id); this.liveAutomation.delete(run0.id);
      this.db.updateRun(run0.id, { status: "failed", error: (e as Error).message, finished_at: nowIso() });
      const final = this.db.getRun(run0.id)!;
      this.log(`run ${run0.id} (${a.name}) failed to start: ${(e as Error).message}`);
      this.emit("run", final);
      await this.notifyFor(a, final, null);
    }
  }

  private async notifyFor(a: Automation, run: Run, event: Event | null) {
    if (!["succeeded", "failed", "timed_out", "rate_limited"].includes(run.status)) return;
    const catchup = (event?.missed_count ?? 0) > 1 ? ` (catch-up: ${event!.missed_count} missed fires)` : "";
    const title = `${a.name}: ${run.status.replace("_", " ")}`;
    const body = (run.status === "succeeded" ? (run.summary?.split("\n")[0] ?? "done") : (run.error?.split("\n")[0] ?? run.status)).slice(0, 200) + catchup;
    await this.notifier.notify({ automation: a, run, status: run.status, title, body, webUrl: `${this.webUrl}/#/runs/${run.id}` });
  }

  /** Deletes run directories older than logRetentionDays for runs no longer in the db or terminal. */
  pruneRunDirs() {
    const cutoff = Date.now() - this.cfg.logRetentionDays * 86400e3;
    if (!existsSync(this.paths.runs)) return;
    for (const name of readdirSync(this.paths.runs)) {
      const p = join(this.paths.runs, name);
      try {
        if (statSync(p).mtimeMs > cutoff) continue;
        const run = this.db.getRun(name);
        if (run && !["succeeded", "failed", "timed_out", "cancelled"].includes(run.status)) continue;
        rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  }

  // ---- introspection ----
  status() {
    return {
      version: VERSION, started_at: this.startedAt, home: this.paths.home, web_url: this.webUrl,
      running: this.live.size, global_max_concurrent: this.globalMax,
      queued: this.db.countRuns(["queued"]), rate_limited: this.db.countRuns(["rate_limited"]),
      last_heartbeat_at: this.db.getSetting("last_heartbeat_at"),
    };
  }
}
