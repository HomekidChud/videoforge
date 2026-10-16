// ============================================================================
// Accounts and sessions: email + password sign-in, durable sessions that
// survive a server restart, the tool library, and the sign-in rules.
//
// Run:
//   npx tsx test/accounts.spec.ts
// ============================================================================

import { spawn, spawnSync, ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PORT = 5197;

const DB = path.join(ROOT, "data.accounts-test.db");
for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) {
  try { fs.unlinkSync(f); } catch {}
}

let server: ChildProcess | null = null;
const OUT = fs.openSync("/tmp/vf_accounts_test.log", "w");
function killServer() { if (server) { try { process.kill(-server.pid!, "SIGKILL"); } catch { server.kill("SIGKILL"); } server = null; } }
process.on("exit", killServer);
process.on("SIGINT", () => { killServer(); process.exit(1); });

const BOOTSTRAP = "vf_admin_test_bootstrap_key_12345";

async function startServer(): Promise<void> {
  server = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT), NODE_ENV: "development", VIDEOFORGE_BOOTSTRAP_KEY: BOOTSTRAP },
    stdio: ["ignore", OUT, OUT],
    detached: true,
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start in 30s");
}

const BASE = `http://127.0.0.1:${PORT}`;
async function j(method: string, url: string, body?: unknown, cookie?: string): Promise<{ status: number; data: any; setCookie: string | null }> {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, setCookie };
}

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) { await fn(); checks++; }

const cookieOf = (r: { setCookie: string | null }) => (r.setCookie ?? "").split(";")[0];

(async () => {
  await startServer();

  await check("sign-in config: no google, no accounts yet", async () => {
    const r = await j("GET", "/api/auth/config");
    if (r.data.google !== false) throw new Error("google should be off when unconfigured");
    if (r.data.hasAccounts !== false) throw new Error("no accounts yet");
  });

  await check("the first account needs the owner key", async () => {
    const bad = await j("POST", "/api/auth/register", { email: "stranger@example.com", password: "password123" });
    if (bad.status !== 400) throw new Error("a stranger must not be able to bootstrap the workspace");
    const ok = await j("POST", "/api/auth/register", { email: "owner@example.com", password: "password123", name: "Owner", ownerKey: BOOTSTRAP });
    if (ok.status !== 200) throw new Error(`first account creation failed: ${JSON.stringify(ok.data)}`);
    if (ok.data.role !== "admin") throw new Error("the first account becomes the admin");
  });

  await check("email sign-in issues a durable cookie session", async () => {
    const bad = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "wrong" });
    if (bad.status !== 401) throw new Error("wrong passwords are rejected");
    const ok = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
    if (ok.status !== 200) throw new Error("login failed");
    const cookie = cookieOf(ok);
    if (!cookie.startsWith("vf_session=")) throw new Error("the session is a vf_session cookie");
    if (!/HttpOnly/i.test(ok.setCookie ?? "")) throw new Error("the session cookie must be HttpOnly");
    // the cookie opens the workspace without any API key
    const me = await j("GET", "/api/auth/me", undefined, cookie);
    if (me.status !== 200 || me.data.email !== "owner@example.com") throw new Error("the session should work like a key");
    // and without a cookie or key, it's a 401
    const anon = await j("GET", "/api/auth/me");
    if (anon.status !== 401) throw new Error("anonymous access must be rejected");
  });

  await check("self-signup is closed until the admin opens it", async () => {
    const r = await j("POST", "/api/auth/register", { email: "kid@example.com", password: "password123" });
    if (r.status !== 400) throw new Error("registration must be closed by default");
    const open = await j("POST", "/api/auth/register", { email: "kid@example.com", password: "password123", ownerKey: BOOTSTRAP });
    // the owner key no longer bootstraps once an account exists — it is not an admin creator
    if (open.status !== 400) throw new Error("the owner key is not a back door once accounts exist");
  });

  const login = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
  const ownerCookie = cookieOf(login);

  await check("the tool library syncs per account", async () => {
    const empty = await j("GET", "/api/tools", undefined, ownerCookie);
    if (empty.status !== 200 || !Array.isArray(empty.data.tools) || empty.data.tools.length) throw new Error("the library starts empty");
    const put = await j("PUT", "/api/tools/tool-1", { name: "My tool", description: "", mode: "code", code: "return [];" }, ownerCookie);
    if (put.status !== 200) throw new Error("saving a tool failed");
    const bad = await j("PUT", "/api/tools/tool-2", { name: "x", mode: "nope" }, ownerCookie);
    if (bad.status !== 400) throw new Error("bad tools are rejected");
    const list = await j("GET", "/api/tools", undefined, ownerCookie);
    if (list.data.tools.length !== 1 || list.data.tools[0].name !== "My tool") throw new Error("saved tools come back");
    const del = await j("DELETE", "/api/tools/tool-1", undefined, ownerCookie);
    if (del.status !== 200) throw new Error("deleting failed");
    // tool routes need auth
    const anon = await j("GET", "/api/tools");
    if (anon.status !== 401) throw new Error("the tool library needs a session");
  });

  await check("sign-in survives a server restart", async () => {
    killServer();
    await new Promise((r) => setTimeout(r, 500));
    await startServer();
    // the cookie was minted before the restart; the session lives in the DB
    const me = await j("GET", "/api/auth/me", undefined, ownerCookie);
    if (me.status !== 200 || me.data.email !== "owner@example.com") throw new Error("the session must survive a restart");
    const tools = await j("GET", "/api/tools", undefined, ownerCookie);
    if (tools.status !== 200) throw new Error("the library must survive a restart too");
  });

  await check("logout ends the session", async () => {
    const out = await j("POST", "/api/auth/logout", undefined, ownerCookie);
    if (out.status !== 200) throw new Error("logout failed");
    const me = await j("GET", "/api/auth/me", undefined, ownerCookie);
    if (me.status !== 401) throw new Error("a logged-out cookie must stop working");
  });

  await check("API keys still work for agents", async () => {
    // an admin account can mint API keys for agents, and they work Bearer-style
    const again = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
    const created = await j("POST", "/api/keys", { label: "agent", scope: "write" }, cookieOf(again));
    if (created.status !== 201 || typeof created.data.key !== "string") throw new Error("an admin account can mint API keys");
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${created.data.key}` } });
    if (!me.ok) throw new Error("minted keys must keep working for agents");
    const meData = await me.json();
    if (meData.kind === "account") throw new Error("Bearer keys are keys, not accounts");
  });

  await check("media tokens minted by accounts work on media routes", async () => {
    const again = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
    const cookie = cookieOf(again);
    // a fake asset id shape — the token must still mint and verify structurally
    const minted = await j("GET", "/api/auth/media-token/0123456789abcdef", undefined, cookie);
    if (minted.status === 200 && typeof minted.data.token === "string") {
      const raw = await fetch(`${BASE}/api/media/0123456789abcdef/raw?st=${minted.data.token}`);
      if (raw.status === 401) throw new Error("account-minted media tokens should verify (asset may 404, not 401)");
    }
  });

  await check("exported standalone scripts run against the API", async () => {
    const again = await j("POST", "/api/auth/login", { email: "owner@example.com", password: "password123" });
    const cookie = cookieOf(again);
    const made = await j("POST", "/api/keys", { label: "script runner", scope: "write" }, cookie);
    if (made.status !== 201) throw new Error("minting a key for the script failed");
    const project = await j("POST", "/api/projects", { name: "Script test", timeline: { clips: [] } }, cookie);
    if (project.status !== 201) throw new Error("creating a project failed");
    const pid = project.data.id;
    // generate the script with the same code the studio exports
    const { exportStandaloneScript } = await import("../shared/custom-tools");
    const fs = await import("node:fs");
    fs.writeFileSync("/tmp/vf-standalone.mjs", exportStandaloneScript({ id: "t", name: "Standalone check", description: "", mode: "code", code: "return [vf.addText({ text: 'Hola', start: 0, duration: 2 })];" }));
    const run = spawnSync("node", ["/tmp/vf-standalone.mjs", pid], {
      env: { ...process.env, VF_API_BASE: BASE, VF_API_KEY: made.data.key },
      encoding: "utf8", timeout: 30000,
    });
    if (run.status !== 0) throw new Error(`script failed: ${run.stderr || run.stdout}`);
    if (!/1 ops applied/.test(run.stdout)) throw new Error(`unexpected script output: ${run.stdout}`);
    const after = await j("GET", `/api/projects/${pid}`, undefined, cookie);
    if (!after.data.timeline.clips.some((c: any) => c.text === "Hola")) throw new Error("the script's op did not land in the timeline");
  });

  killServer();
  console.log(`accounts.spec: ${checks} checks passed`);
  process.exit(0);
})().catch((e) => { killServer(); console.error(e); process.exit(1); });
