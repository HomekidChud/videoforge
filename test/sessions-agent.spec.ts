// ============================================================================
// Durable sessions and self-serve agent keys, tested in process: no server is
// started and no port is opened. Route handlers are driven with plain request
// and response objects.
//
// Run:
//   npx tsx test/sessions-agent.spec.ts
// ============================================================================

process.env.VIDEOFORGE_DB = ":memory:";
process.env.VIDEOFORGE_SESSION_SECRET = "test-secret-test-secret-0123456789";
delete process.env.VIDEOFORGE_BOOTSTRAP_KEY;
delete process.env.VIDEOFORGE_AGENT_KEYS;

import assert from "node:assert/strict";
import crypto from "node:crypto";

const { db, storage } = await import("../server/storage");
const { signToken, verifyToken, resetSecretCache, secretSource } = await import("../server/stateless");
const accounts = await import("../server/accounts");
const auth = await import("../server/auth");
const { registerAgentRoutes, agentIssueThrottle, resetAgentIssueThrottle } = await import("../server/agent");
const { users, sessions, apiKeys } = await import("../shared/schema");
const { eq } = await import("drizzle-orm");

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; }
  catch (e) { console.error(`FAIL: ${name}`); throw e; }
}

// ---- tiny request / response doubles ----
type Res = { code: number; body: any; headers: Record<string, string>; done: boolean; status(n: number): Res; json(b: unknown): Res; setHeader(k: string, v: string): void };
const mkRes = (): Res => ({ code: 200, body: undefined, headers: {}, done: false,
  status(n) { this.code = n; return this; }, json(b) { this.body = b; this.done = true; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const mkReq = (over: Record<string, unknown> = {}) => ({ method: "GET", path: "/api/projects", headers: {}, body: {}, query: {}, params: {}, socket: { remoteAddress: "10.0.0.1" }, ...over }) as any;
/** Run a middleware chain the way Express would, stopping when a handler answers. */
async function run(chain: Function[], req: any): Promise<Res> {
  const res = mkRes();
  for (const h of chain) {
    let advanced = false;
    await h(req, res, () => { advanced = true; });
    if (!advanced) break;
  }
  return res;
}
const cookieReq = (token: string, over: Record<string, unknown> = {}) => mkReq({ headers: { cookie: `vf_session=${token}` }, ...over });
const bearerReq = (key: string, over: Record<string, unknown> = {}) => mkReq({ headers: { authorization: `Bearer ${key}` }, ...over });

// ---- capture the agent routes without an Express app ----
const routes: Record<string, Function[]> = {};
const fakeApp: any = {};
for (const m of ["get", "post", "put", "delete"]) fakeApp[m] = (p: string, ...h: Function[]) => { routes[`${m.toUpperCase()} ${p}`] = h; };
registerAgentRoutes(fakeApp);

const makeUser = (email: string, role = "user") => {
  const u = { id: crypto.randomUUID(), email, passwordHash: "x:y", googleSub: null, name: "Ada", role, createdAt: Date.now() };
  db.insert(users).values(u).run();
  return u;
};

// ============================== signed tokens ==============================
await check("secret comes from the environment", () => assert.equal(secretSource(), "env"));

await check("signed tokens verify, and tampering or expiry is refused", () => {
  const t = signToken("demo", { a: 1, x: Date.now() + 60_000 });
  assert.equal(verifyToken<any>("demo", t)?.a, 1);
  const [k, body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ a: 2, x: Date.now() + 60_000 })).toString("base64url");
  assert.equal(verifyToken("demo", `${k}.${forged}.${sig}`), null, "edited payload");
  assert.equal(verifyToken("demo", `${k}.${body}.${sig.slice(0, -2)}AA`), null, "edited signature");
  assert.equal(verifyToken("other", t), null, "a token is not valid as another kind");
  assert.equal(verifyToken("demo", signToken("demo", { a: 1, x: Date.now() - 1 })), null, "expired");
  assert.equal(verifyToken("demo", signToken("demo", { a: 1 })), null, "no expiry is refused");
  assert.equal(verifyToken("demo", "garbage"), null);
});

await check("a different secret rejects tokens signed with the old one", () => {
  const t = signToken("demo", { x: Date.now() + 60_000 });
  const old = process.env.VIDEOFORGE_SESSION_SECRET;
  process.env.VIDEOFORGE_SESSION_SECRET = "a-completely-different-secret-value";
  resetSecretCache();
  assert.equal(verifyToken("demo", t), null);
  process.env.VIDEOFORGE_SESSION_SECRET = old; resetSecretCache();
  assert.ok(verifyToken("demo", t), "restoring the secret restores the token");
});

await check("the bootstrap key can stand in for the session secret", () => {
  const old = process.env.VIDEOFORGE_SESSION_SECRET;
  delete process.env.VIDEOFORGE_SESSION_SECRET;
  process.env.VIDEOFORGE_BOOTSTRAP_KEY = "vf_admin_example_key_for_test";
  resetSecretCache();
  assert.equal(secretSource(), "bootstrap");
  const t = signToken("demo", { x: Date.now() + 60_000 });
  resetSecretCache();
  assert.ok(verifyToken("demo", t), "stable across a simulated restart");
  delete process.env.VIDEOFORGE_BOOTSTRAP_KEY; process.env.VIDEOFORGE_SESSION_SECRET = old; resetSecretCache();
});

// ================================ sessions ================================
await check("a session cookie identifies the account", () => {
  const u = makeUser("ada@example.com");
  const token = accounts.createSession(u);
  assert.ok(token.startsWith("v2."));
  assert.equal(accounts.sessionUser(cookieReq(token))?.id, u.id);
});

await check("the session survives the database being wiped", () => {
  const u = makeUser("grace@example.com", "admin");
  const token = accounts.createSession(u);
  db.delete(users).where(eq(users.id, u.id)).run(); // what a server reset does
  const back = accounts.sessionUser(cookieReq(token));
  assert.equal(back?.id, u.id);
  assert.equal(back?.email, "grace@example.com");
  assert.equal(back?.role, "admin");
  assert.equal(db.select().from(users).where(eq(users.id, u.id)).get()?.email, "grace@example.com", "the account row was recreated");
});

await check("a recreated account with the same email keeps the browser signed in", () => {
  const u = makeUser("lin@example.com");
  const token = accounts.createSession(u);
  db.delete(users).where(eq(users.id, u.id)).run();
  const again = makeUser("lin@example.com");
  assert.equal(accounts.sessionUser(cookieReq(token))?.id, again.id);
});

await check("a tampered or foreign cookie is refused", () => {
  const u = makeUser("mallory@example.com");
  const token = accounts.createSession(u);
  const [k, body, sig] = token.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  const promoted = Buffer.from(JSON.stringify({ ...claims, r: "admin" })).toString("base64url");
  assert.equal(accounts.sessionUser(cookieReq(`${k}.${promoted}.${sig}`)), null);
  assert.equal(accounts.sessionUser(cookieReq("v2.e30.bad")), null);
  assert.equal(accounts.sessionUser(mkReq()), null, "no cookie");
});

await check("logout revokes the session", () => {
  const u = makeUser("out@example.com");
  const token = accounts.createSession(u);
  assert.ok(accounts.sessionUser(cookieReq(token)));
  accounts.destroySession(cookieReq(token));
  assert.equal(accounts.sessionUser(cookieReq(token)), null);
});

await check("deleting an account refuses its existing sessions, a new sign-in works", async () => {
  const u = makeUser("gone@example.com");
  const old = accounts.createSession(u);
  accounts.revokeToken(u.id, "user", Date.now() + 1000 * 60);
  db.delete(users).where(eq(users.id, u.id)).run();
  assert.equal(accounts.sessionUser(cookieReq(old)), null);
  await new Promise((r) => setTimeout(r, 5));
  const again = { ...u, createdAt: Date.now() };
  db.insert(users).values(again).run();
  assert.ok(accounts.sessionUser(cookieReq(accounts.createSession(again))), "a session issued after the revocation is fine");
});

await check("legacy database sessions keep working until they expire", () => {
  const u = makeUser("legacy@example.com");
  const raw = crypto.randomBytes(32).toString("base64url");
  const id = crypto.createHash("sha256").update(raw).digest("hex");
  db.insert(sessions).values({ id, userId: u.id, createdAt: Date.now(), expiresAt: Date.now() + 60_000 }).run();
  assert.equal(accounts.sessionUser(cookieReq(raw))?.id, u.id);
  db.update(sessions).set({ expiresAt: Date.now() - 1 }).where(eq(sessions.id, id)).run();
  assert.equal(accounts.sessionUser(cookieReq(raw)), null);
});

// ============================== agent keys ==============================
const createKey = async (body: unknown = {}, ip = "10.1.1.1") => run(routes["POST /api/agent/keys"], mkReq({ method: "POST", path: "/api/agent/keys", body, socket: { remoteAddress: ip } }));

await check("an agent can create its own key with no credentials", async () => {
  const res = await createKey({ name: "Motion bot" });
  assert.equal(res.code, 201);
  assert.ok(res.body.key.startsWith("vf_agent."));
  assert.equal(res.body.scope, "write");
  assert.ok(res.body.expiresAt > Date.now() + 6 * 86_400_000 && res.body.expiresAt < Date.now() + 8 * 86_400_000, "7 days by default");
  assert.equal(db.select().from(apiKeys).all().length, 0, "nothing is stored: the key is a signed token");
});

await check("key requests are validated", async () => {
  assert.equal((await createKey({ days: 0 })).code, 400);
  assert.equal((await createKey({ days: 31 })).code, 400);
  assert.equal((await createKey({ days: "7" })).code, 400);
  assert.equal((await createKey({ name: 5 })).code, 400);
  const long = await createKey({ name: "x".repeat(500), days: 30 });
  assert.equal(long.code, 201);
  assert.ok(long.body.expiresAt <= Date.now() + 30 * 86_400_000 + 1000);
});

await check("an agent key authenticates and reports who it is", async () => {
  const { key, agentId } = (await createKey({ name: "Reporter" })).body;
  const req = bearerReq(key, { path: "/api/auth/me" });
  const res = await run([auth.requireScope("read")], req);
  assert.equal(res.done, false, "passed through to the handler");
  assert.equal(req.apiKey.agentId, agentId);
  assert.equal(req.apiKey.scope, "write");
  assert.equal(auth.keyMetadata(req.apiKey).kind, "agent");
});

await check("agent keys cannot reach admin routes", async () => {
  const { key } = (await createKey()).body;
  const res = await run([auth.requireAdmin], bearerReq(key, { path: "/api/keys" }));
  assert.equal(res.code, 403);
});

await check("forged, expired and revoked agent keys are refused", async () => {
  const { key, agentId } = (await createKey()).body;
  const [k, body, sig] = key.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  const longer = Buffer.from(JSON.stringify({ ...claims, x: claims.x + 1e10 })).toString("base64url");
  assert.equal((await run([auth.requireScope("read")], bearerReq(`${k}.${longer}.${sig}`))).code, 401, "extended expiry");
  const expired = signToken("vf_agent", { a: agentId, l: "old", i: 1, x: Date.now() - 1000 });
  assert.equal((await run([auth.requireScope("read")], bearerReq(expired))).code, 401, "expired");
  const revoke = await run(routes["DELETE /api/agent/keys/self"], bearerReq(key, { method: "DELETE", path: "/api/agent/keys/self" }));
  assert.equal(revoke.body.revoked, true);
  assert.equal((await run([auth.requireScope("read")], bearerReq(key))).code, 403, "revoked");
});

await check("renewing keeps the same agent and its projects", async () => {
  const first = (await createKey({ name: "Renewer", days: 1 })).body;
  const res = await run(routes["POST /api/agent/keys/renew"], bearerReq(first.key, { method: "POST", path: "/api/agent/keys/renew", body: { days: 14 } }));
  assert.equal(res.code, 201);
  assert.equal(res.body.agentId, first.agentId);
  assert.ok(res.body.expiresAt > first.expiresAt);
  const owner = await run(routes["POST /api/agent/keys/renew"], bearerReq("not-an-agent", { method: "POST" }));
  assert.equal(owner.code, 401);
});

await check("the agent key still works after a simulated restart", async () => {
  const { key } = (await createKey()).body;
  for (const k of ["session-secret"]) { /* secret is environment-held, so a restart re-reads the same value */ void k; }
  resetSecretCache();
  const res = await run([auth.requireScope("write")], bearerReq(key, { method: "POST", path: "/api/projects" }));
  assert.equal(res.done, false);
});

await check("issuing is throttled per address", async () => {
  resetAgentIssueThrottle();
  let last = 0;
  for (let i = 0; i < 20; i++) last = agentIssueThrottle("203.0.113.9");
  assert.equal(last, 0, "20 per hour are allowed");
  assert.ok(agentIssueThrottle("203.0.113.9") > 0, "the 21st is not");
  assert.equal(agentIssueThrottle("203.0.113.10"), 0, "another address is unaffected");
  resetAgentIssueThrottle();
  const res = await (async () => { for (let i = 0; i < 20; i++) await createKey({}, "198.51.100.7"); return createKey({}, "198.51.100.7"); })();
  assert.equal(res.code, 429);
  assert.ok(Number(res.headers["Retry-After"]) > 0);
  resetAgentIssueThrottle();
});

await check("VIDEOFORGE_AGENT_KEYS=off turns self-serve keys off", async () => {
  process.env.VIDEOFORGE_AGENT_KEYS = "off";
  try {
    assert.equal((await createKey()).code, 403);
    assert.equal((await run(routes["GET /api/agent"], mkReq())).body.enabled, false);
  } finally { delete process.env.VIDEOFORGE_AGENT_KEYS; }
  assert.equal((await run(routes["GET /api/agent"], mkReq())).body.enabled, true);
});

// ================================ sandbox ================================
const now = Date.now();
const mkProject = (ownerId: string | null) => storage.createProject({ id: crypto.randomBytes(6).toString("hex"), name: "p", timelineJson: JSON.stringify({ clips: [] }), createdAt: now, updatedAt: now, ownerId });
const mkAsset = (ownerId: string | null) => storage.createAsset({ id: crypto.randomBytes(6).toString("hex"), filename: "a.mp4", kind: "video", mime: "video/mp4", duration: 1, hasAudio: 0, width: 2, height: 2, sizeBytes: 1, storagePath: "/nonexistent", thumbPath: null, createdAt: now, ownerId });

const A = (await createKey({ name: "A" })).body, B = (await createKey({ name: "B" })).body;
const pA = mkProject(A.agentId), pB = mkProject(B.agentId), pShared = mkProject(null);
const aA = mkAsset(A.agentId), aB = mkAsset(B.agentId);

const gate = (key: string, over: Record<string, unknown>) => run([auth.requireScope(over.method === "GET" || !over.method ? "read" : "write")], bearerReq(key, over));

await check("an agent reaches its own project and nothing else", async () => {
  assert.equal((await gate(A.key, { path: `/api/projects/${pA.id}` })).done, false);
  assert.equal((await gate(A.key, { path: `/api/projects/${pB.id}` })).code, 403, "another agent's project");
  assert.equal((await gate(A.key, { path: `/api/projects/${pShared.id}` })).code, 403, "a shared workspace project");
  assert.equal((await gate(A.key, { path: `/api/live/${pB.id}/publish`, method: "POST" })).code, 403, "live state of another project");
  assert.equal((await gate(A.key, { path: `/api/projects/${pB.id}/timeline/ops`, method: "POST", body: { ops: [] } })).code, 403);
});

await check("an agent cannot render, read or reference what it does not own", async () => {
  assert.equal((await gate(A.key, { path: "/api/renders", method: "POST", body: { projectId: pB.id } })).code, 403);
  assert.equal((await gate(A.key, { path: "/api/renders", method: "POST", body: { projectId: pA.id } })).done, false);
  assert.equal((await gate(A.key, { path: `/api/media/${aB.id}` })).code, 403);
  assert.equal((await gate(A.key, { path: `/api/media/${aA.id}` })).done, false);
  const withForeign = await gate(A.key, { path: `/api/projects/${pA.id}`, method: "PUT", body: { timeline: { clips: [{ assetId: aB.id }] } } });
  assert.equal(withForeign.code, 403, "a timeline using another agent's media");
  const withOwn = await gate(A.key, { path: `/api/projects/${pA.id}`, method: "PUT", body: { timeline: { clips: [{ assetId: aA.id }] } } });
  assert.equal(withOwn.done, false);
});

await check("list filters hide what an agent does not own", async () => {
  const ka = (await run([auth.requireScope("read")], (() => { const r = bearerReq(A.key); (globalThis as any).__r = r; return r; })())), req = (globalThis as any).__r;
  void ka;
  const visible = storage.listProjects().filter((p) => auth.projectAllowed(req.apiKey, p.id)).map((p) => p.id);
  assert.deepEqual(visible, [pA.id]);
  const media = storage.listAssets().filter((a) => auth.assetAllowed(req.apiKey, a.id)).map((a) => a.id);
  assert.deepEqual(media, [aA.id]);
});

await check("owner keys and accounts still see the whole workspace", async () => {
  const { key } = auth.createKey("workspace key", "write");
  const req = bearerReq(key);
  await run([auth.requireScope("read")], req);
  const visible = storage.listProjects().filter((p) => auth.projectAllowed(req.apiKey, p.id)).map((p) => p.id);
  for (const id of [pA.id, pB.id, pShared.id]) assert.ok(visible.includes(id), `sees ${id}`);
});

await check("new projects are stamped with the creating agent", async () => {
  const req = bearerReq(A.key, { method: "POST", path: "/api/projects" });
  await run([auth.requireScope("write")], req);
  assert.equal(auth.ownerOf(req), A.agentId);
  const ownerReq = bearerReq(auth.createKey("plain", "write").key);
  await run([auth.requireScope("write")], ownerReq);
  assert.equal(auth.ownerOf(ownerReq), null, "owner keys create shared projects");
});

await check("the request rate limit applies to agent keys", async () => {
  const { key } = (await createKey({ name: "Burst" })).body;
  let last = 0;
  for (let i = 0; i < 125; i++) last = (await run([auth.requireScope("read")], bearerReq(key, { path: "/api/capabilities" }))).code;
  assert.equal(last, 429);
});

await check("media tokens work for agents and die with the agent", async () => {
  const req = bearerReq(A.key, { path: `/api/auth/media-token/${aA.id}` });
  const gated = await run([auth.requireScope("read")], req);
  assert.equal(gated.done, false, JSON.stringify(gated.body));
  const token = auth.issueMediaToken(aA.id, req.apiKey.id);
  assert.equal(auth.verifyMediaToken(token, aA.id), true);
  assert.equal(auth.verifyMediaToken(auth.issueMediaToken(aB.id, req.apiKey.id), aB.id), false, "not another agent's media");
  await run(routes["DELETE /api/agent/keys/self"], bearerReq(A.key, { method: "DELETE", path: "/api/agent/keys/self" }));
  assert.equal(auth.verifyMediaToken(token, aA.id), false, "revoked agent");
});

console.log(`sessions-agent.spec: ${passed} checks passed`);
