import { useEffect, useState } from "react";
import { del, fmtTime, get, post, put, subscribe } from "../api";
import { nav, useToast } from "../App";

export function Automations() {
  const [rows, setRows] = useState<any[] | null>(null);
  const toast = useToast();
  const load = () => get("/api/automations").then(setRows).catch((e) => toast(e.message, true));
  useEffect(() => { load(); return subscribe({ run: load, automation: load }); }, []);

  const toggle = async (a: any) => { try { await put(`/api/automations/${a.id}`, { enabled: !a.enabled }); load(); } catch (e: any) { toast(e.message, true); } };
  const runNow = async (a: any) => { try { const r = await post(`/api/automations/${a.id}/run`); toast(`Queued run for ${a.name}`); nav(`/runs/${r.id}`); } catch (e: any) { toast(e.message, true); } };
  const remove = async (a: any) => { if (!confirm(`Delete "${a.name}" and its run history?`)) return; try { await del(`/api/automations/${a.id}`); load(); } catch (e: any) { toast(e.message, true); } };

  return <>
    <div className="page-head"><div><h1>Automations</h1><div className="sub">Triggers that start agent runs on this Mac.</div></div><button className="btn primary" onClick={() => nav("/automations/new")}>+ New automation</button></div>
    <div className="card" style={{ padding: 0 }}>
      {rows === null ? <div className="empty">Loading…</div> : rows.length === 0 ? <div className="empty">No automations yet. Create one to get started.</div> :
        <table><thead><tr><th style={{ width: 40 }}></th><th>Name</th><th>Agent</th><th>Triggers</th><th>Next run</th><th>Last run</th><th></th></tr></thead><tbody>
          {rows.map((a) => <tr key={a.id} className="clickable" onClick={() => nav(`/automations/${a.id}`)}>
            <td onClick={(e) => e.stopPropagation()}><button className={"toggle" + (a.enabled ? " on" : "")} title={a.enabled ? "Enabled" : "Disabled"} onClick={() => toggle(a)} /></td>
            <td><b>{a.name}</b><div className="hint mono">{a.working_dir}</div></td>
            <td><span className="chip">{a.backend}</span> <span className="chip">{a.model ?? "default"}</span></td>
            <td>{a.triggers.length ? a.triggers.map((t: any) => <span key={t.id} className="chip" style={{ marginRight: 4 }}>{t.kind === "schedule" ? `⏱ ${t.config.cron}` : t.kind}</span>) : <span className="hint">manual only</span>}</td>
            <td>{a.enabled ? fmtTime(a.next_run_at) : <span className="hint">paused</span>}</td>
            <td>{a.last_run ? <a href={`#/runs/${a.last_run.id}`} onClick={(e) => e.stopPropagation()}><span className={"status " + a.last_run.status}>{a.last_run.status.replace("_", " ")}</span></a> : <span className="hint">never</span>}{a.running ? <span className="chip" style={{ marginLeft: 6 }}>{a.running} running</span> : null}{a.queued ? <span className="chip" style={{ marginLeft: 6 }}>{a.queued} queued</span> : null}</td>
            <td onClick={(e) => e.stopPropagation()}><div className="actions"><button className="btn sm" onClick={() => runNow(a)}>▶ Run now</button><button className="btn sm danger" onClick={() => remove(a)}>Delete</button></div></td>
          </tr>)}
        </tbody></table>}
    </div>
  </>;
}
