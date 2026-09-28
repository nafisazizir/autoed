import { useEffect, useState } from "react";
import { get, subscribe } from "@/lib/api";
import { useRoute } from "@/lib/router";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRail, MobileNav } from "@/components/app-rail";
import { EdgeFade } from "@/components/edge-fade";
import { type EngineStatus, EngineStatusContext } from "@/components/engine-status";
import { Overview } from "@/pages/Overview";
import { Automations } from "@/pages/Automations";
import { AutomationForm } from "@/pages/AutomationForm";
import { Runs } from "@/pages/Runs";
import { RunDetail } from "@/pages/RunDetail";
import { Backends } from "@/pages/Backends";
import { Queue } from "@/pages/Queue";

function useEngineStatusPoll(): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>({ online: true });
  useEffect(() => {
    const refresh = () => get("/api/status").then((s) => setStatus({ ...s, online: true })).catch(() => setStatus((s) => ({ ...s, online: false })));
    refresh();
    const un = subscribe({ hello: (s) => setStatus({ ...s, online: true }), run: () => refresh() });
    const t = setInterval(refresh, 30000);
    return () => { un(); clearInterval(t); };
  }, []);
  return status;
}

function route(path: string) {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "automations" && seg[1] === "new") return <AutomationForm key="new" />;
  if (seg[0] === "automations" && seg[1]) return <AutomationForm key={seg[1]} id={seg[1]} />;
  if (seg[0] === "automations") return <Automations />;
  if (seg[0] === "runs" && seg[1]) return <RunDetail key={seg[1]} id={seg[1]} />;
  if (seg[0] === "runs") return <Runs />;
  if (seg[0] === "backends") return <Backends />;
  if (seg[0] === "queue") return <Queue />;
  return <Overview />;
}

// A centred frame with a 208px rail, then the page column capped at 1152px,
// with frosted top and bottom edges. --rail-content-top is where the rail's
// first link starts; page titles hang off the same line.
export function App() {
  const path = useRoute();
  const status = useEngineStatusPoll();
  useEffect(() => { scrollTo(0, 0); }, [path]);

  return (
    <ThemeProvider>
      <EngineStatusContext.Provider value={status}>
        <TooltipProvider>
          <Toaster>
            <div className="mx-auto flex min-h-svh w-full max-w-360 bg-background-100 [--edge-fade:var(--color-background-100)] [--header-height:--spacing(14)] [--rail-content-top:--spacing(20)] [--rail-width:13rem] md:[--header-height:0px]">
              <AppRail path={path} />
              <main className="flex min-w-0 flex-1 flex-col">
                <MobileNav path={path} />
                <EdgeFade side="top" />
                <div className="mx-auto flex w-full max-w-288 flex-1 flex-col px-4">{route(path)}</div>
                <EdgeFade side="bottom" />
              </main>
            </div>
          </Toaster>
        </TooltipProvider>
      </EngineStatusContext.Provider>
    </ThemeProvider>
  );
}
