import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { awakeCommand, holdAwake } from "../src/awake.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const caffeinatesFor = (pid: number) =>
  Bun.spawnSync(["/usr/bin/pgrep", "-f", `caffeinate -i -s -w ${pid}$`]).stdout.toString().trim().split("\n").filter(Boolean).map(Number);

describe("awakeCommand", () => {
  test("waits on the run's pid on macOS", () => {
    expect(awakeCommand(1234, "darwin")).toEqual(["/usr/bin/caffeinate", "-i", "-s", "-w", "1234"]);
  });
  test("is a no-op elsewhere or for an invalid pid", () => {
    expect(awakeCommand(1234, "linux")).toBeNull();
    expect(awakeCommand(0, "darwin")).toBeNull();
    expect(awakeCommand(-5, "darwin")).toBeNull();
  });
  test("is on by default", () => { expect(DEFAULT_CONFIG.preventSleep).toBe(true); });
});

describe.skipIf(process.platform !== "darwin" || !existsSync("/usr/bin/caffeinate"))("holdAwake (macOS)", () => {
  test("holds an assertion while the process runs and drops it when it exits", async () => {
    const target = Bun.spawn(["/bin/sleep", "2"]);
    holdAwake(target.pid);
    await Bun.sleep(300);
    const holders = caffeinatesFor(target.pid);
    expect(holders.length).toBe(1);
    await target.exited;
    await Bun.sleep(1500);
    expect(alive(holders[0]!)).toBe(false);
  });
  test("release stops the assertion early", async () => {
    const target = Bun.spawn(["/bin/sleep", "5"]);
    const release = holdAwake(target.pid);
    await Bun.sleep(300);
    const [holder] = caffeinatesFor(target.pid);
    expect(holder).toBeDefined();
    release();
    await Bun.sleep(300);
    expect(alive(holder!)).toBe(false);
    target.kill();
  });
});
