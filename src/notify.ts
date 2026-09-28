import type { Config } from "./config.ts";
import type { Automation, NotifyConfig, Run } from "./types.ts";
import { runCapture, whichSync } from "./backends/discover.ts";

export interface Notification {
  automation: Automation;
  run: Run;
  status: string;
  title: string;
  body: string;
  webUrl: string;
}

export class Notifier {
  constructor(private cfg: Config, private log: (m: string) => void) {}

  async notify(n: Notification): Promise<void> {
    const local: NotifyConfig = n.automation.notify ? safeParse(n.automation.notify) : {};
    const macos = local.macos ?? this.cfg.notifications.macos;
    const webhook = local.webhook ?? this.cfg.notifications.webhook;
    await Promise.allSettled([
      macos ? this.macos(n) : Promise.resolve(),
      webhook?.url ? this.webhook(webhook.url, webhook.template ?? "generic", n) : Promise.resolve(),
    ]);
  }

  private async macos(n: Notification) {
    if (process.platform !== "darwin") return;
    const tn = whichSync("terminal-notifier");
    try {
      if (tn) {
        await runCapture([tn, "-title", n.title, "-message", n.body, "-open", n.webUrl, "-group", `autoed-${n.run.id}`], { timeoutMs: 10000 });
      } else {
        const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await runCapture(["osascript", "-e", `display notification "${esc(n.body)}" with title "${esc(n.title)}" subtitle "autoed"`], { timeoutMs: 10000 });
      }
    } catch (e) { this.log(`macos notification failed: ${(e as Error).message}`); }
  }

  private async webhook(url: string, template: string, n: Notification) {
    const payload = {
      automation: { id: n.automation.id, name: n.automation.name },
      run: { id: n.run.id, status: n.run.status, backend: n.run.backend, model: n.run.model, session_id: n.run.session_id, started_at: n.run.started_at, finished_at: n.run.finished_at, error: n.run.error },
      status: n.status, session_id: n.run.session_id, summary: n.run.summary, desktop_url: n.webUrl,
    };
    const text = `${n.title}\n${n.body}\n${n.webUrl}`;
    let body: string; let headers: Record<string, string> = { "content-type": "application/json" };
    switch (template) {
      case "slack": body = JSON.stringify({ text, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${n.title}*\n${n.body}\n<${n.webUrl}|Open run>` } }] }); break;
      case "telegram": body = JSON.stringify({ text, parse_mode: "HTML" }); break;
      case "ntfy": headers = { "content-type": "text/plain", Title: n.title, Click: n.webUrl, Tags: n.status === "succeeded" ? "white_check_mark" : "warning" }; body = n.body; break;
      default: body = JSON.stringify(payload);
    }
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
      if (!res.ok) this.log(`webhook notification ${url} responded ${res.status}`);
    } catch (e) { this.log(`webhook notification failed: ${(e as Error).message}`); }
  }
}

function safeParse(s: string): NotifyConfig { try { return JSON.parse(s); } catch { return {}; } }
