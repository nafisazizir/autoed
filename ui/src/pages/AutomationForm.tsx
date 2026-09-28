import { useEffect, useMemo, useState } from "react";
import { IconAlertTriangle, IconBrandGithub, IconClock, IconPlayerPlay, IconPlus, IconTrash, IconWebhook } from "@tabler/icons-react";
import { get, post, put } from "@/lib/api";
import { notify, notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Picker } from "@/components/picker";
import { CodeView, Ledger, Mono, Notice, Page, PageHeader, Panel, Section } from "@/components/page";

type Trigger = { id?: string; kind: "schedule" | "webhook" | "github" | "manual"; config: any; enabled?: boolean };

const EMPTY = {
  name: "", enabled: true, backend: "devin", model: "", agent_mode: "", agent_profile: "", instructions: "", working_dir: "",
  isolate_worktree: false, continue_session: false, mcp_config: "", timeout_sec: 3600, max_concurrent: 1, rate_limit_count: "", rate_limit_window_sec: "",
  catchup_policy: "coalesce", notify_macos: true, notify_webhook_url: "", notify_webhook_template: "generic", metadata: "", json_schema: "", add_dirs: "", sandbox: false,
  chrome: false, allowed_tools: "", disallowed_tools: "",
};

const DEFAULT = "__default";
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const GITHUB_EVENTS = ["issue", "issue_comment", "pull_request", "pr_review", "push", "check_run"];
const TRIGGER_META = {
  schedule: { label: "Schedule", Icon: IconClock },
  webhook: { label: "Webhook", Icon: IconWebhook },
  github: { label: "GitHub, polled", Icon: IconBrandGithub },
  manual: { label: "Manual", Icon: IconPlayerPlay },
} as const;

const Code = ({ children }: { children: React.ReactNode }) => <code className="text-copy-13-mono text-gray-1000">{children}</code>;
const Hint = ({ children }: { children: React.ReactNode }) => <FieldDescription className="text-copy-13">{children}</FieldDescription>;

/** A boolean setting: its label and a line of explanation, the switch at the end. */
function SwitchField({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <Hint>{description}</Hint>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-x-3 gap-y-6 sm:grid-cols-2">{children}</div>;

export function AutomationForm({ id }: { id?: string }) {
  const [f, setF] = useState<any>(EMPTY);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [backends, setBackends] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cronInfo, setCronInfo] = useState<Record<number, { ok: boolean; error?: string; next?: string[] }>>({});
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  useEffect(() => {
    get("/api/backends").then((b) => setBackends(b.backends)).catch(notifyError);
    if (id) get(`/api/automations/${id}`).then((a) => {
      const notify = a.notify ? JSON.parse(a.notify) : {};
      setF({ ...EMPTY, ...a, model: a.model ?? "", agent_mode: a.agent_mode ?? "", agent_profile: a.agent_profile ?? "", mcp_config: a.mcp_config ?? "", rate_limit_count: a.rate_limit_count ?? "", rate_limit_window_sec: a.rate_limit_window_sec ?? "",
        notify_macos: notify.macos ?? true, notify_webhook_url: notify.webhook?.url ?? "", notify_webhook_template: notify.webhook?.template ?? "generic", metadata: a.metadata ? JSON.stringify(JSON.parse(a.metadata), null, 2) : "", json_schema: a.json_schema ?? "", add_dirs: a.add_dirs ? JSON.parse(a.add_dirs).join("\n") : "", enabled: !!a.enabled, isolate_worktree: !!a.isolate_worktree, continue_session: !!a.continue_session, sandbox: !!a.sandbox,
        chrome: !!a.chrome, allowed_tools: a.allowed_tools ? JSON.parse(a.allowed_tools).join("\n") : "", disallowed_tools: a.disallowed_tools ? JSON.parse(a.disallowed_tools).join("\n") : "" });
      setTriggers(a.triggers.map((t: any) => ({ id: t.id, kind: t.kind, config: t.config ?? {}, enabled: !!t.enabled })));
    }).catch(notifyError);
  }, [id]);

  const be = useMemo(() => backends.find((b) => b.id === f.backend), [backends, f.backend]);
  const selectedModel = be?.models.find((m: any) => m.id === (f.model || be.default_model));
  const mode = be?.agent_modes.find((m: any) => m.id === (f.agent_mode || be.default_agent_mode));
  const isClaude = f.backend === "claude";

  const checkCron = async (i: number, cron: string, tz: string) => {
    if (!cron) return setCronInfo((s) => ({ ...s, [i]: { ok: false, error: "A cron expression is required." } }));
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
    chrome: f.chrome, allowed_tools: lines(f.allowed_tools), disallowed_tools: lines(f.disallowed_tools),
    triggers: triggers.filter((t) => t.kind !== "manual"),
  });
  const save = async () => {
    setSaving(true);
    try {
      const b = body();
      const a = id ? await put(`/api/automations/${id}`, b) : await post("/api/automations", b);
      notify(id ? "Saved" : "Created"); nav(id ? "/automations" : `/automations/${a.id}`);
    } catch (e) { notifyError(e); } finally { setSaving(false); }
  };
  const doPreview = async () => { try { const r = await post(`/api/automations/${id}/preview`); setPreview(r.prompt); } catch (e) { notifyError(e); } };
  const runNow = async () => { try { const r = await post(`/api/automations/${id}/run`); nav(`/runs/${r.id}`); } catch (e) { notifyError(e); } };

  const modelOptions = [{ label: `Default (${be?.default_model ?? "…"})`, value: DEFAULT }, ...(be?.models ?? []).map((m: any) => ({ label: `${m.label}${m.free ? " · free" : m.note ? ` · ${m.note}` : ""}`, value: m.id }))];
  // A Claude model typed by hand is not in the list; keep it selectable so the field still shows it.
  if (f.model && !modelOptions.some((o) => o.value === f.model)) modelOptions.push({ label: f.model, value: f.model });

  const actions = (
    <>
      <Button type="button" shape="rounded" size="sm" variant="ghost" onClick={() => nav("/automations")}>Cancel</Button>
      {id && <Button type="button" shape="rounded" size="sm" variant="secondary" onClick={runNow}><IconPlayerPlay data-icon="inline-start" />Run now</Button>}
      <Button type="submit" form="automation" shape="rounded" size="sm" disabled={saving}>{saving ? "Saving…" : id ? "Save changes" : "Create automation"}</Button>
    </>
  );

  return (
    <Page>
      <PageHeader title={id ? f.name || "Automation" : "New automation"} actions={actions} />

      <form id="automation" onSubmit={(e) => { e.preventDefault(); save(); }} className="flex max-w-3xl flex-col gap-10">
        <Section title="General">
          <FieldGroup className="gap-6">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nightly dependency check" />
            </Field>
            <SwitchField id="enabled" checked={f.enabled} onChange={(v) => set("enabled", v)} label="Enabled" />
          </FieldGroup>
        </Section>

        <Section title="Triggers">
          <div className="flex flex-col gap-4">
            {triggers.map((t, i) => {
              const { label, Icon } = TRIGGER_META[t.kind];
              const bad = cronInfo[i] && !cronInfo[i]!.ok;
              return (
                <Panel key={i} className="flex flex-col gap-5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-gray-900" />
                    <span className="text-label-14 text-gray-1000">{label}</span>
                    <div className="ms-auto flex items-center gap-2">
                      <Switch size="sm" checked={t.enabled !== false} onCheckedChange={(v) => updTrigger(i, { enabled: v })} aria-label={`${label} trigger enabled`} />
                      <Button type="button" shape="rounded" variant="ghost" size="icon-sm" aria-label={`Remove ${label} trigger`} onClick={() => setTriggers((ts) => ts.filter((_, j) => j !== i))}><IconTrash /></Button>
                    </div>
                  </div>

                  {t.kind === "schedule" && (
                    <Grid>
                      <Field data-invalid={bad || undefined}>
                        <FieldLabel htmlFor={`cron-${i}`}>Cron</FieldLabel>
                        <Input id={`cron-${i}`} className="text-label-14-mono" value={t.config.cron ?? ""} aria-invalid={bad || undefined}
                          onChange={(e) => { updTrigger(i, { config: { cron: e.target.value } }); checkCron(i, e.target.value, t.config.tz); }} onBlur={() => checkCron(i, t.config.cron, t.config.tz)} />
                        {bad
                          ? <FieldError className="text-copy-13">{cronInfo[i]!.error}</FieldError>
                          : <Hint>{cronInfo[i]?.next ? <>Next: {cronInfo[i]!.next!.slice(0, 3).map((d) => new Date(d).toLocaleString()).join(" · ")}</> : <>Five fields, or <Code>@hourly</Code> <Code>@daily</Code> <Code>@weekdays</Code> <Code>@weekly</Code> <Code>@every15m</Code></>}</Hint>}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`tz-${i}`}>Timezone</FieldLabel>
                        <Input id={`tz-${i}`} value={t.config.tz ?? ""} onChange={(e) => updTrigger(i, { config: { tz: e.target.value } })} placeholder="Australia/Sydney" />
                      </Field>
                    </Grid>
                  )}

                  {t.kind === "webhook" && (t.id ? (
                    <Ledger items={[
                      ["URL", <Mono>POST {location.origin}/hooks/{t.id}</Mono>],
                      ["Secret", <Mono>{t.config.secret}</Mono>],
                      ["Auth", <span className="text-copy-13 text-gray-900"><Code>X-Autoed-Secret: &lt;secret&gt;</Code>, or <Code>X-Autoed-Signature: sha256=&lt;hmac&gt;</Code> (<Code>X-Hub-Signature-256</Code> accepted).</span>],
                      ["Body", <span className="text-copy-13 text-gray-900">Up to 1 MB, available as <Code>{"{{event.payload}}"}</Code>.</span>],
                    ]} />
                  ) : <p className="text-copy-13 text-gray-900">URL and secret are generated on save.</p>)}

                  {t.kind === "github" && (
                    <FieldGroup className="gap-6">
                      <Grid>
                        <Field>
                          <FieldLabel htmlFor={`repo-${i}`}>Repository</FieldLabel>
                          <Input id={`repo-${i}`} value={t.config.repo ?? ""} onChange={(e) => updTrigger(i, { config: { repo: e.target.value } })} placeholder="acme/widgets" />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`interval-${i}`}>Poll every, in seconds</FieldLabel>
                          <Input id={`interval-${i}`} type="number" value={t.config.intervalSec ?? 300} onChange={(e) => updTrigger(i, { config: { intervalSec: Number(e.target.value) } })} />
                        </Field>
                      </Grid>
                      <FieldSet>
                        <FieldLegend variant="label">Events</FieldLegend>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {GITHUB_EVENTS.map((ev) => {
                            const events: string[] = t.config.events ?? [];
                            return (
                              <Field key={ev} orientation="horizontal">
                                <Checkbox id={`ev-${i}-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => updTrigger(i, { config: { events: c ? [...events, ev] : events.filter((x) => x !== ev) } })} />
                                <FieldLabel htmlFor={`ev-${i}-${ev}`} className="text-label-13-mono">{ev}</FieldLabel>
                              </Field>
                            );
                          })}
                        </div>
                      </FieldSet>
                      <Field>
                        <FieldLabel htmlFor={`filter-${i}`}>Filter</FieldLabel>
                        <Input id={`filter-${i}`} className="text-label-14-mono" value={t.config.filter ?? ""} onChange={(e) => updTrigger(i, { config: { filter: e.target.value } })} placeholder="label.*needs-triage" />
                        <Hint>Optional regex over the event JSON. Needs <Code>gh auth login</Code>.</Hint>
                      </Field>
                    </FieldGroup>
                  )}
                </Panel>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button type="button" shape="rounded" variant="secondary" size="sm" onClick={() => addTrigger("schedule")}><IconPlus data-icon="inline-start" />Schedule</Button>
              <Button type="button" shape="rounded" variant="secondary" size="sm" onClick={() => addTrigger("webhook")}><IconPlus data-icon="inline-start" />Webhook</Button>
              <Button type="button" shape="rounded" variant="secondary" size="sm" onClick={() => addTrigger("github")}><IconPlus data-icon="inline-start" />GitHub</Button>
            </div>
          </div>
        </Section>

        <Section title="Agent">
          <FieldGroup className="gap-6">
            <Grid>
              <Field>
                <FieldLabel htmlFor="backend">Backend</FieldLabel>
                <Picker id="backend" value={f.backend} onChange={(v) => setF((s: any) => ({ ...s, backend: v, model: "", agent_mode: "" }))}
                  options={backends.map((b) => ({ label: `${b.label}${b.detection.ok ? "" : " (not available)"}`, value: b.id, disabled: !b.detection.ok }))} />
                {be && <Hint>{be.detection.version}{be.detection.loggedIn === false && <span className="text-red-900"> · not logged in</span>}</Hint>}
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-mode">Permissions</FieldLabel>
                <Picker id="agent-mode" value={f.agent_mode || DEFAULT} onChange={(v) => set("agent_mode", v === DEFAULT ? "" : v)}
                  options={[{ label: `Default (${be?.default_agent_mode ?? "…"})`, value: DEFAULT }, ...(be?.agent_modes ?? []).map((m: any) => ({ label: m.label, value: m.id }))]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="model">Model</FieldLabel>
                <Picker id="model" value={f.model || DEFAULT} onChange={(v) => set("model", v === DEFAULT ? "" : v)} options={modelOptions} />
                {selectedModel && <div><Badge variant={selectedModel.free ? "secondary" : "outline"}>{selectedModel.free ? "Free tier or subscription" : `Paid: ${selectedModel.note}`}</Badge></div>}
              </Field>
              {isClaude && (
                <Field>
                  <FieldLabel htmlFor="model-id">Model id</FieldLabel>
                  <Input id="model-id" className="text-label-14-mono" value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="Or type any Claude model id" />
                </Field>
              )}
            </Grid>
            {mode?.dangerous && (
              <Notice tone="danger" icon={IconAlertTriangle} title="Skips every permission prompt." />
            )}
            <Field>
              <FieldLabel htmlFor="instructions">Instructions</FieldLabel>
              <Textarea id="instructions" className="min-h-48 text-copy-13-mono" value={f.instructions} onChange={(e) => set("instructions", e.target.value)}
                placeholder="What should the agent do?" />
              <Hint>Variables: <Code>{"{{trigger.kind}}"}</Code> <Code>{"{{event.payload}}"}</Code> <Code>{"{{event.occurred_at}}"}</Code> <Code>{"{{catchup.missed_count}}"}</Code> <Code>{"{{run.id}}"}</Code> <Code>{"{{automation.name}}"}</Code></Hint>
            </Field>
            <Grid>
              <Field>
                <FieldLabel htmlFor="working-dir">Working directory</FieldLabel>
                <Input id="working-dir" className="text-label-14-mono" value={f.working_dir} onChange={(e) => set("working_dir", e.target.value)} placeholder="~/Projects/widgets" />
              </Field>
              {isClaude ? (
                <Field>
                  <FieldLabel htmlFor="agent-profile">Agent profile</FieldLabel>
                  <Input id="agent-profile" value={f.agent_profile} onChange={(e) => set("agent_profile", e.target.value)} />
                  <Hint><Code>claude --agent</Code></Hint>
                </Field>
              ) : (
                <SwitchField id="sandbox" checked={f.sandbox} onChange={(v) => set("sandbox", v)} label="Sandbox exec" description={<>Devin's <Code>--sandbox</Code>.</>} />
              )}
            </Grid>
            {isClaude && (
              <Field>
                <FieldLabel htmlFor="mcp">MCP servers</FieldLabel>
                <Textarea id="mcp" className="min-h-20 text-copy-13-mono" value={f.mcp_config} onChange={(e) => set("mcp_config", e.target.value)} placeholder='{ "mcpServers": { } }' />
                <Hint><Code>--mcp-config</Code> JSON</Hint>
              </Field>
            )}
          </FieldGroup>
        </Section>

        <Section title="Limits">
          <FieldGroup className="gap-6">
            <Grid>
              <Field>
                <FieldLabel htmlFor="timeout">Timeout, in seconds</FieldLabel>
                <Input id="timeout" type="number" value={f.timeout_sec} onChange={(e) => set("timeout_sec", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="max-concurrent">Max concurrent runs</FieldLabel>
                <Input id="max-concurrent" type="number" value={f.max_concurrent} onChange={(e) => set("max_concurrent", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-count">Rate limit, max runs</FieldLabel>
                <Input id="rate-count" type="number" value={f.rate_limit_count} onChange={(e) => set("rate_limit_count", e.target.value)} placeholder="50" />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-window">Per window, in seconds</FieldLabel>
                <Input id="rate-window" type="number" value={f.rate_limit_window_sec} onChange={(e) => set("rate_limit_window_sec", e.target.value)} placeholder="3600" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="catchup">After sleep or power-off</FieldLabel>
                <Picker id="catchup" value={f.catchup_policy} onChange={(v) => set("catchup_policy", v)} options={[
                  { label: "Coalesce missed fires into one run", value: "coalesce" },
                  { label: "Replay every missed fire", value: "replay" },
                  { label: "Skip missed fires", value: "skip" },
                ]} />
              </Field>
            </Grid>
            <SwitchField id="worktree" checked={f.isolate_worktree} onChange={(v) => set("isolate_worktree", v)} label="Isolated git worktree per run" description={<><Code>~/.autoed/worktrees/&lt;run&gt;</Code>, removed after the run.</>} />
            <SwitchField id="continue" checked={f.continue_session} onChange={(v) => set("continue_session", v)} label="Continue previous session" description={<><Code>--resume</Code> the last successful run.</>} />
          </FieldGroup>
        </Section>

        <Section title="Notifications">
          <FieldGroup className="gap-6">
            <SwitchField id="notify-macos" checked={f.notify_macos} onChange={(v) => set("notify_macos", v)} label="macOS notification" />
            <div className="grid gap-x-3 gap-y-6 sm:grid-cols-[2fr_1fr]">
              <Field>
                <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
                <Input id="webhook-url" type="url" value={f.notify_webhook_url} onChange={(e) => set("notify_webhook_url", e.target.value)} placeholder="https://hooks.slack.com/…" />
              </Field>
              <Field>
                <FieldLabel htmlFor="webhook-template">Template</FieldLabel>
                <Picker id="webhook-template" value={f.notify_webhook_template} onChange={(v) => set("notify_webhook_template", v)} options={[
                  { label: "Generic JSON", value: "generic" },
                  { label: "Slack", value: "slack" },
                  { label: "Telegram", value: "telegram" },
                  { label: "ntfy", value: "ntfy" },
                ]} />
              </Field>
            </div>
          </FieldGroup>
        </Section>

        <Section title="Advanced">
          <FieldGroup className="gap-6">
            {isClaude && <>
              <Field>
                <FieldLabel htmlFor="json-schema">Structured output JSON schema</FieldLabel>
                <Textarea id="json-schema" className="min-h-16 text-copy-13-mono" value={f.json_schema} onChange={(e) => set("json_schema", e.target.value)} />
                <Hint><Code>--json-schema</Code></Hint>
              </Field>
              <Field>
                <FieldLabel htmlFor="add-dirs">Additional directories</FieldLabel>
                <Textarea id="add-dirs" className="min-h-16 text-copy-13-mono" value={f.add_dirs} onChange={(e) => set("add_dirs", e.target.value)} />
                <Hint>One per line. <Code>--add-dir</Code></Hint>
              </Field>
              <Grid>
                <Field>
                  <FieldLabel htmlFor="allowed-tools">Allowed tools</FieldLabel>
                  <Textarea id="allowed-tools" className="min-h-16 text-copy-13-mono" value={f.allowed_tools} onChange={(e) => set("allowed_tools", e.target.value)} placeholder="Bash(git log:*)" />
                  <Hint>One rule per line. <Code>--allowedTools</Code></Hint>
                </Field>
                <Field>
                  <FieldLabel htmlFor="disallowed-tools">Disallowed tools</FieldLabel>
                  <Textarea id="disallowed-tools" className="min-h-16 text-copy-13-mono" value={f.disallowed_tools} onChange={(e) => set("disallowed_tools", e.target.value)} placeholder="Bash(gh pr merge:*)" />
                  <Hint>One rule per line. <Code>--disallowedTools</Code></Hint>
                </Field>
              </Grid>
              <SwitchField id="chrome" checked={f.chrome} onChange={(v) => set("chrome", v)} label="Claude in Chrome" description={<><Code>--chrome</Code>: the agent can drive your Chrome browser.</>} />
            </>}
            <Field>
              <FieldLabel htmlFor="metadata">Metadata</FieldLabel>
              <Textarea id="metadata" className="min-h-16 text-copy-13-mono" value={f.metadata} onChange={(e) => set("metadata", e.target.value)} placeholder='{ "team": "platform" }' />
              <Hint>Available as <Code>{"{{automation.metadata}}"}</Code>.</Hint>
            </Field>
          </FieldGroup>
        </Section>

        {id && (
          <Section title="Rendered prompt" actions={<Button type="button" shape="rounded" variant="secondary" size="xs" onClick={doPreview}>Render</Button>}>
            {preview && <CodeView>{preview}</CodeView>}
          </Section>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-alpha-400 pt-6">{actions}</div>
      </form>
    </Page>
  );
}
