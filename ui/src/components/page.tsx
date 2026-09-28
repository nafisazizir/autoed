import * as React from "react";
import { cn } from "@/lib/utils";

// Page vocabulary. Layout follows what a dashboard needs; the business-x
// clone survives as accents only: pill buttons and flat square grey panels.

export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-10 pb-16", className)} {...props} />;
}

/** Title and one line of description on the left, actions on the right, on one line from md. */
export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between lg:pt-(--rail-content-top)">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-heading-32 text-gray-1000">{title}</h1>
        {description && <p className="text-copy-14 text-gray-900">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block: Heading 16, an optional line under it, actions at the end of the title row, then the content. */
export function Section({ title, description, actions, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-heading-16 text-gray-1000">{title}</h2>
          {description && <p className="text-copy-13 text-gray-900">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** The clone's surface: a flat square grey panel, no border. */
export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bg-gray-100 p-4 text-gray-1000", className)} {...props} />;
}

/** Label/value rows separated by hairlines. */
export function Ledger({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("flex flex-col border-t border-gray-alpha-400", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-1 gap-1 border-b border-gray-alpha-400 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
          <dt className="text-label-13 text-gray-900">{k}</dt>
          <dd className="min-w-0 text-label-13 break-words text-gray-1000">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Figures on one grey surface; the 1px gaps show the rule colour as hairlines between cells. */
export function StatGroup({ className, children, ...props }: React.ComponentProps<"dl">) {
  const count = React.Children.count(children);
  return (
    <dl data-columns={Math.min(Math.max(count, 1), 4)} className={cn("grid grid-cols-2 gap-px bg-gray-alpha-400 data-[columns=3]:sm:grid-cols-3 data-[columns=4]:sm:grid-cols-4", className)} {...props}>
      {children}
    </dl>
  );
}

export function Stat({ label, value, href }: { label: React.ReactNode; value: React.ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="order-last text-label-13 text-gray-900">{label}</dt>
      <dd className="truncate text-heading-24 text-gray-1000 tabular-nums">{value}</dd>
    </>
  );
  const cls = "flex min-w-0 flex-col gap-0.5 bg-gray-100 px-5 py-4";
  return href ? <a href={href} className={cn(cls, "outline-none transition-colors hover:bg-gray-200 focus-visible:ring-3 focus-visible:ring-gray-600/50")}>{body}</a> : <div className={cls}>{body}</div>;
}

/** Monospace output (logs, prompts, JSON) on a grey panel. */
export const CodeView = React.forwardRef<HTMLPreElement, React.ComponentProps<"pre">>(function CodeView({ className, ...props }, ref) {
  return <pre ref={ref} className={cn("max-h-[36rem] overflow-auto bg-gray-100 p-4 text-copy-13-mono break-words whitespace-pre-wrap text-gray-1000", className)} {...props} />;
});

export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-label-13-mono", className)} {...props} />;
}

/** A notice: grey for information, red for failure. */
export function Notice({ tone = "default", icon: Icon, title, children, actions }: { tone?: "default" | "danger"; icon?: React.ComponentType<{ className?: string }>; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 p-4", tone === "danger" ? "bg-red-100 text-red-900" : "bg-gray-100 text-gray-1000")}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-label-13">{title}</p>
        {children && <div className={cn("text-copy-13 break-words", tone === "danger" ? "text-red-900" : "text-gray-900")}>{children}</div>}
      </div>
      {actions}
    </div>
  );
}

/** An empty list: a short line on a grey panel, with an optional action. */
export function EmptyState({ title, description, action }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Panel className="flex flex-col items-start gap-3 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-label-14 text-gray-1000">{title}</p>
        {description && <p className="text-copy-13 text-gray-900">{description}</p>}
      </div>
      {action}
    </Panel>
  );
}
