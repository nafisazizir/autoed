export type NavEntry = { name: string; href: string; count?: "running" | "waiting" };

/** One source for the rail and the mobile menu. */
export const nav: NavEntry[] = [
  { name: "Overview", href: "/" },
  { name: "Automations", href: "/automations" },
  { name: "Runs", href: "/runs", count: "running" },
  { name: "Queue", href: "/queue", count: "waiting" },
  { name: "Backends", href: "/backends" },
];
