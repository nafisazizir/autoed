import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeBackend } from "../src/backends/claude.ts";
import { DevinBackend } from "../src/backends/devin.ts";
import type { BuildContext } from "../src/backends/types.ts";
import type { Automation, Run } from "../src/types.ts";

const cfg = { claude: { binary: "/bin/echo" }, devin: { binary: "/bin/echo" } } as any;
const run = { id: "r000000000000000000000001", session_id: "s1", started_at: null, working_dir: "/tmp", worktree_path: null, model: null } as unknown as Run;
const auto = (o: Partial<Automation> = {}) => ({ name: "t", backend: "claude", model: "sonnet", agent_mode: null, agent_profile: null, mcp_config: null, json_schema: null, add_dirs: null, sandbox: 0, chrome: 0, allowed_tools: null, disallowed_tools: null, ...o }) as Automation;
async function build(backend: ClaudeBackend | DevinBackend, a: Automation) {
  const dir = mkdtempSync(join(tmpdir(), "autoed-test-")); const warnings: string[] = [];
  const ctx: BuildContext = { runDir: dir, promptPath: join(dir, "prompt.md"), resumeSessionId: null, warn: (m) => warnings.push(m) };
  try { return { argv: (await backend.buildCommand(run, a, "hi", ctx)).argv, warnings }; } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("claude buildCommand options", () => {
  const claude = new ClaudeBackend(cfg);
  test("no chrome/tool flags by default", async () => {
    const { argv } = await build(claude, auto());
    expect(argv).not.toContain("--chrome"); expect(argv).not.toContain("--allowedTools"); expect(argv).not.toContain("--disallowedTools");
  });
  test("chrome, allowed_tools and disallowed_tools map to CLI flags", async () => {
    const { argv } = await build(claude, auto({ chrome: 1, allowed_tools: JSON.stringify(["Read", "Bash(git log:*)"]), disallowed_tools: JSON.stringify(["Bash(gh pr merge:*)"]) }));
    expect(argv).toContain("--chrome");
    const i = argv.indexOf("--allowedTools"); expect(argv.slice(i + 1, i + 3)).toEqual(["Read", "Bash(git log:*)"]);
    const j = argv.indexOf("--disallowedTools"); expect(argv[j + 1]).toBe("Bash(gh pr merge:*)"); expect(argv[j + 2]).toMatch(/^--/);
  });
});

describe("devin buildCommand ignores claude-only options", () => {
  test("warns and does not pass them", async () => {
    const { argv, warnings } = await build(new DevinBackend(cfg, tmpdir()), auto({ backend: "devin", chrome: 1, disallowed_tools: JSON.stringify(["Edit"]) }));
    expect(argv).not.toContain("--chrome"); expect(argv.join(" ")).not.toContain("Edit");
    expect(warnings.join("\n")).toMatch(/chrome is Claude-only/); expect(warnings.join("\n")).toMatch(/disallowed_tools is Claude-only/);
  });
});
