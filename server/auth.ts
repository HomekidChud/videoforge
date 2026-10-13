// ============================================================================
// API key / permission model.
//
// Scopes (least-privilege, escalating):
//   read  — list & read-only access (GET)
//   write — read + upload media, edit projects, trigger renders (GET/POST/PUT/DELETE)
//   admin — everything, including creating & revoking other keys
//
// Keys are stored as sha256(key) only. Plaintext is shown once on creation.
// Keys are prefixed `vf_live_` (agent/user keys) or `vf_admin_` (owner keys).
// ============================================================================

import type { Express, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { storage, db } from "./storage";
import { apiKeys, type ApiKey } from "@shared/schema";
import { eq } from "drizzle-orm";
import { restrictionsSchema, DEFAULT_RESTRICTIONS, type KeyRestrictions } from "@shared/policy";

export type Scope = "read" | "write" | "admin";
export const SCOPES: Scope[] = ["read", "write", "admin"];
export const ADMIN_KEY_FILE = path.resolve("data/OWNER_KEY.txt");

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function newKey(prefix: "vf_live_" | "vf_admin_"): string {
  const rand = crypto.randomBytes(24).toString("hex");
  return `${prefix}${rand}`;
}

// ---------------------------------------------------------------------------
// Owner bootstrap: on first run, create one admin key and print it to console
// and to data/OWNER_KEY.txt (gitignored). The user must copy it somewhere safe
// and then delete the file, or leave it on their own machine.
// ---------------------------------------------------------------------------

let ownerKeyPlaintext: string | null = null;

export async function ensureOwnerKeyExists(): Promise<string> {
  // Preferred for hosted deployments: the admin key is supplied via
  // VIDEOFORGE_BOOTSTRAP_KEY env var. This means the key never appears in
  // logs, files, or URLs, and it survives ephemeral-filesystem restarts
  // (the key hash is re-seeded into the DB on every boot).
  const bootstrap = process.env.VIDEOFORGE_BOOTSTRAP_KEY?.trim();
  if (bootstrap) {
    const hash = hashKey(bootstrap);
    const existing = listKeys().find((k) => k.keyHash === hash);
    if (existing) return existing.id;
    const row = db.insert(apiKeys)
      .values({
        id: crypto.randomUUID(),
        label: "owner (bootstrap env)",
        scope: "admin",
        keyHash: hash,
        revoked: 0,
        createdAt: Date.now(),
      })
      .returning().get() as ApiKey;
    console.log(`[auth] owner key seeded from VIDEOFORGE_BOOTSTRAP_KEY env var`);
    return row.id;
  }

  // Local dev fallback: generate a random key and write it to OWNER_KEY.txt
  const existing = listKeys().find((k) => k.scope === "admin");
  if (existing) return existing.id;

  const key = newKey("vf_admin_");
  const row = db.insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      label: "owner (auto-created on first run)",
      scope: "admin",
      keyHash: hashKey(key),
      revoked: 0,
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

export function createKey(label: string, scope: Scope, restrictions: KeyRestrictions = DEFAULT_RESTRICTIONS): { key: string; record: ApiKey } {
  const key = newKey("vf_live_");
  const record = db.insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      label: label.slice(0, 200),
      restrictionsJson: JSON.stringify(restrictions),
      scope,
      keyHash: hashKey(key),
      revoked: 0,
      createdAt: Date.now(),
    })
    .returning().get() as ApiKey;
  return { key, record };
}

export function revokeKey(id: string): boolean {
  return db.update(apiKeys).set({ revoked: 1 }).where(eq(apiKeys.id, id)).run().changes > 0;
}

export function findKeyByHash(hash: string): ApiKey | undefined {
  return db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).get();
}

export function findKeyById(id: string): ApiKey | undefined {
  return db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
}

// ---------------------------------------------------------------------------
// Short-lived signed tokens for media URLs. <img>/<video>/download links can
// not send Bearer headers, so the server issues a scoped HMAC token valid for
// 6 hours, bound to a specific resource (asset or render job) and read-only.
// The API key itself is NEVER embedded in URLs.
// ---------------------------------------------------------------------------

const SHORT_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// The signing secret is derived from the owner key hash. On ephemeral
// deployments the DB resets but VIDEOFORGE_BOOTSTRAP_KEY stays stable, so the
// secret is stable too — which is intentional so tokens keep working across
// restarts. Rotate the bootstrap key to invalidate all media tokens.
function shortTokenSecret(): string {
  const ownerRow = listKeys().find((k) => k.scope === "admin");
  return `vf_short_${ownerRow ? ownerRow.keyHash : "dev"}`;
}

/**
 * Issue a read-only media token scoped to a single resource (asset id or
 * render-job id) AND bound to the issuing API key id. If that key is later
 * revoked or deleted, the token immediately stops working.
 */
export function issueMediaToken(resourceId: string, issuingKeyId: string): string {
  const expiresAt = Date.now() + SHORT_TOKEN_TTL_MS;
  const payload = `read:${resourceId}:${issuingKeyId}:${expiresAt}`;
  const sig = crypto
    .createHmac("sha256", shortTokenSecret())
    .update(payload)
    .digest("base64url");
  return `${expiresAt}.${resourceId}.${issuingKeyId}.${sig}`;
}

/**
 * Verify a signed media token for a specific resource. Returns true only if
 * the token is well-formed, unexpired, bound to `resourceId`, the signature
 * matches, AND the issuing API key still exists with read-or-better scope and
 * is not revoked. Tokens are NOT valid for write routes or other resources.
 */
export function verifyMediaToken(token: string, resourceId: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [expiresStr, boundResource, issuingKeyId, sig] = parts;
  if (boundResource !== resourceId) return false;
  const expiresAt = parseInt(expiresStr, 10);
  if (!isFinite(expiresAt) || expiresAt < Date.now()) return false;

  // Check the issuing key is still valid (exists, not revoked, has read+).
  const issuingKey = findKeyById(issuingKeyId);
  if (!issuingKey) return false;
  if (issuingKey.revoked) return false;
  const policy = keyRestrictions(issuingKey);
  if (policy.expiresAt && policy.expiresAt <= Date.now()) return false;
  if (!resourceAllowed(issuingKey, resourceId)) return false;
  if (!(["read", "write", "admin"] as Scope[]).includes(issuingKey.scope as Scope)) {
    return false;
  }

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
// Middleware
// ---------------------------------------------------------------------------

/**
 * General-purpose scope gate. Requires a valid API key via Bearer header.
 * Does NOT accept ?st= media tokens — those are only valid on specific
 * media/download routes (see requireMediaAccess).
 */
export function keyRestrictions(key: ApiKey): KeyRestrictions {
  return restrictionsSchema.parse(JSON.parse(key.restrictionsJson || "{}"));
}
export function projectAllowed(key: ApiKey, id: string): boolean {
  const ids = keyRestrictions(key).projectIds;
  return ids === null || ids.includes(id);
}
export function assetAllowed(key: ApiKey, id: string): boolean {
  const ids = keyRestrictions(key).projectIds;
  if (ids === null) return true;
  return storage.listProjects().some(p => ids.includes(p.id) && JSON.parse(p.timelineJson).clips.some((c: any) => c.assetId === id));
}
function resourceAllowed(key: ApiKey, id: string): boolean {
  const render = storage.getRenderJob(id);
  return render ? projectAllowed(key, render.projectId) : assetAllowed(key, id);
}
export function keyMetadata(k: ApiKey) {
  return { id: k.id, label: k.label, scope: k.scope, revoked: !!k.revoked, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, restrictions: keyRestrictions(k) };
}
const rateWindows = new Map<string, { start: number; count: number }>();
function enforcePolicy(key: ApiKey, req: Request, res: Response): boolean {
  const p = keyRestrictions(key);
  const deny = (message: string, status = 403) => { res.status(status).json({ message }); return false; };
  if (p.expiresAt && p.expiresAt <= Date.now()) return deny("This API key has expired.");
  // This is a browser origin allowlist, not a substitute for server-side authentication.
  if (p.allowedOrigins.length && (!req.headers.origin || !p.allowedOrigins.includes(req.headers.origin))) return deny("Origin is not allowed by this API key.");
  if (req.method === "DELETE" && !p.allowDelete) return deny("Deletion is disabled for this API key.");
  if (req.path === "/api/media/upload" && !p.allowUpload) return deny("Uploads are disabled for this API key.");
  if (req.method === "POST" && req.path === "/api/renders" && !p.allowRender) return deny("Rendering is disabled for this API key.");
  if (p.projectIds !== null) {
    if ((req.path === "/api/projects" && req.method === "POST") || req.path === "/api/media/upload" || (req.path.startsWith("/api/media/") && req.method === "DELETE")) return deny("Project-restricted keys cannot create projects, upload, or delete shared media.");
    const projectMatch = req.path.match(/^\/api\/projects\/([^/]+)/);
    const mediaMatch = req.path.match(/^\/api\/media\/([^/]+)/);
    const renderMatch = req.path.match(/^\/api\/renders\/([^/]+)/);
    if (projectMatch && !projectAllowed(key, projectMatch[1])) return deny("Project is outside this API key's restrictions.");
    if (mediaMatch && !assetAllowed(key, mediaMatch[1])) return deny("Media is outside this API key's restrictions.");
    if (renderMatch && !projectAllowed(key, storage.getRenderJob(renderMatch[1])?.projectId || "")) return deny("Render is outside this API key's restrictions.");
    if (req.path === "/api/renders" && req.method === "POST" && !projectAllowed(key, req.body?.projectId)) return deny("Project is outside this API key's restrictions.");
    const tokenMatch = req.path.match(/^\/api\/auth\/media-token\/([^/]+)/);
    if (tokenMatch && !resourceAllowed(key, tokenMatch[1])) return deny("Resource is outside this API key's restrictions.");
    // Block injecting another project's asset via project JSON or agent ops.
    const refs = req.body?.timeline?.clips?.map((c: any) => c.assetId).filter(Boolean) || [];
    if (req.body?.args?.assetId) refs.push(req.body.args.assetId);
    if (Array.isArray(req.body?.ops)) req.body.ops.forEach((o: any) => { if (o?.args?.assetId) refs.push(o.args.assetId); });
    if (refs.some((id: string) => !assetAllowed(key, id))) return deny("Timeline contains media outside this API key's restrictions.");
  }
  if (p.requestsPerMinute) {
    const now = Date.now();
    let w = rateWindows.get(key.id);
    if (!w || now - w.start >= 60000) {
      // Bound memory even if many short-lived keys are issued.
      rateWindows.forEach((old, id) => { if (now - old.start >= 60000) rateWindows.delete(id); });
      w = { start: now, count: 0 }; rateWindows.set(key.id, w);
    }
    if (w.count >= p.requestsPerMinute) { res.setHeader("Retry-After", Math.ceil((60000 - (now - w.start)) / 1000)); return deny("API key rate limit exceeded.", 429); }
    w.count++;
  }
  // Throttle metadata writes while keeping request-rate tracking in memory.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt > 60000) db.update(apiKeys).set({ lastUsedAt: Date.now() }).where(eq(apiKeys.id, key.id)).run();
  return true;
}
export function requireScope(scope: Scope) {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized: missing Authorization header. Use 'Authorization: Bearer <api-key>'." });
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ message: "Authorization must be Bearer <api-key>." });
    const key = findKeyByHash(hashKey(m[1]));
    if (!key) return res.status(401).json({ message: "Unknown API key." });
    if (key.revoked) return res.status(403).json({ message: "This API key has been revoked." });
    if (SCOPES.indexOf(key.scope as Scope) < SCOPES.indexOf(scope)) return res.status(403).json({ message: `Forbidden: this key has scope '${key.scope}' but this action requires '${scope}'.` });
    if (!enforcePolicy(key, req, res)) return;
    (req as any).apiKey = key;
    next();
  };
}
export const requireAdmin = requireScope("admin");

// ---------------------------------------------------------------------------
// Express route registration (admin key management)
// ---------------------------------------------------------------------------

/**
 * Media-route gate: accepts EITHER a valid Bearer API key OR a signed ?st=
 * media token bound to the specific resource in the URL path. Only used on
 * raw/thumb/download routes. Media tokens never grant write access.
 */
export function requireMediaAccess(kind: "asset" | "render") {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;

    if (authHeader) return requireScope("read")(req, res, next);

    // Path 2: signed ?st= media token, bound to the exact resource in the URL
    const st = typeof req.query?.st === "string" ? String(req.query.st) : undefined;
    if (!st) {
      return res.status(401).json({
        message: "Unauthorized: missing Authorization header. Use 'Authorization: Bearer <api-key>' or a signed ?st= media token.",
      });
    }
    const resourceId = kind === "asset" ? String(req.params.id) : String(req.params.id);
    if (!verifyMediaToken(st, resourceId)) {
      return res.status(401).json({ message: "Unauthorized: invalid or expired media token for this resource." });
    }
    const issuingKey = findKeyById(st.split(".")[2])!;
    if (!enforcePolicy(issuingKey, req, res)) return;
    (req as any).apiKey = { id: `st:${resourceId}`, label: "media token", scope: "read" as Scope, revoked: 0, keyHash: "", createdAt: 0 };
    return next();
  };
}

export function registerKeyRoutes(app: Express) {
  // Issue a short-lived (6h) read-only media token for a specific asset or
  // render job, so <img>/<video>/download links can authenticate. Requires
  // any valid API key with read scope. NOT fetchable with another media token.
  app.get("/api/auth/media-token/:resourceId", requireScope("read"), (req, res) => {
    const resourceId = String(req.params.resourceId);
    // sanity-check the id shape to prevent minting arbitrary junk tokens
    if (!/^[a-f0-9]{4,64}$/i.test(resourceId)) {
      return res.status(400).json({ message: "invalid resourceId" });
    }
    // bind the token to the authenticated key so revoking the key kills the token
    const issuingKeyId = String((req as any).apiKey?.id ?? "");
    res.json({ token: issueMediaToken(resourceId, issuingKeyId), expiresAt: Date.now() + SHORT_TOKEN_TTL_MS });
  });
  app.get("/api/auth/me", requireScope("read"), (req, res) => res.json(keyMetadata((req as any).apiKey)));
  app.get("/api/keys", requireAdmin, (_req, res) => res.json({ keys: listKeys().map(keyMetadata) }));
  app.post("/api/keys", requireAdmin, (req, res) => {
    try {
      const { label, scope } = req.body || {};
      if (typeof label !== "string" || !label.trim()) return res.status(400).json({ message: "Key name is required." });
      if (!SCOPES.includes(scope)) return res.status(400).json({ message: "Choose read, write, or admin scope." });
      const restrictions = restrictionsSchema.parse(req.body.restrictions || {});
      if (scope === "admin" && JSON.stringify(restrictions) !== JSON.stringify(DEFAULT_RESTRICTIONS)) return res.status(400).json({ message: "Admin keys cannot be restricted. Use read or write for restricted keys." });
      if (restrictions.expiresAt && restrictions.expiresAt <= Date.now()) return res.status(400).json({ message: "Expiry must be in the future." });
      if (restrictions.projectIds?.some(id => !storage.getProject(id))) return res.status(400).json({ message: "One or more projects do not exist." });
      const { key, record } = createKey(label.trim(), scope, restrictions);
      res.status(201).json({ message: "Save this key now — it is shown only once.", key, record: keyMetadata(record) });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  // Revoke a key.
  app.delete("/api/keys/:id", requireAdmin, (req, res) => {
    if (String(req.params.id) === (req as any).apiKey.id) return res.status(400).json({ message: "You cannot revoke the key you are currently using. Sign in with another admin key first." });
    const ok = revokeKey(String(req.params.id));
    if (!ok) return res.status(404).json({ message: "key not found" });
    res.json({ revoked: true });
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
