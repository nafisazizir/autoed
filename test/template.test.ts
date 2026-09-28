import { describe, expect, test } from "bun:test";
import { renderPrompt } from "../src/template.ts";
import { detectRateLimit, parseResetTime } from "../src/backends/ratelimit.ts";
import { scrubbedEnv } from "../src/backends/discover.ts";

const run: any = { id: "0123456789abcdef", queued_at: "2026-01-01T00:00:00Z", attempt: 1, working_dir: "/w", worktree_path: null };
const automation: any = { id: "a1", name: "Nightly", metadata: '{"team":"x"}' };

describe("prompt template", () => {
  test("renders scalar, object and missing variables", () => {
    const event: any = { id: "e1", kind: "webhook", occurred_at: "2026-01-01T01:00:00Z", payload: '{"n":1}', missed_count: 0 };
    const out = renderPrompt("{{automation.name}} {{run.short_id}} {{trigger.kind}} {{event.payload}} [{{nope.x}}] {{automation.metadata}}", { run, automation, event });
    expect(out).toBe('Nightly abcdef webhook {\n  "n": 1\n} [] {\n  "team": "x"\n}');
  });
  test("manual run without event", () => {
    expect(renderPrompt("{{trigger.kind}}/{{catchup.missed_count}}", { run, automation, event: null })).toBe("manual/0");
  });
});

describe("rate limit detection", () => {
  test("detects usage limit lines with reset time", () => {
    const now = new Date("2026-01-01T10:00:00");
    const r = detectRateLimit("claude", "some output\nYou've hit your usage limit. Resets at 3pm\n");
    expect(r?.message).toContain("usage limit");
    expect(parseResetTime("resets at 3pm", now)?.getHours()).toBe(15);
    expect(parseResetTime("try again in 45 minutes", now)?.toISOString()).toBe(new Date(now.getTime() + 45 * 60e3).toISOString());
    expect(parseResetTime("resets 9:30am", now)?.getDate()).toBe(2); // tomorrow
  });
  test("ignores ordinary output", () => { expect(detectRateLimit("devin", "all good\nrefactored 3 files")).toBeNull(); });
});

describe("environment scrubbing", () => {
  test("never forwards API keys or the nested-session marker", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test"; process.env.CLAUDECODE = "1";
    const env = scrubbedEnv();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined(); expect(env.CLAUDECODE).toBeUndefined();
    expect(env.PATH).toContain("/usr/bin"); expect(env.HOME).toBeTruthy();
    delete process.env.ANTHROPIC_API_KEY;
  });
});
