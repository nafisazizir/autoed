import { useEffect, useState } from "react";
import { fmtTime, get, post, put, subscribe } from "@/lib/api";
import { notify, notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loading } from "@/components/loading";
import { Page, PageHeader, Section, Stat, StatGroup } from "@/components/page";
import { RunsTable } from "@/components/runs-table";

export function Queue() {
  const [q, setQ] = useState<any>(null);
  const load = () => get("/api/queue").then(setQ).catch(() => {});
  useEffect(() => { load(); return subscribe({ run: load }); }, []);
  if (!q) return <Loading page />;
  const setMax = async (n: number) => { if (!(n >= 1) || n === q.global_max_concurrent) return; try { await put("/api/settings", { global_max_concurrent: n }); notify(`Max concurrent: ${n}`); load(); } catch (e) { notifyError(e); } };
  const cancel = async (id: string) => { try { await post(`/api/runs/${id}/cancel`); notify("Run cancelled"); load(); } catch (e) { notifyError(e); } };
  const cancelButton = (r: any) => <Button shape="rounded" size="xs" variant="secondary" onClick={() => cancel(r.id)}>Cancel</Button>;

  const groups: [string, any[]][] = [
    ["Running", q.running_runs],
    ["Queued", q.queued_runs],
    ["Rate limited", q.rate_limited_runs],
  ];

  return (
    <Page>
      <PageHeader
        title="Queue"
        actions={
          <Field orientation="horizontal" className="w-fit">
            <FieldLabel htmlFor="global-max" className="whitespace-nowrap text-label-13">Max concurrent</FieldLabel>
            <Input id="global-max" type="number" min={1} max={20} size="sm" className="w-16 text-center" defaultValue={q.global_max_concurrent} key={q.global_max_concurrent}
              onBlur={(e) => setMax(Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") setMax(Number(e.currentTarget.value)); }} />
          </Field>
        }
      />

      <StatGroup>
        <Stat label={`Running, of ${q.global_max_concurrent}`} value={q.running} />
        <Stat label="Queued" value={q.queued} />
        <Stat label="Rate limited" value={q.rate_limited} />
        <Stat label="Last heartbeat" value={fmtTime(q.last_heartbeat_at)} />
      </StatGroup>

      {groups.map(([title, rows]) => (
        <Section key={title} title={`${title}${rows.length ? ` (${rows.length})` : ""}`}>
          {rows.length === 0 ? <p className="text-copy-13 text-gray-900">None</p> : <RunsTable rows={rows} compact trailing={cancelButton} />}
        </Section>
      ))}

      <Section title="Per automation">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-0">Automation</TableHead>
              <TableHead>Running</TableHead>
              <TableHead>Queued</TableHead>
              <TableHead>Cap</TableHead>
              <TableHead className="pe-0">Rate limit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.per_automation.map((a: any) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => nav(`/automations/${a.id}`)}>
                <TableCell className="ps-0"><a href={`#/automations/${a.id}`} className="text-gray-1000 outline-none hover:underline focus-visible:underline">{a.name}</a></TableCell>
                <TableCell className="tabular-nums">{a.running}</TableCell>
                <TableCell className="tabular-nums">{a.queued}</TableCell>
                <TableCell className="tabular-nums">{a.max_concurrent}</TableCell>
                <TableCell className="pe-0">{a.rate_limit ?? <span className="text-gray-900">None</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </Page>
  );
}
