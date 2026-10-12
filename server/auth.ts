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

export function createKey(label: string, scope: Scope): { key: string; record: ApiKey } {
  const key = newKey("vf_live_");
  const record = db.insert(apiKeys)
    .values({
      id: crypto.randomUUID(),
      label: label.slice(0, 200),
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
export function requireScope(scope: "read" | "write") {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;

    if (!authHeader) {
      return res.status(401).json({
        message: "Unauthorized: missing Authorization header. Use 'Authorization: Bearer <api-key>'. See /#/api-docs for how to get a key.",
      });
    }

    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return res.status(401).json({ message: "Unauthorized: Authorization header must be 'Bearer <api-key>'." });
    }
    const hash = hashKey(m[1]);
    const key = findKeyByHash(hash);
    if (!key) {
      return res.status(401).json({ message: "Unauthorized: unknown or revoked API key." });
    }
    if (key.revoked) {
      return res.status(403).json({ message: "Forbidden: this key has been revoked." });
    }
    const required: Scope[] = scope === "read" ? ["read", "write", "admin"] : ["write", "admin"];
    if (!required.includes(key.scope as Scope)) {
      return res.status(403).json({
        message: `Forbidden: this key has scope '${key.scope}' but this action requires '${scope}'.`,
      });
    }
    (req as any).apiKey = key;
    next();
  };
}

/** Admin-only gate (used for /api/keys/*). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized: missing Authorization header." });
  }
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ message: "Unauthorized: Authorization header must be 'Bearer <api-key>'." });
  const key = findKeyByHash(hashKey(m[1]));
  if (!key || key.revoked) return res.status(401).json({ message: "Unauthorized: unknown or revoked API key." });
  if (key.scope !== "admin") {
    return res.status(403).json({ message: `Forbidden: only admin keys can manage other keys (this key has scope '${key.scope}').` });
  }
  (req as any).apiKey = key;
  next();
}

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

    // Path 1: Bearer API key (same check as requireScope("read"))
    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ message: "Unauthorized: Authorization header must be 'Bearer <api-key>'." });
      const key = findKeyByHash(hashKey(m[1]));
      if (!key) return res.status(401).json({ message: "Unauthorized: unknown or revoked API key." });
      if (key.revoked) return res.status(403).json({ message: "Forbidden: this key has been revoked." });
      if (!(["read", "write", "admin"] as Scope[]).includes(key.scope as Scope)) {
        return res.status(403).json({ message: `Forbidden: this key has scope '${key.scope}' but this action requires 'read'.` });
      }
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
    const resourceId = kind === "asset" ? String(req.params.id) : String(req.params.id);
    if (!verifyMediaToken(st, resourceId)) {
      return res.status(401).json({ message: "Unauthorized: invalid or expired media token for this resource." });
    }
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
  // List all keys (admin only). Never returns the key itself, only metadata.
  app.get("/api/keys", requireAdmin, (_req, res) => {
    res.json({
      keys: listKeys().map((k) => ({
        id: k.id,
        label: k.label,
        scope: k.scope,
        revoked: !!k.revoked,
        createdAt: k.createdAt,
      })),
    });
  });

  // Create a new key with a chosen scope. Returns the plaintext ONCE.
  app.post("/api/keys", requireAdmin, (req, res) => {
    const { label, scope } = req.body || {};
    if (!label || typeof label !== "string") return res.status(400).json({ message: "label (string) required" });
    if (!SCOPES.includes(scope)) {
      return res.status(400).json({ message: `scope must be one of: ${SCOPES.join(", ")}` });
    }
    const { key, record } = createKey(label, scope as Scope);
    res.status(201).json({
      message: "Save this key now — it is shown only once.",
      key, // ← plaintext, shown once
      record: {
        id: record.id,
        label: record.label,
        scope: record.scope,
        revoked: !!record.revoked,
        createdAt: record.createdAt,
      },
    });
  });

  // Revoke a key.
  app.delete("/api/keys/:id", requireAdmin, (req, res) => {
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
