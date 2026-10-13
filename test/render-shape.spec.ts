// ============================================================================
// FFmpeg integration test: render a timeline with a motion-graphics shape and
// verify the output contains the shape's colour.
//
// Requires ffmpeg on PATH (the repo already depends on it for rendering).
// Run:  npx tsx test/render-shape.spec.ts
// ============================================================================

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { normalizeTimeline, type Timeline } from "@shared/timeline";
import { applyTimelineOp } from "@shared/editing";
import { buildRenderPlan } from "../server/render";
import { rasterizeShape } from "../server/shape-raster";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean, detail?: any) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
};

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
if (!hasFfmpeg) {
  console.error("ffmpeg not on PATH — skipping render test");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. Build a timeline with an animated shape.
// ---------------------------------------------------------------------------
let tl: Timeline = normalizeTimeline({ clips: [] });
tl = applyTimelineOp(tl, { op: "add_shape", args: {
  id: "shape1", kind: "rect", color: "#ff0000",
  start: 0, duration: 2, width: 0.5, height: 0.25,
} }, () => undefined);
// Animate width 0.1 → 0.9 over the 2s.
tl = applyTimelineOp(tl, { op: "set_keyframes", args: {
  clipId: "shape1", property: "width",
  keyframes: [{ time: 0, value: 0.1 }, { time: 2, value: 0.9 }],
} }, () => undefined);

console.log("1) buildRenderPlan produces a valid plan");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render-"));
const outPath = path.join(tmp, "out.mp4");
try {
  const plan = buildRenderPlan(tl, new Map(), tmp, tmp, "test-job", outPath, {});
  check("plan references temp PNG", plan.tempFiles.some((f: string) => f.endsWith(".png")));
  check("plan filter has overlay for shape", plan.filter.includes("overlay"));

  // Run ffmpeg with the plan's args.
  const res = spawnSync("ffmpeg", plan.args, { stdio: "pipe", timeout: 60_000 });
  check("ffmpeg exits 0", res.status === 0, res.stderr?.toString().slice(-500));
  if (res.status === 0) {
    check("output file exists", fs.existsSync(outPath));
    check("output non-empty", fs.statSync(outPath).size > 1000);
    // Extract raw RGB pixels — PNG extraction via pipe can be unreliable with
    // -ss on short videos; write to a temp file instead, deterministic.
    const frameRaw = path.join(tmp, "frame.raw");
    const ex = spawnSync("ffmpeg", ["-y", "-ss", "0.5", "-i", outPath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", frameRaw], { stdio: "ignore" });
    check("frame extraction ok", ex.status === 0, { status: ex.status });
    if (ex.status === 0 && fs.existsSync(frameRaw)) {
      const rgb = fs.readFileSync(frameRaw);
      const W = 1280, H = 720;
      check("raw frame is full size", rgb.length === W * H * 3, { len: rgb.length });
      if (rgb.length === W * H * 3) {
        let redPixels = 0;
        for (let i = 0; i < W * H; i++) {
          const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
          if (r > 200 && g < 100 && b < 100) redPixels++;
        }
        // The shape is animated width 0.1→0.9 over 2s. At t=0.5s the eased
        // width is ~0.3 → 384x180 = 69120 px. Accept anything in a sane band.
        check("frame contains red pixels (shape is visible)", redPixels >= 60000 && redPixels <= 130000, { redPixels });
      }
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 2. Static-shape render (no animation) — sanity that non-animated path works.
// ---------------------------------------------------------------------------
{
  console.log("2) Static shape renders");
  let t2: Timeline = normalizeTimeline({ clips: [] });
  t2 = applyTimelineOp(t2, { op: "add_shape", args: {
    id: "s", kind: "ellipse", color: "#00ff00", start: 0, duration: 1, width: 0.3, height: 0.3,
  } }, () => undefined);
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render2-"));
  const out2 = path.join(tmp2, "out.mp4");
  try {
    const plan = buildRenderPlan(t2, new Map(), tmp2, tmp2, "job2", out2, {});
    const res = spawnSync("ffmpeg", plan.args, { stdio: "pipe", timeout: 60_000 });
    check("static shape ffmpeg ok", res.status === 0, res.stderr?.toString().slice(-400));
    check("static output exists", res.status === 0 && fs.existsSync(out2) && fs.statSync(out2).size > 500);
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
