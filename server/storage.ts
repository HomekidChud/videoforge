import {
  mediaAssets,
  projects,
  renderJobs,
  type Asset,
  type Project,
  type RenderJob,
  type InsertMediaAsset,
  type InsertProject,
  type InsertRenderJob,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { manifestFromDb, restoreFromManifest, saveManifest } from "./durable";

const DATA_ROOT = path.dirname(path.resolve(process.env.VIDEOFORGE_DB || "data.db"));
// Preserve the original default media dir (data/media) so existing asset paths
// keep working; VIDEOFORGE_MEDIA_DIR / VIDEOFORGE_RENDER_DIR are only opt-in.
const DEFAULT_MEDIA_DIR = path.resolve("data/media");

// Non-fatal best-effort helper: a missing directory should produce clear
// per-request errors, never an import-time crash of the whole server.
function ensureDir(dir: string, label: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e: any) {
    console.warn(
      `[storage] WARNING: cannot create the ${label} directory ${dir} (${e.code ?? e.message}). ` +
      `Operations that write there will fail until this is fixed — check that the path ` +
      `points inside a mounted, writable persistent disk.`
    );
  }
}
ensureDir(DEFAULT_MEDIA_DIR, "media");
ensureDir(DATA_ROOT, "database");

let sqlite: ReturnType<typeof Database>;
const dbPath = process.env.VIDEOFORGE_DB || "data.db";
/** True when the configured DB path failed and a fallback is in use. */
export let storageDegraded = false;
try {
  sqlite = new Database(dbPath);
} catch (e: any) {
  // A configured-but-unopenable DB (e.g. the env points outside the mounted
  // Render disk) must not stop the server from booting. Fall back to a local
  // file with an unmissable warning: the service runs, but data is EPHEMERAL
  // until the path is fixed. Health reports the degraded state.
  const fallback = "data.db";
  console.warn(
    `[storage] WARNING: cannot open the configured database at ${dbPath} (${e.code ?? e.message}). ` +
    `FALLING BACK to ${path.resolve(fallback)} — DATA IS EPHEMERAL and will reset on redeploy. ` +
    `Point VIDEOFORGE_DB at a file inside a mounted, writable persistent disk ` +
    `(e.g. /var/lib/<disk>/data.db).`
  );
  try {
    sqlite = new Database(fallback);
  } catch {
    // Even the fallback is unwritable (read-only filesystem): run in memory
    // rather than crash. Data does not survive the process — same warning.
    console.warn(
      `[storage] WARNING: cannot open ${path.resolve(fallback)} either; running on an IN-MEMORY database. ` +
      `Nothing persists — fix VIDEOFORGE_DB before relying on this deployment.`
    );
    sqlite = new Database(":memory:");
  }
  storageDegraded = true;
}
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// ---- durability: write a save manifest to a persistent disk (backup only). ----
//
// This is a BACKUP, not a mirror. It is never merged back into the live DB on
// boot: a manifest is a point-in-time snapshot and merging it blindly could
// resurrect a project the user just deleted, or reactivate a key they revoked.
// It is written continuously (as the DB changes) so the snapshot stays fresh,
// and can be restored by hand via `npm run durable:restore` if a rebuild loses
// the DB. It never contains a plaintext key — only hashes, same as the DB.
if (process.env.VIDEOFORGE_SYNC_DIR) {
  const raw = sqlite;
  const lastSave: { [key: string]: string } = {};
  const touch = () => {
    try {
      const m = manifestFromDb(raw as never);
      const fingerprint = JSON.stringify(m);
      if (fingerprint === lastSave.f) return;
      lastSave.f = fingerprint;
      saveManifest(m);
    } catch { /* backup is best-effort, never fatal */ }
  };
  // Immediate snapshot, then every 5s. On a truly fresh DB the tables do not
  // exist yet at import time, so the first touch is a no-op; the interval
  // writes the first manifest as soon as any row exists.
  touch();
  setInterval(touch, 5000).unref?.();
}


// Ensure all tables exist (so a fresh clone works without `npm run db:push`).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    duration REAL NOT NULL DEFAULT 0,
    has_audio INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    thumb_path TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timeline_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS render_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    output_path TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

// Additive migrations preserve existing projects and keys on upgrade.
for (const [table, column, definition] of [
  ["projects", "visibility", "TEXT NOT NULL DEFAULT 'private'"],
  ["api_keys", "restrictions_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["api_keys", "last_used_at", "INTEGER"],
]) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some(c => c.name === column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export interface IStorage {
  // assets
  createAsset(a: InsertMediaAsset): Asset;
  getAsset(id: string): Asset | undefined;
  listAssets(): Asset[];
  deleteAsset(id: string): boolean;
  updateAssetThumb(id: string, thumbPath: string): Asset | undefined;
  // projects
  createProject(p: InsertProject): Project;
  getProject(id: string): Project | undefined;
  listProjects(): Project[];
  updateProject(id: string, patch: Partial<InsertProject>): Project | undefined;
  deleteProject(id: string): boolean;
  // render jobs
  createRenderJob(j: InsertRenderJob): RenderJob;
  getRenderJob(id: string): RenderJob | undefined;
  listRenderJobs(projectId?: string): RenderJob[];
  updateRenderJob(id: string, patch: Partial<InsertRenderJob>): RenderJob | undefined;
}

export class DatabaseStorage implements IStorage {
  createAsset(a: InsertMediaAsset): Asset {
    return db.insert(mediaAssets).values(a).returning().get();
  }
  getAsset(id: string): Asset | undefined {
    return db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  }
  listAssets(): Asset[] {
    return db.select().from(mediaAssets).all();
  }
  deleteAsset(id: string): boolean {
    return db.delete(mediaAssets).where(eq(mediaAssets.id, id)).run().changes > 0;
  }
  updateAssetThumb(id: string, thumbPath: string): Asset | undefined {
    return db.update(mediaAssets).set({ thumbPath }).where(eq(mediaAssets.id, id)).returning().get();
  }

  createProject(p: InsertProject): Project {
    return db.insert(projects).values(p).returning().get();
  }
  getProject(id: string): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }
  listProjects(): Project[] {
    return db.select().from(projects).all();
  }
  updateProject(id: string, patch: Partial<InsertProject>): Project | undefined {
    return db.update(projects).set(patch).where(eq(projects.id, id)).returning().get();
  }
  deleteProject(id: string): boolean {
    return db.delete(projects).where(eq(projects.id, id)).run().changes > 0;
  }

  createRenderJob(j: InsertRenderJob): RenderJob {
    return db.insert(renderJobs).values(j).returning().get();
  }
  getRenderJob(id: string): RenderJob | undefined {
    return db.select().from(renderJobs).where(eq(renderJobs.id, id)).get();
  }
  listRenderJobs(projectId?: string): RenderJob[] {
    if (projectId) {
      return db.select().from(renderJobs).where(eq(renderJobs.projectId, projectId)).all();
    }
    return db.select().from(renderJobs).all();
  }
  updateRenderJob(id: string, patch: Partial<InsertRenderJob>): RenderJob | undefined {
    return db.update(renderJobs).set(patch).where(eq(renderJobs.id, id)).returning().get();
  }
}

export const storage = new DatabaseStorage();
