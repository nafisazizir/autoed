import { useEffect, useState } from "react";
import { get, subscribe } from "@/lib/api";
import { FilterMenu } from "@/components/filter-menu";
import { Loading } from "@/components/loading";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { statusLabel } from "@/components/run-status";
import { RunsTable } from "@/components/runs-table";

const ALL = "all";
const STATUSES = ["running", "queued", "rate_limited", "succeeded", "failed", "timed_out", "cancelled"];

export function Runs() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [status, setStatus] = useState(ALL);
  const [autos, setAutos] = useState<any[]>([]);
  const [auto, setAuto] = useState(ALL);
  const load = () => get(`/api/runs?limit=200${status !== ALL ? `&status=${status === "running" ? "running,starting" : status}` : ""}${auto !== ALL ? `&automation_id=${auto}` : ""}`).then(setRows).catch(() => setRows([]));
  useEffect(() => { get("/api/automations").then(setAutos).catch(() => {}); }, []);
  useEffect(() => { load(); return subscribe({ run: load }); }, [status, auto]);
  const filtered = status !== ALL || auto !== ALL;

  return (
    <Page>
      <PageHeader
        title="Runs"
        actions={<>
          <FilterMenu label="Automation" value={auto} onChange={setAuto} options={[{ label: "All automations", value: ALL }, ...autos.map((a) => ({ label: a.name, value: a.id }))]} />
          <FilterMenu label="Status" value={status} onChange={setStatus} options={[{ label: "All statuses", value: ALL }, ...STATUSES.map((s) => ({ label: statusLabel(s), value: s }))]} />
        </>}
      />
      {rows === null ? <Loading /> : rows.length === 0
        ? <EmptyState title={filtered ? "No runs match" : "No runs yet"} />
        : <RunsTable rows={rows} />}
    </Page>
  );
}
