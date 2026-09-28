/**
 * Best-effort detection of subscription usage-limit messages.
 * Exact wording is an open question in the spec (§16.6); patterns are deliberately broad
 * and every match is recorded in the run's error so wording can be refined later.
 */
export function detectRateLimit(backend: "claude" | "devin", text: string): { retryAt?: Date; message: string } | null {
  if (!text) return null;
  const patterns = [
    /usage limit/i, /rate[ -]?limit/i, /limit (has been |was )?reached/i, /out of (usage|credits|quota)/i,
    /too many requests/i, /\b429\b/, /quota (exceeded|exhausted)/i, /overloaded/i, /try again (later|in)/i,
    /you('ve| have) hit your/i, /resets? (at|in) /i,
  ];
  const line = text.split("\n").find((l) => patterns.some((p) => p.test(l)));
  if (!line) return null;
  return { retryAt: parseResetTime(line), message: `${backend}: ${line.trim().slice(0, 300)}` };
}

/** Parses "resets at 3pm", "resets 9:30am (Australia/Sydney)", "reset in 2 hours", "retry in 45 minutes", ISO timestamps. */
export function parseResetTime(line: string, now = new Date()): Date | undefined {
  const iso = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/);
  if (iso) { const d = new Date(iso[0]); if (!isNaN(d.getTime()) && d > now) return d; }
  const rel = line.match(/(?:in|after)\s+(\d+)\s*(second|sec|minute|min|hour|hr|h|m|s)s?\b/i);
  if (rel) {
    const n = Number(rel[1]); const u = rel[2]!.toLowerCase();
    const ms = u.startsWith("h") ? n * 3600e3 : u.startsWith("m") ? n * 60e3 : n * 1e3;
    return new Date(now.getTime() + ms);
  }
  const clock = line.match(/(?:reset(?:s|ting)?|available|until|at)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (clock) {
    let h = Number(clock[1]); const m = clock[2] ? Number(clock[2]) : 0; const ap = clock[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) return undefined;
    const d = new Date(now); d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  return undefined;
}
