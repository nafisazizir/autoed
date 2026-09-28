export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { json = { error: text }; }
  if (!res.ok) throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}
export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) });
export const put = <T = any>(p: string, body?: unknown) => api<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const del = <T = any>(p: string) => api<T>(p, { method: "DELETE" });

/** Subscribes to the engine's SSE stream. Returns an unsubscribe function. */
export function subscribe(handlers: Record<string, (data: any) => void>, runId?: string): () => void {
  const es = new EventSource(runId ? `/api/stream?run=${encodeURIComponent(runId)}` : "/api/stream");
  for (const [ev, fn] of Object.entries(handlers)) es.addEventListener(ev, (e) => { try { fn(JSON.parse((e as MessageEvent).data)); } catch { fn((e as MessageEvent).data); } });
  return () => es.close();
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso); const now = Date.now(); const diff = d.getTime() - now; const abs = Math.abs(diff);
  const rel = abs < 60e3 ? `${Math.round(abs / 1e3)}s` : abs < 3600e3 ? `${Math.round(abs / 60e3)}m` : abs < 86400e3 ? `${Math.round(abs / 3600e3)}h` : `${Math.round(abs / 86400e3)}d`;
  return `${diff < 0 ? rel + " ago" : "in " + rel}`;
}
export function fmtAbs(iso: string | null | undefined): string { return iso ? new Date(iso).toLocaleString() : "–"; }
export function duration(a: string | null | undefined, b: string | null | undefined): string {
  if (!a) return "–"; const ms = (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
  if (ms < 60e3) return `${Math.round(ms / 1e3)}s`; if (ms < 3600e3) return `${Math.floor(ms / 60e3)}m ${Math.round((ms % 60e3) / 1e3)}s`; return `${Math.floor(ms / 3600e3)}h ${Math.round((ms % 3600e3) / 60e3)}m`;
}
