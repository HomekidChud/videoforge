// ============================================================================
// Stateless signed tokens.
//
// A database row is a poor place for a credential on a host whose disk resets
// (a free Render instance, a redeploy, a container restart): the row vanishes
// and everybody is signed out. A signed token carries its own claims, so the
// server can check it with nothing but a secret that survives the restart.
//
// Where that secret comes from, in order of preference:
//   1. VIDEOFORGE_SESSION_SECRET        an explicit secret (best)
//   2. VIDEOFORGE_BOOTSTRAP_KEY         already required for hosted servers, so
//                                       the secret is derived from it
//   3. <data dir>/session-secret        generated once, lives as long as the disk
//   4. random, in memory                tokens die on restart (reported by /api/health)
// Rotating the source secret signs everybody out and invalidates every agent key.
// ============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type SecretSource = "env" | "bootstrap" | "file" | "memory";

let cached: { secret: Buffer; source: SecretSource } | null = null;

function dataRoot(): string {
  return path.dirname(path.resolve(process.env.VIDEOFORGE_DB || "data.db"));
}

function resolveSecret(): { secret: Buffer; source: SecretSource } {
  const explicit = process.env.VIDEOFORGE_SESSION_SECRET?.trim();
  if (explicit) {
    if (explicit.length < 16) console.warn("[auth] VIDEOFORGE_SESSION_SECRET is shorter than 16 characters; use a long random value.");
    return { secret: crypto.createHash("sha256").update(`vf-session-v1:${explicit}`).digest(), source: "env" };
  }
  const bootstrap = process.env.VIDEOFORGE_BOOTSTRAP_KEY?.trim();
  if (bootstrap) return { secret: crypto.createHmac("sha256", "vf-session-v1").update(bootstrap).digest(), source: "bootstrap" };
  const file = path.join(dataRoot(), "session-secret");
  try {
    if (fs.existsSync(file)) {
      const hex = fs.readFileSync(file, "utf8").trim();
      if (/^[a-f0-9]{64}$/.test(hex)) return { secret: Buffer.from(hex, "hex"), source: "file" };
    }
    const fresh = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fresh.toString("hex"), { mode: 0o600 });
    return { secret: fresh, source: "file" };
  } catch {
    return { secret: crypto.randomBytes(32), source: "memory" };
  }
}

function current() {
  return (cached ??= resolveSecret());
}

/** Where the signing secret comes from. "memory" means sign-ins do not survive a restart. */
export function secretSource(): SecretSource {
  return current().source;
}

/** Test hook: forget the cached secret so a changed environment is re-read. */
export function resetSecretCache(): void {
  cached = null;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function mac(kind: string, body: string): string {
  return crypto.createHmac("sha256", current().secret).update(`${kind}.${body}`).digest("base64url");
}

/** `<kind>.<payload>.<signature>`. The kind is signed too, so a token cannot be replayed as another kind. */
export function signToken(kind: string, payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${kind}.${body}.${mac(kind, body)}`;
}

/** The payload when the signature is valid and the token is not expired; otherwise null. */
export function verifyToken<T extends { x?: number }>(kind: string, token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== kind) return null;
  const [, body, sig] = parts;
  const expected = mac(kind, body);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.x !== "number" || payload.x <= Date.now()) return null;
    return payload;
  } catch { return null; }
}
