import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "../src/db.ts";
import { Scheduler, firesBetween, nextFire, validateCron } from "../src/scheduler.ts";

function tempDb() { const dir = mkdtempSync(join(tmpdir(), "autoed-test-")); return { db: new Db(join(dir, "t.db")), dir }; }

describe("cron helpers", () => {
  test("validates expressions and presets", () => {
    expect(validateCron("*/5 * * * *")).toBeNull();
    expect(validateCron("@weekdays")).toBeNull();
    expect(validateCron("not a cron")).not.toBeNull();
  });
  test("computes fires between two instants", () => {
    const fires = firesBetween({ cron: "*/15 * * * *", tz: "UTC" }, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T01:00:00Z"));
    expect(fires.map((d) => d.toISOString())).toEqual(["2026-01-01T00:15:00.000Z", "2026-01-01T00:30:00.000Z", "2026-01-01T00:45:00.000Z", "2026-01-01T01:00:00.000Z"]);
  });
  test("respects timezone", () => {
    const n = nextFire({ cron: "0 9 * * *", tz: "Australia/Sydney" }, new Date("2026-01-01T00:00:00Z"));
    expect(n?.toISOString()).toBe("2026-01-01T22:00:00.000Z"); // next 09:00 AEDT (UTC+11) is Jan 2
  });
});

describe("scheduler catch-up", () => {
  test("reports missed fires since last heartbeat and primes next_fire_at", () => {
    const { db, dir } = tempDb();
    try {
      const a = db.createAutomation({ name: "a", backend: "claude", instructions: "x", working_dir: dir, triggers: [{ kind: "schedule", config: { cron: "0 * * * *", tz: "UTC" } }] });
      db.setSetting("last_heartbeat_at", "2026-01-01T00:30:00Z");
      const s = new Scheduler(db, () => {});
      const now = new Date("2026-01-01T03:10:00Z");
      const reqs = s.startup(now);
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.fireTimes.map((d) => d.toISOString())).toEqual(["2026-01-01T01:00:00.000Z", "2026-01-01T02:00:00.000Z", "2026-01-01T03:00:00.000Z"]);
      expect(reqs[0]!.catchup).toBe(true);
      expect(db.listTriggers(a.id)[0]!.next_fire_at).toBe("2026-01-01T04:00:00.000Z");
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  test("no heartbeat means no catch-up on first boot", () => {
    const { db, dir } = tempDb();
    try {
      db.createAutomation({ name: "a", backend: "devin", instructions: "x", working_dir: dir, triggers: [{ kind: "schedule", config: { cron: "* * * * *" } }] });
      expect(new Scheduler(db, () => {}).startup(new Date())).toHaveLength(0);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  test("tick fires due triggers once and groups fires missed during sleep", () => {
    const { db, dir } = tempDb();
    try {
      const a = db.createAutomation({ name: "a", backend: "devin", instructions: "x", working_dir: dir, triggers: [{ kind: "schedule", config: { cron: "*/10 * * * *", tz: "UTC" } }] });
      const s = new Scheduler(db, () => {});
      s.startup(new Date("2026-01-01T00:00:00Z"));
      expect(s.tick(new Date("2026-01-01T00:05:00Z"))).toHaveLength(0);
      const due = s.tick(new Date("2026-01-01T00:10:30Z"));
      expect(due).toHaveLength(1); expect(due[0]!.fireTimes).toHaveLength(1); expect(due[0]!.catchup).toBe(false);
      expect(s.tick(new Date("2026-01-01T00:11:00Z"))).toHaveLength(0);
      const slept = s.tick(new Date("2026-01-01T00:45:00Z")); // 00:20, 00:30, 00:40
      expect(slept[0]!.fireTimes).toHaveLength(3); expect(slept[0]!.catchup).toBe(true);
      db.updateAutomation(a.id, { enabled: false });
      expect(s.tick(new Date("2026-01-01T01:00:00Z"))).toHaveLength(0);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
