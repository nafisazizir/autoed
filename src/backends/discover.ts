import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Minimal environment forwarded to agent processes. Never inherits secrets. */
export const ALLOWED_ENV = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "SHELL", "TERM", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"];
/** Explicitly stripped even if a caller tries to forward them. */
export const DENIED_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "DEVIN_MODEL", "DEVIN_PERMISSION_MODE", "DEVIN_SANDBOX"];

export function standardPath(): string {
  const home = homedir();
  const parts = [
    join(home, ".local", "bin"),
    "/opt/homebrew/bin", "/opt/homebrew/sbin",
    "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin",
  ];
  for (const p of (process.env.PATH ?? "").split(":")) if (p && !parts.includes(p)) parts.push(p);
  return parts.join(":");
}

export function scrubbedEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ALLOWED_ENV) if (process.env[k] !== undefined) env[k] = process.env[k]!;
  env.PATH = standardPath();
  env.HOME ??= homedir();
  // launchd starts the engine without USER/LOGNAME; claude needs USER to find its keychain login.
  const user = loginUser();
  if (user) { env.USER ??= user; env.LOGNAME ??= user; }
  env.SHELL ??= "/bin/zsh";
  env.TERM ??= "dumb";
  env.LANG ??= "en_US.UTF-8";
  Object.assign(env, extra);
  for (const k of DENIED_ENV) delete env[k];
  env.CI = "1";
  env.NO_COLOR = "1";
  return env;
}

let cachedUser: string | null | undefined;
/** The login name, from the OS rather than the environment (Bun's os.userInfo() reads $USER and says "unknown" under launchd). */
export function loginUser(): string | null {
  if (cachedUser !== undefined) return cachedUser;
  if (process.env.USER) return (cachedUser = process.env.USER);
  try { const r = Bun.spawnSync(["/usr/bin/id", "-un"], { stdout: "pipe", stderr: "ignore", env: {} }); const u = r.stdout.toString().trim(); if (r.exitCode === 0 && u) return (cachedUser = u); } catch {}
  return (cachedUser = null);
}

export function isExecutable(p: string | undefined | null): p is string {
  if (!p) return false;
  try { const s = statSync(p); return s.isFile() && (s.mode & 0o111) !== 0; } catch { return false; }
}

export function whichSync(name: string): string | null {
  for (const dir of standardPath().split(":")) {
    const p = join(dir, name);
    if (isExecutable(p)) return p;
  }
  return null;
}

export async function npmGlobalBin(): Promise<string | null> {
  try {
    const npm = whichSync("npm"); if (!npm) return null;
    const proc = Bun.spawn([npm, "bin", "-g"], { stdout: "pipe", stderr: "ignore", env: scrubbedEnv() });
    const out = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    return out && existsSync(out) ? out : null;
  } catch { return null; }
}

export async function findDevinApp(): Promise<string | null> {
  const candidates = ["/Applications/Devin.app", join(homedir(), "Applications", "Devin.app")];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const proc = Bun.spawn(["mdfind", "kMDItemCFBundleIdentifier == 'ai.cognition.devin'"], { stdout: "pipe", stderr: "ignore" });
    const out = (await new Response(proc.stdout).text()).trim().split("\n").filter(Boolean);
    await proc.exited;
    for (const p of out) if (p.endsWith(".app") && existsSync(p)) return p;
  } catch { /* mdfind unavailable */ }
  return null;
}

export async function runCapture(argv: string[], opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const proc = Bun.spawn(argv, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: opts.env ?? scrubbedEnv() });
  const timer = opts.timeoutMs ? setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, opts.timeoutMs) : null;
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  if (timer) clearTimeout(timer);
  return { code, stdout, stderr };
}
