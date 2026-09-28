import { duration, fmtAbs, fmtTime } from "@/lib/api";
import { nav } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mono } from "@/components/page";
import { RunStatus } from "@/components/run-status";

const note = (r: any) => r.error?.split("\n")[0] ?? r.summary?.split("\n")[0] ?? "";

/** Runs as rows. `compact` drops the agent and session columns and shows relative times, for lists inside other pages. */
export function RunsTable({ rows, compact, trailing }: { rows: any[]; compact?: boolean; trailing?: (r: any) => React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="ps-0">Status</TableHead>
          <TableHead>Automation</TableHead>
          {!compact && <TableHead>Agent</TableHead>}
          <TableHead>{compact ? "When" : "Started"}</TableHead>
          <TableHead>Duration</TableHead>
          {!compact && <TableHead>Session</TableHead>}
          <TableHead className={trailing ? undefined : "pe-0"}>Note</TableHead>
          {trailing && <TableHead className="pe-0"><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/runs/${r.id}`)}>
            <TableCell className="ps-0"><RunStatus status={r.status} /></TableCell>
            <TableCell>
              <div className="flex flex-col">
                <a href={`#/runs/${r.id}`} className="text-label-14 text-gray-1000 outline-none hover:underline focus-visible:underline">{r.automation_name}</a>
                <Mono className="text-gray-900">#{r.id.slice(-6)}{r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}</Mono>
              </div>
            </TableCell>
            {!compact && (
              <TableCell>
                <div className="flex gap-1">
                  <Badge variant="secondary">{r.backend}</Badge>
                  <Badge variant="outline">{r.model ?? "default"}</Badge>
                </div>
              </TableCell>
            )}
            <TableCell className="text-label-13 text-gray-900 tabular-nums" title={fmtAbs(r.started_at ?? r.queued_at)}>{compact ? fmtTime(r.started_at ?? r.queued_at) : fmtAbs(r.started_at ?? r.queued_at)}</TableCell>
            <TableCell className="text-label-13 tabular-nums">{r.started_at ? duration(r.started_at, r.finished_at) : "–"}</TableCell>
            {!compact && <TableCell><Mono className="text-gray-900">{r.session_id ? r.session_id.slice(0, 12) : "–"}</Mono></TableCell>}
            <TableCell className={"max-w-80 truncate text-label-13 text-gray-900" + (trailing ? "" : " pe-0")} title={note(r)}>{note(r)}</TableCell>
            {trailing && <TableCell className="pe-0 text-end" onClick={(e) => e.stopPropagation()}>{trailing(r)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
