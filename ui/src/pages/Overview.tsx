import { useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { get, subscribe } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { AutomationsTable } from "@/components/automations-table";
import { useEngineStatus } from "@/components/engine-status";
import { Loading } from "@/components/loading";
import { EmptyState, Page, PageHeader, Section, Stat, StatGroup } from "@/components/page";
import { RunsTable } from "@/components/runs-table";

const DAY = 86400e3;
const BAD = ["failed", "timed_out"];

// The landing page: what is happening now, what went wrong lately, the
// last few runs, then the automations themselves.
export function Overview() {
  const status = useEngineStatus();
  const [autos, setAutos] = useState<any[] | null>(null);
  const [runs, setRuns] = useState<any[] | null>(null);
  const load = () => {
    get("/api/automations").then(setAutos).catch(notifyError);
    get("/api/runs?limit=100").then(setRuns).catch(() => setRuns([]));
  };
  useEffect(() => { load(); return subscribe({ run: load, automation: load }); }, []);

  const since = Date.now() - DAY;
  const recent = (runs ?? []).filter((r) => new Date(r.finished_at ?? r.started_at ?? r.queued_at).getTime() > since);
  const failed = recent.filter((r) => BAD.includes(r.status));
  const succeeded = recent.filter((r) => r.status === "succeeded");
  const attention = (runs ?? []).filter((r) => BAD.includes(r.status) || r.status === "rate_limited").slice(0, 5);
  const newButton = <Button shape="rounded" size="sm" onClick={() => nav("/automations/new")}><IconPlus data-icon="inline-start" />New automation</Button>;

  return (
    <Page>
      <PageHeader title="Overview" actions={newButton} />

      <StatGroup>
        <Stat label={`Running, of ${status.global_max_concurrent ?? "?"}`} value={status.running ?? 0} href="#/queue" />
        <Stat label="Queued" value={(status.queued ?? 0) + (status.rate_limited ?? 0)} href="#/queue" />
        <Stat label="Failed, last 24h" value={failed.length} href="#/runs" />
        <Stat label="Succeeded, last 24h" value={succeeded.length} href="#/runs" />
      </StatGroup>

      {attention.length > 0 && (
        <Section title="Needs attention">
          <RunsTable rows={attention} compact />
        </Section>
      )}

      <Section title="Recent runs" actions={<Button shape="rounded" size="xs" variant="secondary" onClick={() => nav("/runs")}>All runs</Button>}>
        {runs === null ? <Loading /> : runs.length === 0 ? <EmptyState title="No runs yet" /> : <RunsTable rows={runs.slice(0, 8)} compact />}
      </Section>

      <Section title="Automations" actions={<Button shape="rounded" size="xs" variant="secondary" onClick={() => nav("/automations")}>All automations</Button>}>
        {autos === null ? <Loading /> : autos.length === 0 ? <EmptyState title="No automations yet" action={newButton} /> : <AutomationsTable rows={autos} onChange={load} />}
      </Section>
    </Page>
  );
}
