import { useEffect, useState } from "react";
import { fmtAbs, fmtTime, get, post, put, subscribe } from "../api";
import { nav, useToast } from "../App";

export function Queue() {
  const toast = useToast();
  const [q, setQ] = useState<any>(null);
  const load = () => get("/api/queue").then(setQ).catch(() => {});
  useEffect(() => { load(); return subscribe({ run: load }); }, []);
  if (!q) return <div className="empty">Loading…</div>;
  const setMax = async (n: number) => { await put("/api/settings", { global_max_concurrent: n }); load(); };
  const cancel = async (id: string) => { await post(`/api/runs/${id}/cancel`); toast("Cancelled"); load(); };
  const row = (r: any, extra?: string) => <tr key={r.id} className="clickable" onClick={() => nav(`/runs/${r.id}`)}><td><span className={"status " + r.status}>{r.status.replace("_", " ")}</span></td><td><b>{r.automation_name}</b> <span className="hint mono">#{r.id.slice(-6)}</span></td><td>{r.backend}/{r.model}</td><td>{extra ?? fmtAbs(r.started_at ?? r.queued_at)}</td><td onClick={(e) => e.stopPropagation()}><button className="btn sm danger" onClick={() => cancel(r.id)}>Cancel</button></td></tr>;
  return <>
    <div className="page-head"><div><h1>Queue</h1><div className="sub">Global cap, then per-automation cap, then rate limits. Oldest queued run starts first.</div></div>
      <label className="f" style={{ minWidth: 200 }}><span><b>Global max concurrent</b></span><input type="number" min={1} max={20} value={q.global_max_concurrent} onChange={(e) => setMax(Number(e.target.value))} /></label></div>
    <div className="stat" style={{ marginBottom: 16 }}><div className="card"><div className="n">{q.running}</div><div className="l">running (of {q.global_max_concurrent})</div></div><div className="card"><div className="n">{q.queued}</div><div className="l">queued</div></div><div className="card"><div className="n">{q.rate_limited}</div><div className="l">rate limited, waiting</div></div><div className="card"><div className="n">{fmtTime(q.last_heartbeat_at)}</div><div className="l">last heartbeat</div></div></div>
    {[["Running", q.running_runs], ["Queued", q.queued_runs], ["Rate limited", q.rate_limited_runs]].map(([title, rows]: any) => <div className="card" key={title} style={{ padding: 0 }}><h2 style={{ padding: "14px 18px 0" }}>{title}</h2>
      {rows.length === 0 ? <div className="empty">none</div> : <table><tbody>{rows.map((r: any) => row(r, r.status === "rate_limited" ? `retry ${fmtTime(r.next_attempt_at)} · ${r.error?.split("\n")[0]}` : undefined))}</tbody></table>}</div>)}
    <div className="card" style={{ padding: 0 }}><h2 style={{ padding: "14px 18px 0" }}>Per automation</h2><table><thead><tr><th>Automation</th><th>Running</th><th>Queued</th><th>Max concurrent</th><th>Rate limit</th></tr></thead><tbody>
      {q.per_automation.map((a: any) => <tr key={a.id}><td><a href={`#/automations/${a.id}`}>{a.name}</a></td><td>{a.running}</td><td>{a.queued}</td><td>{a.max_concurrent}</td><td>{a.rate_limit ?? <span className="hint">none</span>}</td></tr>)}</tbody></table></div>
  </>;
}
