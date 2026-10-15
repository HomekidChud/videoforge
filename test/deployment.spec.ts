// ============================================================================
// Deployment resilience + optional MongoDB configuration tests.
//
// Run:
//   npx tsx test/deployment.spec.ts
//
// Covers the Render EACCES boot crash (unwritable VIDEOFORGE_SYNC_DIR /
// VIDEOFORGE_DB / media dirs must never kill the server at import time),
// the degraded-storage contract (boot, serve reads, reject writes with a
// clear 503 — never accept data into a disposable database, on every
// mutating route including the live routes), persistence with an unwritable
// backup dir, the owner-key discard path, and the optional MongoDB module
// (server/mongo.ts).
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

let passed = 0, failed = 0, skipped = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return (async () => {
    try { await fn(); passed++; console.log(`PASS: ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL: ${name}: ${e.message}`); }
  })();
};

// A path that can NEVER be created: its parent is a regular file, so
// mkdir -p fails on any OS/user (portable stand-in for Render's EACCES).
const BLOCKER = path.join("/tmp", `vf-blocker-${Date.now()}`);
fs.writeFileSync(BLOCKER, "not a directory");
const unwritable = (sub: string) => path.join(BLOCKER, sub);

const tmp = (label: string) => {
  const d = path.join("/tmp", `vf-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

// ---------------------------------------------------------------------------
// Server harness — one child per scenario, always cleaned up in finally,
// exit awaited. No orphaned processes between scenarios.
// ---------------------------------------------------------------------------
const OUT = fs.openSync("/tmp/vf_deployment_server.log", "w");

async function withServer(
  port: number,
  env: Record<string, string>,
  fn: (port: number) => void | Promise<void>
): Promise<void> {
  const child = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), ...env },
    stdio: ["ignore", OUT, OUT],
    detached: true,
  });
  let killed = false;
  const kill = async () => {
    killed = true;
    try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ }
    // await exit so the next scenario can never talk to a stale process
    if (child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000);
        child.on("exit", () => { clearTimeout(t); resolve(); });
      });
    }
  };
  try {
    const deadline = Date.now() + 30000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok || r.status === 503) break;
      } catch {}
      if (Date.now() > deadline) throw new Error("server did not start in 30s");
      await new Promise((r) => setTimeout(r, 200));
    }
    await fn(port);
  } finally {
    await kill();
  }
  if (!killed) throw new Error("unreachable");
}

const j = async (port: number, p: string, init: RequestInit = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, init);
  let body: any = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
const AUTH = { Authorization: "Bearer vf_admin_deployment_spec_key" };

// ---------------------------------------------------------------------------
// 1. The exact Render failure: sync dir + DB + media dirs all unwritable.
//    Previously: EACCES crash at import. Now: boot, serve reads/UI, 503 on
//    every mutating /api request — including the live routes — with an
//    actionable message.
// ---------------------------------------------------------------------------
await test("unwritable durable paths: server boots, serves reads, rejects writes with 503", async () => {
  const PORT = 5187;
  await withServer(PORT, {
    VIDEOFORGE_DB: unwritable("data/data.db"),
    VIDEOFORGE_SYNC_DIR: unwritable("data/restore"),
    VIDEOFORGE_MEDIA_DIR: unwritable("data/media"),
    VIDEOFORGE_RENDER_DIR: unwritable("data/renders"),
  }, async (port) => {
    const health = await j(port, "/api/health");
    if (health.status !== 200) throw new Error(`health status ${health.status}`);
    if (health.body.ok !== false) throw new Error("degraded storage must report ok:false");
    if (!health.body.warnings?.length) throw new Error("degraded storage must carry warnings");

    const ui = await fetch(`http://127.0.0.1:${port}/`);
    if (ui.status !== 200) throw new Error(`UI status ${ui.status} — server must still serve the client`);

    // key management
    const keys = await j(port, "/api/keys", { method: "POST" });
    if (keys.status !== 503) throw new Error(`mutating request must be 503, got ${keys.status}`);
    if (!String(keys.body.message ?? "").includes("storage is degraded"))
      throw new Error("503 must explain the degraded storage and the fix");

    // a live (polling) route must be covered too — no bypass via /api/live
    const live = await j(port, "/api/live/some-project/publish", { method: "POST", headers: AUTH });
    if (live.status !== 503) throw new Error(`live mutating route must be 503, got ${live.status}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Writable DB + sync dir, unwritable media/render dirs: normal operation
//    for everything except uploads, which fail per-request with a clear
//    error. The manifest backup still works (it must never mirror a
//    degraded DB, and here the DB is fine).
// ---------------------------------------------------------------------------
await test("unwritable media dirs: uploads fail per-request, rest works, manifest written", async () => {
  const PORT = 5186;
  const DB = path.join(tmp("db"), "data.db");
  const SYNC = tmp("sync");
  await withServer(PORT, {
    VIDEOFORGE_DB: DB,
    VIDEOFORGE_SYNC_DIR: SYNC,
    VIDEOFORGE_MEDIA_DIR: unwritable("media"),
    VIDEOFORGE_RENDER_DIR: unwritable("renders"),
    VIDEOFORGE_BOOTSTRAP_KEY: "vf_admin_deployment_spec_key",
    // configured-but-unreachable mongo: health must report it WITHOUT
    // attempting a connection (liveness stays independent of the integration)
    MONGODB_URI: "mongodb://127.0.0.1:1/",
  }, async (port) => {
    const health = await j(port, "/api/health");
    if (health.body.ok !== true) throw new Error("writable DB must report ok:true");
    if (health.body.mongo !== "configured") throw new Error("configured mongo must be reported in health");
    if (health.body.warnings) throw new Error("no warnings expected in this scenario");

    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "clip.mp4");
    const upload = await j(port, "/api/media/upload", {
      method: "POST", headers: AUTH, body: fd,
    });
    if (upload.status === 503) throw new Error("upload must not be blocked by the degraded-DB middleware here");
    if (![400, 500].includes(upload.status)) throw new Error(`upload status ${upload.status}`);
    if (!String(upload.body.message ?? "").match(/store|upload/i))
      throw new Error("failed upload must return a clear per-request error");

    // The manifest writer snapshots on change on a 5s interval — wait for it.
    const manifest = path.join(SYNC, "save_manifest.json");
    for (let i = 0; i < 20 && !fs.existsSync(manifest); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!fs.existsSync(manifest)) throw new Error("manifest backup must be written when the DB is healthy");
  });
});

// ---------------------------------------------------------------------------
// 3. The minimal original regression: writable SQLite + unwritable sync dir.
//    The backup is optional — the service must be fully operational and data
//    must persist across a restart.
// ---------------------------------------------------------------------------
await test("writable DB + unwritable sync dir: fully operational, data survives a restart", async () => {
  const PORT = 5185;
  const DB = path.join(tmp("persist"), "data.db");
  const env = {
    VIDEOFORGE_DB: DB,
    VIDEOFORGE_SYNC_DIR: unwritable("restore"),
    VIDEOFORGE_BOOTSTRAP_KEY: "vf_admin_deployment_spec_key",
  };
  const name = `persist-spec-${Date.now()}`;
  let projectId = "";
  await withServer(PORT, env, async (port) => {
    const health = await j(port, "/api/health");
    if (health.body.ok !== true) throw new Error("must be fully operational");
    if (health.body.warnings) throw new Error("an unwritable optional backup must not degrade the service");
    const created = await j(port, "/api/projects", {
      method: "POST", headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ name, timeline: { clips: [] } }),
    });
    if (created.status !== 201) throw new Error(`create project: ${created.status} ${JSON.stringify(created.body)}`);
    projectId = created.body.id;
    if (!projectId) throw new Error("project id missing from response");
  });
  await withServer(PORT, env, async (port) => {
    const again = await j(port, "/api/health");
    if (again.body.ok !== true) throw new Error("restart must be healthy");
    const list = await j(port, "/api/projects", { headers: AUTH });
    const names = (list.body.projects ?? list.body ?? []).map((p: any) => p.name ?? p);
    if (!JSON.stringify(names).includes(name)) throw new Error("project must survive the restart");
  });
});

// ---------------------------------------------------------------------------
// 4. Optional MongoDB module (server/mongo.ts) — in-process.
// ---------------------------------------------------------------------------
const importMongo = () => import(`../server/mongo.ts?bust=${Date.now()}-${Math.random()}`);

await test("no MONGODB_URI: not configured, nothing connects, getMongoDb refuses", async () => {
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  const m = await importMongo();
  if (m.mongoConfigured() !== false) throw new Error("must not be configured");
  if ((await m.mongoHealth()).status !== "notConfigured") throw new Error("health must say notConfigured");
  if (m.isMongoConnected() !== false) throw new Error("nothing may connect");
  await assert.rejects(() => m.getMongoDb(), /not configured/i);
  await m.closeMongo(); // no-op, must not throw
});

await test("bad MONGODB_URI: bounded failure, no credentials or raw messages leaked", async () => {
  process.env.MONGODB_URI = "mongodb://secretuser:secretpass@127.0.0.1:1/";
  const m = await importMongo();
  const started = Date.now();
  const h = await m.mongoHealth();
  if (h.status !== "error") throw new Error("expected an error status");
  if (Date.now() - started >= 15_000) throw new Error("must fail within the bounded timeouts");
  const text = JSON.stringify(h);
  if (text.includes("secretpass") || text.includes("secretuser")) throw new Error("credentials leaked");
  if (text.includes("mongodb://")) throw new Error("connection string leaked");
  if (m.isMongoConnected() !== false) throw new Error("must not be connected");
  await m.closeMongo();
});

await test("closeMongo() during a pending connect: no race, nothing reconnects", async () => {
  process.env.MONGODB_URI = "mongodb://10.255.255.1:27017/"; // unroutable → hangs until timeout
  const m = await importMongo();
  const pending = m.getMongoDb().catch(() => undefined); // do NOT await yet
  await m.closeMongo(); // close while the connect is still in flight
  if (m.isMongoConnected() !== false) throw new Error("a closed module must stay disconnected");
  await pending;
  if (m.isMongoConnected() !== false) throw new Error("the in-flight connect must not repopulate the client");
  await m.closeMongo();
});

await test("real connection: ping, reuse, read/write, close (disposable in-memory MongoDB)", async () => {
  let memory: { getUri: () => string; stop: () => Promise<void> } | null = null;
  // Only the disposable-server setup is allowed to degrade into a SKIP
  // (binary download can fail on restricted networks). The assertions below
  // it are never skipped.
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memory = await MongoMemoryServer.create();
  } catch (e: any) {
    skipped++;
    console.log(`SKIP: could not obtain the disposable MongoDB binary (${e.message})`);
    return;
  }
  try {
    process.env.MONGODB_URI = memory.getUri();
    process.env.MONGODB_DB = "videoforge-spec";
    const m = await importMongo();
    if (m.mongoConfigured() !== true) throw new Error("must be configured");

    const db1 = await m.getMongoDb();
    await db1.collection("spec").insertOne({ ok: true });
    const found = await db1.collection("spec").findOne({ ok: true });
    if (!found) throw new Error("write/read round-trip failed");

    const h = await m.mongoHealth();
    if (h.status !== "ok" || h.database !== "videoforge-spec") throw new Error(`health: ${JSON.stringify(h)}`);
    if (m.isMongoConnected() !== true) throw new Error("must be connected");

    const db2 = await m.getMongoDb(); // reuse: same handle, no second pool
    if (db2.databaseName !== db1.databaseName) throw new Error("expected the same database");

    await m.closeMongo();
    if (m.isMongoConnected() !== false) throw new Error("close must disconnect");
  } finally {
    if (memory) await memory.stop().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// 5. The durable module itself: unwritable sync dir must not throw at import.
// ---------------------------------------------------------------------------
await test("unwritable sync dir: durable module loads, manifest save is a no-op", async () => {
  process.env.VIDEOFORGE_SYNC_DIR = unwritable("restore");
  const m = await import(`../server/durable.ts?bust=crash-${Date.now()}`);
  if (typeof m.saveManifest !== "function") throw new Error("module did not load");
  // previously: EACCES/ENOTDIR thrown at import time. Now: safe no-op.
  m.saveManifest({ mediaAssets: [], projects: [], renderJobs: [], apiKeyHashes: [], bootstrapKeyHash: null });
});

// ---------------------------------------------------------------------------
// 6. Owner-key discard: if OWNER_KEY.txt cannot be written, no unusable admin
//    row may remain and the plaintext must never be printed.
// ---------------------------------------------------------------------------
await test("unwritable OWNER_KEY.txt: key discarded, no admin row, no plaintext in logs", async () => {
  delete process.env.VIDEOFORGE_BOOTSTRAP_KEY;
  // Run from a directory where data/ cannot exist: make "data" a regular file.
  const cwd = process.cwd();
  const ro = tmp("ro");
  fs.writeFileSync(path.join(ro, "data"), "not a directory");
  process.env.VIDEOFORGE_DB = path.join(ro, "data.db");
  process.chdir(ro);
  const logs: string[] = [];
  const origWarn = console.warn, origLog = console.log;
  console.warn = (...a: any[]) => logs.push(a.join(" "));
  console.log = (...a: any[]) => logs.push(a.join(" "));
  try {
    const auth = await import(`../server/auth.ts?bust=discard-${Date.now()}`);
    const id = await auth.ensureOwnerKeyExists();
    if (id !== null) throw new Error("a discarded key must return null, not a success id");
    const admins = auth.listKeys().filter((k: any) => k.scope === "admin");
    if (admins.length !== 0) throw new Error("no unusable admin row may remain in the DB");
    const text = logs.join("\n");
    if (/vf_admin_[A-Za-z0-9_]+/.test(text)) throw new Error("plaintext key leaked to logs");
    if (!text.includes("VIDEOFORGE_BOOTSTRAP_KEY")) throw new Error("operator must be pointed at the env bootstrap");
  } finally {
    console.warn = origWarn; console.log = origLog;
    process.chdir(cwd);
    delete process.env.VIDEOFORGE_DB;
    fs.rmSync(ro, { recursive: true, force: true });
  }
});

fs.rmSync(BLOCKER, { force: true });
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) process.exit(1);
