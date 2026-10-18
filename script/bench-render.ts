/**
 * Render benchmark. Builds a few representative compositions and times the real
 * FFmpeg pipeline for each, with no server involved.
 *
 *   npx tsx script/bench-render.ts              # all scenarios at 1920x1080
 *   npx tsx script/bench-render.ts motion 1280  # one scenario, custom width
 *
 * Output is one line per scenario: wall time, seconds of video per second of
 * rendering, and the size of the file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderProject } from "../server/render-job";
import { EXAMPLES, buildExample } from "../shared/examples";
import { applyTimelineOp, type TimelineOp } from "../shared/editing";
import { normalizeTimeline, timelineDuration, type Timeline } from "../shared/timeline";
import type { Asset } from "../shared/schema";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-bench-"));
const [, , only, widthArg] = process.argv;
const WIDTH = Number(widthArg) || 1920, HEIGHT = Math.round((WIDTH * 9) / 16 / 2) * 2;

function ffmpeg(args: string[]) {
  const p = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr.slice(-1500));
}

const assets = new Map<string, Asset>();
function makeVideo(id: string, seconds: number, audio = true): Asset {
  const file = path.join(tmp, id);
  ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=${WIDTH}x${HEIGHT}:r=30`, ...(audio ? ["-f", "lavfi", "-i", "sine=f=440:r=48000"] : []), "-t", String(seconds), "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", ...(audio ? ["-c:a", "aac"] : []), "-f", "mp4", file]);
  const a: Asset = { id, filename: `${id}.mp4`, kind: "video", mime: "video/mp4", duration: seconds, hasAudio: audio ? 1 : 0, width: WIDTH, height: HEIGHT, sizeBytes: 1, storagePath: file, thumbPath: null, createdAt: 0 };
  assets.set(id, a);
  return a;
}

function build(ops: TimelineOp[], background = "#17191b"): Timeline {
  let t = normalizeTimeline({ clips: [], resolution: { width: WIDTH, height: HEIGHT }, background, fps: 30 });
  const lookup = (id: string) => { const a = assets.get(id); return a && { kind: a.kind, duration: a.duration }; };
  for (const op of ops) t = applyTimelineOp(t, op, lookup as never);
  return t;
}

const scenarios: Record<string, () => Timeline> = {
  // 26 shapes and labels, every entrance preset: the heaviest motion graphics case.
  motion: () => { const e = EXAMPLES.find((x) => x.id === "preset-sampler")!; return build(e.ops, e.background); },
  // Springs, rotation and code driven motion.
  animation: () => { const e = EXAMPLES.find((x) => x.id === "loop-recipes")!; return build(e.ops, e.background); },
  // Templates one after another, like a real intro.
  intro: () => build(["lower-third", "kinetic-type", "stat-highlight", "progress-bar", "chapter-number"].flatMap((template, i) => [
    { op: "add_motion_template", args: { template, title: "Motion made simple", subtitle: "Rendered with FFmpeg", color: "#f6a447", start: i * 3, duration: 3, idPrefix: `m${i}` } },
  ]) as TimelineOp[]),
  // Footage with titles, a picture in picture and a dissolve between two shots.
  footage: () => {
    makeVideo("shotA", 8); makeVideo("shotB", 8);
    return build([
      { op: "add_clip", args: { id: "a", assetId: "shotA", track: "video", start: 0, inPoint: 0, outPoint: 6 } },
      { op: "add_clip", args: { id: "b", assetId: "shotB", track: "video", start: 5.5, inPoint: 0, outPoint: 6 } },
      { op: "set_transition", args: { clipId: "b", type: "dissolve", duration: 0.5 } },
      { op: "add_clip", args: { id: "pip", assetId: "shotB", track: "overlay", start: 1, inPoint: 0, outPoint: 4, x: 0.8, y: 0.2, scale: 0.3 } },
      { op: "add_text_clip", args: { id: "title", text: "Quarterly update", start: 0.5, duration: 4, y: 0.82, textSize: 6 } },
      { op: "apply_motion", args: { clipId: "title", preset: "rise", duration: 0.6 } },
      { op: "add_motion_template", args: { template: "lower-third", title: "Ada Lovelace", subtitle: "Mathematician", color: "#f6a447", start: 6, duration: 4, idPrefix: "lt" } },
    ] as TimelineOp[]);
  },
};

const names = only && scenarios[only] ? [only] : Object.keys(scenarios);
console.log(`resolution ${WIDTH}x${HEIGHT}, ${os.cpus().length} cores`);
for (const name of names) {
  const timeline = scenarios[name]();
  const seconds = timelineDuration(timeline);
  const out = path.join(tmp, `${name}.mp4`);
  const t0 = Date.now();
  await renderProject({ timeline, assets, mediaDir: tmp, tmpDir: tmp, jobId: name, outPath: out, options: {}, onProgress: () => {} });
  const wall = (Date.now() - t0) / 1000;
  console.log(`${name.padEnd(10)} ${seconds.toFixed(1)}s of video in ${wall.toFixed(1)}s wall  (${(seconds / wall).toFixed(2)}x realtime)  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
fs.rmSync(tmp, { recursive: true, force: true });
