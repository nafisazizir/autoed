import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, chmodSync } from "node:fs";

/** Everything on disk derives from AUTOED_HOME (default ~/.autoed). No literal user paths. */
export interface Config {
  port: number;
  host: string;
  globalMaxConcurrent: number;
  heartbeatSec: number;
  dispatchIntervalSec: number;
  modelCacheHours: number;
  notifications: { macos: boolean; webhook?: { url: string; template?: "generic" | "slack" | "telegram" | "ntfy" } };
  claude: { binary?: string; models?: string[]; defaultModel?: string };
  devin: { binary?: string; defaultModel?: string };
  logRetentionDays: number;
}

export const DEFAULT_CONFIG: Config = {
  port: 4848,
  host: "127.0.0.1",
  globalMaxConcurrent: 2,
  heartbeatSec: 60,
  dispatchIntervalSec: 5,
  modelCacheHours: 24,
  notifications: { macos: true },
  claude: { models: ["opus", "sonnet", "haiku"], defaultModel: "sonnet" },
  devin: { defaultModel: "swe-2-high" },
  logRetentionDays: 30,
};

export interface Paths {
  home: string;
  db: string;
  config: string;
  runs: string;
  worktrees: string;
  logs: string;
  bin: string;
  cache: string;
}

export function resolvePaths(home = process.env.AUTOED_HOME || join(homedir(), ".autoed")): Paths {
  return {
    home,
    db: join(home, "autoed.db"),
    config: join(home, "config.json"),
    runs: join(home, "runs"),
    worktrees: join(home, "worktrees"),
    logs: join(home, "logs"),
    bin: join(home, "bin"),
    cache: join(home, "cache"),
  };
}

export function ensureDirs(p: Paths): void {
  for (const d of [p.home, p.runs, p.worktrees, p.logs, p.bin, p.cache]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true, mode: 0o700 });
  }
  try { chmodSync(p.home, 0o700); } catch { /* best effort */ }
}

export function loadConfig(p: Paths): Config {
  if (!existsSync(p.config)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(readFileSync(p.config, "utf8"));
    return deepMerge(structuredClone(DEFAULT_CONFIG), raw) as Config;
  } catch (e) {
    console.error(`[autoed] config.json is invalid, using defaults: ${(e as Error).message}`);
    return structuredClone(DEFAULT_CONFIG);
  }
}

function deepMerge(base: any, over: any): any {
  if (typeof over !== "object" || over === null || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base?.[k], over[k]);
  return out;
}

export const APP_ID = "ai.autoed.engine";
export const VERSION = "0.1.0";
