import { useEffect, useState } from "react";
import { duration, fmtAbs, get, subscribe } from "../api";
import { nav } from "../App";

const STATUSES = ["", "running", "queued", "rate_limited", "succeeded", "failed", "timed_out", "cancelled"];

export function Runs({ automationId }: { automationId?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [autos, setAutos] = useState<any[]>([]);
  const [auto, setAuto] = useState(automationId ?? "");
  const load = () => get(`/api/runs?limit=200${status ? `&status=${status === "running" ? "running,starting" : status}` : ""}${auto ? `&automation_id=${auto}` : ""}`).then(setRows).catch(() => {});
  useEffect(() => { get("/api/automations").then(setAutos).catch(() => {}); }, []);
  useEffect(() => { load(); return subscribe({ run: load }); }, [status, auto]);

  return <>
    <div className="page-head"><div><h1>Runs</h1><div className="sub">Every agent run, newest first. Click for logs and the result.</div></div>
      <div className="actions"><select value={auto} onChange={(e) => setAuto(e.target.value)}><option value="">All automations</option>{autos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>)}</select></div></div>
    <div className="card" style={{ padding: 0 }}>
      {rows.length === 0 ? <div className="empty">No runs match.</div> :
        <table><thead><tr><th>Status</th><th>Automation</th><th>Agent</th><th>Started</th><th>Duration</th><th>Session</th><th>Note</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id} className="clickable" onClick={() => nav(`/runs/${r.id}`)}>
            <td><span className={"status " + r.status}>{r.status.replace("_", " ")}</span></td>
            <td><b>{r.automation_name}</b><div className="hint mono">{r.id.slice(-6)} · attempt {r.attempt}</div></td>
            <td><span className="chip">{r.backend}</span> <span className="chip">{r.model ?? "default"}</span></td>
            <td>{fmtAbs(r.started_at ?? r.queued_at)}</td>
            <td>{r.started_at ? duration(r.started_at, r.finished_at) : "–"}</td>
            <td className="mono hint">{r.session_id ? r.session_id.slice(0, 12) : "–"}</td>
            <td className="hint" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.error?.split("\n")[0] ?? r.summary?.split("\n")[0] ?? ""}</td>
          </tr>)}
        </tbody></table>}
    </div>
  </>;
}
