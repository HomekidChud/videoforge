import {
  mediaAssets,
  projects,
  renderJobs,
  apiKeys,
  keyUsage,
  type Asset,
  type Project,
  type RenderJob,
  type InsertMediaAsset,
  type InsertProject,
  type InsertRenderJob,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { mkdirSync } from "node:fs";

mkdirSync("data/media", { recursive: true });

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Migrations (idempotent — add columns if missing on existing deployments)
// ---------------------------------------------------------------------------

function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes(column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrate() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS media_assets (
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
  ); CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    timeline_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS render_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    output_path TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS key_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );`);

  addColumnIfMissing("api_keys", "kind", "TEXT NOT NULL DEFAULT 'private'");
  // permissions defaults to NULL so the migration below can distinguish
  // "legacy key, never had explicit permissions" (NULL) from "key that was
  // explicitly set to no permissions" ('[]'). A NULL value is a one-time
  // migration trigger; afterwards it is always set to a concrete array.
  addColumnIfMissing("api_keys", "permissions", "TEXT");
  addColumnIfMissing("api_keys", "expires_at", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("api_keys", "allowed_origins", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing("api_keys", "allowed_ips", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing("api_keys", "rate_limit_per_hour", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("api_keys", "quota_total", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("api_keys", "requests_used", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("api_keys", "last_used_at", "INTEGER NOT NULL DEFAULT 0");

  // ONE-TIME migration: legacy keys (permissions IS NULL) get permissions
  // derived from their legacy scope. After this runs, every row has a concrete
  // permissions array, so an explicit '[]' (locked out) is never overwritten.
  sqlite.exec(`UPDATE api_keys SET permissions = CASE scope
    WHEN 'admin' THEN '[\"media:read\",\"media:upload\",\"media:delete\",\"projects:read\",\"projects:write\",\"timeline:edit\",\"renders:create\",\"renders:download\",\"keys:manage\"]'
    WHEN 'write'  THEN '[\"media:read\",\"media:upload\",\"media:delete\",\"projects:read\",\"projects:write\",\"timeline:edit\",\"renders:create\",\"renders:download\"]'
    ELSE '[\"media:read\",\"projects:read\",\"renders:download\"]'
  END WHERE permissions IS NULL`);
}
migrate();

export const db = drizzle(sqlite);

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

// ---------------------------------------------------------------------------
// Key usage logging + stats
// ---------------------------------------------------------------------------

/**
 * Log a usage event for a key. Returns the inserted row ID so the
 * response-finish hook can update ONLY that row's status code (prevents
 * concurrent requests sharing a key/method/path from having their statuses
 * corrupted together).
 */
export function logKeyUsage(keyId: string, method: string, path: string, status: number): number {
  const r = db.insert(keyUsage).values({ keyId, method, path: path.split("?")[0], status, createdAt: Date.now() }).returning({ id: keyUsage.id }).get();
  return r.id;
}

/** Update a specific usage row's status code (called from the finish hook). */
export function updateKeyUsageStatus(rowId: number, status: number) {
  db.update(keyUsage).set({ status }).where(eq(keyUsage.id, rowId)).run();
}

export function keyUsageStats(keyId: string) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = db.select({ count: sql<number>`count(*)` })
    .from(keyUsage)
    .where(and(eq(keyUsage.keyId, keyId), gte(keyUsage.createdAt, hourAgo)))
    .get();
  const total = db.select({ count: sql<number>`count(*)` })
    .from(keyUsage)
    .where(eq(keyUsage.keyId, keyId))
    .get();
  const lastUsed = db.select({ last: sql<number>`max(created_at)` })
    .from(keyUsage)
    .where(eq(keyUsage.keyId, keyId))
    .get();
  return {
    requestsLastHour: lastHour?.count ?? 0,
    requestsTotal: total?.count ?? 0,
    lastUsedAt: lastUsed?.last ?? 0,
  };
}

export function keyUsageRecent(keyId: string, limit = 100) {
  return db.select().from(keyUsage)
    .where(eq(keyUsage.keyId, keyId))
    .orderBy(desc(keyUsage.createdAt))
    .limit(limit)
    .all();
}

export function usageOverview() {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = db.select({ count: sql<number>`count(*)` }).from(keyUsage)
    .where(gte(keyUsage.createdAt, hourAgo)).get();
  const total = db.select({ count: sql<number>`count(*)` }).from(keyUsage).get();
  const byKey = db.select({
    keyId: keyUsage.keyId,
    count: sql<number>`count(*)`,
  }).from(keyUsage).groupBy(keyUsage.keyId).all();
  const recent = db.select().from(keyUsage)
    .orderBy(desc(keyUsage.createdAt))
    .limit(200).all();
  return {
    requestsLastHour: lastHour?.count ?? 0,
    requestsTotal: total?.count ?? 0,
    byKey,
    recent,
  };
}

export function trimKeyUsage() {
  // keep last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.delete(keyUsage).where(sql`${keyUsage.createdAt} < ${cutoff}`).run();
}
