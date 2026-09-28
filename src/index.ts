#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDirs, loadConfig, resolvePaths, VERSION } from "./config.ts";
import { doctor, formatChecks } from "./doctor.ts";
import { Engine } from "./engine.ts";
import { install, uninstall } from "./install.ts";
import { createApp } from "./server/index.ts";
import type { AutomationInput } from "./types.ts";

const HELP = `autoed ${VERSION} — local agent automations for macOS

Usage: autoed <command> [options]

  serve                     Run the engine (scheduler, queue, web UI on http://127.0.0.1:4848)
  doctor                    Check binaries, logins, environment, power settings, LaunchAgent
  install [--source <bin>]  Install the LaunchAgent (KeepAlive, RunAtLoad) and start the engine
  uninstall                 Remove the LaunchAgent
  status                    Show engine status (via the running engine)
  list                      List automations
  add <file.json>           Create or update an automation from a JSON file (matched by name)
  run <name|id> [--wait]    Trigger a run now. Uses the running engine, or runs in-process if none.
  runs [name|id]            List recent runs
  logs <run-id>             Print a run's stdout log
  cancel <run-id>           Cancel a queued or running run
  open <run-id>             Open the run's directory in Devin Desktop

Environment: AUTOED_HOME (default ~/.autoed) relocates all data. ~/.autoed/config.json overrides ports and paths.
`;

const paths = resolvePaths();
ensureDirs(paths);
const cfg = loadConfig(paths);
const [cmd = "help", ...args] = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name: string) => args.includes(name);
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--") && ["--source"].includes(args[i - 1]!)));

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`http://${cfg.host}:${cfg.port}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(10000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `${res.status} ${res.statusText}`);
  return j;
}
async function engineRunning(): Promise<boolean> { try { const s = await api("/api/status"); return !!s.version; } catch { return false; } }

function fmtRun(r: any) { return `${r.id}  ${(r.status as string).padEnd(12)} ${(r.automation_name ?? r.automation_id).padEnd(24)} ${r.backend}/${r.model ?? "-"}  ${r.started_at ?? r.queued_at}${r.error ? "  " + String(r.error).split("\n")[0] : ""}`; }

switch (cmd) {
  case "serve": {
    const engine = new Engine(cfg, paths);
    const app = createApp(engine);
    const server = Bun.serve({ hostname: cfg.host, port: cfg.port, fetch: app.fetch, idleTimeout: 255 });
    engine.log(`web UI on http://${cfg.host}:${cfg.port}`);
    await engine.start();
    const shutdown = async (sig: string) => { engine.log(`received ${sig}, shutting down`); server.stop(true); await engine.stop(); process.exit(0); };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    break;
  }
  case "doctor": {
    const checks = await doctor(cfg, paths);
    console.log(formatChecks(checks));
    process.exit(checks.some((c) => c.ok === false && /binary|macOS/.test(c.name)) ? 1 : 0);
  }
  case "install": {
    const pp = await install(paths, { source: flag("--source") });
    console.log(`installed ${pp}\nengine log: ${join(paths.logs, "engine.log")}\nopen http://${cfg.host}:${cfg.port}`);
    break;
  }
  case "uninstall": await uninstall(); console.log("LaunchAgent removed"); break;
  case "status": {
    if (!(await engineRunning())) { console.log(`engine not running on ${cfg.host}:${cfg.port}`); process.exit(1); }
    console.log(JSON.stringify(await api("/api/status"), null, 2)); break;
  }
  case "list": {
    const rows = await engineRunning() ? await api("/api/automations") : withEngine((e) => e.db.listAutomations().map((a) => ({ ...a, next_run_at: null, last_run: e.db.lastRun(a.id) })));
    if (!rows.length) console.log("no automations. Create one in the web UI or with `autoed add <file.json>`.");
    for (const a of rows) console.log(`${a.id}  ${a.enabled ? "on " : "off"}  ${a.name.padEnd(28)} ${a.backend}/${a.model ?? "default"}  next=${a.next_run_at ?? "-"}  last=${a.last_run?.status ?? "-"}`);
    break;
  }
  case "add": {
    const file = positional[0]; if (!file) die("usage: autoed add <file.json>");
    const input = JSON.parse(await Bun.file(resolve(file)).text()) as AutomationInput;
    if (await engineRunning()) {
      const existing = (await api("/api/automations")).find((a: any) => a.name === input.name);
      const a = existing ? await api(`/api/automations/${existing.id}`, { method: "PUT", body: JSON.stringify(input) }) : await api("/api/automations", { method: "POST", body: JSON.stringify(input) });
      console.log(`${existing ? "updated" : "created"} ${a.id} ${a.name}`);
    } else {
      withEngine((e) => { const ex = e.db.findAutomation(input.name); const a = ex ? e.db.updateAutomation(ex.id, input) : e.db.createAutomation(input); console.log(`${ex ? "updated" : "created"} ${a.id} ${a.name} (engine not running)`); });
    }
    break;
  }
  case "run": {
    const target = positional[0]; if (!target) die("usage: autoed run <name|id> [--wait]");
    if (await engineRunning()) {
      const list = await api("/api/automations");
      const a = list.find((x: any) => x.id === target || x.name.toLowerCase() === target.toLowerCase()); if (!a) die(`automation not found: ${target}`);
      const run = await api(`/api/automations/${a.id}/run`, { method: "POST", body: "{}" });
      console.log(`queued run ${run.id} for ${a.name} → http://${cfg.host}:${cfg.port}/#/runs/${run.id}`);
      if (has("--wait")) {
        let r = run;
        while (!["succeeded", "failed", "timed_out", "cancelled"].includes(r.status)) { await Bun.sleep(2000); r = await api(`/api/runs/${run.id}`); }
        console.log(fmtRun(r)); if (r.summary) console.log("\n" + r.summary); process.exit(r.status === "succeeded" ? 0 : 1);
      }
    } else {
      // One-shot in-process engine: run this automation and exit.
      const engine = new Engine(cfg, paths);
      const a = engine.db.findAutomation(target); if (!a) die(`automation not found: ${target}`);
      engine.on("log", (_id, stream, line) => (stream === "stderr" ? process.stderr : process.stdout).write(line + "\n"));
      const run = engine.runNow(a);
      console.log(`running ${run.id} for ${a.name} in-process (engine not running)`);
      await engine.dispatch();
      while (true) { const r = engine.db.getRun(run.id)!; if (["succeeded", "failed", "timed_out", "cancelled", "rate_limited"].includes(r.status)) { console.log(fmtRun({ ...r, automation_name: a.name })); if (r.summary) console.log("\n" + r.summary); engine.db.close(); process.exit(r.status === "succeeded" ? 0 : 1); } await Bun.sleep(1000); }
    }
    break;
  }
  case "runs": {
    const rows = await engineRunning() ? await api(`/api/runs?limit=30`) : withEngine((e) => e.db.listRuns({ limit: 30 }).map((r) => ({ ...r, automation_name: e.db.getAutomation(r.automation_id)?.name })));
    const target = positional[0];
    for (const r of rows) if (!target || r.automation_id === target || r.automation_name?.toLowerCase() === target.toLowerCase()) console.log(fmtRun(r));
    break;
  }
  case "logs": { const id = positional[0]; if (!id) die("usage: autoed logs <run-id>"); const p = join(paths.runs, id, has("--stderr") ? "stderr.log" : "stdout.log"); if (!existsSync(p)) die(`no log at ${p}`); process.stdout.write(await Bun.file(p).text()); break; }
  case "cancel": { const id = positional[0]; if (!id) die("usage: autoed cancel <run-id>"); console.log(JSON.stringify(await api(`/api/runs/${id}/cancel`, { method: "POST" }))); break; }
  case "open": { const id = positional[0]; if (!id) die("usage: autoed open <run-id>"); await api(`/api/runs/${id}/open`, { method: "POST" }); break; }
  case "version": case "--version": case "-v": console.log(VERSION); break;
  default: console.log(HELP); if (cmd !== "help" && cmd !== "--help" && cmd !== "-h") process.exit(1);
}

function die(msg: string): never { console.error(msg); process.exit(1); }
function withEngine<T>(fn: (e: Engine) => T): T { const e = new Engine(cfg, paths); try { return fn(e); } finally { e.db.close(); } }
