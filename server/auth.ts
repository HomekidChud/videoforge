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

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Configured on every /api/* route (except /api/keys which uses admin gate).
 *
 * Behavior:
 *  - If no Authorization header is provided AND the request came from the UI
 *    (cookie `vf_ui=1` set by the frontend), treat as full access (write).
 *  - Otherwise require a valid API key with the right scope.
 *
 * This means the editor UI works out of the box, but external agents / scripts
 * must present a key. Set `VITEFORGE_REQUIRE_UI_AUTH=1` to disable the UI bypass.
 */
export function requireScope(scope: "read" | "write") {
  return function (req: Request, res: Response, next: NextFunction) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
    const isUi = req.headers.cookie?.includes("vf_ui=1") && process.env.VIDEOFORGE_REQUIRE_UI_AUTH !== "1";

    if (!authHeader) {
      if (isUi) {
        // UI bypass: treat as a write-capable key
        (req as any).apiKey = { id: "ui", label: "UI session", scope: "write" as Scope, revoked: 0, keyHash: "", createdAt: 0 };
        return next();
      }
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

export function registerKeyRoutes(app: Express) {
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
