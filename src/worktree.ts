import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCapture } from "./backends/discover.ts";

/** Creates a detached git worktree of `repo` at <root>/<runId>. Returns the path. */
export async function createWorktree(root: string, repo: string, runId: string): Promise<string> {
  const top = await runCapture(["git", "-C", repo, "rev-parse", "--show-toplevel"], { timeoutMs: 15000 });
  if (top.code !== 0) throw new Error(`isolate_worktree is on but ${repo} is not a git repository`);
  const path = join(root, runId);
  const r = await runCapture(["git", "-C", top.stdout.trim(), "worktree", "add", "--detach", path, "HEAD"], { timeoutMs: 60000 });
  if (r.code !== 0) throw new Error(`git worktree add failed: ${r.stderr.trim()}`);
  return path;
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
  if (!existsSync(path)) return;
  const r = await runCapture(["git", "-C", repo, "worktree", "remove", "--force", path], { timeoutMs: 60000 });
  if (r.code !== 0) { try { rmSync(path, { recursive: true, force: true }); } catch {} }
  await runCapture(["git", "-C", repo, "worktree", "prune"], { timeoutMs: 30000 });
}
