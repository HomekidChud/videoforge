import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import Busboy from "busboy";
import type { Asset } from "@shared/schema";
import { normalizeClip, normalizeTimeline, clipDuration, type Clip, type Timeline } from "@shared/timeline";
import { buildRenderPlan, runFfmpeg } from "./render";
import { requireScope, requireMediaAccess, projectAllowed, assetAllowed } from "./auth";

const MEDIA_DIR = path.resolve("data/media");
const OUTPUT_DIR = path.resolve("data/renders");
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
fs.mkdirSync(TMP_DIR, { recursive: true });

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
      return;
    }
    storage.updateRenderJob(jobId, { status: "done", progress: 1, outputPath: `/api/renders/${jobId}/download`, updatedAt: now() });
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
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "videoforge-api", version: 1 }));

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
    const ok = storage.deleteProject(String(req.params.id));
    if (!ok) return res.status(404).json({ message: "project not found" });
    res.json({ deleted: true });
  });

  // ---------- timeline edit (agents) ----------
  // atomic ops that operate on a project's timeline in one call
  app.post("/api/projects/:id/timeline/ops", requireScope("write"), (req, res) => {
    const p = storage.getProject(String(req.params.id));
    if (!p) return res.status(404).json({ message: "project not found" });
    const timeline = parseTimeline(p.timelineJson);
    const { op, args } = req.body || {};
    if (!op) return res.status(400).json({ message: "op required" });
    try {
      const clips = timeline.clips;
      const find = (id: unknown) => {
        const c = clips.find((x) => x.id === id);
        if (!c) throw new Error(`clip ${id} not found`);
        return c;
      };
      switch (op) {
        case "add_clip": {
          const c = (args || {}) as Partial<Clip>;
          const asset = c.assetId ? storage.getAsset(c.assetId) : undefined;
          if (c.assetId && !asset) throw new Error(`asset ${c.assetId} not found`);
          if (!c.assetId && !c.text) throw new Error("assetId or text required");
          const inPoint = Math.max(0, c.inPoint ?? 0);
          const maxOut = asset && asset.kind !== "image" && asset.duration ? asset.duration : Infinity;
          const outPoint = Math.min(maxOut, c.outPoint ?? inPoint + (asset?.kind === "video" || asset?.kind === "audio" ? Math.min(asset.duration || 5, 5) : 5));
          const track = (c.track as any) || (asset?.kind === "audio" ? "audio" : c.assetId ? "video" : "overlay");
          clips.push(normalizeClip({ ...c, id: c.id || uid(), track, start: c.start ?? 0, inPoint, outPoint }));
          break;
        }
        case "add_text_clip": {
          const { text, start, duration, ...style } = args || {};
          if (typeof text !== "string" || !text.trim()) throw new Error("text required");
          clips.push(normalizeClip({ ...style, id: uid(), assetId: "", track: "overlay", text, start: start ?? 0, inPoint: 0, outPoint: duration ?? 3 }));
          break;
        }
        case "remove_clip": {
          const i = clips.findIndex((c) => c.id === args?.clipId);
          if (i < 0) throw new Error(`clip ${args?.clipId} not found`);
          clips.splice(i, 1);
          break;
        }
        case "trim_clip": {
          const { clipId, inPoint, outPoint } = args || {};
          const c = find(clipId);
          if (typeof inPoint === "number") c.inPoint = Math.max(0, inPoint);
          if (typeof outPoint === "number") c.outPoint = Math.max(c.inPoint + 0.1, outPoint);
          break;
        }
        case "move_clip": {
          const { clipId, start, track } = args || {};
          const c = find(clipId);
          if (typeof start === "number") c.start = Math.max(0, start);
          if (["video", "overlay", "audio"].includes(track)) c.track = track;
          break;
        }
        case "set_audio": {
          const { clipId, volume, muted } = args || {};
          const c = find(clipId);
          if (typeof volume === "number") c.volume = Math.min(1, Math.max(0, volume));
          if (typeof muted === "boolean") c.muted = muted;
          break;
        }
        case "add_text": {
          const { clipId, text } = args || {};
          const c = find(clipId);
          if (typeof text !== "string" || !text.trim()) throw new Error("text required");
          c.text = text;
          break;
        }
        case "update_clip": {
          const { clipId, ...patch } = args || {};
          const c = find(clipId);
          const { id: _id, assetId: _asset, ...safe } = patch;
          // normalizeClip drops fields equal to their defaults, so replacing the
          // object (rather than merging) lets a patch reset a value to default.
          clips[clips.indexOf(c)] = normalizeClip({ ...c, ...safe, id: c.id, assetId: c.assetId });
          break;
        }
        case "split_clip": {
          const { clipId, at } = args || {};
          const c = find(clipId);
          if (typeof at !== "number") throw new Error("at (timeline seconds) required");
          const dur = clipDuration(c);
          const rel = at - c.start;
          if (rel < 0.1 || rel > dur - 0.1) throw new Error("split point must be inside the clip (at least 0.1s from either edge)");
          const speed = c.speed ?? 1;
          const srcSplit = c.assetId ? c.inPoint + rel * speed : c.inPoint + rel;
          const right: Clip = { ...c, id: uid(), start: at, inPoint: srcSplit };
          delete right.fadeIn;
          delete c.fadeOut;
          c.outPoint = srcSplit;
          clips.push(right);
          break;
        }
        case "set_project": {
          const { fps, resolution } = args || {};
          if (fps) timeline.fps = fps;
          if (resolution) timeline.resolution = resolution;
          break;
        }
        case "reorder": {
          const { order } = args || {};
          if (!Array.isArray(order)) throw new Error("order (array of clip ids) required");
          const byId = new Map(clips.map((c) => [c.id, c]));
          const next = order.map((id: string) => byId.get(id)).filter(Boolean) as Clip[];
          if (next.length !== clips.length) throw new Error("order must contain every clip id");
          let t = 0;
          for (const c of next.filter((c) => c.track === "video")) {
            c.start = t;
            t += clipDuration(c);
          }
          timeline.clips = next;
          break;
        }
        default:
          return res.status(400).json({ message: `unknown op: ${op}` });
      }
      const normalized = normalizeTimeline(timeline);
      timeline.clips = normalized.clips; timeline.fps = normalized.fps; timeline.resolution = normalized.resolution;
      const updated = storage.updateProject(String(req.params.id), {
        timelineJson: JSON.stringify(timeline),
        updatedAt: now(),
      });
      res.json({
        id: updated!.id,
        name: updated!.name,
        visibility: updated!.visibility,
        timeline,
        createdAt: updated!.createdAt,
        updatedAt: updated!.updatedAt,
      });
    } catch (e: any) {
      res.status(422).json({ message: e.message || "op failed" });
    }
  });

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
