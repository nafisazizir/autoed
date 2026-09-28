import { createContext, useContext } from "react";

export type EngineStatus = { online: boolean; version?: string; home?: string; running?: number; queued?: number; rate_limited?: number; global_max_concurrent?: number };

export const EngineStatusContext = createContext<EngineStatus>({ online: true });
export const useEngineStatus = () => useContext(EngineStatusContext);

export const navCount = (s: EngineStatus, kind?: "running" | "waiting") =>
  kind === "running" ? s.running ?? 0 : kind === "waiting" ? (s.queued ?? 0) + (s.rate_limited ?? 0) : 0;
