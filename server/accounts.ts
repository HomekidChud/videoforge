// ============================================================================
// Accounts: real people sign in with email + password (or Google when
// configured). API keys stay for AI agents and scripts.
//
// Sessions are random tokens stored as sha256 in SQLite, delivered as an
// HttpOnly cookie. Because the session lives in the database (not memory),
// sign-ins survive server restarts and redeploys, the browser keeps its
// cookie and it keeps working. Sessions last 30 days.
// ============================================================================

import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { db } from "./storage";
import { users, sessions, customTools, type User } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin, requireScope, hashKey, findKeyByHash } from "./auth";

const SESSION_COOKIE = "vf_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-user salt, stored "salt:hash" in hex.
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex"), b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(email: unknown): string {
  const e = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) throw new Error("enter a real email address");
  return e;
}
export function validatePassword(password: unknown): string {
  const p = String(password ?? "");
  if (p.length < 8 || p.length > 200) throw new Error("passwords need at least 8 characters");
  return p;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.insert(sessions).values({ id: hashToken(token), userId, createdAt: now, expiresAt: now + SESSION_TTL_MS }).run();
  return token;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** The signed-in user for a request, or null. Expiring sessions are deleted. */
export function sessionUser(req: Request): User | null {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const row = db.select().from(sessions).where(eq(sessions.id, hashToken(token))).get();
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    try { db.delete(sessions).where(eq(sessions.id, row.id)).run(); } catch { /* best effort */ }
    return null;
  }
  return db.select().from(users).where(eq(users.id, row.userId)).get() ?? null;
}

export function destroySession(req: Request): void {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return;
  try { db.delete(sessions).where(eq(sessions.id, hashToken(token))).run(); } catch { /* best effort */ }
}

function readCookie(header: unknown, name: string): string | null {
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function requestIsSecure(req: Request): boolean {
  // Behind a proxy (Render, nginx…), the socket is plain HTTP but the client
  // came in over TLS. Trust the standard forwarded header; req.secure covers direct TLS.
  const proto = req.headers["x-forwarded-proto"];
  return req.secure || (typeof proto === "string" && proto.split(",")[0].trim() === "https");
}

/**
 * Cookie SameSite: Lax by default, but when the frontend lives on another site
 * (e.g. the app on GitHub Pages calling an API on render.com), the browser
 * would never send a Lax cookie on those cross-site requests, sign-in would
 * silently fail on the next API call. Cross-site frontends need SameSite=None
 * (which also requires Secure, so only on HTTPS).
 */
function sameSiteFor(req: Request, secure: boolean): "Lax" | "None" {
  if (!secure) return "Lax"; // None without Secure is rejected by browsers
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return "Lax";
  try {
    const o = new URL(origin).hostname;
    const h = host.split(":")[0];
    if (o === h) return "Lax"; // same host
    if (o.endsWith("." + h) || h.endsWith("." + o)) return "Lax"; // subdomains of each other: same site
    return "None"; // a different site entirely (github.io → onrender.com)
  } catch { return "Lax"; }
}

function setSessionCookie(res: Response, token: string, req: Request): void {
  // Secure only when this request actually arrived over HTTPS, otherwise the
  // browser silently drops the cookie and every reload looks like a sign-out.
  const secure = requestIsSecure(req);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSiteFor(req, secure)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`);
}

function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function listUsers(): User[] {
  return db.select().from(users).all();
}

export function userCount(): number {
  return listUsers().length;
}

/** Account creation rules:
 *  - No accounts yet: the FIRST account is created with the owner API key
 *    (it becomes the workspace admin). This keeps a public deployment safe -
 *    a stranger can't bootstrap themselves.
 *  - Accounts exist: anyone can register when VIDEOFORGE_ACCOUNTS=open,
 *    otherwise only an admin can create accounts (from the platform page). */
export function registerUser(email: unknown, password: unknown, name: unknown, ownerKey: unknown, asAdmin = false): User {
  const e = validateEmail(email);
  const p = validatePassword(password);
  const existing = db.select().from(users).where(eq(users.email, e)).get();
  if (existing) throw new Error("an account with that email already exists");
  const first = userCount() === 0;
  if (first) {
    // The first account must prove ownership with the workspace owner key.
    const key = typeof ownerKey === "string" && ownerKey.trim() ? findKeyByHash(hashKey(ownerKey.trim())) : undefined;
    if (!key || key.scope !== "admin" || key.revoked) throw new Error("this workspace has no accounts yet, create yours with the owner API key (from data/OWNER_KEY.txt or VIDEOFORGE_BOOTSTRAP_KEY)");
  } else if (!asAdmin && process.env.VIDEOFORGE_ACCOUNTS !== "open") {
    throw new Error("this workspace needs an admin to create accounts, ask them to add you, or set VIDEOFORGE_ACCOUNTS=open to allow self-signup");
  }
  const user: User = {
    id: crypto.randomUUID(),
    email: e,
    passwordHash: hashPassword(p),
    googleSub: null,
    name: String(name ?? "").slice(0, 80),
    role: first || asAdmin ? "admin" : "user",
    createdAt: Date.now(),
  };
  db.insert(users).values(user).run();
  return user;
}

export function createManagedAccount(email: unknown, password: unknown, name: unknown, role: unknown): User {
  const asAdmin = role === "admin";
  if (asAdmin && userCount() > 0) {
    // a second admin is fine; the first-admin bootstrap rule only applies when empty
  }
  return registerUser(email, password, name, undefined, asAdmin);
}

export function authenticate(email: unknown, password: unknown): User {
  const e = validateEmail(email);
  const row = db.select().from(users).where(eq(users.email, e)).get();
  if (!row?.passwordHash || !verifyPassword(String(password ?? ""), row.passwordHash)) {
    throw new Error("wrong email or password");
  }
  return row;
}

/** Upsert a Google account (by Google id, else by matching email). */
export function upsertGoogleUser(googleSub: string, email: string, name: string): User {
  const bySub = db.select().from(users).where(eq(users.googleSub, googleSub)).get();
  if (bySub) return bySub;
  const byEmail = db.select().from(users).where(eq(users.email, email)).get();
  if (byEmail) {
    db.update(users).set({ googleSub, name: byEmail.name || name }).where(eq(users.id, byEmail.id)).run();
    return { ...byEmail, googleSub, name: byEmail.name || name };
  }
  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash: null,
    googleSub,
    name: name.slice(0, 80),
    role: userCount() === 0 ? "admin" : "user",
    createdAt: Date.now(),
  };
  db.insert(users).values(user).run();
  return user;
}

// ---------------------------------------------------------------------------
// Google sign-in (only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set)
// ---------------------------------------------------------------------------

const googleClient = () => ({
  id: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
  secret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
});
export function googleConfigured(): boolean {
  const g = googleClient();
  return !!(g.id && g.secret);
}

function originOf(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:5000";
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAccountRoutes(app: Express) {
  // Public: what sign-in methods this deployment offers.
  app.get("/api/auth/config", (_req, res) => {
    res.json({ google: googleConfigured(), accountsOpen: process.env.VIDEOFORGE_ACCOUNTS === "open", hasAccounts: userCount() > 0 });
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const user = registerUser(req.body?.email, req.body?.password, req.body?.name, req.body?.ownerKey);
      setSessionCookie(res, createSession(user.id), req);
      res.json({ kind: "account", id: user.id, email: user.email, name: user.name, role: user.role, scope: user.role === "admin" ? "admin" : "write" });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const user = authenticate(req.body?.email, req.body?.password);
      setSessionCookie(res, createSession(user.id), req);
      res.json({ kind: "account", id: user.id, email: user.email, name: user.name, role: user.role, scope: user.role === "admin" ? "admin" : "write" });
    } catch (e: any) { res.status(401).json({ message: e.message }); }
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(req);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Google: start and callback. Only mounted when configured.
  if (googleConfigured()) {
    app.get("/api/auth/google/start", (req, res) => {
      const state = crypto.randomBytes(16).toString("base64url");
      const redirectUri = `${originOf(req)}/api/auth/google/callback`;
      // Same relaxation as the session cookie: cross-site frontends need None.
      const secure = requestIsSecure(req);
      res.setHeader("Set-Cookie", `vf_oauth_state=${state}; Path=/; HttpOnly; SameSite=${sameSiteFor(req, secure)}; Max-Age=600${secure ? "; Secure" : ""}`);
      const params = new URLSearchParams({
        client_id: googleClient().id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
      });
      res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    });

    app.get("/api/auth/google/callback", async (req, res) => {
      const fail = (message: string) => res.status(400).send(`Sign-in with Google failed: ${message}`);
      try {
        const code = String(req.query?.code ?? "");
        const state = String(req.query?.state ?? "");
        const expected = readCookie(req.headers.cookie, "vf_oauth_state");
        if (!code || !state || !expected || state !== expected) return fail("the request was stale, try again");
        const redirectUri = `${originOf(req)}/api/auth/google/callback`;
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: googleClient().id, client_secret: googleClient().secret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString(),
        });
        const tokens = await tokenRes.json() as { id_token?: string };
        if (!tokenRes.ok || !tokens.id_token) return fail("Google did not return a sign-in");
        // Decode and verify the id_token claims (the token came from Google over TLS).
        const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")) as { sub?: string; email?: string; name?: string; aud?: string; iss?: string; exp?: number };
        if (!payload.sub || !payload.email) return fail("the Google account has no email");
        if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return fail("unexpected token issuer");
        if (payload.aud !== googleClient().id) return fail("token was for a different app");
        if ((payload.exp ?? 0) * 1000 < Date.now()) return fail("token expired");
        const user = upsertGoogleUser(payload.sub, payload.email.toLowerCase(), payload.name ?? "");
        res.setHeader("Set-Cookie", `vf_oauth_state=; Path=/; HttpOnly; Max-Age=0`);
        setSessionCookie(res, createSession(user.id), req);
        // Back to the app: the SPA origin when the frontend is hosted elsewhere.
        const spa = process.env.CORS_ORIGIN?.trim() || `${originOf(req)}/`;
        res.redirect(302, `${spa.replace(/\/$/, "")}/#/editor`);
      } catch (e: any) { fail(e.message ?? "something went wrong"); }
    });
  }

  // Admin: account management.
  app.get("/api/accounts", requireAdmin, (_req, res) => {
    res.json({ accounts: listUsers().map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt })) });
  });
  app.post("/api/accounts", requireAdmin, (req, res) => {
    try {
      const user = createManagedAccount(req.body?.email, req.body?.password, req.body?.name, req.body?.role);
      res.status(201).json({ id: user.id, email: user.email, role: user.role });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/accounts/:id", requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return res.status(404).json({ message: "no such account" });
    // never delete the last admin
    const admins = listUsers().filter((u) => u.role === "admin");
    if (user.role === "admin" && admins.length <= 1) return res.status(400).json({ message: "the last admin account cannot be deleted" });
    db.delete(sessions).where(eq(sessions.userId, id)).run();
    db.delete(users).where(eq(users.id, id)).run();
    res.json({ ok: true });
  });

  // The tool library: per-account custom tools, synced between browsers.
  app.get("/api/tools", requireScope("read"), (req, res) => {
    const owner = String((req as any).apiKey?.id ?? "");
    res.json({ tools: db.select().from(customTools).where(eq(customTools.ownerId, owner)).all().map(rowToTool) });
  });
  app.put("/api/tools/:id", requireScope("write"), (req, res) => {
    try {
      const owner = String((req as any).apiKey?.id ?? "");
      const id = String(req.params.id).slice(0, 80);
      const { name, description, mode, code, graph } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) throw new Error("tool name required");
      if (mode !== "blocks" && mode !== "code") throw new Error("mode must be blocks or code");
      if (mode === "blocks" && (!graph || typeof graph !== "object")) throw new Error("a blocks tool needs a graph");
      if (mode === "code" && typeof code !== "string") throw new Error("a code tool needs code");
      const serialized = JSON.stringify({ graph, code });
      if (serialized.length > 200_000) throw new Error("this tool is too large to sync");
      const now = Date.now();
      const existing = db.select().from(customTools).where(and(eq(customTools.id, id), eq(customTools.ownerId, owner))).get();
      if (existing) {
        db.update(customTools).set({ name: name.slice(0, 80), description: String(description ?? "").slice(0, 300), mode, code: mode === "code" ? code : null, graphJson: mode === "blocks" ? JSON.stringify(graph) : null, updatedAt: now }).where(and(eq(customTools.id, id), eq(customTools.ownerId, owner))).run();
      } else {
        db.insert(customTools).values({ id, ownerId: owner, name: name.slice(0, 80), description: String(description ?? "").slice(0, 300), mode, code: mode === "code" ? code : null, graphJson: mode === "blocks" ? JSON.stringify(graph) : null, createdAt: now, updatedAt: now }).run();
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/tools/:id", requireScope("write"), (req, res) => {
    const owner = String((req as any).apiKey?.id ?? "");
    const id = String(req.params.id);
    db.delete(customTools).where(and(eq(customTools.id, id), eq(customTools.ownerId, owner))).run();
    res.json({ ok: true });
  });
}

function rowToTool(row: { id: string; name: string; description: string; mode: string; code: string | null; graphJson: string | null }) {
  let graph: unknown = undefined;
  try { graph = row.graphJson ? JSON.parse(row.graphJson) : undefined; } catch { /* damaged row, treated as absent */ }
  return { id: row.id, name: row.name, description: row.description, mode: row.mode === "code" ? "code" as const : "blocks" as const, code: row.code ?? undefined, graph };
}
