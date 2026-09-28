import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeBackend } from "../src/backends/claude.ts";
import { DevinBackend } from "../src/backends/devin.ts";
import type { BuildContext } from "../src/backends/types.ts";
import type { Run } from "../src/types.ts";

const run = { id: "r000000000000000000000001", session_id: "s1", started_at: null, working_dir: "/tmp", worktree_path: null } as unknown as Run;
const claude = new ClaudeBackend({ claude: {}, devin: {} } as any);
const devin = new DevinBackend({ claude: {}, devin: {} } as any, tmpdir());
const out = (o: object) => JSON.stringify({ type: "result", session_id: "s1", ...o });
function withCtx<T>(fn: (ctx: BuildContext) => Promise<T>) { const dir = mkdtempSync(join(tmpdir(), "autoed-test-")); return fn({ runDir: dir, promptPath: join(dir, "prompt.md"), resumeSessionId: null, warn: () => {} }).finally(() => rmSync(dir, { recursive: true, force: true })); }

describe("claude parseResult rate-limit detection", () => {
  test("successful result mentioning rate limits is ok", async () => {
    const r = await claude.parseResult(run, out({ is_error: false, result: "The site returned HTTP 429 (rate limit), try again later. Resets at 3pm." }), "", 0);
    expect(r.ok).toBe(true); expect(r.rateLimited).toBeUndefined();
  });
  test("is_error usage-limit result is rate limited", async () => {
    const r = await claude.parseResult(run, out({ is_error: true, result: "Claude AI usage limit reached|1767225600" }), "", 1);
    expect(r.ok).toBe(false); expect(r.rateLimited?.message).toMatch(/usage limit/);
  });
  test("stderr rate limit on non-zero exit without JSON", async () => {
    const r = await claude.parseResult(run, "", "Error: 429 Too Many Requests", 1);
    expect(r.rateLimited).toBeDefined();
  });
  test("ordinary failure is not rate limited", async () => {
    const r = await claude.parseResult(run, out({ is_error: true, result: "tool crashed" }), "", 1);
    expect(r.ok).toBe(false); expect(r.rateLimited).toBeUndefined(); expect(r.error).toBe("tool crashed");
  });
});

describe("devin parseResult rate-limit detection", () => {
  test("successful stdout mentioning 429 is ok", () => withCtx(async (ctx) => {
    const r = await devin.parseResult(run, "Fetched page; server said 429 too many requests, skipped it.", "", 0, ctx);
    expect(r.ok).toBe(true); expect(r.rateLimited).toBeUndefined();
  }));
  test("failed run with usage limit in stdout is rate limited", () => withCtx(async (ctx) => {
    const r = await devin.parseResult(run, "Error: you have hit your usage limit, resets in 2 hours", "", 1, ctx);
    expect(r.rateLimited?.retryAt).toBeInstanceOf(Date);
  }));
});
