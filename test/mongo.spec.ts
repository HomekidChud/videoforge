import assert from "node:assert";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Optional MongoDB configuration (server/mongo.ts).
//
// The module is env-driven and captures MONGODB_URI at module load, so each
// scenario re-imports it with a cache-busting query string.
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return (async () => {
    try { await fn(); passed++; console.log(`PASS: ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL: ${name}: ${e.message}`); }
  })();
};

const importMongo = () => {
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  return import(`../server/mongo.ts?bust=${Date.now()}-${Math.random()}`);
};

await test("no MONGODB_URI: not configured, nothing connects", async () => {
  const m = await importMongo();
  assert.equal(m.mongoConfigured(), false);
  assert.deepEqual(await m.mongoHealth(), { status: "notConfigured" });
  // getMongoDb must throw (never silently fall back to another store)
  await assert.rejects(() => m.getMongoDb(), /not configured/i);
  await m.closeMongo(); // no-op, must not throw
});

await test("bad MONGODB_URI: health reports error, never throws, no hang", async () => {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:1/"; // closed port → fast refusal
  const m = await import(`../server/mongo.ts?bust=bad-${Date.now()}`);
  assert.equal(m.mongoConfigured(), true);
  const started = Date.now();
  const h = await m.mongoHealth();
  assert.equal(h.status, "error");
  assert.ok(Date.now() - started < 15_000, "bounded timeouts, no hang");
  await m.closeMongo();
});

await test("credentials are redacted in health errors", async () => {
  process.env.MONGODB_URI = "mongodb://secretuser:secretpass@127.0.0.1:1/";
  const m = await import(`../server/mongo.ts?bust=redact-${Date.now()}`);
  const h = await m.mongoHealth();
  assert.equal(h.status, "error");
  assert.ok(!JSON.stringify(h).includes("secretpass"), "password must not appear");
  await m.closeMongo();
});

// ---------------------------------------------------------------------------
// Crash-safe durable paths: an unwritable VIDEOFORGE_SYNC_DIR must not throw
// at import time (the Render EACCES regression).
// ---------------------------------------------------------------------------
await test("unwritable sync dir: module loads with a warning, backup disabled", async () => {
  const bad = "/var/lib/videoforge-definitely-unwritable/restore";
  // If the sandbox happens to be root, force a guaranteed failure with a
  // path whose parent is a *file* — mkdir -p on a file parent always fails.
  const fileParent = "/tmp/vf-not-a-dir";
  fs.rmSync(fileParent, { recursive: true, force: true });
  fs.writeFileSync(fileParent, "not a directory");
  process.env.VIDEOFORGE_SYNC_DIR = `${fileParent}/restore`;
  const m = await import(`../server/durable.ts?bust=crash-${Date.now()}`);
  // Importing at all is the regression test: previously this threw EACCES/ENOTDIR.
  assert.equal(typeof m.saveManifest, "function");
  // saveManifest is a safe no-op rather than a crash
  m.saveManifest({
    mediaAssets: [], projects: [], renderJobs: [], apiKeyHashes: [],
    bootstrapKeyHash: null,
  });
  fs.rmSync(fileParent, { force: true });
});

// The full Render failure mode: BOTH the DB path and the sync dir point at an
// unwritable location. The server module graph must still load (previously
// this was the EACCES crash at startup) and serve reads/writes on a fallback.
await test("unwritable DB + sync dir: server still boots on a fallback database", async () => {
  const fileParent = "/tmp/vf-not-a-dir-db";
  fs.rmSync(fileParent, { recursive: true, force: true });
  fs.writeFileSync(fileParent, "not a directory");
  process.env.VIDEOFORGE_DB = `${fileParent}/data.db`;
  process.env.VIDEOFORGE_SYNC_DIR = `${fileParent}/restore`;
  // The fallback DB is cwd-relative, so run from /tmp to keep the repo clean.
  const cwd = process.cwd();
  process.chdir("/tmp");
  try {
    const storage = await import(`../server/storage.ts?bust=db-${Date.now()}`);
    assert.equal(storage.storageDegraded, true, "degraded state is visible to /api/health");
    const before = storage.storage.listProjects().length;
    const p = storage.storage.createProject({ id: `t${Date.now()}`, name: "fallback", timelineJson: "{}", createdAt: Date.now(), updatedAt: Date.now() });
    assert.ok(p, "writes work against the fallback database");
    assert.equal(storage.storage.listProjects().length, before + 1);
  } finally {
    process.chdir(cwd);
    fs.rmSync(fileParent, { force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
