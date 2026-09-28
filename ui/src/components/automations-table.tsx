import { useState } from "react";
import { IconDots, IconPencil, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { del, fmtTime, post, put } from "@/lib/api";
import { notify, notifyError } from "@/lib/notify";
import { nav } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAlert } from "@/components/confirm-dialog";
import { Mono } from "@/components/page";
import { RunStatus } from "@/components/run-status";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const KIND: Record<string, string> = { schedule: "Schedule", webhook: "Webhook", github: "GitHub" };

function triggers(a: any) {
  if (!a.triggers.length) return <span className="text-gray-900">Manual</span>;
  const schedule = a.triggers.find((t: any) => t.kind === "schedule");
  const kinds = [...new Set<string>(a.triggers.map((t: any) => KIND[t.kind] ?? t.kind))];
  return (
    <div className="flex flex-col">
      <span>{kinds.join(", ")}</span>
      {schedule && <Mono className="text-gray-900">{schedule.config.cron}</Mono>}
    </div>
  );
}

function nextRun(a: any) {
  if (!a.enabled) return <span className="text-gray-900">Paused</span>;
  if (a.running) return <span className="text-blue-900">{a.running} running{a.queued ? `, ${a.queued} queued` : ""}</span>;
  if (a.queued) return <span>{a.queued} queued</span>;
  if (a.next_run_at) return fmtTime(a.next_run_at);
  return <span className="text-gray-900">{a.triggers.length ? "On event" : "By hand"}</span>;
}

/** One row per automation: toggle, name, trigger, agent, next run, last run, actions. Rows open the editor. */
export function AutomationsTable({ rows, onChange }: { rows: any[]; onChange: () => void }) {
  const [deleting, setDeleting] = useState<any>(null);
  const toggle = async (a: any) => { try { await put(`/api/automations/${a.id}`, { enabled: !a.enabled }); onChange(); } catch (e) { notifyError(e); } };
  const runNow = async (a: any) => { try { const r = await post(`/api/automations/${a.id}/run`); notify("Run queued"); nav(`/runs/${r.id}`); } catch (e) { notifyError(e); } };
  const remove = async (a: any) => { try { await del(`/api/automations/${a.id}`); notify(`Deleted ${a.name}`); onChange(); } catch (e) { notifyError(e); } };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 ps-0"><span className="sr-only">Enabled</span></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead className="pe-0 text-end"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id} className="cursor-pointer" onClick={() => nav(`/automations/${a.id}`)}>
              <TableCell className="ps-0" onClick={stop}>
                <Switch size="sm" checked={!!a.enabled} onCheckedChange={() => toggle(a)} aria-label={a.enabled ? `Pause ${a.name}` : `Enable ${a.name}`} />
              </TableCell>
              <TableCell>
                <div className="flex max-w-72 flex-col">
                  <a href={`#/automations/${a.id}`} className="truncate text-label-14 text-gray-1000 outline-none hover:underline focus-visible:underline">{a.name}</a>
                  <Mono className="truncate text-gray-900" title={a.working_dir}>{a.working_dir}</Mono>
                </div>
              </TableCell>
              <TableCell className="text-label-13">{triggers(a)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Badge variant="secondary">{a.backend}</Badge>
                  <Badge variant="outline">{a.model ?? "default"}</Badge>
                </div>
              </TableCell>
              <TableCell className="text-label-13 tabular-nums">{nextRun(a)}</TableCell>
              <TableCell>
                {a.last_run
                  ? <a href={`#/runs/${a.last_run.id}`} onClick={stop} className="inline-flex flex-col gap-0.5 outline-none hover:underline focus-visible:underline"><RunStatus status={a.last_run.status} /><span className="text-label-12 text-gray-900">{fmtTime(a.last_run.finished_at ?? a.last_run.started_at ?? a.last_run.queued_at)}</span></a>
                  : <span className="text-label-13 text-gray-900">Never</span>}
              </TableCell>
              <TableCell className="pe-0" onClick={stop}>
                <div className="flex items-center justify-end gap-1">
                  <Button shape="rounded" size="xs" variant="secondary" onClick={() => runNow(a)}><IconPlayerPlay data-icon="inline-start" />Run now</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button shape="rounded" size="icon-xs" variant="ghost" aria-label={`More actions for ${a.name}`} />}><IconDots /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => nav(`/automations/${a.id}`)}><IconPencil />Edit</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleting(a)}><IconTrash />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmAlert
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title={`Delete ${deleting?.name}?`}
        description="Cancels its active runs and removes its triggers and run history."
        action="Delete"
        onConfirm={() => remove(deleting)}
      />
    </>
  );
}
