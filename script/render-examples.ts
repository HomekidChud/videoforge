/**
 * Renders every example from shared/examples.ts with the real FFmpeg pipeline.
 *   npm run examples            -> docs/examples/<id>.gif + <id>.png (poster frame)
 * Also renders a transitions reel from generated test footage (no files needed).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildRenderPlan } from "../server/render";
import { EXAMPLES, buildExample } from "../shared/examples";
import { applyTimelineOp } from "../shared/editing";
import { normalizeTimeline, timelineDuration, type Timeline } from "../shared/timeline";
import type { Asset } from "../shared/schema";

const out = path.resolve(import.meta.dirname, "..", "docs", "examples");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-examples-"));
fs.mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const DEFAULT_WIDTH = 640;

function ffmpeg(args: string[]) {
  const p = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr.slice(-1500));
}

function renderTimeline(id: string, timeline: Timeline, assets = new Map<string, Asset>(), mediaDir = tmp, poster = 1, width = DEFAULT_WIDTH, fps = 15) {
  const mp4 = path.join(tmp, `${id}.mp4`), total = timelineDuration(timeline);
  const plan = buildRenderPlan(timeline, assets, mediaDir, tmp, id, mp4, { width });
  ffmpeg(plan.args);
  const palette = path.join(tmp, `${id}-palette.png`);
  ffmpeg(["-i", mp4, "-vf", `fps=${fps},palettegen=stats_mode=diff`, palette]);
  ffmpeg(["-i", mp4, "-i", palette, "-lavfi", `fps=${fps}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", path.join(out, `${id}.gif`)]);
  ffmpeg(["-i", mp4, "-ss", String(Math.min(poster, total - .1)), "-frames:v", "1", path.join(out, `${id}.png`)]);
  plan.tempFiles.forEach(f => fs.rmSync(f, { force: true }));
  console.log(`rendered ${id} (${total.toFixed(1)}s, ${(fs.statSync(path.join(out, `${id}.gif`)).size / 1024).toFixed(0)} KB gif)`);
}

try {
  for (const example of EXAMPLES) {
    if (only.length && !only.includes(example.id)) continue;
    renderTimeline(example.id, buildExample(example), undefined, tmp, /sampler/.test(example.id) || example.id === "loop-recipes" ? 2.2 : 1.8);
  }

  const reels: { id: string; types: string[]; colors: [string, string][] }[] = [
    { id: "transitions", types: ["wipe-up", "iris", "wipe-down"], colors: [["#f6a447", "#7c3aed"], ["#0ea5e9", "#22c55e"], ["#ef4444", "#facc15"], ["#14b8a6", "#6366f1"]] },
    { id: "transitions-2", types: ["barn-h", "barn-v", "diamond", "wipe-diagonal"], colors: [["#f472b6", "#6366f1"], ["#22c55e", "#0ea5e9"], ["#facc15", "#ef4444"], ["#7c3aed", "#14b8a6"], ["#f6a447", "#ec4899"]] },
  ];
  for (const reel of reels) {
    if (only.length && !only.includes(reel.id)) continue;
    // Generated gradient clips joined with each transition type (no files needed).
    const assets = new Map<string, Asset>();
    reel.colors.forEach(([c0, c1], i) => {
      const id = `${reel.id}-${i}`;
      ffmpeg(["-f", "lavfi", "-i", `gradients=s=640x360:c0=${c0}:c1=${c1}:speed=0.01`, "-t", "4", "-r", "30", "-pix_fmt", "yuv420p", "-f", "mp4", path.join(tmp, id)]);
      assets.set(id, { id, filename: `${id}.mp4`, kind: "video", mime: "video/mp4", duration: 4, hasAudio: 0, width: 640, height: 360, sizeBytes: 1, storagePath: id, thumbPath: null, createdAt: 0 });
    });
    let t = normalizeTimeline({ clips: [], resolution: { width: 1280, height: 720 }, fps: 30, background: "#000000" });
    const lookup = (id: string) => assets.get(id) && { kind: "video", duration: 4 };
    reel.colors.forEach((_, i) => { t = applyTimelineOp(t, { op: "add_clip", args: { id: `clip-${i}`, assetId: `${reel.id}-${i}`, track: "video", start: i * 3, inPoint: 0, outPoint: 3 } }, lookup); });
    reel.types.forEach((type, i) => { t = applyTimelineOp(t, { op: "set_transition", args: { clipId: `clip-${i + 1}`, type, duration: 1 } }, lookup); });
    t = applyTimelineOp(t, { op: "add_text_clip", args: { id: "tag", text: reel.types.join("  /  "), y: .9, textSize: 4, duration: timelineDuration(t) } }, lookup);
    renderTimeline(reel.id, t, assets, tmp, 2.5, 480, 10);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
