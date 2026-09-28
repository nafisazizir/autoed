import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Engine } from "../engine.ts";
import { nextFire, validateCron, CRON_PRESETS } from "../scheduler.ts";
import { renderPrompt } from "../template.ts";
import type { AutomationInput, Run, RunStatus, ScheduleTriggerConfig } from "../types.ts";
import { UI_HTML } from "./ui.ts";

const MAX_BODY = 1024 * 1024;

export function createApp(engine: Engine) {
  const app = new Hono();
  const db = engine.db;

  app.onError((err, c) => c.json({ error: err.message }, 400));

  // ---------- status ----------
  app.get("/api/status", (c) => c.json(engine.status()));

  // ---------- automations ----------
  const decorate = (a: ReturnType<typeof db.getAutomation>) => {
    if (!a) return null;
    const triggers = db.listTriggers(a.id).map((t) => ({ ...t, config: safeJson(t.config) }));
    const nextRuns = triggers.filter((t) => t.kind === "schedule" && t.enabled && t.next_fire_at).map((t) => t.next_fire_at!).sort();
    const last = db.lastRun(a.id);
    return { ...a, triggers, next_run_at: nextRuns[0] ?? null, last_run: last ? pick(last, ["id", "status", "queued_at", "started_at", "finished_at", "error"]) : null,
      running: db.countRuns(["starting", "running"], a.id), queued: db.countRuns(["queued", "rate_limited"], a.id) };
  };
  app.get("/api/automations", (c) => c.json(db.listAutomations().map(decorate)));
  app.post("/api/automations", async (c) => {
    const input = validateInput(await c.req.json());
    const a = db.createAutomation(input);
    engine.emit("automation", a);
    engine.scheduler.tick(); // primes next_fire_at
    return c.json(decorate(db.getAutomation(a.id)), 201);
  });
  app.get("/api/automations/:id", (c) => { const a = decorate(db.getAutomation(c.req.param("id"))); return a ? c.json(a) : c.json({ error: "not found" }, 404); });
  app.put("/api/automations/:id", async (c) => {
    const id = c.req.param("id");
    if (!db.getAutomation(id)) return c.json({ error: "not found" }, 404);
    const input = validateInput(await c.req.json(), true);
    const a = db.updateAutomation(id, input);
    engine.emit("automation", a);
    engine.scheduler.tick();
    return c.json(decorate(db.getAutomation(id)));
  });
  app.delete("/api/automations/:id", (c) => {
    const id = c.req.param("id");
    for (const r of db.listRuns({ automation_id: id, status: ["queued", "rate_limited", "starting", "running"], limit: 1000 })) engine.cancel(r.id);
    db.deleteAutomation(id); engine.emit("automation", { id, deleted: true }); return c.json({ ok: true });
  });
  app.post("/api/automations/:id/run", async (c) => {
    const a = db.getAutomation(c.req.param("id")); if (!a) return c.json({ error: "not found" }, 404);
    const body = await c.req.json().catch(() => ({}));
    return c.json(engine.runNow(a, { source: "manual", ...(body?.payload ? { input: body.payload } : {}) }), 201);
  });
  app.post("/api/automations/:id/preview", async (c) => {
    const a = db.getAutomation(c.req.param("id")); if (!a) return c.json({ error: "not found" }, 404);
    const fake = { id: "preview000000000000000000", automation_id: a.id, event_id: null, status: "queued", queued_at: new Date().toISOString(), started_at: null, finished_at: null, backend: a.backend, model: a.model, session_id: null, working_dir: a.working_dir, worktree_path: null, exit_code: null, error: null, result_json: null, attempt: 1, next_attempt_at: null, pid: null, summary: null } as Run;
    return c.json({ prompt: renderPrompt(a.instructions, { run: fake, automation: a, event: null }) });
  });

  // ---------- runs ----------
  app.get("/api/runs", (c) => {
    const status = c.req.query("status"); const automation_id = c.req.query("automation_id") || undefined;
    const runs = db.listRuns({ automation_id, status: status ? (status.split(",") as RunStatus[]) : undefined, limit: Number(c.req.query("limit") ?? 100), offset: Number(c.req.query("offset") ?? 0) });
    const names = new Map(db.listAutomations().map((a) => [a.id, a.name]));
    return c.json(runs.map((r) => ({ ...r, automation_name: names.get(r.automation_id) ?? "(deleted)" })));
  });
  app.get("/api/runs/:id", async (c) => {
    const r = db.getRun(c.req.param("id")); if (!r) return c.json({ error: "not found" }, 404);
    const dir = join(engine.paths.runs, r.id);
    const read = async (f: string, tail?: number) => { const p = join(dir, f); if (!existsSync(p)) return null; const t = await Bun.file(p).text(); return tail ? t.split("\n").slice(-tail).join("\n") : t; };
    const a = db.getAutomation(r.automation_id);
    const event = r.event_id ? db.getEvent(r.event_id) : null;
    return c.json({ ...r, automation_name: a?.name ?? "(deleted)", event: event ? { ...event, payload: safeJson(event.payload) } : null,
      prompt: await read("prompt.md"), stdout: await read("stdout.log", 400), stderr: await read("stderr.log", 400), command: safeJson(await read("command.json")), result: safeJson(r.result_json), live: engine.isLive(r.id), run_dir: dir });
  });
  app.get("/api/runs/:id/logs", async (c) => {
    const stream = c.req.query("stream") === "stderr" ? "stderr.log" : "stdout.log";
    const p = join(engine.paths.runs, c.req.param("id"), stream);
    if (!existsSync(p)) return c.text("", 200);
    return new Response(Bun.file(p), { headers: { "content-type": "text/plain; charset=utf-8" } });
  });
  app.post("/api/runs/:id/cancel", (c) => c.json(engine.cancel(c.req.param("id"))));
  app.post("/api/runs/:id/retry", (c) => c.json(engine.retry(c.req.param("id")), 201));
  app.post("/api/runs/:id/open", async (c) => {
    const r = db.getRun(c.req.param("id")); if (!r) return c.json({ error: "not found" }, 404);
    await engine.backends.get(r.backend).openInDesktop(r); return c.json({ ok: true });
  });

  // ---------- live stream (SSE): run updates, automation updates, log lines ----------
  app.get("/api/stream", (c) => streamSSE(c, async (stream) => {
    const runId = c.req.query("run");
    let alive = true;
    const send = (event: string, data: unknown) => { if (alive) stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => { alive = false; }); };
    const onRun = (r: Run) => { if (!runId || r.id === runId) send("run", r); };
    const onLog = (id: string, s: string, line: string) => { if (runId === id) send("log", { stream: s, line }); };
    const onAuto = (a: unknown) => send("automation", a);
    const onEngine = (m: string) => { if (!runId) send("engine", m); };
    engine.on("run", onRun); engine.on("log", onLog); engine.on("automation", onAuto); engine.on("engine", onEngine);
    send("hello", engine.status());
    stream.onAbort(() => { alive = false; });
    try { while (alive) { await stream.sleep(15000); send("ping", Date.now()); } }
    finally { engine.off("run", onRun); engine.off("log", onLog); engine.off("automation", onAuto); engine.off("engine", onEngine); }
  }));

  // ---------- backends ----------
  app.get("/api/backends", async (c) => {
    const out = [];
    for (const b of engine.backends.all()) {
      const [detection, models] = await Promise.all([engine.backends.detectCached(b.id), b.listModels().catch(() => [])]);
      out.push({ id: b.id, label: b.label, detection, models, agent_modes: b.agentModes, default_agent_mode: b.defaultAgentMode, default_model: b.defaultModel });
    }
    const leaked = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"].filter((k) => process.env[k]);
    return c.json({ backends: out, environment: { api_key_vars_present: leaked, scrubbed: true } });
  });
  app.post("/api/backends/refresh", async (c) => { engine.backends.invalidate(); await engine.backends.devin.listModels(true).catch(() => []); return c.json({ ok: true }); });

  // ---------- queue & settings ----------
  app.get("/api/queue", (c) => {
    const names = new Map(db.listAutomations().map((a) => [a.id, a]));
    const withName = (r: Run) => ({ ...r, automation_name: names.get(r.automation_id)?.name ?? "(deleted)" });
    return c.json({ ...engine.status(),
      running_runs: db.listRuns({ status: ["starting", "running"], limit: 100 }).map(withName),
      queued_runs: db.listRuns({ status: "queued", limit: 200 }).map(withName),
      rate_limited_runs: db.listRuns({ status: "rate_limited", limit: 200 }).map(withName),
      per_automation: [...names.values()].map((a) => ({ id: a.id, name: a.name, max_concurrent: a.max_concurrent, running: db.countRuns(["starting", "running"], a.id), queued: db.countRuns(["queued"], a.id), rate_limit: a.rate_limit_count ? `${a.rate_limit_count} per ${a.rate_limit_window_sec}s` : null })),
    });
  });
  app.get("/api/settings", (c) => c.json({ global_max_concurrent: engine.globalMax, config: engine.cfg, config_path: engine.paths.config, cron_presets: CRON_PRESETS }));
  app.put("/api/settings", async (c) => {
    const b = await c.req.json();
    if (b.global_max_concurrent !== undefined) { const n = Math.max(1, Math.min(20, Number(b.global_max_concurrent) || 1)); db.setSetting("global_max_concurrent", String(n)); void engine.dispatch(); }
    return c.json({ global_max_concurrent: engine.globalMax });
  });
  app.get("/api/events", (c) => c.json(db.listEvents(c.req.query("automation_id") || undefined, Number(c.req.query("limit") ?? 100)).map((e) => ({ ...e, payload: safeJson(e.payload) }))));
  app.post("/api/validate/cron", async (c) => {
    const { cron, tz } = await c.req.json();
    const err = validateCron(String(cron ?? ""), tz);
    if (err) return c.json({ ok: false, error: err });
    const cfg: ScheduleTriggerConfig = { cron, tz };
    const next: string[] = []; let from = new Date();
    for (let i = 0; i < 5; i++) { const n = nextFire(cfg, from); if (!n) break; next.push(n.toISOString()); from = n; }
    return c.json({ ok: true, next });
  });

  // ---------- inbound webhooks ----------
  app.post("/hooks/:triggerId", async (c) => {
    const t = db.getTrigger(c.req.param("triggerId"));
    if (!t || t.kind !== "webhook" || !t.enabled) return c.json({ error: "unknown hook" }, 404);
    const a = db.getAutomation(t.automation_id);
    if (!a || !a.enabled) return c.json({ error: "automation disabled" }, 409);
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BODY) return c.json({ error: "body too large" }, 413);
    const raw = await c.req.text();
    if (raw.length > MAX_BODY) return c.json({ error: "body too large" }, 413);
    const cfg = safeJson(t.config) as { secret: string } | null;
    const secret = cfg?.secret ?? "";
    const provided = c.req.header("x-autoed-secret") ?? c.req.query("secret") ?? "";
    const sig = c.req.header("x-autoed-signature") ?? c.req.header("x-hub-signature-256") ?? "";
    let authed = false;
    if (provided && safeEq(provided, secret)) authed = true;
    else if (sig) { const mac = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"); authed = safeEq(sig, mac); }
    if (!authed) return c.json({ error: "unauthorized" }, 401);
    let payload: unknown = raw;
    try { payload = JSON.parse(raw); } catch {}
    const headers: Record<string, string> = {};
    for (const [k, v] of c.req.raw.headers) if (/^(x-github-event|x-github-delivery|content-type|user-agent)$/i.test(k)) headers[k.toLowerCase()] = v;
    const run = engine.enqueueEvent(a, { trigger_id: t.id, kind: "webhook", payload: { body: payload, headers } });
    return c.json({ ok: true, run_id: run.id }, 202);
  });

  // ---------- UI ----------
  app.get("/", (c) => c.html(UI_HTML));
  app.get("/index.html", (c) => c.html(UI_HTML));
  app.notFound((c) => c.req.path.startsWith("/api/") || c.req.path.startsWith("/hooks/") ? c.json({ error: "not found" }, 404) : c.html(UI_HTML));
  return app;
}

function validateInput(body: any, partial = false): AutomationInput {
  if (!body || typeof body !== "object") throw new Error("body must be a JSON object");
  if (body.triggers) {
    if (!Array.isArray(body.triggers)) throw new Error("triggers must be an array");
    for (const t of body.triggers) {
      if (t.kind === "schedule") { const err = validateCron(String(t.config?.cron ?? ""), t.config?.tz); if (err) throw new Error(`invalid cron "${t.config?.cron}": ${err}`); }
      if (t.kind === "github" && !t.config?.repo) throw new Error("github trigger needs config.repo (owner/name)");
    }
  }
  if (!partial || body.working_dir !== undefined) {
    if (!String(body.working_dir ?? "").trim()) throw new Error("working_dir is required"); // ~ is expanded in db.automationColumns
  }
  return body as AutomationInput;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
function safeJson(s: string | null | undefined) { if (!s) return null; try { return JSON.parse(s); } catch { return s; } }
function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> { const r = {} as Pick<T, K>; for (const k of keys) r[k] = o[k]; return r; }
