import { existsSync } from "node:fs";
import { arch, homedir, release } from "node:os";
import { join } from "node:path";
import { Backends } from "./backends/index.ts";
import { findDevinApp, runCapture, whichSync } from "./backends/discover.ts";
import { devinDataDir } from "./backends/devin.ts";
import { APP_ID, type Config, type Paths, VERSION } from "./config.ts";

export interface Check { name: string; ok: boolean | null; detail: string; fix?: string }

export async function doctor(cfg: Config, paths: Paths): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  add({ name: "autoed", ok: true, detail: `v${VERSION}, home ${paths.home}, bun ${Bun.version}, exe ${process.execPath}` });
  const sw = await runCapture(["sw_vers", "-productVersion"], { timeoutMs: 5000 }).catch(() => null);
  const ver = sw?.stdout.trim() || "";
  const major = Number(ver.split(".")[0]);
  add({ name: "macOS", ok: process.platform !== "darwin" ? false : major >= 14, detail: `${process.platform} ${ver || release()} ${arch()}`, fix: major < 14 ? "autoed needs macOS 14 (Sonoma) or newer" : undefined });

  const backends = new Backends(cfg, paths.cache);
  for (const b of backends.all()) {
    const d = await b.detect();
    add({ name: `${b.label} binary`, ok: d.ok, detail: d.binary ? `${d.binary} (${d.version ?? "version unknown"})` : d.note ?? "not found", fix: d.ok ? undefined : d.note });
    add({ name: `${b.label} login`, ok: d.loggedIn, detail: d.loggedIn === null ? "unknown" : d.loggedIn ? "logged in" : "not logged in", fix: d.loggedIn === false ? d.note : undefined });
  }
  const app = await findDevinApp();
  add({ name: "Devin.app", ok: !!app, detail: app ?? "not found", fix: app ? undefined : "install Devin Desktop to view sessions" });
  const sdb = join(devinDataDir(), "sessions.db");
  add({ name: "Devin session store", ok: existsSync(sdb), detail: sdb, fix: existsSync(sdb) ? undefined : "run devin once so the session store exists" });
  const cp = join(homedir(), ".claude", "projects");
  add({ name: "Claude session store", ok: existsSync(cp), detail: cp, fix: existsSync(cp) ? undefined : "run claude once so the projects directory exists" });

  const leaked = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_BASE_URL"].filter((k) => process.env[k]);
  add({ name: "API key in environment", ok: leaked.length === 0, detail: leaked.length ? `${leaked.join(", ")} set in this shell (scrubbed for runs, but check launchd/login env)` : "none set" });
  const launchctlEnv = await runCapture(["launchctl", "getenv", "ANTHROPIC_API_KEY"], { timeoutMs: 5000 }).catch(() => null);
  add({ name: "API key in launchd env", ok: !launchctlEnv?.stdout.trim(), detail: launchctlEnv?.stdout.trim() ? "ANTHROPIC_API_KEY is set via launchctl setenv" : "clean", fix: launchctlEnv?.stdout.trim() ? "launchctl unsetenv ANTHROPIC_API_KEY" : undefined });

  add({ name: "gh (GitHub triggers)", ok: !!whichSync("gh") || null, detail: whichSync("gh") ?? "not installed (only needed for GitHub triggers)" });
  add({ name: "git (worktree isolation)", ok: !!whichSync("git"), detail: whichSync("git") ?? "not found" });

  const pm = await runCapture(["pmset", "-g", "custom"], { timeoutMs: 5000 }).catch(() => null);
  if (pm?.stdout) {
    const sleep = pm.stdout.match(/^\s*sleep\s+(\d+)/m)?.[1];
    const womp = pm.stdout.match(/^\s*womp\s+(\d+)/m)?.[1];
    const ar = pm.stdout.match(/^\s*autorestart\s+(\d+)/m)?.[1];
    add({ name: "pmset sleep", ok: sleep === "0" ? true : sleep === undefined ? null : false, detail: `sleep=${sleep ?? "?"} womp=${womp ?? "?"} autorestart=${ar ?? "?"}`, fix: sleep !== "0" ? "sudo pmset -a sleep 0 disksleep 0 womp 1 autorestart 1" : undefined });
  }
  const al = await runCapture(["defaults", "read", "/Library/Preferences/com.apple.loginwindow", "autoLoginUser"], { timeoutMs: 5000 }).catch(() => null);
  add({ name: "auto-login", ok: al?.code === 0 ? true : null, detail: al?.code === 0 ? `user ${al.stdout.trim()}` : "not configured (or not readable)", fix: al?.code === 0 ? undefined : "System Settings › Users & Groups › Automatic login" });

  const plist = join(homedir(), "Library", "LaunchAgents", `${APP_ID}.plist`);
  const lc = await runCapture(["launchctl", "list", APP_ID], { timeoutMs: 5000 }).catch(() => null);
  add({ name: "LaunchAgent", ok: existsSync(plist) ? lc?.code === 0 : null, detail: existsSync(plist) ? (lc?.code === 0 ? `loaded (${plist})` : `installed but not loaded (${plist})`) : "not installed", fix: existsSync(plist) ? undefined : "autoed install" });

  let portFree: boolean | null = null; let portDetail = `${cfg.host}:${cfg.port}`;
  try {
    const res = await fetch(`http://${cfg.host}:${cfg.port}/api/status`, { signal: AbortSignal.timeout(1500) });
    const j: any = await res.json().catch(() => null);
    portFree = false; portDetail += j?.version ? ` in use by autoed ${j.version} (running since ${j.started_at})` : " in use by another process";
  } catch { portFree = true; portDetail += " free"; }
  add({ name: "port", ok: portFree === false && portDetail.includes("autoed") ? true : portFree, detail: portDetail });
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const icon = (ok: boolean | null) => (ok === true ? "✓" : ok === false ? "✗" : "·");
  return checks.map((c) => `${icon(c.ok)} ${c.name.padEnd(26)} ${c.detail}${c.fix && c.ok !== true ? `\n    → ${c.fix}` : ""}`).join("\n");
}
