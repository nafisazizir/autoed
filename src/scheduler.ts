import { Cron } from "croner";
import type { Db } from "./db.ts";
import type { Automation, ScheduleTriggerConfig, Trigger } from "./types.ts";

export const CRON_PRESETS: Record<string, string> = {
  "@hourly": "0 * * * *", "@daily": "0 9 * * *", "@weekdays": "0 9 * * 1-5", "@weekly": "0 9 * * 1", "@every15m": "*/15 * * * *",
};

export function parseCron(expr: string, tz?: string): Cron {
  const e = CRON_PRESETS[expr.trim()] ?? expr.trim();
  return new Cron(e, { timezone: tz || undefined, paused: true, catch: false });
}

export function validateCron(expr: string, tz?: string): string | null {
  try { const c = parseCron(expr, tz); c.stop(); return null; } catch (e) { return (e as Error).message; }
}

export function nextFire(cfg: ScheduleTriggerConfig, from: Date): Date | null {
  const c = parseCron(cfg.cron, cfg.tz);
  try { return c.nextRun(from); } finally { c.stop(); }
}

/** All fire times strictly after `from` and at or before `to`, capped. */
export function firesBetween(cfg: ScheduleTriggerConfig, from: Date, to: Date, cap = 10000): Date[] {
  const c = parseCron(cfg.cron, cfg.tz);
  try {
    const out: Date[] = [];
    let cur: Date | null = c.nextRun(from);
    while (cur && cur.getTime() <= to.getTime() && out.length < cap) { out.push(cur); cur = c.nextRun(cur); }
    return out;
  } finally { c.stop(); }
}

export interface FireRequest { trigger: Trigger; automation: Automation; fireTimes: Date[]; catchup: boolean }

/**
 * Scheduler: keeps next_fire_at per schedule trigger, fires due triggers, and reconstructs missed
 * fires after sleep / power-off using the last heartbeat. Pure over the db; the engine turns
 * FireRequests into events and runs.
 */
export class Scheduler {
  constructor(private db: Db, private log: (m: string) => void) {}

  /** On engine start: compute missed fires since last heartbeat and prime next_fire_at. */
  startup(now = new Date()): FireRequest[] {
    const hb = this.db.getSetting("last_heartbeat_at");
    const since = hb ? new Date(hb) : null;
    const out: FireRequest[] = [];
    for (const { trigger, automation, cfg } of this.scheduleTriggers()) {
      if (since && automation.enabled) {
        const missed = firesBetween(cfg, since, now);
        if (missed.length) out.push({ trigger, automation, fireTimes: missed, catchup: true });
      }
      this.db.setTriggerNextFire(trigger.id, nextFire(cfg, now)?.toISOString() ?? null);
    }
    if (since) this.log(`startup: last heartbeat ${since.toISOString()}, ${out.reduce((n, f) => n + f.fireTimes.length, 0)} missed fire(s) across ${out.length} trigger(s)`);
    return out;
  }

  /** Called every tick. Fires triggers whose next_fire_at has passed. Multiple passed fires (sleep) are grouped. */
  tick(now = new Date()): FireRequest[] {
    const out: FireRequest[] = [];
    for (const { trigger, automation, cfg } of this.scheduleTriggers()) {
      if (!trigger.next_fire_at) { this.db.setTriggerNextFire(trigger.id, nextFire(cfg, now)?.toISOString() ?? null); continue; }
      const next = new Date(trigger.next_fire_at);
      if (next.getTime() > now.getTime()) continue;
      // Everything from next_fire_at (inclusive) to now.
      const fires = [next, ...firesBetween(cfg, next, now)];
      const after = nextFire(cfg, now);
      this.db.setTriggerNextFire(trigger.id, after?.toISOString() ?? null);
      if (!automation.enabled) continue;
      out.push({ trigger, automation, fireTimes: fires, catchup: fires.length > 1 });
    }
    return out;
  }

  heartbeat(now = new Date()) { this.db.setSetting("last_heartbeat_at", now.toISOString()); }

  private scheduleTriggers() {
    const autos = new Map(this.db.listAutomations().map((a) => [a.id, a]));
    const out: Array<{ trigger: Trigger; automation: Automation; cfg: ScheduleTriggerConfig }> = [];
    for (const t of this.db.listTriggers()) {
      if (t.kind !== "schedule" || !t.enabled) continue;
      const a = autos.get(t.automation_id); if (!a) continue;
      let cfg: ScheduleTriggerConfig;
      try { cfg = JSON.parse(t.config); if (validateCron(cfg.cron, cfg.tz)) throw new Error("bad cron"); } catch { this.log(`trigger ${t.id} has invalid schedule config`); continue; }
      out.push({ trigger: t, automation: a, cfg });
    }
    return out;
  }
}
