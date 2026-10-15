// ============================================================================
// Deployment resilience + optional MongoDB configuration tests.
//
// Run:
//   npx tsx test/deployment.spec.ts
//
// Covers the Render EACCES boot crash (unwritable VIDEOFORGE_SYNC_DIR /
// VIDEOFORGE_DB / media dirs must never kill the server at import time),
// the degraded-storage contract (boot, serve reads, reject writes with a
// clear 503 — never accept data into a disposable database), and the
// optional MongoDB module (server/mongo.ts).
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

let passed = 0, failed = 0;
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
// Server harness
// ---------------------------------------------------------------------------
let server: ChildProcess | null = null;
const OUT = fs.openSync("/tmp/vf_deployment_server.log", "w");

function killServer() {
  if (server) {
    try { process.kill(-server.pid!, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch {} }
    server = null;
  }
}
process.on("exit", killServer);
process.on("SIGINT", () => { killServer(); process.exit(1); });

async function startServer(port: number, env: Record<string, string>): Promise<void> {
  server = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), ...env },
    stdio: ["ignore", OUT, OUT],
    detached: true,
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok || r.status === 503) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start in 30s");
}
const j = async (port: number, p: string, init: RequestInit = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, init);
  let body: any = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

// ---------------------------------------------------------------------------
// 1. The exact Render failure: sync dir + DB + media dirs all unwritable.
//    Previously: EACCES crash at import. Now: boot, serve reads/UI, 503 on
//    every mutating /api request with an actionable message.
// ---------------------------------------------------------------------------
await test("unwritable durable paths: server boots, serves reads, rejects writes with 503", async () => {
  const PORT = 5187;
  await startServer(PORT, {
    VIDEOFORGE_DB: unwritable("data/data.db"),
    VIDEOFORGE_SYNC_DIR: unwritable("data/restore"),
    VIDEOFORGE_MEDIA_DIR: unwritable("data/media"),
    VIDEOFORGE_RENDER_DIR: unwritable("data/renders"),
  });

  const health = await j(PORT, "/api/health");
  if (health.status !== 200) throw new Error(`health status ${health.status}`);
  if (health.body.ok !== false) throw new Error("degraded storage must report ok:false");
  if (!health.body.warnings?.length) throw new Error("degraded storage must carry warnings");

  const ui = await fetch(`http://127.0.0.1:${PORT}/`);
  if (ui.status !== 200) throw new Error(`UI status ${ui.status} — server must still serve the client`);

  const write = await j(PORT, "/api/keys", { method: "POST" });
  if (write.status !== 503) throw new Error(`mutating request must be 503, got ${write.status}`);
  if (!String(write.body.message ?? "").includes("storage is degraded"))
    throw new Error("503 must explain the degraded storage and the fix");

  // the process must still be alive (no import-time crash, no boot loop)
  if (!server || server.exitCode !== null) throw new Error("server process died");
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
  await startServer(PORT, {
    VIDEOFORGE_DB: DB,
    VIDEOFORGE_SYNC_DIR: SYNC,
    VIDEOFORGE_MEDIA_DIR: unwritable("media"),
    VIDEOFORGE_RENDER_DIR: unwritable("renders"),
    VIDEOFORGE_BOOTSTRAP_KEY: "vf_admin_deployment_spec_key",
    // configured-but-unreachable mongo: health must report it WITHOUT
    // attempting a connection (liveness stays independent of the integration)
    MONGODB_URI: "mongodb://127.0.0.1:1/",
  });

  const health = await j(PORT, "/api/health");
  if (health.body.ok !== true) throw new Error("writable DB must report ok:true");
  if (health.body.mongo !== "configured") throw new Error("configured mongo must be reported in health");
  if (health.body.warnings) throw new Error("no warnings expected in this scenario");

  const fd = new FormData();
  fd.append("file", new Blob(["x"]), "clip.mp4");
  const upload = await j(PORT, "/api/media/upload", {
    method: "POST",
    headers: { Authorization: "Bearer vf_admin_deployment_spec_key" },
    body: fd,
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
  killServer();
});

// ---------------------------------------------------------------------------
// 3. Optional MongoDB module (server/mongo.ts) — in-process.
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
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create();
    memory = mem;
    process.env.MONGODB_URI = mem.getUri();
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
  } catch (e: any) {
    if (/download|EACCES|ENOSPC|network/i.test(e.message ?? "")) {
      console.log(`SKIP: could not obtain the disposable MongoDB binary (${e.message})`);
    } else throw e;
  } finally {
    if (memory) await memory.stop().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// 4. The durable module itself: unwritable sync dir must not throw at import.
// ---------------------------------------------------------------------------
await test("unwritable sync dir: durable module loads, manifest save is a no-op", async () => {
  process.env.VIDEOFORGE_SYNC_DIR = unwritable("restore");
  const m = await import(`../server/durable.ts?bust=crash-${Date.now()}`);
  if (typeof m.saveManifest !== "function") throw new Error("module did not load");
  // previously: EACCES/ENOTDIR thrown at import time. Now: safe no-op.
  m.saveManifest({ mediaAssets: [], projects: [], renderJobs: [], apiKeyHashes: [], bootstrapKeyHash: null });
});

fs.rmSync(BLOCKER, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
