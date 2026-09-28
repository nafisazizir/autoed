export type BackendId = "claude" | "devin";
export type CatchupPolicy = "coalesce" | "replay" | "skip";
export type TriggerKind = "schedule" | "webhook" | "github" | "manual";
export type EventStatus = "queued" | "coalesced" | "dispatched" | "dropped";
export type RunStatus =
  | "queued" | "starting" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "rate_limited";

export interface NotifyConfig {
  macos?: boolean;
  webhook?: { url: string; template?: "generic" | "slack" | "telegram" | "ntfy" };
}

export interface Automation {
  id: string;
  name: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  backend: BackendId;
  model: string | null;
  agent_mode: string | null;
  agent_profile: string | null;
  instructions: string;
  working_dir: string;
  isolate_worktree: number;
  continue_session: number;
  mcp_config: string | null;
  timeout_sec: number;
  max_concurrent: number;
  rate_limit_count: number | null;
  rate_limit_window_sec: number | null;
  catchup_policy: CatchupPolicy;
  notify: string | null; // JSON NotifyConfig
  metadata: string | null; // JSON
  json_schema: string | null;
  add_dirs: string | null; // JSON string[]
  sandbox: number;
}

export interface Trigger {
  id: string;
  automation_id: string;
  kind: TriggerKind;
  config: string; // JSON
  enabled: number;
  next_fire_at: string | null;
  cursor: string | null;
}

export interface ScheduleTriggerConfig { cron: string; tz?: string }
export interface WebhookTriggerConfig { secret: string; hmac?: boolean }
export interface GithubTriggerConfig { repo: string; events: string[]; filter?: string; intervalSec?: number }

export interface Event {
  id: string;
  trigger_id: string | null;
  automation_id: string;
  occurred_at: string;
  payload: string | null;
  status: EventStatus;
  kind: TriggerKind;
  missed_count: number;
}

export interface Run {
  id: string;
  automation_id: string;
  event_id: string | null;
  status: RunStatus;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  backend: BackendId;
  model: string | null;
  session_id: string | null;
  working_dir: string;
  worktree_path: string | null;
  exit_code: number | null;
  error: string | null;
  result_json: string | null;
  attempt: number;
  next_attempt_at: string | null;
  pid: number | null;
  summary: string | null;
}

export interface AutomationInput {
  name: string;
  enabled?: boolean;
  backend: BackendId;
  model?: string | null;
  agent_mode?: string | null;
  agent_profile?: string | null;
  instructions: string;
  working_dir: string;
  isolate_worktree?: boolean;
  continue_session?: boolean;
  mcp_config?: unknown;
  timeout_sec?: number;
  max_concurrent?: number;
  rate_limit_count?: number | null;
  rate_limit_window_sec?: number | null;
  catchup_policy?: CatchupPolicy;
  notify?: NotifyConfig | null;
  metadata?: Record<string, string> | null;
  json_schema?: unknown;
  add_dirs?: string[];
  sandbox?: boolean;
  triggers?: Array<{ id?: string; kind: TriggerKind; config?: Record<string, unknown>; enabled?: boolean }>;
}

export const ACTIVE_RUN_STATUSES: RunStatus[] = ["starting", "running"];
export const TERMINAL_RUN_STATUSES: RunStatus[] = ["succeeded", "failed", "timed_out", "cancelled"];
