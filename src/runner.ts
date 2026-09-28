import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import type { Backend, BuildContext } from "./backends/index.ts";
import type { Automation, Run } from "./types.ts";

export interface RunOutcome {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  stdout: string;
  stderr: string;
  warnings: string[];
}

export interface LiveHandle {
  child: ChildProcess;
  cancel: (reason: "cancelled" | "timed_out") => void;
  onLine: (cb: (stream: "stdout" | "stderr", line: string) => void) => () => void;
}

const MAX_CAPTURE = 4 * 1024 * 1024; // keep the last 4 MB of each stream in memory for parsing

/** Spawns the backend process in its own process group, tees output to disk, enforces the timeout. */
export async function startRun(opts: {
  backend: Backend; run: Run; automation: Automation; prompt: string; runDir: string; resumeSessionId: string | null;
  onStarted: (pid: number, argv: string[]) => void;
}): Promise<{ handle: LiveHandle; done: Promise<RunOutcome>; ctx: BuildContext }> {
  const { backend, run, automation, prompt, runDir } = opts;
  if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const promptPath = join(runDir, "prompt.md");
  await Bun.write(promptPath, prompt);
  const warnings: string[] = [];
  const ctx: BuildContext = { runDir, promptPath, resumeSessionId: opts.resumeSessionId, warn: (m) => warnings.push(m) };
  const cmd = await backend.buildCommand(run, automation, prompt, ctx);
  if (!existsSync(cmd.cwd)) throw new Error(`working directory does not exist: ${cmd.cwd}`);
  await Bun.write(join(runDir, "command.json"), JSON.stringify({ argv: cmd.argv, cwd: cmd.cwd, env_keys: Object.keys(cmd.env) }, null, 2));

  const child = spawn(cmd.argv[0]!, cmd.argv.slice(1), { cwd: cmd.cwd, env: cmd.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const outFile = createWriteStream(join(runDir, "stdout.log"), { flags: "a" });
  const errFile = createWriteStream(join(runDir, "stderr.log"), { flags: "a" });
  let stdout = ""; let stderr = "";
  const listeners = new Set<(s: "stdout" | "stderr", l: string) => void>();
  let timedOut = false; let cancelled = false;

  const pipe = (stream: NodeJS.ReadableStream, file: WriteStream, which: "stdout" | "stderr") => {
    let buf = "";
    stream.on("data", (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      file.write(s);
      if (which === "stdout") { stdout += s; if (stdout.length > MAX_CAPTURE) stdout = stdout.slice(-MAX_CAPTURE); }
      else { stderr += s; if (stderr.length > MAX_CAPTURE) stderr = stderr.slice(-MAX_CAPTURE); }
      buf += s;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); for (const l of listeners) l(which, line); }
    });
    stream.on("end", () => { if (buf) for (const l of listeners) l(which, buf); });
  };
  pipe(child.stdout!, outFile, "stdout");
  pipe(child.stderr!, errFile, "stderr");

  if (cmd.stdin !== undefined) { child.stdin!.on("error", () => {}); child.stdin!.end(cmd.stdin); } else child.stdin!.end();

  const killTree = (sig: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch {} }
  };
  const cancel = (reason: "cancelled" | "timed_out") => {
    if (reason === "timed_out") timedOut = true; else cancelled = true;
    killTree("SIGTERM");
    setTimeout(() => { if (child.exitCode === null && child.signalCode === null) killTree("SIGKILL"); }, 10000).unref();
  };
  const timer = setTimeout(() => cancel("timed_out"), automation.timeout_sec * 1000);

  const done = new Promise<RunOutcome>((resolve) => {
    child.on("error", (e) => { stderr += `\n[autoed] spawn error: ${e.message}\n`; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      outFile.end(); errFile.end();
      resolve({ exitCode: code, signal, timedOut, cancelled, stdout, stderr, warnings });
    });
  });
  if (child.pid) opts.onStarted(child.pid, cmd.argv);
  else { clearTimeout(timer); }

  const handle: LiveHandle = { child, cancel, onLine: (cb) => { listeners.add(cb); return () => listeners.delete(cb); } };
  return { handle, done, ctx };
}
