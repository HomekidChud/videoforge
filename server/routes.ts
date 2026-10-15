import type { Express } from "express";
import type { Server } from "node:http";
import { storage, storageDegraded } from "./storage";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import Busboy from "busboy";
import type { Asset } from "@shared/schema";
import { normalizeTimeline, clipEnd, timelineDuration, type Timeline } from "@shared/timeline";
import { applyTimelineOp } from "@shared/editing";
import { animatedValues } from "@shared/animation";
import { capabilities } from "@shared/capabilities";
import { GRAPHICS_SCHEMA, MOTION_TEMPLATES } from "@shared/graphics";
import { buildRenderPlan, runFfmpeg } from "./render";
import { requireScope, requireMediaAccess, projectAllowed, assetAllowed, keyRestrictions } from "./auth";
import { actorOf, syncTimeline, logEvent, renameLive, dropLive, registerLiveRoutes } from "./live";
import { mongoHealth } from "./mongo";

const MEDIA_DIR = path.resolve(process.env.VIDEOFORGE_MEDIA_DIR || "data/media");
const OUTPUT_DIR = path.resolve(process.env.VIDEOFORGE_RENDER_DIR || "data/renders");

// Best-effort: an unwritable directory must not crash the server at import
// time (the same failure mode as an unmounted Render disk). Requests that
// need these directories fail with a clear per-request error instead.
function ensureDir(dir: string, label: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e: any) {
    console.warn(
      `[routes] WARNING: cannot create the ${label} directory ${dir} (${e.code ?? e.message}). ` +
      `Uploads and renders will fail until it points inside a mounted, writable disk.`
    );
  }
}
ensureDir(MEDIA_DIR, "media");
ensureDir(OUTPUT_DIR, "renders");

const MAX_UPLOAD_BYTES = Number(process.env.VIDEOFORGE_MAX_UPLOAD_MB || 2048) * 1048576;
const now = () => Date.now();
const uid = () => crypto.randomBytes(6).toString("hex");

function kindFromMime(mime: string, filename: string): "video" | "audio" | "image" {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".mkv", ".avi"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  return "video";
}

async function probe(filepath: string) {
  const ffprobe = (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      const p = spawn("ffprobe", args);
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(`ffprobe exit ${c}`))));
      p.on("error", reject);
    });
  const dur = parseFloat(
    await ffprobe([
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filepath,
    ]),
  );
  let w = 0, h = 0;
  try {
    const dims = await ffprobe([
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      filepath,
    ]);
    const m = dims.match(/(\d+),(\d+)/);
    if (m) { w = parseInt(m[1]); h = parseInt(m[2]); }
  } catch { /* no video stream */ }
  let hasAudio = false;
  try {
    const a = await ffprobe([
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      filepath,
    ]);
    hasAudio = a.trim().length > 0;
  } catch { /* no audio */ }
  return { duration: isFinite(dur) ? dur : 0, width: w, height: h, hasAudio };
}

function assetToJSON(a: Asset) {
  return {
    id: a.id,
    filename: a.filename,
    kind: a.kind,
    mime: a.mime,
    duration: a.duration,
    width: a.width,
    height: a.height,
    sizeBytes: a.sizeBytes,
    uploadUrl: `/api/media/${a.id}/raw`,
    thumbnailUrl: `/api/media/${a.id}/thumb`,
    createdAt: a.createdAt,
  };
}

function parseTimeline(json: string): Timeline {
  return normalizeTimeline(JSON.parse(json));
}

// ---------------------------------------------------------------
// Render worker (ffmpeg)
// ---------------------------------------------------------------

const TMP_DIR = path.resolve("data/tmp");
ensureDir(TMP_DIR, "tmp");

const SYSTEM = { id: "system", label: "VideoForge", scope: "admin" };
async function runRender(jobId: string, projectId: string) {
  const project = storage.getProject(projectId);
  if (!project) {
    storage.updateRenderJob(jobId, { status: "error", error: "project not found", updatedAt: now() });
    return;
  }
  let tempFiles: string[] = [];
  try {
    storage.updateRenderJob(jobId, { status: "rendering", updatedAt: now() });
    const assets = new Map(storage.listAssets().map((a) => [a.id, a]));
    const outPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    const plan = buildRenderPlan(parseTimeline(project.timelineJson), assets, MEDIA_DIR, TMP_DIR, jobId, outPath);
    tempFiles = plan.tempFiles;
    console.log(`[render ${jobId}] filter graph:\n${plan.filter.slice(0, 4000)}`);
    let lastWrite = 0;
    const { code, stderrTail } = await runFfmpeg(plan.args, plan.total, (pct) => {
      if (Date.now() - lastWrite < 400) return;
      lastWrite = Date.now();
      storage.updateRenderJob(jobId, { progress: pct, updatedAt: now() });
    });
    if (code !== 0) {
      console.error(`[render ${jobId}] ffmpeg exit ${code}\n${stderrTail}`);
      const reason = stderrTail.split("\n").filter((l) => l.trim()).slice(-2).join(" ").slice(0, 300);
      storage.updateRenderJob(jobId, { status: "error", error: `ffmpeg failed (exit ${code}): ${reason}`, updatedAt: now() });
      logEvent(projectId, SYSTEM, "render", "Export failed");
      return;
    }
    storage.updateRenderJob(jobId, { status: "done", progress: 1, outputPath: `/api/renders/${jobId}/download`, updatedAt: now() });
    logEvent(projectId, SYSTEM, "render", "Export finished");
  } catch (e: any) {
    storage.updateRenderJob(jobId, { status: "error", error: String(e?.message || e), updatedAt: now() });
  } finally {
    for (const f of tempFiles) fs.promises.unlink(f).catch(() => {});
  }
}

// ---------------------------------------------------------------
// Routes
// ---------------------------------------------------------------

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ---------- health ----------
  // mongo is optional: only reported when MONGODB_URI is configured, and a
  // mongo outage never marks the whole API unhealthy (SQLite is the datastore).
  app.get("/api/health", async (_req, res) => {
    const mongo = await mongoHealth();
    const warnings: string[] = [];
    if (storageDegraded) warnings.push("configured database path is not writable; a fallback database is in use and data is ephemeral");
    res.json({
      ok: true,
      service: "videoforge-api",
      version: 1,
      ...(mongo.status === "notConfigured" ? {} : { mongo }),
      ...(warnings.length ? { warnings } : {}),
    });
  });

  // Public sharing is read-only and opt-in. Never expose source assets or keys.
  app.get("/api/public/projects/:id", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const p = storage.getProject(String(req.params.id));
    if (!p || p.visibility !== "public") return res.status(404).json({ message: "This project is private or unavailable." });
    const job = storage.listRenderJobs(p.id).filter(j => j.status === "done").sort((a,b) => b.createdAt - a.createdAt)[0];
    res.json({ id: p.id, name: p.name, updatedAt: p.updatedAt, renderUrl: job ? `/api/public/projects/${p.id}/renders/${job.id}` : null });
  });
  app.get("/api/public/projects/:id/renders/:jobId", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const p = storage.getProject(String(req.params.id));
    const job = storage.getRenderJob(String(req.params.jobId));
    if (!p || p.visibility !== "public" || !job || job.projectId !== p.id || job.status !== "done") return res.status(404).json({ message: "Render unavailable." });
    const file = path.join(OUTPUT_DIR, `${job.id}.mp4`);
    if (!fs.existsSync(file)) return res.status(404).json({ message: "Rendered file missing." });
    res.sendFile(file);
  });

  // ---------- media upload (multipart) ----------
  app.post("/api/media/upload", requireScope("write"), (req, res) => {
    if (!req.headers["content-type"]?.includes("multipart/form-data")) {
      return res.status(400).json({ message: "multipart/form-data required" });
    }
    const busboy = Busboy({ headers: req.headers as any, limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 } });
    type Pending = { id: string; dest: string; filename: string; mime: string; done: Promise<boolean> };
    const pending: Pending[] = [];
    let failed: string | null = null;
    busboy.on("file", (_name: string, stream: any, info: any) => {
      // Stream straight to disk — never buffer whole videos in memory.
      const id = uid();
      const dest = path.join(MEDIA_DIR, id);
      const out = fs.createWriteStream(dest);
      let truncated = false;
      stream.on("limit", () => { truncated = true; failed = `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB upload limit.`; });
      stream.pipe(out);
      const done = new Promise<boolean>((resolve) => {
        out.on("finish", () => resolve(!truncated));
        out.on("error", () => { failed = "Could not store the uploaded file."; resolve(false); });
      });
      pending.push({ id, dest, filename: path.basename(String(info.filename || "upload")), mime: info.mimeType, done });
    });
    busboy.on("error", () => { failed = "Malformed upload."; });
    req.pipe(busboy);
    busboy.on("finish", async () => {
      const results: any[] = [];
      const oks = await Promise.all(pending.map((p) => p.done));
      if (failed || oks.some((ok) => !ok)) {
        for (const p of pending) fs.promises.unlink(p.dest).catch(() => {});
        return res.status(failed?.includes("exceeds") ? 413 : 400).json({ message: failed || "Upload failed." });
      }
      for (const f of pending) {
        const kind = kindFromMime(f.mime, f.filename);
        let duration = 0, width = 0, height = 0, hasAudio = 0;
        try {
          const p = await probe(f.dest);
          duration = kind === "image" ? 0 : p.duration; width = p.width; height = p.height; hasAudio = p.hasAudio ? 1 : 0;
        } catch (e) { console.warn("probe failed:", e); }
        const stat = await fsp.stat(f.dest);
        const asset = storage.createAsset({
          id: f.id, filename: f.filename, kind, mime: f.mime || "application/octet-stream",
          duration, width, height, hasAudio, sizeBytes: stat.size, storagePath: f.dest, thumbPath: null, createdAt: now(),
        });
        results.push(assetToJSON(asset));
      }
      res.status(201).json({ assets: results });
    });
  });

  // ---------- media list / detail ----------
  app.get("/api/media", requireScope("read"), (req, res) => {
    res.json({ assets: storage.listAssets().filter(a => assetAllowed((req as any).apiKey, a.id)).map(assetToJSON) });
  });

  app.get("/api/media/:id", requireScope("read"), (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    res.json(assetToJSON(a));
  });

  app.delete("/api/media/:id", requireScope("write"), (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    try { fs.unlinkSync(a.storagePath); } catch { /* ignore */ }
    storage.deleteAsset(String(req.params.id));
    res.json({ deleted: true });
  });

  // raw binary streaming — accepts either a Bearer key or a signed ?st= token
  app.get("/api/media/:id/raw", requireMediaAccess("asset"), (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    const stat = fs.statSync(a.storagePath);
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(a.storagePath).pipe(res);
  });

  // thumbnail (frame at 1s, or full image) — accepts Bearer key or signed ?st=
  app.get("/api/media/:id/thumb", requireMediaAccess("asset"), async (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    const thumb = path.join(MEDIA_DIR, `${a.id}_thumb.jpg`);
    if (!fs.existsSync(thumb)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const p = spawn("ffmpeg", [
            "-y",
            ...(a.kind === "image" ? [] : ["-ss", String(Math.min(1, (a.duration || 0) / 2))]),
            "-i", a.storagePath,
            "-vframes", "1",
            "-vf", "scale=320:-2",
            thumb,
          ]);
          p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}`))));
          p.on("error", reject);
        });
        storage.updateAssetThumb(a.id, thumb);
      } catch (e) {
        console.warn("thumb gen failed", e);
        return res.status(404).json({ message: "thumbnail unavailable" });
      }
    }
    res.setHeader("Content-Type", "image/jpeg");
    fs.createReadStream(thumb).pipe(res);
  });

  // Peak envelope for drawing audio waveforms in the timeline (cached on disk).
  app.get("/api/media/:id/waveform", requireMediaAccess("asset"), async (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    if (!a.hasAudio) return res.json({ peaks: [] });
    const cache = path.join(MEDIA_DIR, `${a.id}_wave.json`);
    if (fs.existsSync(cache)) return res.type("json").send(fs.readFileSync(cache));
    try {
      const pcm = await new Promise<Buffer>((resolve, reject) => {
        const p = spawn("ffmpeg", ["-v", "error", "-i", a.storagePath, "-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "-"]);
        const chunks: Buffer[] = [];
        p.stdout.on("data", (c: Buffer) => chunks.push(c));
        p.on("close", (c) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`exit ${c}`))));
        p.on("error", reject);
      });
      const samples = Math.floor(pcm.length / 2);
      const perSecond = 20; // 20 peaks per second keeps the payload small
      const bucket = Math.max(1, Math.floor(2000 / perSecond));
      const peaks: number[] = [];
      for (let i = 0; i < samples; i += bucket) {
        let m = 0;
        for (let j = i; j < Math.min(samples, i + bucket); j++) m = Math.max(m, Math.abs(pcm.readInt16LE(j * 2)));
        peaks.push(Math.round((m / 32768) * 100) / 100);
      }
      const body = JSON.stringify({ perSecond, peaks });
      fs.writeFileSync(cache, body);
      res.type("json").send(body);
    } catch {
      res.status(404).json({ message: "waveform unavailable" });
    }
  });

  // ---------- projects ----------
  app.get("/api/projects", requireScope("read"), (req, res) => {
    res.json({
      projects: storage.listProjects().filter(p => projectAllowed((req as any).apiKey, p.id)).map((p) => ({
        id: p.id,
        name: p.name,
        visibility: p.visibility,
        timeline: parseTimeline(p.timelineJson),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  });

  app.get("/api/projects/:id", requireScope("read"), (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p) return res.status(404).json({ message: "project not found" });
    res.json({
      id: p.id,
      name: p.name,
      visibility: p.visibility,
      timeline: parseTimeline(p.timelineJson),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  });

  app.post("/api/projects", requireScope("write"), (req, res) => {
    try {
      const { name, timeline } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "name (string) required" });
      }
      if (!timeline || !Array.isArray(timeline.clips)) {
        return res.status(400).json({ message: "timeline with clips[] required" });
      }
      const id = uid();
      const t: Timeline = normalizeTimeline(timeline);
      const p = storage.createProject({
        id,
        name: name.slice(0, 200),
        timelineJson: JSON.stringify(t),
        createdAt: now(),
        updatedAt: now(),
      });
      res.status(201).json({
        id: p.id,
        name: p.name,
        visibility: p.visibility,
        timeline: t,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message || "bad request" });
    }
  });

  app.put("/api/projects/:id", requireScope("write"), (req, res) => {
    try {
      const p = storage.getProject(String(req.params.id));
      if (!p) return res.status(404).json({ message: "project not found" });
      const { name, timeline } = req.body || {};
      const patch: any = { updatedAt: now() };
      if (req.body.visibility !== undefined) {
        if ((req as any).apiKey.scope !== "admin") return res.status(403).json({ message: "Only an admin can change project visibility." });
        if (!["private", "public"].includes(req.body.visibility)) return res.status(400).json({ message: "Visibility must be private or public." });
        patch.visibility = req.body.visibility;
      }
      if (typeof name === "string") patch.name = name.slice(0, 200);
      if (timeline) {
        if (!Array.isArray(timeline.clips)) {
          return res.status(400).json({ message: "timeline.clips must be an array" });
        }
        const t: Timeline = normalizeTimeline(timeline);
        patch.timelineJson = JSON.stringify(t);
      }
      const updated = storage.updateProject(String(req.params.id), patch);
      if (updated) { if (patch.name) renameLive(updated.id, patch.name); if (patch.timelineJson) syncTimeline(updated.id, actorOf(req), parseTimeline(patch.timelineJson), "save"); }
      res.json({
        id: updated!.id,
        name: updated!.name,
        visibility: updated!.visibility,
        timeline: parseTimeline(updated!.timelineJson),
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message || "bad request" });
    }
  });

  app.delete("/api/projects/:id", requireScope("write"), (req, res) => {
    const ok = storage.deleteProject(String(req.params.id)); if (ok) dropLive(String(req.params.id));
    if (!ok) return res.status(404).json({ message: "project not found" });
    res.json({ deleted: true });
  });

  // ---------- timeline edit (agents) ----------
  // Atomic ops: send one { op, args } or { ops: [...] } to apply a batch all-or-nothing.
  app.post("/api/projects/:id/timeline/ops", requireScope("write"), (req, res) => {
    const id = String(req.params.id);
    const p = storage.getProject(id);
    if (!p) return res.status(404).json({ message: "project not found" });
    if (req.body?.expectedUpdatedAt !== undefined && req.body.expectedUpdatedAt !== p.updatedAt) return res.status(409).json({ message: "Project changed. Fetch its latest state before retrying.", code: "REVISION_CONFLICT", updatedAt: p.updatedAt });
    const list = Array.isArray(req.body?.ops) ? req.body.ops : req.body?.op ? [{ op: req.body.op, args: req.body.args }] : [];
    if (!list.length) return res.status(400).json({ message: "op or ops required" });
    if (list.length > 100) return res.status(400).json({ message: "at most 100 ops per request" });
    let timeline = parseTimeline(p.timelineJson);
    const oldIds = new Set(timeline.clips.map(c => c.id));
    for (let i = 0; i < list.length; i++) {
      try {
        timeline = applyTimelineOp(timeline, list[i], (assetId) => storage.getAsset(assetId));
      } catch (e: any) {
        return res.status(422).json({ message: `${list.length > 1 ? `op ${i + 1} (${list[i]?.op}): ` : ""}${e.message || "op failed"}`, failedIndex: i });
      }
    }
    const createdClipIds = timeline.clips.filter(c => !oldIds.has(c.id)).map(c => c.id);
    if (req.body?.dryRun === true) {
      // Additive change summary (compared against the stored timeline as it was on entry).
      const prev = parseTimeline(p.timelineJson);
      const prevById = new Map(prev.clips.map(c => [c.id, c]));
      const added = timeline.clips.filter(c => !prevById.has(c.id)).map(c => c.id);
      const removed = Array.from(oldIds).filter(id => !timeline.clips.some(c => c.id === id));
      const changed: string[] = [];
      for (const c of timeline.clips) {
        const old = prevById.get(c.id);
        if (old && JSON.stringify(old) !== JSON.stringify(c)) changed.push(c.id);
      }
      const timelineDiff = {
        fps: prev.fps !== timeline.fps ? { from: prev.fps, to: timeline.fps } : undefined,
        background: prev.background !== timeline.background ? { from: prev.background, to: timeline.background } : undefined,
        resolution: JSON.stringify(prev.resolution) !== JSON.stringify(timeline.resolution) ? { from: prev.resolution, to: timeline.resolution } : undefined,
        tracks: JSON.stringify(prev.tracks ?? {}) !== JSON.stringify(timeline.tracks ?? {}) ? { from: prev.tracks, to: timeline.tracks } : undefined,
        markers: JSON.stringify(prev.markers ?? []) !== JSON.stringify(timeline.markers ?? []) ? { from: prev.markers, to: timeline.markers } : undefined,
      };
      const summary = { addedClipIds: added, changedClipIds: changed, removedClipIds: removed, timelineDiff };
      return res.json({ id, timeline, applied: list.length, dryRun: true, createdClipIds, summary, updatedAt: p.updatedAt });
    }
    const updated = storage.updateProject(id, { timelineJson: JSON.stringify(timeline), updatedAt: Math.max(now(), p.updatedAt + 1) })!;
    syncTimeline(id, actorOf(req), timeline, "api", `API ${list.length > 1 ? `batch of ${list.length} ops` : "op"}: ${Array.from(new Set(list.map((o: any) => o?.op))).slice(0, 6).join(", ")}`);
    res.json({ id: updated.id, name: updated.name, visibility: updated.visibility, timeline, applied: list.length, createdClipIds, createdAt: updated.createdAt, updatedAt: updated.updatedAt });
  });

  app.get("/api/graphics/schema", requireScope("read"), (_req, res) => res.json(GRAPHICS_SCHEMA));
  app.get("/api/motion/templates", requireScope("read"), (_req, res) => res.json({ templates: MOTION_TEMPLATES }));
  app.post("/api/projects/:id/timeline/validate", requireScope("read"), (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p || !projectAllowed((req as any).apiKey, p.id)) return res.status(404).json({ message: "project not found" });
    try {
      const timeline = normalizeTimeline(req.body?.timeline);
      const missing = timeline.clips.filter(c => c.assetId && !storage.getAsset(c.assetId)).map(c => c.assetId);
      if (missing.length) return res.status(422).json({ valid: false, message: "Missing media assets", missingAssetIds: Array.from(new Set(missing)) });
      return res.json({ valid: true, timeline, duration: timelineDuration(timeline), clipCount: timeline.clips.length });
    } catch (e: any) { return res.status(422).json({ valid: false, message: e.message }); }
  });

  // Evaluate every animated value at a time, so an agent can verify keyframes without rendering.
  app.get("/api/projects/:id/state", requireScope("read"), (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p || !projectAllowed((req as any).apiKey, p.id)) return res.status(404).json({ message: "project not found" });
    const timeline = parseTimeline(p.timelineJson), t = Math.max(0, Number(req.query.t ?? 0) || 0);
    res.json({ time: t, duration: timelineDuration(timeline), clips: timeline.clips.filter((c) => t >= c.start && t < clipEnd(c)).map((c) => ({ id: c.id, track: c.track, local: Math.round((t - c.start) * 1000) / 1000, values: animatedValues(c, t) })) });
  });

  // Render one finished frame as PNG: the fastest visual feedback loop for an agent.
  app.get("/api/projects/:id/frame", requireScope("read"), async (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p || !projectAllowed((req as any).apiKey, p.id)) return res.status(404).json({ message: "project not found" });
    const out = path.join(TMP_DIR, `frame_${uid()}.png`); let temp: string[] = [];
    try {
      const timeline = parseTimeline(p.timelineJson), at = Math.min(Math.max(0, Number(req.query.t ?? 0) || 0), Math.max(0, timelineDuration(timeline) - 0.04));
      const width = Math.min(1920, Math.max(160, Math.round(Number(req.query.width ?? 960) || 960)));
      const assets = new Map(storage.listAssets().map((a) => [a.id, a]));
      const plan = buildRenderPlan(timeline, assets, MEDIA_DIR, TMP_DIR, `frame${uid()}`, out, { frameAt: at, width });
      temp = plan.tempFiles;
      const { code, stderrTail } = await runFfmpeg(plan.args, 1, () => {});
      if (code !== 0 || !fs.existsSync(out)) return res.status(422).json({ message: `frame render failed: ${stderrTail.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}` });
      res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "no-store");
      fs.createReadStream(out).on("close", () => fs.promises.unlink(out).catch(() => {})).pipe(res);
    } catch (e: any) { res.status(422).json({ message: e.message || "frame render failed" }); }
    finally { temp.forEach((f) => fs.promises.unlink(f).catch(() => {})); }
  });

  registerLiveRoutes(app);

  app.post("/api/projects/:id/duplicate", requireScope("write"), (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p || !projectAllowed((req as any).apiKey, p.id)) return res.status(404).json({ message: "project not found" });
    if (keyRestrictions((req as any).apiKey).projectIds !== null) return res.status(403).json({ message: "Project-restricted keys cannot create projects." });
    const copy = storage.createProject({ id: uid(), name: `${p.name} copy`.slice(0, 200), timelineJson: p.timelineJson, createdAt: now(), updatedAt: now() });
    res.status(201).json({ id: copy.id, name: copy.name, visibility: copy.visibility, timeline: parseTimeline(copy.timelineJson), createdAt: copy.createdAt, updatedAt: copy.updatedAt });
  });

  // A contact sheet of evenly spaced frames: one image tells an agent what the whole edit looks like.
  app.get("/api/projects/:id/storyboard", requireScope("read"), async (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p || !projectAllowed((req as any).apiKey, p.id)) return res.status(404).json({ message: "project not found" });
    const timeline = parseTimeline(p.timelineJson), total = timelineDuration(timeline);
    if (total <= 0) return res.status(422).json({ message: "project is empty" });
    const count = Math.min(12, Math.max(2, Math.round(Number(req.query.count ?? 6) || 6))), width = Math.min(640, Math.max(160, Math.round(Number(req.query.width ?? 320) || 320)));
    const files: string[] = [], temp: string[] = [], assets = new Map(storage.listAssets().map((a) => [a.id, a]));
    try {
      const times = Array.from({ length: count }, (_, i) => Math.min(Math.max(0, total - 0.04), (total * (i + 0.5)) / count));
      for (let i = 0; i < times.length; i += 3) await Promise.all(times.slice(i, i + 3).map(async (at, j) => {
        const out = path.join(TMP_DIR, `board_${uid()}_${i + j}.png`); files[i + j] = out;
        const plan = buildRenderPlan(timeline, assets, MEDIA_DIR, TMP_DIR, `board${uid()}`, out, { frameAt: at, width }); temp.push(...plan.tempFiles);
        const r = await runFfmpeg(plan.args, 1, () => {}); if (r.code !== 0) throw new Error("frame render failed");
      }));
      const cols = Math.min(4, count), rows = Math.ceil(count / cols), sheet = path.join(TMP_DIR, `sheet_${uid()}.png`);
      const args = ["-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex", `${files.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${count}:layout=${files.map((_, i) => `${(i % cols)}*w0_${Math.floor(i / cols)}*h0`).join("|")}:fill=black[o]`, "-map", "[o]", "-frames:v", "1", sheet];
      const done = await runFfmpeg(args, 1, () => {}); if (done.code !== 0 || !fs.existsSync(sheet)) throw new Error("storyboard failed");
      temp.push(sheet); res.setHeader("Content-Type", "image/png"); res.setHeader("X-Storyboard", JSON.stringify({ cols, rows, times: times.map((t) => Math.round(t * 100) / 100) }));
      res.setHeader("Access-Control-Expose-Headers", "X-Storyboard"); res.send(fs.readFileSync(sheet));
    } catch (e: any) { res.status(422).json({ message: e.message || "storyboard failed" }); }
    finally { [...files, ...temp].forEach((f) => f && fs.promises.unlink(f).catch(() => {})); }
  });
  app.get("/api/capabilities", requireScope("read"), (_req, res) => res.json(capabilities()));

  // ---------- render ----------
  app.post("/api/renders", requireScope("write"), (req, res) => {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ message: "projectId required" });
    const p = storage.getProject(projectId);
    if (!p) return res.status(404).json({ message: "project not found" });
    const jobId = uid();
    storage.createRenderJob({
      id: jobId,
      projectId,
      status: "queued",
      progress: 0,
      outputPath: null,
      error: null,
      createdAt: now(),
      updatedAt: now(),
    });
    logEvent(projectId, actorOf(req), "render", "Started an export");
    // fire-and-forget; job status is pollable
    setImmediate(() => runRender(jobId, projectId));
    res.status(201).json({ jobId, status: "queued", statusUrl: `/api/renders/${jobId}` });
  });

  app.get("/api/renders", requireScope("read"), (req, res) => {
    const pid = req.query.projectId as string | undefined;
    res.json({ jobs: storage.listRenderJobs(pid).filter(j => projectAllowed((req as any).apiKey, j.projectId)) });
  });

  app.get("/api/renders/:id", requireScope("read"), (req, res) => {
    const j = storage.getRenderJob(String(req.params.id));
    if (!j) return res.status(404).json({ message: "job not found" });
    res.json(j);
  });

  app.get("/api/renders/:id/download", requireMediaAccess("render"), (req, res) => {
    const j = storage.getRenderJob(String(req.params.id));
    if (!j || j.status !== "done") return res.status(404).json({ message: "render not ready" });
    const outPath = path.join(OUTPUT_DIR, `${String(req.params.id)}.mp4`);
    if (!fs.existsSync(outPath)) return res.status(404).json({ message: "rendered file missing" });
    const stat = fs.statSync(outPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="render_${String(req.params.id)}.mp4"`);
    fs.createReadStream(outPath).pipe(res);
  });

  return httpServer;
}
