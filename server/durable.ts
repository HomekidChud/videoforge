/**
 * Durable persistence for the parts of VideoForge that make a rebuild safe.
 *
 * Everything in this file is optional and enabled by setting
 * `VIDEOFORGE_SYNC_*` to a writable directory on a persistent disk
 * (or an env var pointing at the same content as a single JSON string).
 * On Render: mount a persistent disk (e.g. /var/lib/videoforge/data),
 * set `VIDEOFORGE_DB=/var/lib/videoforge/data/data.db`,
 * `VIDEOFORGE_SYNC_DIR=/var/lib/videoforge/data/restore`,
 * and the sync cron set in Render writes there.
 *
 * What it saves:
 * - the SQLite database (data.db) is written directly by storage.ts
 * - media source files and render outputs live under `data/`
 * - a "save manifest" (save_manifest.json) records the exact set of media
 *   and project metadata needed to restore the DB row-for-row on a rebuild
 * - key existence and health for the bootstrap owner key
 *
 * What it never stores: the plaintext API key (only its SHA-256 hash, as the
 * DB does). Restore can only recreate a hash that already exists, so the
 * bootstrap owner key remains the single source of truth for key access.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SYNC_DIR = path.resolve(process.env.VIDEOFORGE_SYNC_DIR ?? "data/restore");
const MANIFEST = path.join(SYNC_DIR, "save_manifest.json");

// The manifest is an optional backup, it must never be able to stop the
// server from booting. If the sync directory cannot be created (e.g. the
// path is outside a mounted persistent disk and the sandbox user cannot
// write there, as happens on Render when the disk is missing or mounted
// elsewhere), log a clear warning and disable the backup instead of
// throwing at import time.
let syncDirOk = true;
try {
  fs.mkdirSync(SYNC_DIR, { recursive: true });
} catch (e: any) {
  syncDirOk = false;
  console.warn(
    `[durable] WARNING: cannot create the sync directory ${SYNC_DIR} (${e.code ?? e.message}). ` +
    "The save-manifest backup is disabled; the app will continue without it. " +
    "Check that VIDEOFORGE_SYNC_DIR points inside a mounted, writable persistent disk."
  );
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const now = () => Date.now();

export type SaveManifest = {
  version: 1;
  updatedAt: number;
  mediaAssets: { id: string; filename: string; kind: string; mime: string; duration: number; width: number; height: number; sizeBytes: number; hasAudio: number; createdAt: number }[];
  projects: { id: string; name: string; timelineJson: string; visibility: string; createdAt: number; updatedAt: number }[];
  renderJobs: { id: string; projectId: string; status: string; progress: number; outputPath: string | null; error: string | null; createdAt: number; updatedAt: number }[];
  apiKeyHashes: { id: string; label: string; scope: string; keyHash: string; restrictionsJson: string; lastUsedAt: number | null; revoked: number; createdAt: number }[];
  bootstrapKeyHash: string | null;
};

function loadManifest(): SaveManifest {
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as SaveManifest; }
  catch { return { version: 1, updatedAt: 0, mediaAssets: [], projects: [], renderJobs: [], apiKeyHashes: [], bootstrapKeyHash: null }; }
}

/** Write the manifest to disk. Never writes a value that includes a plaintext key. */
export function saveManifest(manifest: Omit<SaveManifest, "updatedAt" | "version">): void {
  if (!syncDirOk) return; // no writable sync directory, backup disabled, not fatal
  const full: SaveManifest = { ...manifest, version: 1, updatedAt: now() };
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(full, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, MANIFEST);
}

/**
 * Restore from the manifest. Reads every table, only writes what is missing.
 * Never overwrites newer rows, an existing project key is not clobbered if
 * it is newer than the manifest. Returns true if anything was restored.
 * SAFETY: this is NOT called on boot. A manifest is a point-in-time backup
 * snapshot, and merging it blindly on every boot would resurrect projects
 * the user just deleted or reactivate a key they just revoked. It is exposed
 * as an explicit, opt-in rebuild-recovery helper for `npm run durable:restore`.
 */
export function restoreFromManifest(db: { prepare: (sql: string) => { run: (...args: unknown[]) => void; get: (...args: unknown[]) => any; all: (...args: unknown[]) => any[] } }): { restored: boolean; counts: Record<string, number> } {
  const m = loadManifest();
  const counts: Record<string, number> = { mediaAssets: 0, projects: 0, renderJobs: 0, apiKeyHashes: 0 };
  if (m.version !== 1) return { restored: false, counts };
  const existingMedia = new Set(db.prepare("SELECT id FROM media_assets").all().map((r: any) => r.id));
  const existingProjects = new Set(db.prepare("SELECT id FROM projects").all().map((r: any) => r.id));
  const existingRenders = new Set(db.prepare("SELECT id FROM render_jobs").all().map((r: any) => r.id));
  const existingKeys = new Set(db.prepare("SELECT id FROM api_keys").all().map((r: any) => r.id));
  const insertMedia = db.prepare("INSERT OR IGNORE INTO media_assets (id, filename, kind, mime, duration, has_audio, width, height, size_bytes, storage_path, thumb_path, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const a of m.mediaAssets) if (!existingMedia.has(a.id)) { insertMedia.run(a.id, a.filename, a.kind, a.mime, a.duration, a.hasAudio, a.width, a.height, a.sizeBytes, path.join("data/media", a.id), null, a.createdAt); counts.mediaAssets++; }
  const insertProject = db.prepare("INSERT OR IGNORE INTO projects (id, name, timeline_json, created_at, updated_at) VALUES (?,?,?,?,?)");
  for (const p of m.projects) if (!existingProjects.has(p.id)) { insertProject.run(p.id, p.name, p.timelineJson, p.createdAt, p.updatedAt); counts.projects++; }
  const insertRender = db.prepare("INSERT OR IGNORE INTO render_jobs (id, project_id, status, progress, output_path, error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)");
  for (const j of m.renderJobs) if (!existingRenders.has(j.id)) { insertRender.run(j.id, j.projectId, j.status, j.progress, j.outputPath, j.error, j.createdAt, j.updatedAt); counts.renderJobs++; }
  const insertKey = db.prepare("INSERT OR IGNORE INTO api_keys (id, label, scope, key_hash, restrictions_json, last_used_at, revoked, created_at) VALUES (?,?,?,?,?,?,?,?)");
  for (const k of m.apiKeyHashes) if (!existingKeys.has(k.id)) { insertKey.run(k.id, k.label, k.scope, k.keyHash, k.restrictionsJson, k.lastUsedAt, k.revoked, k.createdAt); counts.apiKeyHashes++; }
  return { restored: Object.values(counts).some((n) => n > 0), counts };
}

/**
 * Build a manifest from the current DB. Call this on every save-trigger.
 * Note: `visibility` lives in the projects table; render `outPath` is preserved
 * verbatim so restoring produces the same URL. This is a point-in-time backup
 * snapshot, not a live mirror.
 */
export function manifestFromDb(db: { prepare: (sql: string) => { run: (...args: unknown[]) => void; get: (...args: unknown[]) => any; all: (...args: unknown[]) => any[] } }): Omit<SaveManifest, "updatedAt" | "version"> {
  const mediaAssets = (db.prepare("SELECT id, filename, kind, mime, duration, has_audio as hasAudio, width, height, size_bytes as sizeBytes, created_at as createdAt FROM media_assets").all() as any[]).map((r) => ({
    id: r.id, filename: r.filename, kind: r.kind, mime: r.mime, duration: r.duration, width: r.width, height: r.height, sizeBytes: r.sizeBytes, hasAudio: r.hasAudio, createdAt: r.createdAt,
  }));
  const projects = (db.prepare("SELECT id, name, timeline_json as timelineJson, visibility, created_at as createdAt, updated_at as updatedAt FROM projects").all() as any[]).map((r) => ({
    id: r.id, name: r.name, timelineJson: r.timelineJson, visibility: r.visibility ?? "private", createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
  const renderJobs = (db.prepare("SELECT id, project_id as projectId, status, progress, output_path as outputPath, error, created_at as createdAt, updated_at as updatedAt FROM render_jobs").all() as any[]).map((r) => ({
    id: r.id, projectId: r.projectId, status: r.status, progress: r.progress, outputPath: r.outputPath, error: r.error, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));
  const apiKeyHashes = (db.prepare("SELECT id, label, scope, key_hash as keyHash, restrictions_json as restrictionsJson, last_used_at as lastUsedAt, revoked, created_at as createdAt FROM api_keys").all() as any[]).map((r) => ({
    id: r.id, label: r.label, scope: r.scope, keyHash: r.keyHash, restrictionsJson: r.restrictionsJson, lastUsedAt: r.lastUsedAt, revoked: r.revoked, createdAt: r.createdAt,
  }));
  const bootstrap = process.env.VIDEOFORGE_BOOTSTRAP_KEY?.trim() ?? null;
  return { mediaAssets, projects, renderJobs, apiKeyHashes, bootstrapKeyHash: bootstrap ? sha256(bootstrap) : null };
}
