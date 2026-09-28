import { useEffect, useMemo, useState } from "react";
import { get, post, put } from "../api";
import { nav, useToast } from "../App";

type Trigger = { id?: string; kind: "schedule" | "webhook" | "github" | "manual"; config: any; enabled?: boolean };

const EMPTY = {
  name: "", enabled: true, backend: "devin", model: "", agent_mode: "", agent_profile: "", instructions: "", working_dir: "",
  isolate_worktree: false, continue_session: false, mcp_config: "", timeout_sec: 3600, max_concurrent: 1, rate_limit_count: "", rate_limit_window_sec: "",
  catchup_policy: "coalesce", notify_macos: true, notify_webhook_url: "", notify_webhook_template: "generic", metadata: "", json_schema: "", add_dirs: "", sandbox: false,
};

export function AutomationForm({ id }: { id?: string }) {
  const toast = useToast();
  const [f, setF] = useState<any>(EMPTY);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [backends, setBackends] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cronInfo, setCronInfo] = useState<Record<number, { ok: boolean; error?: string; next?: string[] }>>({});
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  useEffect(() => {
    get("/api/backends").then((b) => setBackends(b.backends)).catch((e) => toast(e.message, true));
    if (id) get(`/api/automations/${id}`).then((a) => {
      const notify = a.notify ? JSON.parse(a.notify) : {};
      setF({ ...EMPTY, ...a, model: a.model ?? "", agent_mode: a.agent_mode ?? "", agent_profile: a.agent_profile ?? "", mcp_config: a.mcp_config ?? "", rate_limit_count: a.rate_limit_count ?? "", rate_limit_window_sec: a.rate_limit_window_sec ?? "",
        notify_macos: notify.macos ?? true, notify_webhook_url: notify.webhook?.url ?? "", notify_webhook_template: notify.webhook?.template ?? "generic", metadata: a.metadata ? JSON.stringify(JSON.parse(a.metadata), null, 2) : "", json_schema: a.json_schema ?? "", add_dirs: a.add_dirs ? JSON.parse(a.add_dirs).join("\n") : "", enabled: !!a.enabled, isolate_worktree: !!a.isolate_worktree, continue_session: !!a.continue_session, sandbox: !!a.sandbox });
      setTriggers(a.triggers.map((t: any) => ({ id: t.id, kind: t.kind, config: t.config ?? {}, enabled: !!t.enabled })));
    }).catch((e) => toast(e.message, true));
  }, [id]);

  const be = useMemo(() => backends.find((b) => b.id === f.backend), [backends, f.backend]);
  const selectedModel = be?.models.find((m: any) => m.id === (f.model || be.default_model));
  const mode = be?.agent_modes.find((m: any) => m.id === (f.agent_mode || be.default_agent_mode));

  const checkCron = async (i: number, cron: string, tz: string) => {
    if (!cron) return setCronInfo((s) => ({ ...s, [i]: { ok: false, error: "required" } }));
    const r = await post("/api/validate/cron", { cron, tz }).catch((e) => ({ ok: false, error: e.message }));
    setCronInfo((s) => ({ ...s, [i]: r }));
  };
  const updTrigger = (i: number, patch: Partial<Trigger> | { config: any }) => setTriggers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch, config: { ...t.config, ...(patch as any).config } } : t)));
  const addTrigger = (kind: Trigger["kind"]) => setTriggers((ts) => [...ts, { kind, config: kind === "schedule" ? { cron: "0 9 * * 1-5", tz: Intl.DateTimeFormat().resolvedOptions().timeZone } : kind === "github" ? { repo: "", events: ["issue", "pull_request"], intervalSec: 300 } : {}, enabled: true }]);

  const body = () => ({
    name: f.name, enabled: f.enabled, backend: f.backend, model: f.model || null, agent_mode: f.agent_mode || null, agent_profile: f.agent_profile || null,
    instructions: f.instructions, working_dir: f.working_dir, isolate_worktree: f.isolate_worktree, continue_session: f.continue_session,
    mcp_config: f.mcp_config || null, timeout_sec: Number(f.timeout_sec), max_concurrent: Number(f.max_concurrent),
    rate_limit_count: f.rate_limit_count ? Number(f.rate_limit_count) : null, rate_limit_window_sec: f.rate_limit_window_sec ? Number(f.rate_limit_window_sec) : null,
    catchup_policy: f.catchup_policy, notify: { macos: f.notify_macos, ...(f.notify_webhook_url ? { webhook: { url: f.notify_webhook_url, template: f.notify_webhook_template } } : {}) },
    metadata: f.metadata ? JSON.parse(f.metadata) : null, json_schema: f.json_schema || null, add_dirs: f.add_dirs.split("\n").map((s: string) => s.trim()).filter(Boolean), sandbox: f.sandbox,
    triggers: triggers.filter((t) => t.kind !== "manual"),
  });
  const save = async () => {
    setSaving(true);
    try {
      const b = body();
      const a = id ? await put(`/api/automations/${id}`, b) : await post("/api/automations", b);
      toast(id ? "Saved" : "Created"); nav(id ? "/" : `/automations/${a.id}`);
    } catch (e: any) { toast(e.message, true); } finally { setSaving(false); }
  };
  const doPreview = async () => { if (!id) return toast("Save first to preview the rendered prompt"); const r = await post(`/api/automations/${id}/preview`); setPreview(r.prompt); };
  const runNow = async () => { if (!id) return; const r = await post(`/api/automations/${id}/run`); nav(`/runs/${r.id}`); };

  return <>
    <div className="page-head"><div><h1>{id ? "Edit automation" : "New automation"}</h1><div className="sub">Same shape as Devin's automation form: name, triggers, agent definition, limits.</div></div>
      <div className="actions">{id && <button className="btn" onClick={runNow}>▶ Run now</button>}<button className="btn" onClick={() => nav("/")}>Cancel</button><button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button></div></div>

    <div className="card"><h2>Name</h2>
      <div className="row"><label className="f"><span><b>Name</b></span><input type="text" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nightly dependency check" /></label>
        <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled</label></div>
    </div>

    <div className="card"><h2>Triggers <small>manual "Run now" is always available</small></h2>
      {triggers.map((t, i) => <div className="trigger" key={i}>
        <div className="head"><span>{{ schedule: "⏱ Schedule", webhook: "⚡ Webhook", github: "GitHub (polled)", manual: "Manual" }[t.kind]}</span>
          <div className="actions"><label className="check"><input type="checkbox" checked={t.enabled !== false} onChange={(e) => updTrigger(i, { enabled: e.target.checked })} /> enabled</label><button className="btn sm danger" onClick={() => setTriggers((ts) => ts.filter((_, j) => j !== i))}>Remove</button></div></div>
        {t.kind === "schedule" && <>
          <div className="row"><label className="f"><span><b>Cron</b> (5 fields, or @hourly @daily @weekdays @weekly @every15m)</span><input type="text" value={t.config.cron ?? ""} onChange={(e) => { updTrigger(i, { config: { cron: e.target.value } }); checkCron(i, e.target.value, t.config.tz); }} onBlur={() => checkCron(i, t.config.cron, t.config.tz)} /></label>
            <label className="f"><span><b>Timezone</b></span><input type="text" value={t.config.tz ?? ""} onChange={(e) => updTrigger(i, { config: { tz: e.target.value } })} placeholder="Australia/Sydney" /></label></div>
          {cronInfo[i] && (cronInfo[i]!.ok ? <div className="hint">Next: {cronInfo[i]!.next?.slice(0, 3).map((d) => new Date(d).toLocaleString()).join(" · ")}</div> : <div className="err">{cronInfo[i]!.error}</div>)}
        </>}
        {t.kind === "webhook" && <>
          {t.id ? <div className="kv"><dt>URL</dt><dd className="mono">POST {location.origin}/hooks/{t.id}</dd><dt>Secret</dt><dd className="mono">{t.config.secret}</dd><dt>Auth</dt><dd className="hint">Header <code>X-Autoed-Secret: &lt;secret&gt;</code>, or HMAC-SHA256 of the body in <code>X-Autoed-Signature: sha256=…</code> (GitHub's <code>X-Hub-Signature-256</code> also works). Body ≤ 1 MB, available as <code>{"{{event.payload}}"}</code>.</dd></div>
            : <div className="hint">A secret and URL are generated when you save.</div>}
        </>}
        {t.kind === "github" && <>
          <div className="row-3"><label className="f"><span><b>Repository</b> owner/name</span><input type="text" value={t.config.repo ?? ""} onChange={(e) => updTrigger(i, { config: { repo: e.target.value } })} placeholder="acme/widgets" /></label>
            <label className="f"><span><b>Events</b></span><select multiple value={t.config.events ?? []} onChange={(e) => updTrigger(i, { config: { events: [...e.target.selectedOptions].map((o) => o.value) } })} style={{ height: 110 }}>{["issue", "issue_comment", "pull_request", "pr_review", "push", "check_run"].map((ev) => <option key={ev} value={ev}>{ev}</option>)}</select></label>
            <div><label className="f"><span><b>Poll every (seconds)</b></span><input type="number" value={t.config.intervalSec ?? 300} onChange={(e) => updTrigger(i, { config: { intervalSec: Number(e.target.value) } })} /></label>
              <label className="f" style={{ marginTop: 10 }}><span><b>Filter</b> (regex over the event JSON, optional)</span><input type="text" value={t.config.filter ?? ""} onChange={(e) => updTrigger(i, { config: { filter: e.target.value } })} placeholder="label.*needs-triage" /></label></div></div>
          <div className="hint">Polled with <code>gh api</code> using a cursor. Requires <code>gh auth login</code> on this Mac. No inbound port needed.</div>
        </>}
      </div>)}
      <div className="actions"><button className="btn sm" onClick={() => addTrigger("schedule")}>+ Schedule</button><button className="btn sm" onClick={() => addTrigger("webhook")}>+ Webhook</button><button className="btn sm" onClick={() => addTrigger("github")}>+ GitHub</button></div>
    </div>

    <div className="card"><h2>Agent definition</h2>
      <div className="form">
        <div className="row-3">
          <label className="f"><span><b>Backend</b></span><select value={f.backend} onChange={(e) => { set("backend", e.target.value); set("model", ""); set("agent_mode", ""); }}>{backends.map((b) => <option key={b.id} value={b.id} disabled={!b.detection.ok}>{b.label}{b.detection.ok ? "" : " (not available)"}</option>)}</select>
            {be && <span className="hint">{be.detection.binary} · {be.detection.version}{be.detection.loggedIn === false && <span className="err"> · not logged in</span>}</span>}</label>
          <label className="f"><span><b>Model</b></span><select value={f.model} onChange={(e) => set("model", e.target.value)}><option value="">Default ({be?.default_model})</option>{be?.models.map((m: any) => <option key={m.id} value={m.id}>{m.label}{m.free ? " · free" : m.note ? ` · ${m.note}` : ""}</option>)}</select>
            {selectedModel && <span className={"chip " + (selectedModel.free ? "free" : "paid")}>{selectedModel.free ? "Free tier / subscription" : `Paid: ${selectedModel.note}`}</span>}
            {f.backend === "claude" && <input type="text" value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="or type a model id" style={{ marginTop: 6 }} />}</label>
          <label className="f"><span><b>Agent mode</b> (permissions)</span><select value={f.agent_mode} onChange={(e) => set("agent_mode", e.target.value)}><option value="">Default ({be?.default_agent_mode})</option>{be?.agent_modes.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            {mode?.dangerous && <span className="warn">⚠ This mode skips all permission prompts. The agent can run any command in the working directory and beyond.</span>}</label>
        </div>
        <label className="f"><span><b>Instructions</b> · variables: <code>{"{{trigger.kind}} {{event.payload}} {{event.occurred_at}} {{catchup.missed_count}} {{run.id}} {{automation.name}}"}</code></span>
          <textarea value={f.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder={"Check open dependabot PRs. For each one that passes CI, review the diff and merge it if safe.\n\nTrigger: {{trigger.kind}}\nEvent: {{event.payload}}"} style={{ minHeight: 180 }} /></label>
        <div className="row"><label className="f"><span><b>Working directory</b></span><input type="text" value={f.working_dir} onChange={(e) => set("working_dir", e.target.value)} placeholder="~/Projects/widgets" /></label>
          {f.backend === "claude" ? <label className="f"><span><b>Agent profile</b> (<code>claude --agent</code>, optional)</span><input type="text" value={f.agent_profile} onChange={(e) => set("agent_profile", e.target.value)} /></label> : <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked={f.sandbox} onChange={(e) => set("sandbox", e.target.checked)} /> Sandbox exec (Devin <code>--sandbox</code>)</label>}</div>
        {f.backend === "claude" && <label className="f"><span><b>MCP servers</b> (JSON passed to <code>--mcp-config</code>, optional)</span><textarea value={f.mcp_config} onChange={(e) => set("mcp_config", e.target.value)} placeholder='{ "mcpServers": { } }' style={{ minHeight: 70 }} /></label>}
      </div>
    </div>

    <div className="card"><details><summary>Advanced: isolation, limits, catch-up, notifications, metadata</summary>
      <div className="form">
        <div className="row">
          <label className="check"><input type="checkbox" checked={f.isolate_worktree} onChange={(e) => set("isolate_worktree", e.target.checked)} /> Isolated git worktree per run <small>(~/.autoed/worktrees/&lt;run&gt;, removed after the run)</small></label>
          <label className="check"><input type="checkbox" checked={f.continue_session} onChange={(e) => set("continue_session", e.target.checked)} /> Continue previous session <small>(<code>--resume</code> last successful run)</small></label>
        </div>
        <div className="row-3">
          <label className="f"><span><b>Timeout</b> seconds</span><input type="number" value={f.timeout_sec} onChange={(e) => set("timeout_sec", e.target.value)} /></label>
          <label className="f"><span><b>Max concurrent</b> runs of this automation</span><input type="number" value={f.max_concurrent} onChange={(e) => set("max_concurrent", e.target.value)} /></label>
          <label className="f"><span><b>Catch-up policy</b> after sleep / power-off</span><select value={f.catchup_policy} onChange={(e) => set("catchup_policy", e.target.value)}><option value="coalesce">Coalesce missed fires into one run</option><option value="replay">Replay every missed fire</option><option value="skip">Skip missed fires</option></select></label>
        </div>
        <div className="row"><label className="f"><span><b>Rate limit</b> max runs</span><input type="number" value={f.rate_limit_count} onChange={(e) => set("rate_limit_count", e.target.value)} placeholder="e.g. 50" /></label>
          <label className="f"><span><b>per window</b> seconds</span><input type="number" value={f.rate_limit_window_sec} onChange={(e) => set("rate_limit_window_sec", e.target.value)} placeholder="e.g. 3600" /></label></div>
        <div className="row-3">
          <label className="check"><input type="checkbox" checked={f.notify_macos} onChange={(e) => set("notify_macos", e.target.checked)} /> macOS notification</label>
          <label className="f"><span><b>Webhook notification URL</b></span><input type="url" value={f.notify_webhook_url} onChange={(e) => set("notify_webhook_url", e.target.value)} placeholder="https://hooks.slack.com/…" /></label>
          <label className="f"><span><b>Template</b></span><select value={f.notify_webhook_template} onChange={(e) => set("notify_webhook_template", e.target.value)}><option value="generic">Generic JSON</option><option value="slack">Slack</option><option value="telegram">Telegram</option><option value="ntfy">ntfy</option></select></label>
        </div>
        {f.backend === "claude" && <><label className="f"><span><b>Structured output JSON schema</b> (<code>--json-schema</code>, optional)</span><textarea value={f.json_schema} onChange={(e) => set("json_schema", e.target.value)} style={{ minHeight: 60 }} /></label>
          <label className="f"><span><b>Additional directories</b> (<code>--add-dir</code>, one per line)</span><textarea value={f.add_dirs} onChange={(e) => set("add_dirs", e.target.value)} style={{ minHeight: 50 }} /></label></>}
        <label className="f"><span><b>Metadata</b> JSON key/values, available as <code>{"{{automation.metadata}}"}</code></span><textarea value={f.metadata} onChange={(e) => set("metadata", e.target.value)} placeholder='{ "team": "platform" }' style={{ minHeight: 60 }} /></label>
      </div></details></div>

    {id && <div className="card"><h2>Rendered prompt preview <small>with manual-trigger placeholders</small></h2><div className="actions"><button className="btn sm" onClick={doPreview}>Render</button></div>{preview && <pre className="log" style={{ marginTop: 10 }}>{preview}</pre>}</div>}
  </>;
}
