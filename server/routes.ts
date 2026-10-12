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
import type { Asset, Clip, Project, Timeline } from "@shared/schema";
import { requireScope, requireMediaAccess } from "./auth";

const MEDIA_DIR = path.resolve("data/media");
const OUTPUT_DIR = path.resolve("data/renders");
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
  const t = JSON.parse(json);
  if (!Array.isArray(t.clips)) throw new Error("timeline.clips must be an array");
  return t as Timeline;
}

// ---------------------------------------------------------------
// Render worker (ffmpeg)
// ---------------------------------------------------------------

function buildFilterGraph(project: Project, assets: Map<string, Asset>): { inputs: string[]; filters: string[]; maps: string[] } {
  const timeline = parseTimeline(project.timelineJson);
  const inputs: string[] = [];
  const filters: string[] = [];
  const maps: string[] = [];
  let vin = 0, ain = 0; // running input index
  let vConcat = "";
  let aConcat = "";
  const outW = timeline.resolution?.width || 1280;
  const outH = timeline.resolution?.height || 720;
  const fps = timeline.fps || 30;

  const videoClips = timeline.clips.filter((c) => c.track === "video");
  const overlayClips = timeline.clips.filter((c) => c.text && c.text.trim());

  videoClips.forEach((clip, i) => {
    const asset = assets.get(clip.assetId);
    if (!asset) return;
    inputs.push("-i", path.join(MEDIA_DIR, asset.id));
    const dur = Math.max(0.1, clip.outPoint - clip.inPoint);
    const vIdx = vin;
    filters.push(
      `[${vIdx}:v]` +
      `trim=start=${clip.inPoint}:end=${clip.outPoint},setpts=PTS-STARTPTS,` +
      `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,` +
      `fps=${fps},format=yuv420p[v${i}];`
    );
    vConcat += `[v${i}]`;
    // audio from the same input — only when the source has audio
    if (asset.hasAudio) {
      const aIdx = vin;
      const vol = clip.muted ? 0 : Math.min(1, Math.max(0, clip.volume ?? 1));
      filters.push(
        `[${aIdx}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS,` +
        `volume=${vol}[a${i}];`
      );
      aConcat += `[a${i}]`;
    }
    vin++;
  });

  if (videoClips.length > 1) {
    filters.push(`${vConcat}concat=n=${videoClips.length}:v=1:a=0[vout_raw];`);
  } else if (videoClips.length === 1) {
    filters.push(`[v0]null[vout_raw];`);
  }

  // overlay text clips: drawtext burned onto [vout_raw] segments
  let overlayChain = "";
  overlayClips.forEach((clip, i) => {
    if (!clip.text) return;
    const esc = clip.text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
    overlayChain +=
      `drawtext=text='${esc}':fontcolor=white:fontsize=${Math.round(outH / 18)}:x=(w-text_w)/2:y=h*0.78:` +
      `box=1:boxcolor=black@0.5:boxborderw=${Math.round(outH / 60)}:enable='between(t,${clip.start},${clip.outPoint})',`;
  });

  if (overlayChain) {
    // strip trailing comma from the last filter in the chain
    filters.push(`[vout_raw]${overlayChain.replace(/,$/, "")}[vout];`);
  } else {
    filters.push(`[vout_raw]null[vout];`);
  }

  const hasAudio = videoClips.some((c) => assets.get(c.assetId)?.hasAudio);
  if (hasAudio) {
    if (videoClips.length > 1) {
      filters.push(`${aConcat}concat=n=${videoClips.length}:v=0:a=1[aout];`);
    } else {
      filters.push(`[a0]anull[aout];`);
    }
    maps.push("-map", "[vout]", "-map", "[aout]");
  } else {
    maps.push("-map", "[vout]", "-an");
  }
  return { inputs, filters, maps };
}

async function runRender(jobId: string, projectId: string) {
  const project = storage.getProject(projectId);
  if (!project) {
    storage.updateRenderJob(jobId, { status: "error", error: "project not found", updatedAt: now() });
    return;
  }
  try {
    storage.updateRenderJob(jobId, { status: "rendering", updatedAt: now() });
    const assets = new Map(storage.listAssets().map((a) => [a.id, a]));
    const { inputs, filters, maps } = buildFilterGraph(project, assets);
    const outPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    // Some ffmpeg builds reject a trailing ';' in the filter graph
    // ("No such filter: ''"). Strip it before passing to ffmpeg.
    const filterArg = filters.join("").replace(/;\s*$/, "");
    const args = [
      "-y",
      ...inputs,
      "-filter_complex", filterArg,
      ...maps,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      outPath,
    ];
    console.log(`[render ${jobId}] ffmpeg ${args.join(" ").slice(0, 800)}`);
    console.log(`[render ${jobId}] full filter:\n${filterArg}`);
    await new Promise<void>((resolve) => {
      const p = spawn("ffmpeg", args);
      p.stderr!.on("data", (d: Buffer) => {
        const s = d.toString();
        const m = s.match(/time=(\d+):(\d+):(\d+)/);
        if (m) {
          const t = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
          // rough progress: we don't know total duration exactly; use per-input duration
          // (compute total expected = sum of clip durations)
          const timeline = parseTimeline(project.timelineJson);
          const total = timeline.clips
            .filter((c) => c.track === "video")
            .reduce((s2, c) => s2 + (c.outPoint - c.inPoint), 0);
          if (total > 0) {
            const pct = Math.min(0.99, t / total);
            storage.updateRenderJob(jobId, { progress: pct, updatedAt: now() });
          }
        }
        if (s.includes("Error") || s.includes("error")) console.error(s.slice(0, 400));
      });
      p.on("close", (c) => {
        console.log(`[render ${jobId}] ffmpeg exit code=${c}`);
        if (c === 0) resolve();
        else {
          storage.updateRenderJob(jobId, { status: "error", error: `ffmpeg exit ${c}`, updatedAt: now() });
          resolve();
        }
      });
      p.on("error", (e) => {
        storage.updateRenderJob(jobId, { status: "error", error: String(e), updatedAt: now() });
        resolve();
      });
    });
    const check = storage.getRenderJob(jobId);
    if (check && check.status !== "error") {
      storage.updateRenderJob(jobId, {
        status: "done",
        progress: 1,
        outputPath: `/api/renders/${jobId}/download`,
        updatedAt: now(),
      });
    }
  } catch (e: any) {
    storage.updateRenderJob(jobId, { status: "error", error: String(e?.message || e), updatedAt: now() });
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

  // ---------- media upload (multipart) ----------
  app.post("/api/media/upload", requireScope("write"), (req, res) => {
    if (!req.headers["content-type"]?.includes("multipart/form-data")) {
      return res.status(400).json({ message: "multipart/form-data required" });
    }
    const busboy = Busboy({ headers: req.headers as any });
    const files: any[] = [];
    busboy.on("file", (name: string, stream: any, info: any) => {
      console.log(`[upload] file field=${name} filename=${info.filename} mime=${info.mimeType}`);
      // buffer the stream fully into memory as it arrives, to avoid any
      // backpressure / async ordering issues once we leave the handler
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      const done = new Promise<void>((r) => stream.on("end", () => r()));
      files.push({ name, stream, info, chunks, done });
    });
    busboy.on("error", (e: any) => {
      console.error("[upload] busboy error", e);
    });
    req.pipe(busboy);
    busboy.on("finish", async () => {
      console.log(`[upload] finish, ${files.length} files`);
      const results: any[] = [];
      for (const f of files) {
        const id = uid();
        const ext = path.extname(f.info.filename).slice(0, 12);
        const dest = path.join(MEDIA_DIR, id);
        await f.done;
        const buf = Buffer.concat(f.chunks);
        fs.writeFileSync(dest, buf);
        console.log(`[upload] wrote ${buf.length} bytes to ${dest}`);
        const kind = kindFromMime(f.info.mimeType, f.info.filename);
        let duration = 0, width = 0, height = 0, hasAudio = 0;
        try {
          const p = await probe(dest);
          duration = p.duration; width = p.width; height = p.height; hasAudio = p.hasAudio ? 1 : 0;
        } catch (e) { console.warn("probe failed:", e); }
        const stat = await fsp.stat(dest);
        const asset = storage.createAsset({
          id,
          filename: f.info.filename,
          kind,
          mime: f.info.mimeType || "application/octet-stream",
          duration,
          width,
          height,
          hasAudio,
          sizeBytes: stat.size,
          storagePath: dest,
          thumbPath: null,
          createdAt: now(),
        });
        results.push(assetToJSON(asset));
      }
      res.status(201).json({ assets: results });
    });
  });

  // ---------- media list / detail ----------
  app.get("/api/media", requireScope("read"), (_req, res) => {
    res.json({ assets: storage.listAssets().map(assetToJSON) });
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
            ...(a.kind === "image" ? [] : ["-ss", "1"]),
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

  // ---------- projects ----------
  app.get("/api/projects", requireScope("read"), (_req, res) => {
    res.json({
      projects: storage.listProjects().map((p) => ({
        id: p.id,
        name: p.name,
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
      const t: Timeline = {
        version: 1,
        fps: timeline.fps || 30,
        resolution: timeline.resolution || { width: 1280, height: 720 },
        clips: timeline.clips,
      };
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
      if (typeof name === "string") patch.name = name.slice(0, 200);
      if (timeline) {
        if (!Array.isArray(timeline.clips)) {
          return res.status(400).json({ message: "timeline.clips must be an array" });
        }
        const t: Timeline = {
          version: 1,
          fps: timeline.fps || 30,
          resolution: timeline.resolution || { width: 1280, height: 720 },
          clips: timeline.clips,
        };
        patch.timelineJson = JSON.stringify(t);
      }
      const updated = storage.updateProject(String(req.params.id), patch);
      res.json({
        id: updated!.id,
        name: updated!.name,
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
      switch (op) {
        case "add_clip": {
          const c = args as Partial<Clip>;
          if (!c.assetId) throw new Error("assetId required");
          const asset = storage.getAsset(c.assetId);
          if (!asset) throw new Error(`asset ${c.assetId} not found`);
          const inPoint = Math.max(0, c.inPoint ?? 0);
          const outPoint = Math.min(asset.duration || inPoint + 10, c.outPoint ?? (inPoint + 5));
          const start = c.start ?? 0;
          const clip: Clip = {
            id: c.id || uid(),
            assetId: c.assetId,
            track: (c.track as any) || "video",
            start,
            inPoint,
            outPoint,
            volume: c.volume ?? 1,
            muted: c.muted ?? false,
            text: c.text,
          };
          clips.push(clip);
          break;
        }
        case "remove_clip": {
          const id = args?.clipId;
          const i = clips.findIndex((c) => c.id === id);
          if (i < 0) throw new Error(`clip ${id} not found`);
          clips.splice(i, 1);
          break;
        }
        case "trim_clip": {
          const { clipId, inPoint, outPoint } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          if (typeof inPoint === "number") c.inPoint = Math.max(0, inPoint);
          if (typeof outPoint === "number") c.outPoint = Math.max(c.inPoint + 0.1, outPoint);
          break;
        }
        case "move_clip": {
          const { clipId, start } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          if (typeof start === "number") c.start = Math.max(0, start);
          break;
        }
        case "set_audio": {
          const { clipId, volume, muted } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          if (typeof volume === "number") c.volume = Math.min(1, Math.max(0, volume));
          if (typeof muted === "boolean") c.muted = muted;
          break;
        }
        case "add_text": {
          const { clipId, text } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          if (typeof text !== "string" || !text.trim()) throw new Error("text required");
          c.text = text;
          break;
        }
        case "reorder": {
          const { order } = args || {};
          if (!Array.isArray(order)) throw new Error("order (array of clip ids) required");
          const byId = new Map(clips.map((c) => [c.id, c]));
          const next = order.map((id: string) => byId.get(id)).filter(Boolean) as Clip[];
          if (next.length !== clips.length) throw new Error("order must contain every clip id");
          // re-space video clips sequentially
          let t = 0;
          for (const c of next.filter((c) => c.track === "video")) {
            c.start = t;
            t += c.outPoint - c.inPoint;
          }
          timeline.clips = next;
          break;
        }
        default:
          return res.status(400).json({ message: `unknown op: ${op}` });
      }
      const updated = storage.updateProject(String(req.params.id), {
        timelineJson: JSON.stringify(timeline),
        updatedAt: now(),
      });
      res.json({
        id: updated!.id,
        name: updated!.name,
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
    res.json({ jobs: storage.listRenderJobs(pid) });
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
