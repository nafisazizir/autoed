import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const CAFFEINATE = "/usr/bin/caffeinate";

/** caffeinate argv that keeps the host from idle/system sleep until `pid` exits; null where unsupported. */
export function awakeCommand(pid: number, platform: string = process.platform): string[] | null {
  if (platform !== "darwin" || !Number.isInteger(pid) || pid <= 0) return null;
  // -i: no idle sleep; -s: no system sleep while on AC power; -w: release when the run's process exits.
  return [CAFFEINATE, "-i", "-s", "-w", String(pid)];
}

/**
 * Holds a power assertion for the lifetime of a run. A run that starts on a maintenance wake can
 * otherwise be frozen by sleep and hit its wall-clock timeout without doing any work.
 * Returns a release function (also safe to call after the process has exited on its own).
 */
export function holdAwake(pid: number): () => void {
  const argv = awakeCommand(pid);
  if (!argv || !existsSync(argv[0]!)) return () => {};
  try {
    const c = spawn(argv[0]!, argv.slice(1), { stdio: "ignore" });
    c.on("error", () => {});
    c.unref();
    return () => { if (c.exitCode === null && c.signalCode === null) { try { c.kill("SIGTERM"); } catch {} } };
  } catch { return () => {}; }
}
