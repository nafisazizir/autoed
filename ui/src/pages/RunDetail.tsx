import { useEffect, useRef, useState } from "react";
import { duration, fmtAbs, get, post, subscribe } from "../api";
import { nav, useToast } from "../App";

export function RunDetail({ id }: { id: string }) {
  const toast = useToast();
  const [run, setRun] = useState<any>(null);
  const [lines, setLines] = useState<Array<{ s: string; l: string }>>([]);
  const [tab, setTab] = useState<"logs" | "prompt" | "result" | "event" | "command">("logs");
  const logRef = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);

  const load = () => get(`/api/runs/${id}`).then((r) => {
    setRun(r);
    const out = (r.stdout ?? "").split("\n").filter(Boolean).map((l: string) => ({ s: "stdout", l }));
    const err = (r.stderr ?? "").split("\n").filter(Boolean).map((l: string) => ({ s: "stderr", l }));
    setLines([...out, ...err.length ? [{ s: "stderr", l: "── stderr ──" }, ...err] : []]);
  }).catch((e) => toast(e.message, true));

  useEffect(() => { load(); return subscribe({ run: (r) => { setRun((prev: any) => ({ ...prev, ...r })); if (["succeeded", "failed", "timed_out", "cancelled", "rate_limited"].includes(r.status)) setTimeout(load, 300); }, log: (d) => setLines((ls) => [...ls.slice(-2000), { s: d.stream, l: d.line }]) }, id); }, [id]);
  useEffect(() => { if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines, follow]);

  if (!run) return <div className="empty">Loading…</div>;
  const act = async (a: string) => { try { const r = await post(`/api/runs/${id}/${a}`); if (a === "retry") nav(`/runs/${r.id}`); else if (a === "open") toast("Opening in Devin Desktop"); else load(); } catch (e: any) { toast(e.message, true); } };
  const active = ["queued", "starting", "running", "rate_limited"].includes(run.status);

  return <>
    <div className="page-head"><div><h1><a href={`#/automations/${run.automation_id}`}>{run.automation_name}</a> <span className="hint mono">#{run.id.slice(-6)}</span></h1><div className="sub"><span className={"status " + run.status}>{run.status.replace("_", " ")}</span>{run.error && <span className="err"> · {run.error.split("\n")[0]}</span>}</div></div>
      <div className="actions"><button className="btn" onClick={() => act("open")}>Open in Devin Desktop</button>{active ? <button className="btn danger" onClick={() => act("cancel")}>Cancel</button> : <button className="btn" onClick={() => act("retry")}>Retry</button>}</div></div>

    <div className="card"><dl className="kv">
      <dt>Timeline</dt><dd>queued {fmtAbs(run.queued_at)}{run.started_at && <> → started {fmtAbs(run.started_at)}</>}{run.finished_at && <> → finished {fmtAbs(run.finished_at)}</>} {run.started_at && <span className="hint">({duration(run.started_at, run.finished_at)})</span>}</dd>
      <dt>Agent</dt><dd><span className="chip">{run.backend}</span> <span className="chip">{run.model ?? "default"}</span> {run.pid && <span className="hint">pid {run.pid}</span>}</dd>
      <dt>Session</dt><dd className="mono">{run.session_id ?? "–"}</dd>
      <dt>Directory</dt><dd className="mono">{run.worktree_path ?? run.working_dir}{run.worktree_path && <span className="hint"> (isolated worktree of {run.working_dir})</span>}</dd>
      {run.event && <><dt>Trigger</dt><dd>{run.event.kind}{run.event.missed_count > 1 && <span className="warn"> · catch-up of {run.event.missed_count} missed fires</span>} <span className="hint">{fmtAbs(run.event.occurred_at)}</span></dd></>}
      {run.next_attempt_at && <><dt>Retry at</dt><dd>{fmtAbs(run.next_attempt_at)}</dd></>}
      {run.exit_code !== null && <><dt>Exit code</dt><dd>{run.exit_code}</dd></>}
      <dt>Run dir</dt><dd className="mono hint">{run.run_dir}</dd>
    </dl></div>

    <div className="card">
      <div className="tabs">{(["logs", "prompt", "result", "event", "command"] as const).map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
        {tab === "logs" && <label className="check" style={{ marginLeft: "auto" }}><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow</label>}</div>
      {tab === "logs" && <pre className="log" ref={logRef}>{lines.length ? lines.map((x, i) => <span key={i} className={x.s === "stderr" ? "stderr" : ""}>{x.l}{"\n"}</span>) : <span className="hint">{active ? "Waiting for output…" : "No output captured."}</span>}</pre>}
      {tab === "prompt" && <pre className="log">{run.prompt ?? "(not rendered yet)"}</pre>}
      {tab === "result" && <pre className="log">{run.summary ? run.summary + "\n\n" : ""}{run.result ? JSON.stringify(run.result, null, 2) : "(no structured result)"}</pre>}
      {tab === "event" && <pre className="log">{run.event ? JSON.stringify(run.event, null, 2) : "(manual run, no event)"}</pre>}
      {tab === "command" && <pre className="log">{run.command ? `${run.command.argv.map((a: string) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}\n\ncwd: ${run.command.cwd}\nenv: ${run.command.env_keys.join(", ")}` : "(not started)"}</pre>}
    </div>
  </>;
}
