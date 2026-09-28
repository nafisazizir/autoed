import type { Automation, Event, Run } from "./types.ts";

/** Renders {{a.b.c}} variables. Objects are rendered as pretty JSON. Unknown variables render empty. */
export function renderPrompt(template: string, ctx: { run: Run; automation: Automation; event: Event | null; trigger?: { kind: string } | null }): string {
  let payload: unknown = null;
  if (ctx.event?.payload) { try { payload = JSON.parse(ctx.event.payload); } catch { payload = ctx.event.payload; } }
  const vars: Record<string, unknown> = {
    trigger: { kind: ctx.trigger?.kind ?? ctx.event?.kind ?? "manual" },
    event: { payload, occurred_at: ctx.event?.occurred_at ?? ctx.run.queued_at, id: ctx.event?.id ?? null, kind: ctx.event?.kind ?? "manual" },
    catchup: { missed_count: ctx.event?.missed_count ?? 0, is_catchup: (ctx.event?.missed_count ?? 0) > 0 },
    run: { id: ctx.run.id, short_id: ctx.run.id.slice(-6), attempt: ctx.run.attempt, working_dir: ctx.run.worktree_path ?? ctx.run.working_dir },
    automation: { name: ctx.automation.name, id: ctx.automation.id, metadata: safeJson(ctx.automation.metadata) },
    now: new Date().toISOString(),
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as any)[k] : undefined), vars);
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
  });
}

function safeJson(s: string | null): unknown { if (!s) return null; try { return JSON.parse(s); } catch { return s; } }
