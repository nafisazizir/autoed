import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { get, subscribe } from "./api";
import { Automations } from "./pages/Automations";
import { AutomationForm } from "./pages/AutomationForm";
import { Runs } from "./pages/Runs";
import { RunDetail } from "./pages/RunDetail";
import { Backends } from "./pages/Backends";
import { Queue } from "./pages/Queue";

type Toast = { msg: string; err?: boolean } | null;
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function useHash() {
  const [hash, setHash] = useState(location.hash.slice(1) || "/");
  useEffect(() => { const f = () => setHash(location.hash.slice(1) || "/"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return hash;
}
export const nav = (to: string) => { location.hash = to; };

export function App() {
  const route = useHash();
  const [status, setStatus] = useState<any>(null);
  const [online, setOnline] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const showToast = useCallback((msg: string, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), err ? 6000 : 3000); }, []);

  useEffect(() => {
    const refresh = () => get("/api/status").then((s) => { setStatus(s); setOnline(true); }).catch(() => setOnline(false));
    refresh();
    const un = subscribe({ hello: (s) => { setStatus(s); setOnline(true); }, run: () => refresh() });
    const t = setInterval(refresh, 30000);
    return () => { un(); clearInterval(t); };
  }, []);

  const path = route.split("?")[0]!;
  const seg = path.split("/").filter(Boolean);
  let page;
  if (seg[0] === "automations" && seg[1] === "new") page = <AutomationForm />;
  else if (seg[0] === "automations" && seg[1]) page = <AutomationForm id={seg[1]} />;
  else if (seg[0] === "runs" && seg[1]) page = <RunDetail id={seg[1]} />;
  else if (seg[0] === "runs") page = <Runs />;
  else if (seg[0] === "backends") page = <Backends />;
  else if (seg[0] === "queue") page = <Queue />;
  else page = <Automations />;

  const link = (to: string, label: string, count?: number) => <a href={`#${to}`} className={(to === "/" ? path === "/" : path.startsWith(to)) ? "active" : ""}>{label}{count ? <span className="count">{count}</span> : null}</a>;
  return (
    <ToastCtx.Provider value={showToast}>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand"><span className={"dot" + (online ? "" : " off")} />autoed</div>
          <nav className="nav">
            {link("/", "Automations")}
            {link("/runs", "Runs", status?.running)}
            {link("/queue", "Queue", (status?.queued ?? 0) + (status?.rate_limited ?? 0))}
            {link("/backends", "Backends")}
          </nav>
          <div className="foot">{online ? <>v{status?.version} · {status?.running ?? 0}/{status?.global_max_concurrent ?? "?"} running<br /><span className="mono">{status?.home}</span></> : <span className="err">engine offline</span>}</div>
        </aside>
        <main className="main">{page}</main>
      </div>
      {toast && <div className={"toast" + (toast.err ? " err" : "")}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}
