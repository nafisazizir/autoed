import type { Config } from "../config.ts";
import type { BackendId } from "../types.ts";
import { ClaudeBackend } from "./claude.ts";
import { DevinBackend } from "./devin.ts";
import type { Backend, Detection } from "./types.ts";

export type { Backend, Detection, ModelInfo, ParsedResult, BuiltCommand, BuildContext } from "./types.ts";

export class Backends {
  readonly claude: ClaudeBackend;
  readonly devin: DevinBackend;
  constructor(cfg: Config, cacheDir: string) {
    this.claude = new ClaudeBackend(cfg);
    this.devin = new DevinBackend(cfg, cacheDir);
  }
  get(id: BackendId): Backend {
    if (id === "claude") return this.claude;
    if (id === "devin") return this.devin;
    throw new Error(`unknown backend ${id}`);
  }
  all(): Backend[] { return [this.claude, this.devin]; }
  private detections = new Map<BackendId, { at: number; d: Detection }>();
  /** detect() shells out (version, keychain, auth status); cache it briefly so the UI stays snappy. */
  async detectCached(id: BackendId, ttlMs = 60_000): Promise<Detection> {
    const hit = this.detections.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return hit.d;
    const d = await this.get(id).detect();
    this.detections.set(id, { at: Date.now(), d });
    return d;
  }
  invalidate() { this.claude.invalidate(); this.devin.invalidate(); this.detections.clear(); }
}
