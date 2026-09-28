import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import type { Automation, Run } from "../types.ts";
import { newUuid } from "../ids.ts";
import type { Backend, BuildContext, BuiltCommand, Detection, ModelInfo, ParsedResult } from "./types.ts";
import { isExecutable, npmGlobalBin, runCapture, scrubbedEnv, whichSync } from "./discover.ts";
import { detectRateLimit } from "./ratelimit.ts";

export class ClaudeBackend implements Backend {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly agentModes = [
    { id: "acceptEdits", label: "Accept edits (auto-approve file edits)" },
    { id: "auto", label: "Auto (Claude decides, prompts denied)" },
    { id: "dontAsk", label: "Don't ask (deny anything that would prompt)" },
    { id: "plan", label: "Plan only (read-only)" },
    { id: "bypassPermissions", label: "Bypass permissions (runs everything)", dangerous: true },
  ];
  readonly defaultAgentMode = "acceptEdits";
  private binaryCache: string | null | undefined;

  constructor(private cfg: Config) {}
  get defaultModel() { return this.cfg.claude.defaultModel ?? "sonnet"; }

  async binary(): Promise<string | null> {
    if (this.binaryCache !== undefined) return this.binaryCache;
    const home = homedir();
    const candidates = [
      this.cfg.claude.binary,
      whichSync("claude"),
      join(home, ".local", "bin", "claude"),
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      join(home, ".claude", "local", "claude"),
    ];
    const npmBin = await npmGlobalBin();
    if (npmBin) candidates.push(join(npmBin, "claude"));
    for (const c of candidates) if (isExecutable(c)) return (this.binaryCache = c);
    return (this.binaryCache = null);
  }
  invalidate() { this.binaryCache = undefined; }

  async detect(): Promise<Detection> {
    const bin = await this.binary();
    if (!bin) return { ok: false, binary: null, version: null, loggedIn: null, note: "claude binary not found (config.claude.binary, PATH, ~/.local/bin, /opt/homebrew/bin, /usr/local/bin, npm -g)" };
    const v = await runCapture([bin, "--version"], { timeoutMs: 15000 });
    const version = v.stdout.trim().split("\n")[0] || null;
    // Login check: the keychain item "Claude Code-credentials" exists when logged in via OAuth.
    let loggedIn: boolean | null = null;
    try {
      const sec = await runCapture(["security", "find-generic-password", "-s", "Claude Code-credentials"], { timeoutMs: 10000 });
      loggedIn = sec.code === 0;
    } catch { loggedIn = null; }
    if (loggedIn === false && existsSync(join(homedir(), ".claude", ".credentials.json"))) loggedIn = true;
    return { ok: v.code === 0, binary: bin, version, loggedIn, note: loggedIn === false ? "run `claude` once and log in" : undefined };
  }

  async listModels(): Promise<ModelInfo[]> {
    const ids = this.cfg.claude.models ?? ["opus", "sonnet", "haiku"];
    return ids.map((id) => ({ id, label: id, free: true, note: "subscription" }));
  }

  newSessionId() { return newUuid(); }

  async buildCommand(run: Run, a: Automation, prompt: string, ctx: BuildContext): Promise<BuiltCommand> {
    const bin = await this.binary();
    if (!bin) throw new Error("claude binary not found");
    const argv = [bin, "-p", "--output-format", "json", "--permission-prompts", "none"];
    if (run.session_id && !ctx.resumeSessionId) argv.push("--session-id", run.session_id);
    argv.push("--name", `${a.name} #${run.id.slice(-6)}`);
    const model = run.model ?? a.model ?? this.defaultModel;
    if (model) argv.push("--model", model);
    if (a.agent_profile) argv.push("--agent", a.agent_profile);
    if (a.mcp_config) {
      const p = join(ctx.runDir, "mcp.json");
      await Bun.write(p, a.mcp_config);
      argv.push("--mcp-config", p);
    }
    const mode = a.agent_mode || this.defaultAgentMode;
    argv.push("--permission-mode", mode);
    if (mode === "bypassPermissions") { argv.push("--dangerously-skip-permissions"); ctx.warn("permission mode bypassPermissions: the agent can run any command"); }
    if (a.json_schema) argv.push("--json-schema", a.json_schema);
    if (ctx.resumeSessionId) argv.push("--resume", ctx.resumeSessionId);
    const addDirs: string[] = a.add_dirs ? JSON.parse(a.add_dirs) : [];
    if (addDirs.length) argv.push("--add-dir", ...addDirs);
    const allowed: string[] = a.allowed_tools ? JSON.parse(a.allowed_tools) : [];
    const disallowed: string[] = a.disallowed_tools ? JSON.parse(a.disallowed_tools) : [];
    if (allowed.length) argv.push("--allowedTools", ...allowed);
    if (disallowed.length) argv.push("--disallowedTools", ...disallowed);
    if (a.chrome) argv.push("--chrome");
    return { argv, env: scrubbedEnv(), cwd: run.worktree_path ?? run.working_dir, stdin: prompt };
  }

  async parseResult(run: Run, stdout: string, stderr: string, exitCode: number | null): Promise<ParsedResult> {
    let json: any = null;
    const trimmed = stdout.trim();
    if (trimmed.startsWith("{")) { try { json = JSON.parse(trimmed); } catch { /* not json */ } }
    if (!json) {
      // stream or partial output: take the last JSON object line
      for (const line of trimmed.split("\n").reverse()) { if (line.startsWith("{")) { try { json = JSON.parse(line); break; } catch {} } }
    }
    const sessionId = json?.session_id ?? run.session_id ?? undefined;
    const resultText: string = typeof json?.result === "string" ? json.result : "";
    // Only failed runs can be rate-limited: a successful result that merely mentions "429" or "rate limit" is agent output.
    const failed = exitCode !== 0 || !json || !!json.is_error;
    const rl = failed ? detectRateLimit("claude", `${json ? resultText : exitCode !== 0 ? trimmed.slice(-4000) : ""}\n${stderr}\n${json?.is_error ? JSON.stringify(json) : ""}`) : null;
    if (rl) return { ok: false, sessionId, rateLimited: rl, error: rl.message };
    if (json) {
      const ok = exitCode === 0 && !json.is_error;
      const denials = Array.isArray(json.permission_denials) ? json.permission_denials.length : 0;
      let error: string | undefined;
      if (!ok) error = resultText || json.error || `claude exited ${exitCode} (${json.stop_reason ?? json.subtype ?? "unknown"})`;
      const structured = json.structured_output ?? json.result;
      return { ok, sessionId, error, result: { ...json, permission_denials_count: denials }, summary: resultText.slice(0, 2000) || undefined, ...(structured !== undefined ? { structured } : {}) };
    }
    return { ok: exitCode === 0, sessionId, error: exitCode === 0 ? undefined : (stderr.trim().split("\n").slice(-5).join("\n") || `exit ${exitCode}`), summary: trimmed.slice(0, 2000) || undefined };
  }

  async openInDesktop(run: Run) {
    const devin = whichSync("devin");
    if (devin) await runCapture([devin, "desktop", run.worktree_path ?? run.working_dir], { timeoutMs: 15000 });
    else await runCapture(["open", "-b", "ai.cognition.devin", run.worktree_path ?? run.working_dir], { timeoutMs: 15000 });
  }
}
