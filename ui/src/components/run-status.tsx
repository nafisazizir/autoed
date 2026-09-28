import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  succeeded: "bg-green-700",
  failed: "bg-red-700",
  timed_out: "bg-red-700",
  running: "bg-blue-700 animate-pulse",
  starting: "bg-blue-700 animate-pulse",
  queued: "bg-gray-700",
  rate_limited: "bg-amber-700",
  cancelled: "bg-gray-600",
};

export const statusLabel = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

/** A run's state: the clone's square dot in the state's hue, then its name. */
export function RunStatus({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-label-13 text-gray-1000", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0", DOT[status] ?? "bg-gray-700")} />
      {statusLabel(status)}
    </span>
  );
}
