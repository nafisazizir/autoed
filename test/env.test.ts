import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const run = (env: Record<string, string>) => {
  const r = Bun.spawnSync([process.execPath, "-e", `import { scrubbedEnv } from ${JSON.stringify(join(import.meta.dir, "../src/backends/discover.ts"))}; console.log(JSON.stringify(scrubbedEnv()))`], { env, stdout: "pipe" });
  return JSON.parse(r.stdout.toString());
};

describe("scrubbedEnv", () => {
  test("fills USER/LOGNAME from the OS when the parent (e.g. launchd) has none", () => {
    const expected = Bun.spawnSync(["/usr/bin/id", "-un"]).stdout.toString().trim();
    const env = run({ HOME: process.env.HOME!, PATH: "/usr/bin:/bin" });
    expect(env.USER).toBe(expected); expect(env.LOGNAME).toBe(expected); expect(env.USER).not.toBe("unknown");
  });
  test("keeps an inherited USER", () => {
    expect(run({ HOME: process.env.HOME!, PATH: "/usr/bin:/bin", USER: "someone" }).USER).toBe("someone");
  });
});
