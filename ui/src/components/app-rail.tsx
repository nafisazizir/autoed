import { useState } from "react";
import { nav } from "@/lib/config";
import { isActive } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Nav, NavContent, NavFooter, NavItem, NavLink, NavList } from "@/components/ui/nav";
import { navCount, useEngineStatus } from "@/components/engine-status";

function RailLinks({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const status = useEngineStatus();
  return (
    <NavList marker>
      {nav.map((item) => {
        const n = navCount(status, item.count);
        return (
          <NavItem key={item.href}>
            <NavLink active={isActive(path, item.href)} href={`#${item.href}`} onClick={onNavigate}>
              {item.name}
              {n > 0 && <span className="ms-auto text-label-13 text-gray-900 tabular-nums">{n}</span>}
            </NavLink>
          </NavItem>
        );
      })}
    </NavList>
  );
}

function EngineLine() {
  const status = useEngineStatus();
  return status.online ? null : <p className="text-label-13 text-red-900">Engine offline</p>;
}

// The rail from the business-x clone: the first column of a centred frame,
// sticky and full height, links marked by the sliding square, a warning at the
// foot when the engine is offline.
export function AppRail({ path }: { path: string }) {
  return (
    <Nav aria-label="Primary" className="sticky top-0 hidden h-svh w-(--rail-width) shrink-0 gap-6 px-5 pt-(--rail-content-top) pb-6 md:flex">
      <NavContent>
        <RailLinks path={path} />
      </NavContent>
      <NavFooter>
        <EngineLine />
      </NavFooter>
    </Nav>
  );
}

// Below md the rail is gone; a bar opens the same links full screen, one type
// role louder.
export function MobileNav({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const current = nav.find((item) => isActive(path, item.href));
  return (
    <>
      <header className="sticky top-0 z-50 flex h-14 items-center gap-2 bg-background-100 px-4 md:hidden">
        <span className="text-label-14 text-gray-1000">{current?.name}</span>
        <Button variant="ghost" size="sm" shape="rounded" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ms-auto">
          {open ? "Close" : "Menu"}
        </Button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-50 overflow-y-auto bg-background-100 md:hidden">
          <Nav size="lg" aria-label="Primary" className="gap-10 px-4 py-6">
            <RailLinks path={path} onNavigate={() => setOpen(false)} />
            <EngineLine />
          </Nav>
        </div>
      )}
    </>
  );
}
