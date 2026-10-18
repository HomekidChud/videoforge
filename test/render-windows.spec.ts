// ============================================================================
// Tests for windowed rendering (bug 2/3), the render guardrail, preview
// frame pruning, render job reconciliation on boot (bug 5) and renderProject
// temp file cleanup (bug 7).
//
// Run:
//   npx tsx test/render-windows.spec.ts
// ============================================================================

import { spawn, ChildProcess, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { once } from "node:events";
import { buildRenderPlan, planRenderWindows, runFfmpeg } from "../server/render";
import { MIN_CLIP, normalizeTimeline, type Timeline } from "../shared/timeline";
import { incomingTransition } from "../shared/transitions";
import type { Asset } from "@shared/schema";

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "vf-rw-"));
const H = (p: string) => `http://127.0.0.1:${PORT}${p}`;
const PORT = 5213;

let passed = 0, failed = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return (async () => {
    try { await fn(); passed++; console.log(`PASS: ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL: ${name}: ${e.message}`); }
  })();
};
const eq = (a: unknown, b: unknown, msg: string) => assert.equal(a, b, msg);
const ok = (c: unknown, msg: string) => assert.ok(c, msg);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(" ")} failed:\n${r.stderr}`);
  return r;
};
const probe = (file: string) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=codec_type,nb_frames,width,height", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
};
const frameCount = (file: string) => {
  // count decoded frames (nb_frames can be absent on the concatenated file)
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", "-", "-stats"], { encoding: "utf8" });
  const m = r.stderr.match(/frame=\s*(\d+)/g);
  return m ? parseInt(m[m.length - 1].replace(/\D/g, ""), 10) : -1;
};
const psnr = (a: string, b: string) => {
  const r = spawnSync("ffmpeg", ["-i", a, "-i", b, "-filter_complex", "[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/average:([\d.]+|inf)/);
  if (!m) throw new Error(`psnr failed: ${r.stderr.slice(-400)}`);
  return m[1] === "inf" ? Infinity : parseFloat(m[1]);
};

const asset = (id: string, file: string, duration: number, kind = "video"): Asset => ({
  id, filename: file, kind, mime: "video/mp4", duration, width: 320, height: 180, sizeBytes: 0,
  hasAudio: 1, storagePath: path.join(WORK, file), thumbPath: null, createdAt: 0,
  ownerId: null,
} as any as Asset);

// ---------------------------------------------------------------------------
// 1. planRenderWindows unit behaviour
// ---------------------------------------------------------------------------
const tl1 = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [
  { id: "c0", assetId: "m0", track: "video", start: 0, inPoint: 0, outPoint: 3 },
  { id: "c1", assetId: "m1", track: "video", start: 3, inPoint: 0, outPoint: 3 },
] });
await test("a simple timeline fits in one window (single-pass path)", () => {
  const w = planRenderWindows(tl1);
  eq(w.length, 1, "one window");
  eq(w[0].start, 0); eq(w[0].end, 6);
});

const manyClips = (n: number, per = 3): Timeline => normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, assetId: `m${i % 8}`, track: "video", start: i * per, inPoint: 0, outPoint: per })) });
await test("a dense timeline splits into windows with bounded inputs", () => {
  // A tighter budget exercises the splitting (the default 512MB budget fits
  // ~21 inputs at this small resolution in one pass — which is fine, it fits).
  process.env.VIDEOFORGE_RENDER_BUDGET_MB = "256";
  try {
  const tl = manyClips(24); // 24 sequential clips, 72s
  const w = planRenderWindows(tl);
  ok(w.length > 1, `24 clips split into ${w.length} windows`);
  // every window opens at most the cap the budget allows (~4 inputs)
  const assets8 = new Map(Array.from({ length: 8 }, (_, i) => [`m${i}`, asset(`m${i}`, `m${i}`, 30)]));
  for (const win of w) {
    const plan = buildRenderPlan(tl, assets8, WORK, WORK, `u${win.start}`, path.join(WORK, "x.mp4"), { window: win });
    const opened = plan.args.filter((a) => a === "-i").length;
    ok(opened <= 4, `window [${win.start},${win.end}] opens ${opened} inputs`);
  }
  // windows are contiguous and frame-aligned
  for (let i = 1; i < w.length; i++) ok(Math.abs(w[i].start - w[i - 1].end) < 1e-6, "contiguous");
  } finally { process.env.VIDEOFORGE_RENDER_BUDGET_MB = ""; }
});

await test("too many simultaneous clips is rejected with a clear error", () => {
  // A tighter budget lowers the per-pass input cap (the default 512MB budget
  // would happily plan 10 inputs at this small resolution — correctly, it fits).
  process.env.VIDEOFORGE_RENDER_BUDGET_MB = "256";
  try {
    const tl = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, assetId: `m${i}`, track: "video", start: 0, inPoint: 0, outPoint: 4 })) });
    assert.throws(() => planRenderWindows(tl), /at most \d+ simultaneous inputs/, "guardrail names the limit");
  } finally { process.env.VIDEOFORGE_RENDER_BUDGET_MB = ""; }
});

await test("the per-window input cap is sized by the memory budget and resolution", () => {
  // 24 sequential clips at 1080x1920 (the shape of timeline that used to OOM a
  // small container): on the default 512MB budget windows carry only a couple
  // of inputs each, so the timeline is split finely.
  const tall = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, assetId: `m${i}`, track: "video", start: i, inPoint: 0, outPoint: 1 })) });
  const assets24 = new Map(Array.from({ length: 24 }, (_, i) => [`m${i}`, asset(`m${i}`, `m${i}`, 30)]));
  const w = planRenderWindows(tall);
  ok(w.length > 4, `dense 1080p timeline is split finely (${w.length} windows)`);
  for (const win of w) {
    const plan = buildRenderPlan(tall, assets24, WORK, WORK, `b${win.start}`, path.join(WORK, "x.mp4"), { window: win });
    const opened = plan.args.filter((a) => a === "-i").length;
    ok(opened <= 2, `1080p window [${win.start},${win.end}] opens only ${opened} inputs on a 512MB budget`);
  }
  // clips stacked beyond the budget are rejected up front, naming the limit
  const stacked = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, assetId: `m${i}`, track: "video", start: 0, inPoint: 0, outPoint: 4 })) });
  assert.throws(() => planRenderWindows(stacked), /simultaneous/i, "over-budget stacking is rejected with guidance");
  // a bigger budget lifts the cap and coarsens the split
  process.env.VIDEOFORGE_RENDER_BUDGET_MB = "4096";
  const big = planRenderWindows(tall);
  process.env.VIDEOFORGE_RENDER_BUDGET_MB = "";
  ok(big.length < w.length, `a 4GB budget coarsens the windows (${big.length} vs ${w.length})`);
});

await test("audio-track clips do not consume the video window input budget", () => {
  // Footage plus a separate soundtrack: the audio bed is mixed in its own pass,
  // so it must not push sequential video clips over the per-window input cap.
  const tall = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, assetId: `m${i}`, track: "video", start: i, inPoint: 0, outPoint: 1 })),
    { id: "bed", assetId: "m0", track: "audio", start: 0, inPoint: 0, outPoint: 6 },
  ] });
  const w = planRenderWindows(tall);
  ok(w.length > 1, `video clips are windowed (${w.length} windows)`);
  for (const win of w) {
    const plan = buildRenderPlan(tall, new Map(Array.from({ length: 8 }, (_, i) => [`m${i}`, asset(`m${i}`, `m${i}`, 30)])), WORK, WORK, `a${win.start}`, path.join(WORK, "x.mp4"), { window: win, audio: false });
    const opened = plan.args.filter((a) => a === "-i").length;
    ok(opened <= 2, `window [${win.start},${win.end}] opens ${opened} inputs with an audio bed present`);
  }
});

await test("sub-second sequential cuts still split at their boundaries", () => {
  // Two adjacent 0.25s clips at the one-input 1080p cap: the cut between them is
  // a valid split point, so this must plan instead of rejecting.
  const tall = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: [
    { id: "a", assetId: "m0", track: "video", start: 0, inPoint: 0, outPoint: 0.25 },
    { id: "b", assetId: "m1", track: "video", start: 0.25, inPoint: 0, outPoint: 0.5 },
  ] });
  const w = planRenderWindows(tall);
  eq(w.length, 2, `two quarter-second clips split at the cut (${w.length} windows)`);
});

await test("a requested output width relaxes the input cap", () => {
  // 6 clips stacked at 1080p exceed the budget at full size (cap 1), but a
  // 480p-wide export of the same timeline fits it (cap rises to the ceiling).
  const stacked = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, assetId: `m${i}`, track: "video", start: 0, inPoint: 0, outPoint: 4 })) });
  assert.throws(() => planRenderWindows(stacked), /simultaneous/i, "full-size is over budget");
  const w = planRenderWindows(stacked, { width: 480 });
  ok(w.length >= 1, `a 480p export plans (${w.length} windows)`);
});

const framesInMs = (w: { start: number; end: number }) => Math.max(0, Math.floor((w.end - 1e-9) * 24) - Math.ceil(w.start * 24 - 1e-9) + 1);

await test("minimum-length sequential clips split at their boundary", () => {
  // The shortest legal clip is MIN_CLIP (0.1s — normalization bumps anything
  // shorter, which would make two shorter "clips" overlap and stack). Two
  // minimum-length clips at the 1080p cap (1 input per pass) must split exactly
  // at the cut between them, even though each window is only a few frames.
  const tall = normalizeTimeline({ fps: 24, resolution: { width: 1080, height: 1920 }, clips: [
    { id: "a", assetId: "m0", track: "video", start: 0, inPoint: 0, outPoint: MIN_CLIP },
    { id: "b", assetId: "m1", track: "video", start: MIN_CLIP, inPoint: MIN_CLIP, outPoint: 2 * MIN_CLIP },
  ] });
  eq(tall.clips.length, 2, "both minimum-length clips survive normalization");
  for (const c of tall.clips) ok(Math.abs((c.outPoint - c.inPoint) - MIN_CLIP) < 1e-9, `clip ${c.id} keeps its ${MIN_CLIP}s duration`);
  const w = planRenderWindows(tall);
  eq(w.length, 2, `two minimum-length clips split at the cut (${w.length} windows)`);
  ok(Math.abs(w[1].start - MIN_CLIP) < 1e-9, `split lands exactly on the cut (${w[1].start})`);
  ok(framesInMs(w[0]) >= 1 && framesInMs(w[1]) >= 1, `each window holds frames (${framesInMs(w[0])}, ${framesInMs(w[1])})`);
});
await test("long timelines are split into duration-bounded windows", () => {
  // One 300s clip fits the input cap in a single window, but windows are also
  // duration-bounded so the one-at-a-time ffmpeg lane frees up between passes
  // (a preview requested mid-export waits for one pass, not the whole export).
  const tl = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [
    { id: "long", assetId: "m0", track: "video", start: 0, inPoint: 0, outPoint: 300 },
  ] });
  const w = planRenderWindows(tl);
  ok(w.length >= Math.ceil(300 / 60), `300s clip is split into ${w.length} windows`);
  for (const win of w) ok(win.end - win.start <= 60 + 1e-6, `window [${win.start},${win.end}] is at most 60s`);
  for (let i = 1; i < w.length; i++) ok(Math.abs(w[i].start - w[i - 1].end) < 1e-6, "contiguous");
});

await test("an empty timeline is still a plain render error", () => {
  const tl = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [] });
  assert.throws(() => planRenderWindows(tl), /empty/i);
});

// ---------------------------------------------------------------------------
// 2. single-frame preview only opens clips active at the instant
// ---------------------------------------------------------------------------
await test("frame preview prunes to active clips", () => {
  const tl = manyClips(8);
  const assets8 = new Map(Array.from({ length: 8 }, (_, i) => [`m${i}`, asset(`m${i}`, `m${i}`, 30)]));
  const plan = buildRenderPlan(tl, assets8, WORK, WORK, "frame", path.join(WORK, "f.png"), { frameAt: 10.5, width: 320 });
  const opened = plan.args.filter((a) => a === "-i").length;
  // at t=10.5 only clips 3 and 4 are active (3s each)
  ok(opened <= 2, `frame at a single instant opens ${opened} inputs, not all 8`);
});

await test("a frame in a gap renders the background instead of erroring", async () => {
  const tl = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [
    { id: "a", assetId: "m0", track: "video", start: 0, inPoint: 0, outPoint: 1 },
    { id: "b", assetId: "m0", track: "video", start: 2, inPoint: 0, outPoint: 1 },
  ] });
  const assets1 = new Map([["m0", asset("m0", "m0", 5)]]);
  const plan = buildRenderPlan(tl, assets1, WORK, WORK, "gap", path.join(WORK, "g.png"), { frameAt: 1.5, width: 320 });
  ok(plan.args.includes("-map"), "plan builds for an instant between clips");
  const r = await runFfmpeg(plan.args, 1, () => {});
  eq(r.code, 0, `gap frame renders, stderr=${r.stderrTail.slice(-300)}`);
  ok(fs.existsSync(path.join(WORK, "g.png")), "png written");
});

// ---------------------------------------------------------------------------
// 3. real renders: windowed output matches single-pass output
// ---------------------------------------------------------------------------
const COLORS = ["red", "green", "blue", "yellow", "cyan", "magenta", "orange", "purple"];
for (let i = 0; i < COLORS.length; i++) {
  ff(["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=${COLORS[i]}:s=320x180:d=4:r=24`, "-f", "lavfi", "-i", `sine=frequency=${300 + i * 60}:duration=4`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-f", "mp4", path.join(WORK, `m${i}`)]);
}
const mediaAssets = new Map(COLORS.map((_, i) => [`m${i}`, asset(`m${i}`, `m${i}`, 4)]));

// 8 sequential clips with fades, genuinely overlapping dissolves (the from-clip
// extends 0.6s past the next clip's start), fractional non-frame-aligned cut
// points, source trims, a typewriter caption whose reveal spans the whole
// timeline (so it is mid-animation at every window join), and an audio bed
// whose volume is animated up from zero — the ONLY audio source, since the
// video clips are muted: the shape of timeline that used to die on the free-tier
// container.
const complex = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, assetId: `m${i}`, track: "video", start: i * 3 + 0.17, inPoint: 0.3, outPoint: 3.9,
    fadeIn: 0.4, fadeOut: 0.4, muted: true,
    ...(i > 0 ? { transitionIn: { fromClipId: `c${i - 1}`, type: "dissolve", duration: 0.6 } } : {}),
  })),
  { id: "t0", assetId: "", track: "overlay", text: "burn-in caption", start: 0, inPoint: 0, outPoint: 24.77,
    textReveal: { mode: "typewriter", duration: 20, delay: 2 } },
  { id: "bed", assetId: "m0", track: "audio", start: 0, inPoint: 0, outPoint: 24.77, volume: 0,
    keyframes: { volume: [{ time: 0, value: 0 }, { time: 2, value: 1 }] } },
] });
const RENDER_OPTS = { quality: "standard" as const, fps: 30 };

await test("windowed render matches the single-pass render", async () => {
  // A tighter budget forces this timeline into several windows (the default
  // 512MB budget fits all 8 inputs in one pass at this resolution).
  process.env.VIDEOFORGE_RENDER_BUDGET_MB = "256";
  try {
  const windows = planRenderWindows(complex, RENDER_OPTS);
  ok(windows.length > 1, `timeline is split into ${windows.length} windows`);
  // the dissolves genuinely activate (an incoming transition needs the overlap)
  ok(complex.clips.filter((c) => incomingTransition(complex, c)).length === 7, "all seven dissolves are active");
  // the caption animation is mid-flight at every window join
  const cap = complex.clips.find((c) => c.id === "t0")!;
  for (let i = 1; i < windows.length; i++) {
    const t = windows[i].start;
    ok(t > cap.textReveal!.delay && t < cap.textReveal!.delay + cap.textReveal!.duration,
      `typewriter is mid-animation at join ${i} (${t}s inside [${cap.textReveal!.delay}, ${cap.textReveal!.delay + cap.textReveal!.duration}])`);
  }

  // reference: single pass (the old path, unchanged for simple timelines)
  const single = path.join(WORK, "single.mp4");
  const planS = buildRenderPlan(complex, mediaAssets, WORK, WORK, "single", single, RENDER_OPTS);
  const rS = await runFfmpeg(planS.args, planS.total, () => {});
  eq(rS.code, 0, `single pass ok: ${rS.stderrTail.slice(-400)}`);

  // windowed: video chunks + one audio pass + concat, like runRenderWindowed
  const chunks: string[] = [], temp: string[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const chunk = path.join(WORK, `seg${i}.mp4`);
    const plan = buildRenderPlan(complex, mediaAssets, WORK, WORK, `seg${i}`, chunk, { ...RENDER_OPTS, window: w });
    temp.push(...plan.tempFiles);
    const r = await runFfmpeg(plan.args, plan.total, () => {});
    eq(r.code, 0, `window ${i} ok: ${r.stderrTail.slice(-400)}`);
    chunks.push(chunk);
  }
  const total = windows[windows.length - 1].end;
  const audioFile = path.join(WORK, "aud.m4a");
  const planA = buildRenderPlan(complex, mediaAssets, WORK, WORK, "aud", audioFile, { ...RENDER_OPTS, window: { start: 0, end: total, audioOnly: true } });
  temp.push(...planA.tempFiles);
  const rA = await runFfmpeg(planA.args, planA.total, () => {});
  eq(rA.code, 0, `audio pass ok: ${rA.stderrTail.slice(-400)}`);

  const list = path.join(WORK, "list.txt");
  fs.writeFileSync(list, chunks.map((c) => `file '${c}'`).join("\n"));
  const out = path.join(WORK, "windowed.mp4");
  const rC = await runFfmpeg(["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", list, "-i", audioFile, "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", out], 1, () => {});
  eq(rC.code, 0, `concat ok: ${rC.stderrTail.slice(-400)}`);

  // same duration, same frame count, near-identical pixels
  const dS = probe(single), dW = probe(out);
  ok(Math.abs(parseFloat(dS.format.duration) - parseFloat(dW.format.duration)) < 0.2, `durations match (${dS.format.duration} vs ${dW.format.duration})`);
  const fS = frameCount(single), fW = frameCount(out);
  eq(fS, fW, `frame counts match (${fS} vs ${fW})`);
  ok(dW.streams.some((s: any) => s.codec_type === "audio"), "audio present in windowed render");
  // and it is actually audible after the volume ramp (the video clips are
  // muted, so the only sound source is the keyframed bed)
  const vol = meanVolume(out);
  ok(vol > -45, `audio bed is audible after its ramp (mean volume ${vol}dB)`);
  const p = psnr(single, out);
  ok(p > 40, `windowed render is pixel-faithful to the single pass (psnr ${p}dB)`);

  // per-join check: the frames around every window boundary must match the
  // single pass too, not just the whole-video average — on BOTH sides of the
  // join, comparing every extracted frame.
  for (let i = 1; i < windows.length; i++) {
    const t = windows[i].start;
    const a = framesAround(single, t), b = framesAround(out, t);
    ok(a.length === b.length && a.length >= 3, `join ${i} at ${t}s extracted ${a.length} frames`);
    const jp = joinPsnr(a, b);
    ok(jp > 35, `frames around join ${i} (${t}s) match (worst-frame psnr ${jp}dB)`);
  }
  } finally { process.env.VIDEOFORGE_RENDER_BUDGET_MB = ""; }
});

function meanVolume(file: string, from = 3): number {
  // measured from `from` seconds in, past the audio bed's 0..2s volume ramp,
  // so the number reflects the ramped-up bed and not the silent lead-in
  const r = spawnSync("ffmpeg", ["-ss", String(from), "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  if (!m) throw new Error(`volumedetect failed: ${r.stderr.slice(-300)}`);
  return parseFloat(m[1]);
}

/** Extract frames on both sides of a time point (input seek + decode). */
function framesAround(file: string, t: number): string[] {
  const dir = fs.mkdtempSync(path.join(WORK, "join-"));
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.max(0, t - 0.08)), "-i", file, "-frames:v", "6", path.join(dir, "f%02d.png")], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`framesAround failed: ${r.stderr.slice(-200)}`);
  return fs.readdirSync(dir).sort().map((n) => path.join(dir, n));
}
function joinPsnr(a: string[], b: string[]): number {
  // compare every corresponding frame around the join, not just the first
  let worst = Infinity;
  for (let i = 0; i < a.length; i++) {
    const r = spawnSync("ffmpeg", ["-v", "info", "-i", a[i], "-i", b[i], "-filter_complex", "[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8" });
    const m = r.stderr.match(/average:([\d.]+|inf)/);
    if (!m) throw new Error(`joinPsnr failed: ${r.stderr.slice(-300)}`);
    worst = Math.min(worst, m[1] === "inf" ? Infinity : parseFloat(m[1]));
  }
  return worst;
}

// ---------------------------------------------------------------------------
// 4. renderProject cleans its temp files (bug 7)
// ---------------------------------------------------------------------------
await test("renderProject deletes its temp files when it settles", async () => {
  const { renderProject } = await import("../server/render-job");
  const tmp = fs.mkdtempSync(path.join(WORK, "job-"));
  const tl = normalizeTimeline({ fps: 24, resolution: { width: 320, height: 180 }, clips: [
    { id: "t", assetId: "", track: "overlay", text: "cleanup probe", start: 0, inPoint: 0, outPoint: 1 },
  ] });
  await renderProject({ timeline: tl, assets: new Map(), mediaDir: tmp, tmpDir: tmp, jobId: "clean1", outPath: path.join(WORK, "clean1.mp4"), options: {}, onProgress: () => {} });
  const left = fs.readdirSync(tmp);
  eq(left.length, 0, `tmp dir empty after renderProject (left: ${left.join(",")})`);
});

// ---------------------------------------------------------------------------
// 5. boot reconciliation of interrupted render jobs (bug 5)
// ---------------------------------------------------------------------------
await test("startup reconciliation marks interrupted jobs terminal", async () => {
  const db = path.join(WORK, "reconcile.db");
  process.env.VIDEOFORGE_DB = db;
  // bust the module cache so the fresh DB path is picked up
  const storage = await import(`../server/storage.ts?bust=${Date.now()}`);
  const s = storage as any;
  const mk = (id: string, status: string) => s.storage.createRenderJob({ id, projectId: "p", status, progress: 0, outputPath: null, error: null, createdAt: 1, updatedAt: 1 });
  mk("j-done", "done"); mk("j-rendering", "rendering"); mk("j-queued", "queued"); mk("j-error", "error");
  const n = s.reconcileInterruptedRenderJobs();
  eq(n, 2, "two interrupted jobs found");
  eq(s.storage.getRenderJob("j-rendering").status, "error");
  ok(/interrupted by server restart/.test(s.storage.getRenderJob("j-rendering").error), "error names the restart and suggests requeueing");
  eq(s.storage.getRenderJob("j-queued").status, "error", "a queued job that never started is also terminal");
  eq(s.storage.getRenderJob("j-done").status, "done", "finished jobs untouched");
  eq(s.storage.getRenderJob("j-error").status, "error", "already-failed jobs untouched");
});

// ---------------------------------------------------------------------------
// 6. end to end: a dense timeline renders through the API on the windowed path
// ---------------------------------------------------------------------------
await test("API: dense timeline renders via windowed passes and finishes", async () => {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const DB = path.join(WORK, "e2e.db");
  const PORT_E2E = 5214;
  const OUT = fs.openSync(path.join(WORK, "server.log"), "w");
  let server: ChildProcess | null = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT_E2E), NODE_ENV: "development", VIDEOFORGE_RENDER_BUDGET_MB: "256" },
    stdio: ["ignore", OUT, OUT],
    detached: true,
  });
  const kill = () => { try { process.kill(-server!.pid!, "SIGKILL"); } catch {} };
  process.on("exit", kill);
  try {
    const H2 = (p: string) => `http://127.0.0.1:${PORT_E2E}${p}`;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try { const r = await fetch(H2("/api/health")); if (r.ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    const adminKey = fs.readFileSync(path.join(ROOT, "data", "OWNER_KEY.txt"), "utf8").match(/^(vf_admin_[a-f0-9]+)$/m)?.[1];
    ok(!!adminKey, "admin key available");
    const AUTH = { Authorization: `Bearer ${adminKey}` };

    // upload the 8 colour/tone clips
    const ids: string[] = [];
    for (let i = 0; i < COLORS.length; i++) {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(path.join(WORK, `m${i}`))], { type: "video/mp4" }), `m${i}.mp4`);
      const r = await fetch(H2("/api/media/upload"), { method: "POST", headers: AUTH, body: fd });
      eq(r.status, 201, `upload ${i} ok`);
      const body = await r.json() as any;
      ids.push(body.assets[0].id);
    }

    const makeProject = async (clips: any[]) => {
      const r = await fetch(H2("/api/projects"), { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ name: "dense", timeline: { fps: 24, resolution: { width: 320, height: 180 }, clips } }) });
      const b = await r.json() as any;
      return b.id as string;
    };

    // guardrail: 24 clips stacked at the same moment is rejected before a job
    // exists (the default budget caps this resolution at ~21 inputs per pass)
    const denseId = await makeProject(Array.from({ length: 24 }, (_, i) => ({ assetId: ids[i % ids.length], track: "video", start: 0, inPoint: 0, outPoint: 4 })));
    {
      const r = await fetch(H2("/api/renders"), { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: denseId }) });
      eq(r.status, 400, "too-dense timeline is rejected with 400");
      const b = await r.json() as any;
      ok(/simultaneous/.test(b.message), `guardrail message names the limit: ${b.message}`);
    }

    // the renderable 8-clip timeline with fades, dissolves, a caption, and an
    // audio bed whose volume animates up from zero (regression: the windowed
    // path must still include its audio in the export). The video clips are
    // muted so the bed is the ONLY audio source — if the windowed path drops
    // it, the export is silent and this test fails on volume, not just streams.
    const goodId = await makeProject([
      ...Array.from({ length: 8 }, (_, i) => ({
        assetId: ids[i], track: "video", start: i * 3 + 0.17, inPoint: 0.3, outPoint: 3.9,
        fadeIn: 0.4, fadeOut: 0.4, muted: true,
        ...(i > 0 ? { transitionIn: { fromClipId: `x${i - 1}`, type: "dissolve", duration: 0.6 } } : {}),
      })).map((c: any, i: number) => ({ ...c, id: `x${i}` })),
      { id: "cap", assetId: "", track: "overlay", text: "e2e caption", start: 0, inPoint: 0, outPoint: 24.77 },
      { id: "bed", assetId: ids[0], track: "audio", start: 0, inPoint: 0, outPoint: 24.77, volume: 0,
        keyframes: { volume: [{ time: 0, value: 0 }, { time: 2, value: 1 }] } },
    ]);
    const jr = await fetch(H2("/api/renders"), { method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: goodId, options: { quality: "standard" } }) });
    eq(jr.status, 201, "render accepted");
    const job = await jr.json() as any;
    let final: any = null;
    let worstFrameMs = 0;
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const s = await (await fetch(H2(`/api/renders/${job.jobId}`), { headers: AUTH })).json();
      // While the export is running, request frames: the ffmpeg lane must answer
      // them between render passes (they queue behind at most one window).
      if (s.status === "rendering") {
        const t0 = Date.now();
        const fr = await fetch(H2(`/api/projects/${goodId}/frame?t=1&width=320`), { headers: AUTH });
        if (fr.ok) worstFrameMs = Math.max(worstFrameMs, Date.now() - t0);
      }
      if (s.status !== "queued" && s.status !== "rendering") { final = s; break; }
    }
    ok(final, "render reached a terminal state");
    eq(final?.status, "done", `render done (error: ${final?.error})`);
    ok(final?.progress === 1, "progress reported as complete");
    ok(worstFrameMs > 0, "at least one frame was requested while the render was running");
    ok(worstFrameMs < 30000, `frame previews during the render stayed responsive (worst ${worstFrameMs}ms)`);
    const dl = await fetch(H2(`/api/renders/${job.jobId}/download`), { headers: AUTH });
    eq(dl.status, 200, "download works");
    const outFile = path.join(WORK, "e2e-out.mp4");
    fs.writeFileSync(outFile, Buffer.from(await dl.arrayBuffer()));
    const d = probe(outFile);
    ok(Math.abs(parseFloat(d.format.duration) - 24.77) < 0.5, `duration ≈ 24.77s (got ${d.format.duration})`);
    ok(d.streams.some((s: any) => s.codec_type === "audio"), "audio in the exported file");
    ok(meanVolume(outFile) > -45, `exported audio bed is audible after its ramp (${meanVolume(outFile)}dB)`);
    ok(frameCount(outFile) >= 24 * 24 - 2, `frame count ≈ 576 (got ${frameCount(outFile)})`);
  } finally { kill(); }
});

console.log(failed ? `\n${failed} FAILED` : `\n${passed} checks passed`);
process.exit(failed ? 1 : 0);
