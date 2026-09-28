import { useEffect, useState } from "react";
import { get, post } from "../api";
import { useToast } from "../App";

export function Backends() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get("/api/backends").then(setData).catch((e) => toast(e.message, true));
  useEffect(() => { load(); }, []);
  const refresh = async () => { setBusy(true); try { await post("/api/backends/refresh"); await load(); toast("Re-detected binaries and refreshed models"); } finally { setBusy(false); } };
  if (!data) return <div className="empty">Detecting backends…</div>;
  const ok = (v: boolean | null) => v === true ? <span className="ok">✓</span> : v === false ? <span className="err">✗</span> : <span className="hint">?</span>;
  return <>
    <div className="page-head"><div><h1>Backends</h1><div className="sub">Agent CLIs on this Mac. Runs use the CLI's own login; autoed never handles keys.</div></div><button className="btn" disabled={busy} onClick={refresh}>{busy ? "Refreshing…" : "Re-detect & refresh models"}</button></div>
    {data.environment.api_key_vars_present.length > 0 && <div className="card warn">⚠ {data.environment.api_key_vars_present.join(", ")} is set in the engine's environment. Runs are launched with a scrubbed environment, but remove it from your login environment so Claude Code never bills API credits.</div>}
    {data.backends.map((b: any) => <div className="card" key={b.id}>
      <h2>{b.label} {ok(b.detection.ok)}</h2>
      <dl className="kv"><dt>Binary</dt><dd className="mono">{b.detection.binary ?? <span className="err">{b.detection.note}</span>}</dd><dt>Version</dt><dd>{b.detection.version ?? "–"}</dd><dt>Logged in</dt><dd>{ok(b.detection.loggedIn)} {b.detection.loggedIn === false && <span className="hint">{b.detection.note}</span>}</dd>
        <dt>Default</dt><dd><span className="chip">{b.default_model}</span> <span className="chip">{b.default_agent_mode}</span></dd>
        <dt>Models</dt><dd>{b.models.map((m: any) => <span key={m.id} className={"chip " + (m.free ? "free" : "paid")} style={{ margin: "0 4px 4px 0" }} title={m.note}>{m.label}{m.free ? " · free" : ""}</span>)}</dd>
        <dt>Agent modes</dt><dd>{b.agent_modes.map((m: any) => <span key={m.id} className={"chip" + (m.dangerous ? " paid" : "")} style={{ margin: "0 4px 4px 0" }}>{m.id}{m.dangerous ? " ⚠" : ""}</span>)}</dd></dl>
    </div>)}
  </>;
}
