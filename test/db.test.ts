import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Db } from "../src/db.ts";

function withDb(fn: (db: Db, dir: string) => void) { const dir = mkdtempSync(join(tmpdir(), "autoed-test-")); const db = new Db(join(dir, "t.db")); try { fn(db, dir); } finally { db.close(); rmSync(dir, { recursive: true, force: true }); } }

describe("db", () => {
  test("creates automations with triggers and generates webhook secrets", () => withDb((db, dir) => {
    const a = db.createAutomation({ name: "n", backend: "claude", instructions: "hi", working_dir: dir, triggers: [{ kind: "webhook" }, { kind: "schedule", config: { cron: "@daily" } }] });
    const ts = db.listTriggers(a.id);
    expect(ts).toHaveLength(2);
    expect(JSON.parse(ts[0]!.config).secret).toHaveLength(32);
    expect(a.timeout_sec).toBe(3600); expect(a.catchup_policy).toBe("coalesce");
  }));
  test("validates backend and required fields", () => withDb((db, dir) => {
    expect(() => db.createAutomation({ name: "", backend: "claude", instructions: "", working_dir: dir })).toThrow(/name/);
    expect(() => db.createAutomation({ name: "x", backend: "nope" as any, instructions: "", working_dir: dir })).toThrow(/backend/);
    expect(() => db.createAutomation({ name: "x", backend: "devin", instructions: "", working_dir: dir, triggers: [{ kind: "schedule", config: {} }] })).toThrow(/cron/);
  }));
  test("updates keep existing trigger ids and secrets, drop removed ones", () => withDb((db, dir) => {
    const a = db.createAutomation({ name: "n", backend: "devin", instructions: "", working_dir: dir, triggers: [{ kind: "webhook" }, { kind: "schedule", config: { cron: "@hourly" } }] });
    const [hook, sched] = db.listTriggers(a.id);
    db.updateAutomation(a.id, { triggers: [{ id: hook!.id, kind: "webhook", config: JSON.parse(hook!.config) }] });
    const after = db.listTriggers(a.id);
    expect(after).toHaveLength(1); expect(after[0]!.id).toBe(hook!.id); expect(after[0]!.config).toBe(hook!.config);
    expect(db.getTrigger(sched!.id)).toBeNull();
  }));
  test("run lifecycle queries", () => withDb((db, dir) => {
    const a = db.createAutomation({ name: "n", backend: "claude", instructions: "", working_dir: dir });
    const r1 = db.createRun({ automation_id: a.id, event_id: null, backend: "claude", model: "sonnet", working_dir: dir, session_id: "s1" });
    db.updateRun(r1.id, { status: "running", started_at: "2026-01-01T00:00:00Z" });
    expect(db.countRuns(["running"], a.id)).toBe(1);
    expect(db.failOrphanedRuns("restart")).toBe(1);
    expect(db.getRun(r1.id)!.status).toBe("failed");
    db.updateRun(r1.id, { status: "succeeded", finished_at: "2026-01-01T00:01:00Z" });
    expect(db.lastSuccessfulSession(a.id)).toBe("s1");
    db.deleteAutomation(a.id);
    expect(db.getRun(r1.id)).toBeNull(); // cascades
  }));
});
