import { useEffect, useState } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { get, post } from "@/lib/api";
import { notify, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Loading } from "@/components/loading";
import { Ledger, Mono, Notice, Page, PageHeader, Section } from "@/components/page";

/** A yes/no/unknown answer with a square dot. */
function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("size-1.5 shrink-0", ok === true ? "bg-green-700" : ok === false ? "bg-red-700" : "bg-gray-600")} />
      {children}
    </span>
  );
}

export function Backends() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => get("/api/backends").then(setData).catch(notifyError);
  useEffect(() => { load(); }, []);
  const refresh = async () => { setBusy(true); try { await post("/api/backends/refresh"); await load(); notify("Backends refreshed"); } catch (e) { notifyError(e); } finally { setBusy(false); } };

  return (
    <Page>
      <PageHeader
        title="Backends"
        actions={<Button shape="rounded" size="sm" variant="secondary" disabled={busy} onClick={refresh}>{busy ? <Spinner data-icon="inline-start" /> : <IconRefresh data-icon="inline-start" />}Re-detect</Button>}
      />
      {!data ? <Loading label="Detecting backends" /> : <>
        {data.environment.api_key_vars_present.length > 0 && (
          <Notice icon={IconAlertTriangle} title={`${data.environment.api_key_vars_present.join(", ")} is set in the engine's environment`}>
            Runs don't get it, but remove it from your login environment so Claude Code can't bill API credits.
          </Notice>
        )}
        <div className="grid gap-10 xl:grid-cols-2">
          {data.backends.map((b: any) => (
            <Section key={b.id} title={b.label} actions={<Check ok={b.detection.ok}><span className="text-label-13">{b.detection.ok ? "Available" : "Not available"}</span></Check>}>
              <Ledger items={[
                ["Binary", b.detection.binary ? <Mono>{b.detection.binary}</Mono> : <span className="text-red-900">{b.detection.note}</span>],
                ["Version", b.detection.version ?? "–"],
                ["Logged in", <Check ok={b.detection.loggedIn}>{b.detection.loggedIn === true ? "Yes" : b.detection.loggedIn === false ? b.detection.note ?? "No" : "Unknown"}</Check>],
                ["Defaults", <span className="inline-flex flex-wrap gap-1"><Badge variant="secondary">{b.default_model}</Badge><Badge variant="outline">{b.default_agent_mode}</Badge></span>],
                ["Agent modes", <span className="inline-flex flex-wrap gap-1">{b.agent_modes.map((m: any) => <Badge key={m.id} variant={m.dangerous ? "destructive" : "outline"}>{m.id}</Badge>)}</span>],
                [`Models (${b.models.length})`, <span className="inline-flex flex-wrap gap-1">{b.models.map((m: any) => <Badge key={m.id} variant="outline" className="max-w-full" title={m.note ? `${m.label} · ${m.note}` : m.label}><span className="truncate">{m.label}</span>{m.free && <span className="text-green-900">Free</span>}</Badge>)}</span>],
              ]} />
            </Section>
          ))}
        </div>
      </>}
    </Page>
  );
}
