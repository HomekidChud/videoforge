// ============================================================================
// API key / permission / restriction model.
//
// Keys are stored as sha256(key) only. Plaintext is shown once on creation.
// Prefixes: `vf_pub_` (public/embeddable), `vf_live_` (private), `vf_admin_` (owner).
//
// Public keys are READ-ONLY and can never hold write/admin permissions or
// manage other keys. Private keys can hold any permission.
//
// Restrictions enforced on every auth path (Bearer AND signed media token):
//   - revoked / disabled
//   - expiry
//   - allowed origins (browser-only defense; spoofable outside browsers)
//   - allowed IPs / CIDRs
//   - rate limit (requests/hour, sliding window via key_usage table)
//   - quota (total requests, lifetime)
//   - fine-grained permissions (replaces legacy scope; legacy scope kept for compat)
// ============================================================================

import type { Express, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { db, logKeyUsage, keyUsageStats } from "./storage";
import { apiKeys, type ApiKey, type Permission, PERMISSIONS, scopeToPermissions } from "@shared/schema";
import { eq } from "drizzle-orm";

export type Scope = "read" | "write" | "admin";
export const SCOPES: Scope[] = ["read", "write", "admin"];
export const ADMIN_KEY_FILE = path.resolve("data/OWNER_KEY.txt");

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function newKey(prefix: "vf_pub_" | "vf_live_" | "vf_admin_"): string {
  const rand = crypto.randomBytes(24).toString("hex");
  return `${prefix}${rand}`;
}

// ---------------------------------------------------------------------------
// Helpers: parse JSON columns safely
// ---------------------------------------------------------------------------

function parseJsonArray(s: string): string[] {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
function parsePermissions(s: string): Permission[] {
  const a = parseJsonArray(s);
  return a.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
}

export function keyPermissions(k: ApiKey): Permission[] {
  const perms = parsePermissions(k.permissions);
  if (perms.length > 0) return perms;
  return scopeToPermissions(k.scope as Scope);
}

export function keyKind(k: ApiKey): "public" | "private" {
  return (k.kind as "public" | "private") === "public" ? "public" : "private";
}

// Public keys cannot hold write/admin permissions regardless of what's stored.
export function effectivePermissions(k: ApiKey): Permission[] {
  const perms = keyPermissions(k);
  if (keyKind(k) === "public") return perms.filter((p) => p === "media:read" || p === "projects:read" || p === "renders:download");
  return perms;
}

export type KeyRestrictions = {
  expiresAt: number;
  allowedOrigins: string[];
  allowedIps: string[];
  rateLimitPerHour: number;
  quotaTotal: number;
};

export function keyRestrictions(k: ApiKey): KeyRestrictions {
  return {
    expiresAt: k.expiresAt ?? 0,
    allowedOrigins: parseJsonArray(k.allowedOrigins ?? "[]"),
    allowedIps: parseJsonArray(k.allowedIps ?? "[]"),
    rateLimitPerHour: k.rateLimitPerHour ?? 0,
    quotaTotal: k.quotaTotal ?? 0,
  };
}

// ---------------------------------------------------------------------------
// CIDR / IP matching
// ---------------------------------------------------------------------------

function ipToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) { const v = parseInt(p, 10); if (isNaN(v) || v < 0 || v > 255) return null; n = (n << 8) | v; }
  return n >>> 0;
}

function matchCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr ?? "32", 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const a = ipToLong(ip); const b = ipToLong(net);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

export function ipAllowed(req: Request, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) return true; // unrestricted
  // Prefer X-Forwarded-For if present (render proxy). Fall back to socket.
  let ip = req.socket.remoteAddress ?? "";
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    // Take the FIRST hop (original client) — trust only the proxy-added header
    ip = xff.split(",")[0].trim();
  }
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return allowedIps.some((entry) => entry === ip || matchCidr(ip, entry));
}

export function originAllowed(req: Request, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true;
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (no Origin header) — cannot check
  return allowedOrigins.includes(origin);
}

export function isExpired(k: ApiKey): boolean {
  const r = keyRestrictions(k);
  return r.expiresAt > 0 && r.expiresAt < Date.now();
}

// ---------------------------------------------------------------------------
// Owner bootstrap (unchanged behaviour)
// ---------------------------------------------------------------------------

let ownerKeyPlaintext: string | null = null;

export async function ensureOwnerKeyExists(): Promise<string> {
  const bootstrap = process.env.VIDEOFORGE_BOOTSTRAP_KEY?.trim();
  if (bootstrap) {
    const hash = hashKey(bootstrap);
    const existing = listKeys().find((k) => k.keyHash === hash);
    if (existing) return existing.id;
    const row = db.insert(apiKeys)
      .values({
        id: crypto.randomUUID(),
        label: "owner (bootstrap env)",
        kind: "private",
        scope: "admin",
        permissions: JSON.stringify(scopeToPermissions("admin")),
        keyHash: hash,
        revoked: 0,
        expiresAt: 0,
        allowedOrigins: "[]",
        allowedIps: "[]",
        rateLimitPerHour: 0,
        quotaTotal: 0,
        requestsUsed: 0,
        lastUsedAt: 0,
        createdAt: Date.now(),
      })
      .returning().get() as ApiKey;
    console.log(`[auth] owner key seeded from VIDEOFORGE_BOOTSTRAP_KEY env var`);
    return row.id;
  }

  const existing = listKeys().find((k) => k.scope === "admin");
  if (existing) return existing.id;

  const key = newKey("vf_admin_");
  const row = db.insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      label: "owner (auto-created on first run)",
      kind: "private",
      scope: "admin",
      permissions: JSON.stringify(scopeToPermissions("admin")),
      keyHash: hashKey(key),
      revoked: 0,
      expiresAt: 0,
      allowedOrigins: "[]",
      allowedIps: "[]",
      rateLimitPerHour: 0,
      quotaTotal: 0,
      requestsUsed: 0,
      lastUsedAt: 0,
      createdAt: Date.now(),
    })
    .returning().get() as ApiKey;
  ownerKeyPlaintext = key;
  fs.mkdirSync(path.dirname(ADMIN_KEY_FILE), { recursive: true });
  await fsp.writeFile(ADMIN_KEY_FILE, `# VideoForge owner key (keep this secret; delete this file after saving it elsewhere)\n${key}\n`, { mode: 0o600 });
  console.log("=".repeat(64));
  console.log("Created your first admin (owner) API key. It is stored at:");
  console.log("  " + ADMIN_KEY_FILE);
  console.log("Copy it somewhere safe (password manager / env var), then delete that file.");
  console.log("You can also create more keys later with POST /api/keys.");
  console.log("=".repeat(64));
  return row.id;
}

export function getOwnerKeyPlaintext(): string | null {
  return ownerKeyPlaintext;
}

// ---------------------------------------------------------------------------
// Key CRUD (admin only)
// ---------------------------------------------------------------------------

export function listKeys(): ApiKey[] {
  return db.select().from(apiKeys).all();
}

export type NewKeyOpts = {
  label: string;
  kind: "public" | "private";
  permissions: Permission[];
  expiresAt?: number;
  allowedOrigins?: string[];
  allowedIps?: string[];
  rateLimitPerHour?: number;
  quotaTotal?: number;
};

export function createKey(opts: NewKeyOpts): { key: string; record: ApiKey } {
  const kind = opts.kind;
  let perms = opts.permissions.filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  if (kind === "public") {
    // hard-clamp public keys to read-only
    perms = perms.filter((p) => p === "media:read" || p === "projects:read" || p === "renders:download");
  }
  const prefix = kind === "public" ? "vf_pub_" : "vf_live_";
  const key = newKey(prefix);
  const scope: Scope = kind === "public" ? "read" : (perms.includes("keys:manage") ? "admin" : perms.includes("projects:write") || perms.includes("timeline:edit") || perms.includes("media:upload") ? "write" : "read");
  const record = db.insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      label: opts.label.slice(0, 200),
      kind,
      scope,
      permissions: JSON.stringify(perms),
      keyHash: hashKey(key),
      revoked: 0,
      expiresAt: Math.max(0, opts.expiresAt ?? 0),
      allowedOrigins: JSON.stringify(opts.allowedOrigins ?? []),
      allowedIps: JSON.stringify(opts.allowedIps ?? []),
      rateLimitPerHour: Math.max(0, opts.rateLimitPerHour ?? 0),
      quotaTotal: Math.max(0, opts.quotaTotal ?? 0),
      requestsUsed: 0,
      lastUsedAt: 0,
      createdAt: Date.now(),
    })
    .returning().get() as ApiKey;
  return { key, record };
}

export function revokeKey(id: string): boolean {
  return db.update(apiKeys).set({ revoked: 1 }).where(eq(apiKeys.id, id)).run().changes > 0;
}

export function unRevokeKey(id: string): boolean {
  return db.update(apiKeys).set({ revoked: 0 }).where(eq(apiKeys.id, id)).run().changes > 0;
}

export function deleteKey(id: string): boolean {
  return db.delete(apiKeys).where(eq(apiKeys.id, id)).run().changes > 0;
}

export function updateKey(id: string, patch: Record<string, unknown>): ApiKey | undefined {
  return db.update(apiKeys).set(patch).where(eq(apiKeys.id, id)).returning().get();
}

export function rotateKey(id: string): { key: string; record: ApiKey } | undefined {
  const existing = findKeyById(id);
  if (!existing) return undefined;
  // revoke the old, mint a new key with the SAME settings
  revokeKey(id);
  const created = createKey({
    label: existing.label,
    kind: keyKind(existing),
    permissions: keyPermissions(existing),
    expiresAt: keyRestrictions(existing).expiresAt,
    allowedOrigins: keyRestrictions(existing).allowedOrigins,
    allowedIps: keyRestrictions(existing).allowedIps,
    rateLimitPerHour: keyRestrictions(existing).rateLimitPerHour,
    quotaTotal: keyRestrictions(existing).quotaTotal,
  });
  return created;
}

export function findKeyByHash(hash: string): ApiKey | undefined {
  return db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).get();
}

export function findKeyById(id: string): ApiKey | undefined {
  return db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
}

// ---------------------------------------------------------------------------
// Restriction enforcement — shared by every auth path
// ---------------------------------------------------------------------------

export type RestrictionResult = { ok: true; key: ApiKey } | { ok: false; status: number; message: string; key: ApiKey };

export function checkRestrictions(req: Request, key: ApiKey): RestrictionResult {
  if (key.revoked) return { ok: false, status: 403, message: "Forbidden: this key has been revoked.", key };
  if (isExpired(key)) return { ok: false, status: 403, message: "Forbidden: this key has expired.", key };
  const r = keyRestrictions(key);
  if (!ipAllowed(req, r.allowedIps)) return { ok: false, status: 403, message: "Forbidden: request from a disallowed IP.", key };
  if (!originAllowed(req, r.allowedOrigins)) return { ok: false, status: 403, message: "Forbidden: request from a disallowed origin.", key };
  // rate limit
  if (r.rateLimitPerHour > 0) {
    const s = keyUsageStats(key.id);
    if (s.requestsLastHour >= r.rateLimitPerHour) {
      return { ok: false, status: 429, message: `Rate limit exceeded (${r.rateLimitPerHour} req/hour). Try again later.`, key };
    }
  }
  // quota
  if (r.quotaTotal > 0) {
    const s = keyUsageStats(key.id);
    if (s.requestsTotal >= r.quotaTotal) {
      return { ok: false, status: 429, message: `Quota exhausted (${s.requestsTotal}/${r.quotaTotal} requests).`, key };
    }
  }
  return { ok: true, key };
}

function resolveBearerKey(req: Request): { key: ApiKey; raw: string } | null {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const key = findKeyByHash(hashKey(m[1]));
  if (!key) return null;
  return { key, raw: m[1] };
}

// Record usage (fire-and-forget)
function recordUsage(req: Request, key: ApiKey) {
  logKeyUsage(key.id, req.method, req.path, 0);
  db.update(apiKeys).set({ requestsUsed: (key.requestsUsed ?? 0) + 1, lastUsedAt: Date.now() }).where(eq(apiKeys.id, key.id)).run();
}

function sendErr(res: Response, r: { status: number; message: string }, retryAfter = false) {
  if (r.status === 429 && retryAfter) res.setHeader("Retry-After", "60");
  return res.status(r.status).json({ message: r.message });
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function hasPerm(k: ApiKey, perm: Permission): boolean {
  return effectivePermissions(k).includes(perm);
}

/** Permission-based gate. Replaces requireScope. */
export function requirePermission(perm: Permission) {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
    if (!authHeader) {
      return res.status(401).json({
        message: `Unauthorized: missing Authorization header. Use 'Authorization: Bearer <api-key>'. See /#/api-docs for how to get a key.`,
      });
    }
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ message: "Unauthorized: Authorization header must be 'Bearer <api-key>'." });
    const key = findKeyByHash(hashKey(m[1]));
    if (!key) return res.status(401).json({ message: "Unauthorized: unknown or revoked API key." });
    const check = checkRestrictions(req, key);
    if (!check.ok) { recordUsage(req, key); return sendErr(res, check, true); }
    if (!hasPerm(key, perm)) {
      recordUsage(req, key);
      return res.status(403).json({
        message: `Forbidden: this key does not have '${perm}'. Its permissions: [${effectivePermissions(key).join(", ")}]`,
      });
    }
    recordUsage(req, key);
    (req as any).apiKey = key;
    next();
  };
}

/** Admin gate for key management (requires 'keys:manage'). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  return requirePermission("keys:manage")(req, res, next);
}

/** Legacy scope gate — maps onto permissions. Kept for API compatibility. */
export function requireScope(scope: "read" | "write") {
  const perm: Permission = scope === "read" ? "media:read" : "projects:write";
  return requirePermission(perm);
}

/**
 * Media-route gate: accepts EITHER a valid Bearer API key OR a signed ?st=
 * media token bound to the specific resource in the URL path. Both paths
 * enforce ALL restrictions (expiry, IP, origin, rate limit, quota).
 */
export function requireMediaAccess(kind: "asset" | "render") {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;

    // Path 1: Bearer API key — must have media:read (or project read)
    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ message: "Unauthorized: Authorization header must be 'Bearer <api-key>'." });
      const key = findKeyByHash(hashKey(m[1]));
      if (!key) return res.status(401).json({ message: "Unauthorized: unknown or revoked API key." });
      const check = checkRestrictions(req, key);
      if (!check.ok) { recordUsage(req, key); return sendErr(res, check, true); }
      const perms = effectivePermissions(key);
      if (!perms.includes("media:read") && !perms.includes("projects:read")) {
        recordUsage(req, key);
        return res.status(403).json({ message: `Forbidden: this key lacks read access to media.` });
      }
      recordUsage(req, key);
      (req as any).apiKey = key;
      return next();
    }

    // Path 2: signed ?st= media token, bound to the exact resource in the URL
    const st = typeof req.query?.st === "string" ? String(req.query.st) : undefined;
    if (!st) {
      return res.status(401).json({
        message: "Unauthorized: missing Authorization header. Use 'Authorization: Bearer <api-key>' or a signed ?st= media token.",
      });
    }
    const resourceId = String(req.params.id);
    if (!verifyMediaToken(st, resourceId, req)) {
      return res.status(401).json({ message: "Unauthorized: invalid or expired media token for this resource." });
    }
    (req as any).apiKey = { id: `st:${resourceId}`, label: "media token", scope: "read" as Scope, revoked: 0, keyHash: "", createdAt: 0 };
    return next();
  };
}

// ---------------------------------------------------------------------------
// Short-lived signed tokens for media URLs (same model as before, now
// restriction-aware and capped at the issuing key's own expiry)
// ---------------------------------------------------------------------------

const SHORT_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function shortTokenSecret(): string {
  const ownerRow = listKeys().find((k) => k.scope === "admin" && !k.revoked);
  return `vf_short_${ownerRow ? ownerRow.keyHash : "dev"}`;
}

/**
 * Issue a read-only media token scoped to a single resource AND bound to the
 * issuing API key. The token's effective expiry is min(6h, key expiry).
 * Revoking the key immediately invalidates the token.
 */
export function issueMediaToken(resourceId: string, issuingKeyId: string): { token: string; expiresAt: number } {
  const key = findKeyById(issuingKeyId);
  const keyExpiry = key ? keyRestrictions(key).expiresAt : 0;
  let expiresAt = Date.now() + SHORT_TOKEN_TTL_MS;
  if (keyExpiry > 0 && keyExpiry < expiresAt) expiresAt = keyExpiry;
  const payload = `read:${resourceId}:${issuingKeyId}:${expiresAt}`;
  const sig = crypto
    .createHmac("sha256", shortTokenSecret())
    .update(payload)
    .digest("base64url");
  return { token: `${expiresAt}.${resourceId}.${issuingKeyId}.${sig}`, expiresAt };
}

/**
 * Verify a signed media token for a specific resource, rechecking the issuing
 * key's restrictions (revoked, expired, IP/origin, rate limit, quota) at use
 * time so a token can never bypass key-level restrictions.
 */
export function verifyMediaToken(token: string, resourceId: string, req: Request): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [expiresStr, boundResource, issuingKeyId, sig] = parts;
  if (boundResource !== resourceId) return false;
  const expiresAt = parseInt(expiresStr, 10);
  if (!isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const issuingKey = findKeyById(issuingKeyId);
  if (!issuingKey) return false;
  if (issuingKey.revoked) return false;
  if (isExpired(issuingKey)) return false;

  const r = keyRestrictions(issuingKey);
  if (!ipAllowed(req, r.allowedIps)) return false;
  if (!originAllowed(req, r.allowedOrigins)) return false;
  if (r.rateLimitPerHour > 0) {
    const s = keyUsageStats(issuingKey.id);
    if (s.requestsLastHour >= r.rateLimitPerHour) return false;
  }
  if (r.quotaTotal > 0) {
    const s = keyUsageStats(issuingKey.id);
    if (s.requestsTotal >= r.quotaTotal) return false;
  }

  // record usage against the issuing key so rate limiting is consistent
  recordUsage(req, issuingKey);

  const payload = `read:${boundResource}:${issuingKeyId}:${expiresAt}`;
  const expected = crypto
    .createHmac("sha256", shortTokenSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Safe serializer for key metadata (never includes plaintext or hash)
// ---------------------------------------------------------------------------

export function serializeKey(k: ApiKey) {
  const r = keyRestrictions(k);
  const stats = (() => { try { return keyUsageStats(k.id); } catch { return { requestsLastHour: 0, requestsTotal: 0, lastUsedAt: 0 }; } })();
  return {
    id: k.id,
    label: k.label,
    kind: keyKind(k),
    scope: k.scope,
    permissions: effectivePermissions(k),
    revoked: !!k.revoked,
    expired: isExpired(k),
    expiresAt: r.expiresAt,
    allowedOrigins: r.allowedOrigins,
    allowedIps: r.allowedIps,
    rateLimitPerHour: r.rateLimitPerHour,
    quotaTotal: r.quotaTotal,
    requestsUsed: stats.requestsTotal,
    requestsLastHour: stats.requestsLastHour,
    lastUsedAt: stats.lastUsedAt || k.lastUsedAt,
    createdAt: k.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Express route registration (key management)
// ---------------------------------------------------------------------------

export function registerKeyRoutes(app: Express) {
  // Issue a short-lived (6h, capped at key expiry) read-only media token.
  app.get("/api/auth/media-token/:resourceId", requirePermission("media:read"), (req, res) => {
    const resourceId = String(req.params.resourceId);
    if (!/^[a-f0-9]{4,64}$/i.test(resourceId)) {
      return res.status(400).json({ message: "invalid resourceId" });
    }
    const issuingKeyId = String((req as any).apiKey?.id ?? "");
    const { token, expiresAt } = issueMediaToken(resourceId, issuingKeyId);
    res.json({ token, expiresAt });
  });

  // List all keys (admin only). Never returns plaintext, only metadata.
  app.get("/api/keys", requireAdmin, (_req, res) => {
    res.json({ keys: listKeys().map(serializeKey) });
  });

  // List available permissions (admin only).
  app.get("/api/keys/permissions", requireAdmin, (_req, res) => {
    res.json({ permissions: PERMISSIONS });
  });

  // Get one key with recent usage.
  app.get("/api/keys/:id", requireAdmin, (req, res) => {
    const k = findKeyById(String(req.params.id));
    if (!k) return res.status(404).json({ message: "key not found" });
    res.json(serializeKey(k));
  });

  app.get("/api/keys/:id/usage", requireAdmin, (req, res) => {
    const k = findKeyById(String(req.params.id));
    if (!k) return res.status(404).json({ message: "key not found" });
    res.json(serializeKey(k));
  });

  // Create a new key with chosen permissions + restrictions. Returns plaintext ONCE.
  app.post("/api/keys", requireAdmin, (req, res) => {
    const {
      label, kind, permissions, scope,
      expiresAt, allowedOrigins, allowedIps, rateLimitPerHour, quotaTotal,
    } = req.body || {};
    if (!label || typeof label !== "string") return res.status(400).json({ message: "label (string) required" });
    const k = kind === "public" ? "public" : "private";

    let perms: Permission[] = [];
    if (Array.isArray(permissions)) {
      perms = permissions.filter((p: any) => (PERMISSIONS as readonly string[]).includes(p));
    } else if (typeof scope === "string" && SCOPES.includes(scope as Scope)) {
      perms = scopeToPermissions(scope as Scope);
    }
    if (perms.length === 0) return res.status(400).json({ message: `permissions (array) or scope required` });

    // public keys: clamp to read-only
    if (k === "public") {
      perms = perms.filter((p: Permission) => p === "media:read" || p === "projects:read" || p === "renders:download");
      if (perms.length === 0) return res.status(400).json({ message: `public keys can only have read permissions (media:read, projects:read, renders:download)` });
    }

    const exp = typeof expiresAt === "number" ? Math.max(0, Math.round(expiresAt)) : 0;
    const ao = Array.isArray(allowedOrigins) ? allowedOrigins.filter((s: any) => typeof s === "string") : [];
    const ai = Array.isArray(allowedIps) ? allowedIps.filter((s: any) => typeof s === "string") : [];
    const rl = typeof rateLimitPerHour === "number" ? Math.max(0, Math.round(rateLimitPerHour)) : 0;
    const qt = typeof quotaTotal === "number" ? Math.max(0, Math.round(quotaTotal)) : 0;

    const { key, record } = createKey({ label, kind: k, permissions: perms, expiresAt: exp, allowedOrigins: ao, allowedIps: ai, rateLimitPerHour: rl, quotaTotal: qt });
    res.status(201).json({
      message: "Save this key now — it is shown only once.",
      key,
      record: serializeKey(record),
    });
  });

  // Update a key's restrictions/permissions (admin only). Never returns plaintext.
  app.put("/api/keys/:id", requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const existing = findKeyById(id);
    if (!existing) return res.status(404).json({ message: "key not found" });
    const { label, permissions, expiresAt, allowedOrigins, allowedIps, rateLimitPerHour, quotaTotal } = req.body || {};

    const patch: Record<string, unknown> = {};
    if (typeof label === "string" && label.trim()) patch.label = label.slice(0, 200);
    if (Array.isArray(permissions)) {
      let perms = permissions.filter((p: any) => (PERMISSIONS as readonly string[]).includes(p));
      if (keyKind(existing) === "public") {
        perms = perms.filter((p: Permission) => p === "media:read" || p === "projects:read" || p === "renders:download");
      }
      if (perms.length > 0) patch.permissions = JSON.stringify(perms);
    }
    if (typeof expiresAt === "number") patch.expiresAt = Math.max(0, Math.round(expiresAt));
    if (Array.isArray(allowedOrigins)) patch.allowedOrigins = JSON.stringify(allowedOrigins.filter((s: any) => typeof s === "string"));
    if (Array.isArray(allowedIps)) patch.allowedIps = JSON.stringify(allowedIps.filter((s: any) => typeof s === "string"));
    if (typeof rateLimitPerHour === "number") patch.rateLimitPerHour = Math.max(0, Math.round(rateLimitPerHour));
    if (typeof quotaTotal === "number") patch.quotaTotal = Math.max(0, Math.round(quotaTotal));

    const updated = updateKey(id, patch);
    if (!updated) return res.status(404).json({ message: "key not found" });
    res.json(serializeKey(updated));
  });

  // Revoke a key (admin only).
  app.delete("/api/keys/:id", requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const existing = findKeyById(id);
    if (!existing) return res.status(404).json({ message: "key not found" });
    const ok = revokeKey(id);
    if (!ok) return res.status(404).json({ message: "key not found" });
    res.json({ revoked: true });
  });

  // Enable (un-revoke) a key (admin only).
  app.post("/api/keys/:id/enable", requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const existing = findKeyById(id);
    if (!existing) return res.status(404).json({ message: "key not found" });
    const ok = unRevokeKey(id);
    if (!ok) return res.status(404).json({ message: "key not found" });
    const k = findKeyById(id)!;
    res.json(serializeKey(k));
  });

  // Rotate a key — revokes the old, mints a new one with the same settings.
  // Returns the new plaintext ONCE.
  app.post("/api/keys/:id/rotate", requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const rotated = rotateKey(id);
    if (!rotated) return res.status(404).json({ message: "key not found" });
    res.status(201).json({
      message: "Old key revoked. Save the new key now — it is shown only once.",
      key: rotated.key,
      record: serializeKey(rotated.record),
    });
  });

  // Usage overview (admin only).
  app.get("/api/keys/usage-overview", requireAdmin, (_req, res) => {
    const { usageOverview } = require("./storage");
    res.json(usageOverview());
  });

  // Get the owner key plaintext (admin only) — only available before the
  // OWNER_KEY.txt file is deleted, so the owner can always recover it.
  app.get("/api/keys/owner", requireAdmin, (_req, res) => {
    const pt = getOwnerKeyPlaintext();
    if (!pt) {
      return res.status(404).json({ message: "Owner key plaintext is no longer available in memory. Create a new key instead." });
    }
    res.json({ key: pt });
  });
}
