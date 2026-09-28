import { useEffect, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { get, subscribe } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { AutomationsTable } from "@/components/automations-table";
import { Loading } from "@/components/loading";
import { EmptyState, Page, PageHeader } from "@/components/page";

export function Automations() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => get("/api/automations").then(setRows).catch(notifyError);
  useEffect(() => { load(); return subscribe({ run: load, automation: load }); }, []);
  const newButton = <Button shape="rounded" size="sm" onClick={() => nav("/automations/new")}><IconPlus data-icon="inline-start" />New automation</Button>;

  return (
    <Page>
      <PageHeader title="Automations" actions={newButton} />
      {rows === null ? <Loading /> : rows.length === 0
        ? <EmptyState title="No automations yet" action={newButton} />
        : <AutomationsTable rows={rows} onChange={load} />}
    </Page>
  );
}
