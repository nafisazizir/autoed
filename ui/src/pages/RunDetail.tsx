import { useEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconClock, IconExternalLink, IconPlayerStop, IconRefresh } from "@tabler/icons-react";
import { duration, fmtAbs, get, post, subscribe } from "@/lib/api";
import { notify, notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loading } from "@/components/loading";
import { CodeView, Ledger, Mono, Notice, Page, PageHeader, Section, Stat, StatGroup } from "@/components/page";
import { RunStatus, statusLabel } from "@/components/run-status";

const TERMINAL = ["succeeded", "failed", "timed_out", "cancelled", "rate_limited"];
const ACTIVE = ["queued", "starting", "running", "rate_limited"];
type Row = [React.ReactNode, React.ReactNode];

export function RunDetail({ id }: { id: string }) {
  const [run, setRun] = useState<any>(null);
  const [lines, setLines] = useState<Array<{ s: string; l: string }>>([]);
  const [tab, setTab] = useState("logs");
  const logRef = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);

  const load = () => get(`/api/runs/${id}`).then((r) => {
    setRun(r);
    const out = (r.stdout ?? "").split("\n").filter(Boolean).map((l: string) => ({ s: "stdout", l }));
    const err = (r.stderr ?? "").split("\n").filter(Boolean).map((l: string) => ({ s: "stderr", l }));
    setLines([...out, ...err.length ? [{ s: "stderr", l: "── stderr ──" }, ...err] : []]);
  }).catch(notifyError);

  useEffect(() => { load(); return subscribe({ run: (r) => { setRun((prev: any) => ({ ...prev, ...r })); if (TERMINAL.includes(r.status)) setTimeout(load, 300); }, log: (d) => setLines((ls) => [...ls.slice(-2000), { s: d.stream, l: d.line }]) }, id); }, [id]);
  useEffect(() => { if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines, follow, tab]);

  if (!run) return <Loading page />;
  const act = async (a: string) => { try { const r = await post(`/api/runs/${id}/${a}`); if (a === "retry") nav(`/runs/${r.id}`); else if (a === "open") notify("Opening Devin Desktop"); else load(); } catch (e) { notifyError(e); } };
  const active = ACTIVE.includes(run.status);

  const details: Row[] = [
    ["Queued", fmtAbs(run.queued_at)],
    ...(run.started_at ? [["Started", fmtAbs(run.started_at)] as Row] : []),
    ...(run.finished_at ? [["Finished", fmtAbs(run.finished_at)] as Row] : []),
    ["Agent", <span className="inline-flex flex-wrap items-center gap-1"><Badge variant="secondary">{run.backend}</Badge><Badge variant="outline">{run.model ?? "default"}</Badge>{run.pid && <span className="ms-1 text-gray-900">pid {run.pid}</span>}</span>],
    ["Session", <Mono>{run.session_id ?? "–"}</Mono>],
    ["Directory", <><Mono>{run.worktree_path ?? run.working_dir}</Mono>{run.worktree_path && <span className="text-gray-900"> (worktree of <Mono>{run.working_dir}</Mono>)</span>}</>],
    ...(run.event ? [["Trigger", <>{run.event.kind}{run.event.missed_count > 1 && <span className="text-amber-900"> · catch-up of {run.event.missed_count} missed fires</span>} <span className="text-gray-900">{fmtAbs(run.event.occurred_at)}</span></>] as Row] : []),
    ...(run.next_attempt_at ? [["Retry at", fmtAbs(run.next_attempt_at)] as Row] : []),
    ["Run folder", <Mono className="text-gray-900">{run.run_dir}</Mono>],
  ];

  return (
    <Page>
      <PageHeader
        title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{run.automation_name}<RunStatus status={run.status} className="text-label-14" /></span>}
        description={<>Run #{run.id.slice(-6)}{run.attempt > 1 ? `, attempt ${run.attempt}` : ""} · <a href={`#/automations/${run.automation_id}`} className="text-gray-1000 underline underline-offset-2">Edit automation</a></>}
        actions={<>
          <Button shape="rounded" size="sm" variant="secondary" onClick={() => act("open")}><IconExternalLink data-icon="inline-start" />Open in Devin Desktop</Button>
          {active
            ? <Button shape="rounded" size="sm" variant="destructive" onClick={() => act("cancel")}><IconPlayerStop data-icon="inline-start" />Cancel run</Button>
            : <Button shape="rounded" size="sm" onClick={() => act("retry")}><IconRefresh data-icon="inline-start" />Retry</Button>}
        </>}
      />

      {run.error && (
        <Notice tone={run.status === "rate_limited" ? "default" : "danger"} icon={run.status === "rate_limited" ? IconClock : IconAlertTriangle} title={<span className="text-label-13-mono">{run.error.split("\n")[0]}</span>} />
      )}

      <StatGroup>
        <Stat label="Status" value={statusLabel(run.status)} />
        <Stat label="Duration" value={run.started_at ? duration(run.started_at, run.finished_at) : "–"} />
        <Stat label="Exit code" value={run.exit_code ?? "–"} />
        <Stat label="Attempt" value={run.attempt ?? 1} />
      </StatGroup>

      <Section title="Output">
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="gap-3">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="event">Event</TabsTrigger>
              <TabsTrigger value="command">Command</TabsTrigger>
            </TabsList>
            {tab === "logs" && (
              <label className="flex items-center gap-2 text-label-13 text-gray-900">
                Follow
                <Switch size="sm" checked={follow} onCheckedChange={setFollow} />
              </label>
            )}
          </div>
          <TabsContent value="logs">
            <CodeView ref={logRef}>
              {lines.length ? lines.map((x, i) => <span key={i} className={x.s === "stderr" ? "text-red-900" : undefined}>{x.l}{"\n"}</span>) : <span className="text-gray-900">{active ? "Waiting for output…" : "No output."}</span>}
            </CodeView>
          </TabsContent>
          <TabsContent value="prompt"><CodeView>{run.prompt ?? "Not rendered."}</CodeView></TabsContent>
          <TabsContent value="result"><CodeView>{run.summary ? run.summary + "\n\n" : ""}{run.result ? JSON.stringify(run.result, null, 2) : "No result."}</CodeView></TabsContent>
          <TabsContent value="event"><CodeView>{run.event ? JSON.stringify(run.event, null, 2) : "Manual run."}</CodeView></TabsContent>
          <TabsContent value="command"><CodeView>{run.command ? `${run.command.argv.map((a: string) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n\ncwd: ${run.command.cwd}\nenv: ${run.command.env_keys.join(", ")}` : "Not started."}</CodeView></TabsContent>
        </Tabs>
      </Section>

      <Section title="Details">
        <Ledger items={details} />
      </Section>
    </Page>
  );
}
