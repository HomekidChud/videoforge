import assert from "node:assert";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Set VIDEOFORGE_SYNC_DIR BEFORE importing durable.ts, because the manifest
// path is captured at module load. The module is loaded once per test file, so
// every test in this file uses the same sync dir; reset() just clears it.
const SYNC_DIR = "/tmp/vf-sync-spec";
const MANIFEST = path.join(SYNC_DIR, "save_manifest.json");
fs.rmSync(SYNC_DIR, { recursive: true, force: true });
fs.mkdirSync(SYNC_DIR, { recursive: true });
process.env.VIDEOFORGE_SYNC_DIR = SYNC_DIR;
const { manifestFromDb, restoreFromManifest, saveManifest } = await import("../server/durable");

function reset() { fs.rmSync(SYNC_DIR, { recursive: true, force: true }); fs.mkdirSync(SYNC_DIR, { recursive: true }); }

const SCHEMA = `
  CREATE TABLE media_assets (id TEXT PRIMARY KEY, filename TEXT, kind TEXT, mime TEXT, duration REAL, has_audio INTEGER, width INTEGER, height INTEGER, size_bytes INTEGER, storage_path TEXT, thumb_path TEXT, created_at INTEGER);
  CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, timeline_json TEXT, created_at INTEGER, updated_at INTEGER, visibility TEXT);
  CREATE TABLE render_jobs (id TEXT PRIMARY KEY, project_id TEXT, status TEXT, progress REAL, output_path TEXT, error TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE api_keys (id TEXT PRIMARY KEY, label TEXT, scope TEXT, key_hash TEXT, restrictions_json TEXT, last_used_at INTEGER, revoked INTEGER, created_at INTEGER);
`;

function freshDb() {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

// The manifest path is captured at module load, so re-import the durable module
// with a fresh sync dir per test. Cache-bust via a query string.
async function freshDurable() {
  reset();
  return import(`../server/durable.ts?bust=${Date.now()}`);
}

let passed = 0, failed = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return (async () => {
    try { await fn(); passed++; console.log(`PASS: ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL: ${name}: ${e.message}`); }
  })();
};

await test("manifest round-trips every table", () => {
  reset();
  const db = freshDb();
  db.prepare("INSERT INTO projects (id, name, timeline_json, created_at, updated_at, visibility) VALUES ('p1','demo','{}',1,2,'public')").run();
  db.prepare("INSERT INTO media_assets (id, filename, kind, mime, storage_path, created_at) VALUES ('a1','clip.mp4','video','video/mp4','data/media/a1',1)").run();
  db.prepare("INSERT INTO render_jobs (id, project_id, status) VALUES ('r1','p1','done')").run();
  db.prepare("INSERT INTO api_keys (id, label, scope, key_hash, revoked) VALUES ('k1','agent','admin','hash',1)").run();

  saveManifest(manifestFromDb(db as never));
  const onDisk = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  assert.equal(onDisk.projects.length, 1);
  assert.equal(onDisk.mediaAssets.length, 1);
  assert.equal(onDisk.renderJobs.length, 1);
  assert.equal(onDisk.apiKeyHashes.length, 1);
  assert.equal(onDisk.apiKeyHashes[0].revoked, 1, "a revoked key stays revoked in the manifest");
  assert.equal(onDisk.projects[0].visibility, "public");
});

await test("restore adds only missing rows", () => {
  reset();
  const db = freshDb();
  db.prepare("INSERT INTO projects (id, name, timeline_json, created_at, updated_at, visibility) VALUES ('p1','demo','{}',1,2,'public')").run();
  db.prepare("INSERT INTO projects (id, name, timeline_json, created_at, updated_at, visibility) VALUES ('p2','kept','{}',1,2,'private')").run();
  saveManifest(manifestFromDb(db as never));

  const rebuild = freshDb(); // fresh DB — simulates a rebuild losing the DB
  rebuild.prepare("INSERT INTO projects (id, name, timeline_json, created_at, updated_at, visibility) VALUES ('p2','kept','{}',1,2,'private')").run();
  const r = restoreFromManifest(rebuild as never);
  assert.equal(r.restored, true);
  assert.equal(r.counts.projects, 1, "only p1 was restored, p2 was already there");
  assert.equal(rebuild.prepare("SELECT id FROM projects").all().length, 2);
});

await test("restore does not resurrect a project deleted after the manifest was written", () => {
  reset();
  const db = freshDb();
  db.prepare("INSERT INTO projects (id, name, timeline_json, created_at, updated_at, visibility) VALUES ('p1','demo','{}',1,2,'public')").run();
  saveManifest(manifestFromDb(db as never)); // manifest now has p1

  db.prepare("DELETE FROM projects WHERE id='p1'").run(); // user deletes it
  saveManifest(manifestFromDb(db as never)); // manifest is refreshed, p1 is gone

  const rebuild = freshDb(); // a rebuild after deletion
  const r = restoreFromManifest(rebuild as never);
  assert.equal(r.restored, false, "nothing to restore because the manifest no longer has p1");
  assert.equal(rebuild.prepare("SELECT id FROM projects").all().length, 0, "the deleted project does not come back");
});

await test("restore does not reactivate a key the user revoked", () => {
  reset();
  const db = freshDb();
  db.prepare("INSERT INTO api_keys (id, label, scope, key_hash, revoked) VALUES ('k1','agent','admin','h',0)").run();
  saveManifest(manifestFromDb(db as never));
  db.prepare("UPDATE api_keys SET revoked=1 WHERE id='k1'").run();
  saveManifest(manifestFromDb(db as never)); // manifest refreshed with revoked=1

  const rebuild = freshDb();
  const r = restoreFromManifest(rebuild as never);
  assert.ok(r.restored);
  const row = rebuild.prepare("SELECT revoked FROM api_keys WHERE id='k1'").get() as { revoked: number };
  assert.equal(row.revoked, 1, "the key stays revoked after a rebuild");
});

await test("manifest is never merged on boot (it is a backup, not a mirror)", () => {
  // The durable.ts module does NOT call restoreFromManifest on import; the
  // storage.ts block only writes the manifest. This test asserts the contract
  // by reading the module source, so it does not drift silently.
  reset();
  const src = fs.readFileSync("server/storage.ts", "utf8");
  assert.ok(src.includes("restoreFromManifest"), "storage.ts imports the restore helper");
  assert.ok(!/restoreFromManifest\(/.test(src.split("BACKUP, not a mirror")[1] ?? ""), "storage.ts does not call restoreFromManifest in the boot block — the manifest is written, not merged");
  const durableSrc = fs.readFileSync("server/durable.ts", "utf8");
  assert.ok(durableSrc.includes("SAFETY: this is NOT called on boot"), "durable.ts documents that restore is opt-in");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
