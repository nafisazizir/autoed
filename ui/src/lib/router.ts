import { useEffect, useState } from "react";

/** Hash routing: the engine serves one embedded HTML file, so every page lives under #/. */
export function useRoute() {
  const read = () => (location.hash.slice(1) || "/").split("?")[0]!;
  const [path, setPath] = useState(read);
  useEffect(() => { const f = () => setPath(read()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return path;
}

export const nav = (to: string) => { location.hash = to; };

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
