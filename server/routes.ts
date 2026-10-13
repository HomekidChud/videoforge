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
import { requirePermission, requireMediaAccess } from "./auth";

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

function escText(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

/** Clip timeline duration accounting for playback speed. */
function clipTimelineDur(c: Clip): number {
  const speed = Math.max(0.1, Math.min(4, c.speed ?? 1));
  const src = c.outPoint - c.inPoint;
  return Math.max(0.1, src / speed);
}

/** Total timeline duration = max over clips of (start + duration). */
function timelineTotal(clips: Clip[]): number {
  let end = 0;
  for (const c of clips) {
    const isImage = c.track === "video" && c.duration !== undefined && c.duration > 0 && c.outPoint - c.inPoint <= 0.01;
    const d = isImage ? c.duration! : clipTimelineDur(c);
    end = Math.max(end, c.start + d);
  }
  return end;
}

function buildFilterGraph(project: Project, assets: Map<string, Asset>): { inputs: string[]; filters: string[]; maps: string[] } {
  const timeline = parseTimeline(project.timelineJson);
  const inputs: string[] = [];
  const filters: string[] = [];
  const maps: string[] = [];
  const outW = timeline.resolution?.width || 1280;
  const outH = timeline.resolution?.height || 720;
  const fps = timeline.fps || 30;

  const clips = timeline.clips.filter((c) => c.assetId && assets.has(c.assetId));
  const total = Math.max(0.1, timelineTotal(clips));
  const totalDur = (total + 0.5).toFixed(3);

  // ---- Video: start with a black canvas of the full duration, overlay every clip at its start
  let bgAcc = "blackbg";
  filters.push(`color=c=black:s=${outW}x${outH}:d=${totalDur}:r=${fps}[${bgAcc}];`);

  // ---- Audio: silent base of the full duration
  let aBase = "abase0";
  filters.push(`anullsrc=r=44100:cl=stereo:d=${totalDur}[${aBase}];`);
  let aMixCount = 0;

  const inIdxByClip: number[] = [];

  clips.forEach((clip, i) => {
    const asset = assets.get(clip.assetId)!;
    const isImage = asset.kind === "image";
    const speed = Math.max(0.1, Math.min(4, clip.speed ?? 1));
    const vDur = isImage ? Math.max(0.2, clip.duration ?? 5) : clipTimelineDur(clip);

    inputs.push("-i", path.join(MEDIA_DIR, asset.id));
    const inIdx = inputs.length / 2 - 1;
    inIdxByClip.push(inIdx);

    // ============ VIDEO CHAIN ============
    if (clip.track !== "audio") {
      let v = `[${inIdx}:v]`;

      // image: loop to duration. video: nothing yet (trim comes after speed).
      if (isImage) {
        filters.push(`${v}loop=loop=-1:size=1:start=0,setpts=PTS-STARTPTS,fps=${fps},trim=duration=${vDur.toFixed(3)},setpts=PTS-STARTPTS[vi${i}a];`);
        v = `[vi${i}a]`;
      }

      // crop (fractions)
      const cT = Math.min(0.45, Math.max(0, clip.cropTop ?? 0));
      const cB = Math.min(0.45, Math.max(0, clip.cropBottom ?? 0));
      const cL = Math.min(0.45, Math.max(0, clip.cropLeft ?? 0));
      const cR = Math.min(0.45, Math.max(0, clip.cropRight ?? 0));
      if (cT + cB > 0 || cL + cR > 0) {
        filters.push(`${v}crop=iw*${(1 - cL - cR).toFixed(4)}:ih*${(1 - cT - cB).toFixed(4)}:iw*${cL.toFixed(4)}:ih*${cT.toFixed(4)}[vc${i}];`);
        v = `[vc${i}]`;
      }

      // colour adjustments
      const b = clip.brightness ?? 1;
      const ct = clip.contrast ?? 1;
      const sa = clip.saturation ?? 1;
      const hu = clip.hue ?? 0;
      if (b !== 1 || ct !== 1 || sa !== 1 || hu !== 0) {
        const parts: string[] = [];
        if (b !== 1 || ct !== 1 || sa !== 1) {
          parts.push(`eq=brightness=${(b - 1).toFixed(3)}:contrast=${ct.toFixed(3)}:saturation=${sa.toFixed(3)}`);
        }
        if (hu !== 0) parts.push(`hue=h=${(hu * Math.PI / 180).toFixed(4)}`);
        if (parts.length > 0) {
          filters.push(`${v}${parts.join(",")}[vf${i}];`);
          v = `[vf${i}]`;
        }
      }

      // blur
      const bl = clip.blur ?? 0;
      if (bl > 0) {
        filters.push(`${v}boxblur=luma_radius=${Math.max(1, Math.round(bl * 8))}:luma_power=1:chroma_radius=${Math.max(1, Math.round(bl * 8))}:chroma_power=1[vb${i}];`);
        v = `[vb${i}]`;
      }

      // rotate + flips
      const rot = clip.rotate ?? 0;
      if (clip.flipH) {
        filters.push(`${v}hflip[vfh${i}];`);
        v = `[vfh${i}]`;
      }
      if (clip.flipV) {
        filters.push(`${v}vflip[vfv${i}];`);
        v = `[vfv${i}]`;
      }
      if (Math.abs(rot) > 0.5) {
        // rotate filter takes RADIANS. rot is in degrees, so convert once.
        const rad = (rot * Math.PI / 180).toFixed(4);
        // rotate around center, keep same dimensions
        filters.push(`${v}rotate=${rad}:fillcolor=black@0:ow=iw:oh=ih[vr${i}];`);
        v = `[vr${i}]`;
      }

      // trim + speed for video
      if (!isImage) {
        filters.push(`${v}trim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)},setpts=PTS-STARTPTS[vi${i}b];`);
        v = `[vi${i}b]`;
        if (speed !== 1) {
          filters.push(`${v}setpts=PTS/${speed.toFixed(4)}[vsp${i}];`);
          v = `[vsp${i}]`;
        }
      }

      // fits into canvas
      filters.push(`${v}scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1[vcf${i}];`);
      v = `[vcf${i}]`;

      // zoom — applied AFTER fit-to-canvas so the zoom is relative to the
      // already-fitted frame and doesn't get cancelled by the fit step.
      // Zooming past 1.0 crops the edges; zooming below 1.0 shows the
      // canvas background around a shrunken frame.
      const sc = Math.max(0.05, Math.min(4, clip.scale ?? 1));
      if (sc !== 1) {
        if (sc > 1) {
          // zoom in: scale up, then center-crop back to outW x outH
          filters.push(`${v}scale=iw*${sc.toFixed(4)}:ih*${sc.toFixed(4)},crop=${outW}:${outH}:(iw-${outW})/2:(ih-${outH})/2[vsc${i}];`);
        } else {
          // zoom out: scale down, then pad back to outW x outH
          filters.push(`${v}scale=iw*${sc.toFixed(4)}:ih*${sc.toFixed(4)},pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black[vsc${i}];`);
        }
        v = `[vsc${i}]`;
      }

      // video fades (relative to clip's own local time)
      const fi = Math.max(0, Math.min(vDur / 2, clip.fadeIn ?? 0));
      const fo = Math.max(0, Math.min(vDur / 2, clip.fadeOut ?? 0));
      if (fi > 0) {
        filters.push(`${v}fade=t=in:st=0:d=${fi.toFixed(2)}[vfi${i}];`);
        v = `[vfi${i}]`;
      }
      if (fo > 0) {
        filters.push(`${v}fade=t=out:st=${Math.max(0, vDur - fo).toFixed(2)}:d=${fo.toFixed(2)}[vfo${i}];`);
        v = `[vfo${i}]`;
      }

      // --- CRITICAL: shift the clip's PTS so it plays at clip.start ---
      // Without this, `overlay enable='between(t,start,start+dur)' only controls
      // VISIBILITY — the clip's internal timestamps still play from 0, so a clip
      // at start=4s would already be 4s into its own playback when it appears.
      // Shifting PTS by +start (in seconds, expressed as start/TB in TB units)
      // makes the clip's timeline align with the canvas.
      // NOTE: use ${clip.start}/TB (start seconds expressed in TB units), NOT
      // start*fps/TB — PTS is already in TB units, so adding start/TB adds exactly
      // `start` seconds regardless of the codec timebase.
      filters.push(`${v}setpts=PTS+${clip.start.toFixed(6)}/TB[vst${i}];`);
      v = `[vst${i}]`;

      // overlay onto background at clip.start
      const newBg = `bg${i}`;
      filters.push(`[${bgAcc}]${v}overlay=0:0:enable='between(t,${clip.start.toFixed(3)},${(clip.start + vDur).toFixed(3)})'[${newBg}];`);
      bgAcc = newBg;

      // text overlay for this clip
      if (clip.text && clip.text.trim()) {
        const e = escText(clip.text.trim());
        const newT = `bgt${i}`;
        filters.push(
          `[${bgAcc}]drawtext=text='${e}':fontcolor=white:fontsize=${Math.round(outH / 18)}:x=(w-text_w)/2:y=h*0.78:` +
          `box=1:boxcolor=black@0.5:boxborderw=${Math.round(outH / 60)}:enable='between(t,${clip.start.toFixed(3)},${(clip.start + vDur).toFixed(3)})'[${newT}];`
        );
        bgAcc = newT;
      }
    }

    // ============ AUDIO CHAIN ============
    if (asset.hasAudio || asset.kind === "audio") {
      const vol = clip.muted ? 0 : Math.min(1, Math.max(0, clip.volume ?? 1));
      let a = `[${inIdx}:a]`;

      // trim
      if (!isImage) {
        filters.push(`${a}atrim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)},asetpts=PTS-STARTPTS[atr${i}];`);
        a = `[atr${i}]`;
        // speed — atempo directly multiplies playback rate (speed=2 → atempo=2).
        // NOTE: atempo only supports 0.5–2.0 per stage; chain if needed.
        if (speed !== 1) {
          const chain: string[] = [];
          let remaining = speed;
          while (remaining > 2) { chain.push("atempo=2.0"); remaining /= 2; }
          while (remaining < 0.5) { chain.push("atempo=0.5"); remaining *= 2; }
          chain.push(`atempo=${Math.min(2, Math.max(0.5, remaining)).toFixed(4)}`);
          filters.push(`${a}${chain.join(",")}[asp${i}];`);
          a = `[asp${i}]`;
        }
      }

      // audio fades
      const afi = Math.max(0, Math.min(vDur / 2, clip.audioFadeIn ?? 0));
      const afo = Math.max(0, Math.min(vDur / 2, clip.audioFadeOut ?? 0));
      if (afi > 0) {
        filters.push(`${a}afade=t=in:st=0:d=${afi.toFixed(2)}[afi${i}];`);
        a = `[afi${i}]`;
      }
      if (afo > 0) {
        filters.push(`${a}afade=t=out:st=${Math.max(0, vDur - afo).toFixed(2)}:d=${afo.toFixed(2)}[afo${i}];`);
        a = `[afo${i}]`;
      }

      // volume
      if (vol !== 1) {
        filters.push(`${a}volume=${vol.toFixed(3)}[avl${i}];`);
        a = `[avl${i}]`;
      }

      // delay to clip.start then mix onto base
      filters.push(`${a}adelay=${Math.round(clip.start * 1000)}|${Math.round(clip.start * 1000)}[adl${i}];`);
      a = `[adl${i}]`;
      const newBase = `amix${aMixCount}`;
      // normalize=0 so amix does NOT attenuate inputs (would otherwise halve
      // the volume of everything already mixed, each time a new clip is mixed in).
      filters.push(`[${aBase}]${a}amix=inputs=2:duration=first:normalize=0,apad=whole_dur=${totalDur}[${newBase}];`);
      aBase = newBase;
      aMixCount++;
    }
  });

  maps.push("-map", `[${bgAcc}]`, "-map", `[${aBase}]`);
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
  app.post("/api/media/upload", requirePermission("media:upload"), (req, res) => {
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
  app.get("/api/media", requirePermission("media:read"), (_req, res) => {
    res.json({ assets: storage.listAssets().map(assetToJSON) });
  });

  app.get("/api/media/:id", requirePermission("media:read"), (req, res) => {
    const a = storage.getAsset(String(req.params.id));
    if (!a) return res.status(404).json({ message: "asset not found" });
    res.json(assetToJSON(a));
  });

  app.delete("/api/media/:id", requirePermission("media:delete"), (req, res) => {
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
  app.get("/api/projects", requirePermission("projects:read"), (_req, res) => {
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

  app.get("/api/projects/:id", requirePermission("projects:read"), (req, res) => {
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

  app.post("/api/projects", requirePermission("projects:write"), (req, res) => {
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

  app.put("/api/projects/:id", requirePermission("projects:write"), (req, res) => {
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

  app.delete("/api/projects/:id", requirePermission("projects:write"), (req, res) => {
    const ok = storage.deleteProject(String(req.params.id));
    if (!ok) return res.status(404).json({ message: "project not found" });
    res.json({ deleted: true });
  });

  // ---------- timeline edit (agents) ----------
  // atomic ops that operate on a project's timeline in one call
  app.post("/api/projects/:id/timeline/ops", requirePermission("timeline:edit"), (req, res) => {
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
          const num = (v: unknown, lo: number, hi: number, dflt?: number) =>
            typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
          const clip: Clip = {
            id: c.id || uid(),
            assetId: c.assetId,
            track: (c.track as any) || "video",
            start,
            inPoint,
            outPoint,
            volume: num(c.volume, 0, 1, 1) ?? 1,
            muted: c.muted ?? false,
            text: c.text,
            duration: num(c.duration, 0.1, 3600),
            speed: num(c.speed, 0.1, 4),
            brightness: num(c.brightness, 0, 2),
            contrast: num(c.contrast, 0, 2),
            saturation: num(c.saturation, 0, 2),
            hue: num(c.hue, -180, 180),
            blur: num(c.blur, 0, 10),
            opacity: num(c.opacity, 0, 1),
            scale: num(c.scale, 0.05, 4),
            rotate: num(c.rotate, -180, 180),
            flipH: typeof c.flipH === "boolean" ? c.flipH : undefined,
            flipV: typeof c.flipV === "boolean" ? c.flipV : undefined,
            cropTop: num(c.cropTop, 0, 0.45),
            cropBottom: num(c.cropBottom, 0, 0.45),
            cropLeft: num(c.cropLeft, 0, 0.45),
            cropRight: num(c.cropRight, 0, 0.45),
            fadeIn: num(c.fadeIn, 0, 60),
            fadeOut: num(c.fadeOut, 0, 60),
            audioFadeIn: num(c.audioFadeIn, 0, 60),
            audioFadeOut: num(c.audioFadeOut, 0, 60),
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
        case "update_clip": {
          // generic clip property patch (speed, filters, transform, fades, text)
          const { clipId, patch } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          const p = patch || {};
          const num = (v: unknown, lo: number, hi: number) =>
            typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
          const setNum = (k: keyof Clip, v: number | undefined, lo: number, hi: number) => {
            const n = num(v, lo, hi); if (n !== undefined) (c as any)[k] = n;
          };
          setNum("volume", p.volume, 0, 1);
          setNum("duration", p.duration, 0.1, 3600);
          setNum("speed", p.speed, 0.1, 4);
          setNum("brightness", p.brightness, 0, 2);
          setNum("contrast", p.contrast, 0, 2);
          setNum("saturation", p.saturation, 0, 2);
          setNum("hue", p.hue, -180, 180);
          setNum("blur", p.blur, 0, 10);
          setNum("opacity", p.opacity, 0, 1);
          setNum("scale", p.scale, 0.05, 4);
          setNum("rotate", p.rotate, -180, 180);
          setNum("cropTop", p.cropTop, 0, 0.45);
          setNum("cropBottom", p.cropBottom, 0, 0.45);
          setNum("cropLeft", p.cropLeft, 0, 0.45);
          setNum("cropRight", p.cropRight, 0, 0.45);
          setNum("fadeIn", p.fadeIn, 0, 60);
          setNum("fadeOut", p.fadeOut, 0, 60);
          setNum("audioFadeIn", p.audioFadeIn, 0, 60);
          setNum("audioFadeOut", p.audioFadeOut, 0, 60);
          if (typeof p.muted === "boolean") c.muted = p.muted;
          if (typeof p.flipH === "boolean") c.flipH = p.flipH;
          if (typeof p.flipV === "boolean") c.flipV = p.flipV;
          if (typeof p.text === "string") c.text = p.text.trim() ? p.text : undefined;
          if (typeof p.start === "number") c.start = Math.max(0, p.start);
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
        case "split_clip": {
          const { clipId, at } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          if (typeof at !== "number") throw new Error("at (seconds, source-relative) required");
          const srcAt = c.inPoint + at;
          if (at <= 0.05 || srcAt >= c.outPoint - 0.05) throw new Error("split point must be inside the clip");
          const second: Clip = { ...c, id: uid(), start: c.start + at, inPoint: srcAt };
          c.outPoint = srcAt;
          clips.push(second);
          break;
        }
        case "duplicate_clip": {
          const { clipId } = args || {};
          const c = clips.find((x) => x.id === clipId);
          if (!c) throw new Error(`clip ${clipId} not found`);
          const copy: Clip = { ...c, id: uid(), start: c.start + (c.outPoint - c.inPoint) };
          clips.push(copy);
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
  app.post("/api/renders", requirePermission("renders:create"), (req, res) => {
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

  app.get("/api/renders", requirePermission("renders:download"), (req, res) => {
    const pid = req.query.projectId as string | undefined;
    res.json({ jobs: storage.listRenderJobs(pid) });
  });

  app.get("/api/renders/:id", requirePermission("renders:download"), (req, res) => {
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
