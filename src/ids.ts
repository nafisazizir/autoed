import { randomUUID, randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Lexicographically sortable id (ULID-like): 10 chars time + 16 chars random, lowercase. */
export function newId(): string {
  let t = Date.now();
  let time = "";
  for (let i = 0; i < 10; i++) { time = ALPHABET[t % 32] + time; t = Math.floor(t / 32); }
  const rnd = randomBytes(16);
  let r = "";
  for (let i = 0; i < 16; i++) r += ALPHABET[rnd[i]! % 32];
  return time + r;
}

export function newUuid(): string { return randomUUID(); }
export function shortId(id: string): string { return id.slice(-6); }
export function newSecret(): string { return randomBytes(24).toString("base64url"); }
export function nowIso(): string { return new Date().toISOString(); }
