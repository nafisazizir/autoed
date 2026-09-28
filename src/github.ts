import type { Engine } from "./engine.ts";
import type { GithubTriggerConfig, Trigger } from "./types.ts";
import { runCapture, whichSync } from "./backends/discover.ts";

/**
 * GitHub poller (v1.1): uses `gh api` with a per-trigger cursor so no inbound port is needed.
 * Supported events: issue, issue_comment, pull_request, pr_review, push, check_run.
 * Cursor = ISO timestamp of the newest item seen; each poll asks for items updated after it.
 */
export class GithubPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  constructor(private engine: Engine, private log: (m: string) => void) {}

  start() { this.timer = setInterval(() => void this.poll(), 60_000); void this.poll(); }
  stop() { if (this.timer) clearInterval(this.timer); }

  async poll() {
    if (this.busy) return; this.busy = true;
    try {
      const gh = whichSync("gh"); 
      const triggers = this.engine.db.listTriggers().filter((t) => t.kind === "github" && t.enabled);
      if (!triggers.length) return;
      if (!gh) { this.log("github triggers configured but `gh` is not installed"); return; }
      for (const t of triggers) {
        const a = this.engine.db.getAutomation(t.automation_id);
        if (!a?.enabled) continue;
        let cfg: GithubTriggerConfig; try { cfg = JSON.parse(t.config); } catch { continue; }
        if (!cfg.repo) continue;
        const state = safeJson(t.cursor) as { last_poll_at?: string; seen?: Record<string, string> } | null ?? {};
        const interval = (cfg.intervalSec ?? 300) * 1000;
        if (state.last_poll_at && Date.now() - new Date(state.last_poll_at).getTime() < interval) continue;
        try { await this.pollTrigger(gh, t, cfg, state); } catch (e) { this.log(`${a.name}: poll failed: ${(e as Error).message}`); }
      }
    } finally { this.busy = false; }
  }

  private async pollTrigger(gh: string, t: Trigger, cfg: GithubTriggerConfig, state: { last_poll_at?: string; seen?: Record<string, string> }) {
    const a = this.engine.db.getAutomation(t.automation_id)!;
    const seen = state.seen ?? {};
    const first = !state.last_poll_at;
    const since = state.last_poll_at ?? new Date().toISOString();
    const events = new Set(cfg.events?.length ? cfg.events : ["issue", "pull_request"]);
    const found: Array<{ key: string; updated: string; type: string; item: unknown }> = [];

    const api = async (path: string) => {
      const r = await runCapture([gh, "api", "--paginate", "-H", "Accept: application/vnd.github+json", path], { timeoutMs: 60000 });
      if (r.code !== 0) throw new Error(r.stderr.trim().split("\n")[0] || `gh api ${path} failed`);
      const txt = r.stdout.trim();
      // --paginate concatenates arrays; wrap defensively
      try { return JSON.parse(txt); } catch { return JSON.parse(`[${txt.replace(/\]\s*\[/g, ",")}]`); }
    };

    if (events.has("issue") || events.has("pull_request")) {
      const items = await api(`/repos/${cfg.repo}/issues?state=all&sort=updated&direction=desc&since=${encodeURIComponent(since)}&per_page=50`);
      for (const it of items) {
        const isPr = !!it.pull_request; const type = isPr ? "pull_request" : "issue";
        if (!events.has(type)) continue;
        found.push({ key: `${type}:${it.number}`, updated: it.updated_at, type, item: { number: it.number, title: it.title, state: it.state, html_url: it.html_url, user: it.user?.login, labels: (it.labels ?? []).map((l: any) => l.name), body: it.body, updated_at: it.updated_at } });
      }
    }
    if (events.has("issue_comment")) {
      const items = await api(`/repos/${cfg.repo}/issues/comments?sort=updated&direction=desc&since=${encodeURIComponent(since)}&per_page=50`);
      for (const c of items) found.push({ key: `issue_comment:${c.id}`, updated: c.updated_at, type: "issue_comment", item: { id: c.id, issue_url: c.issue_url, html_url: c.html_url, user: c.user?.login, body: c.body, updated_at: c.updated_at } });
    }
    if (events.has("pr_review")) {
      const prs = await api(`/repos/${cfg.repo}/pulls?state=open&sort=updated&direction=desc&per_page=20`);
      for (const pr of prs) {
        if (pr.updated_at < since) continue;
        const reviews = await api(`/repos/${cfg.repo}/pulls/${pr.number}/reviews?per_page=50`);
        for (const r of reviews) if (r.submitted_at && r.submitted_at > since) found.push({ key: `pr_review:${r.id}`, updated: r.submitted_at, type: "pr_review", item: { id: r.id, pr: pr.number, state: r.state, user: r.user?.login, body: r.body, html_url: r.html_url } });
      }
    }
    if (events.has("push")) {
      const commits = await api(`/repos/${cfg.repo}/commits?since=${encodeURIComponent(since)}&per_page=50`);
      for (const c of commits) found.push({ key: `push:${c.sha}`, updated: c.commit?.committer?.date ?? since, type: "push", item: { sha: c.sha, message: c.commit?.message, author: c.commit?.author?.name, html_url: c.html_url } });
    }
    if (events.has("check_run")) {
      const runs = await api(`/repos/${cfg.repo}/actions/runs?per_page=30&created=>=${encodeURIComponent(since.slice(0, 19))}`);
      for (const r of runs.workflow_runs ?? []) if (r.status === "completed" && r.updated_at > since) found.push({ key: `check_run:${r.id}`, updated: r.updated_at, type: "check_run", item: { id: r.id, name: r.name, conclusion: r.conclusion, head_branch: r.head_branch, html_url: r.html_url } });
    }

    const filter = cfg.filter ? new RegExp(cfg.filter, "i") : null;
    let fired = 0;
    for (const f of found.sort((x, y) => x.updated.localeCompare(y.updated))) {
      if (seen[f.key] === f.updated) continue;
      seen[f.key] = f.updated;
      if (first) continue; // establish the baseline without replaying history
      if (filter && !filter.test(JSON.stringify(f.item))) continue;
      this.engine.enqueueEvent(a, { trigger_id: t.id, kind: "github", payload: { repo: cfg.repo, event: f.type, ...(f.item as object) }, occurred_at: f.updated });
      fired++;
    }
    // keep the seen map bounded
    const keys = Object.keys(seen); if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete seen[k];
    this.engine.db.setTriggerCursor(t.id, JSON.stringify({ last_poll_at: new Date().toISOString(), seen }));
    if (fired) this.log(`${a.name}: ${fired} new ${cfg.repo} event(s)`);
  }
}

function safeJson(s: string | null) { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }
