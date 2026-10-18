import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { sanitizeRenderOptions, RENDER_QUALITIES, presetWidth } from "../shared/render-options";
import { buildRenderPlan } from "../server/render";
import { normalizeClip, normalizeTimeline } from "../shared/timeline";

let checks = 0;
const check = (fn: () => void) => { fn(); checks++; };

// ---------------------------------------------------------------- sanitizeRenderOptions
check(() => assert.deepEqual(sanitizeRenderOptions(undefined), {}));
check(() => assert.deepEqual(sanitizeRenderOptions("junk"), {}));
check(() => assert.deepEqual(sanitizeRenderOptions({ quality: "high" }), { quality: "high" }));
check(() => assert.deepEqual(sanitizeRenderOptions({ quality: "constructor" }), {}), "prototype keys must not pass as quality names");
check(() => assert.deepEqual(sanitizeRenderOptions({ quality: "toString" }), {}));
check(() => assert.deepEqual(sanitizeRenderOptions({ quality: 42 }), {}));
check(() => assert.deepEqual(sanitizeRenderOptions({ width: 1281 }), { width: 1280 }), "odd widths round to even");
check(() => assert.deepEqual(sanitizeRenderOptions({ width: 100 }), {}), "width below 256 is dropped");
check(() => assert.deepEqual(sanitizeRenderOptions({ width: 8192 }), {}), "width above 4096 is dropped");
check(() => assert.deepEqual(sanitizeRenderOptions({ fps: 12 }), { fps: 12 }));
check(() => assert.deepEqual(sanitizeRenderOptions({ fps: 11 }), {}), "fps below 12 is dropped");
check(() => assert.deepEqual(sanitizeRenderOptions({ fps: 61 }), {}), "fps above 60 is dropped");
check(() => assert.deepEqual(sanitizeRenderOptions({ audio: false }), { audio: false }));
check(() => assert.deepEqual(sanitizeRenderOptions({ audio: "no" }), {}));

// ---------------------------------------------------------------- presetWidth
check(() => assert.equal(presetWidth(1920, 1080, 1080), 1920), "landscape 1080p keeps width");
check(() => assert.equal(presetWidth(1080, 1920, 1080), 1080), "portrait 1080p targets the short side");
check(() => assert.equal(presetWidth(1080, 1920, 720), 720), "portrait 720p scales the width down");
check(() => assert.equal(presetWidth(1280, 720, 480), 854), "480p of a 720p project");

// ---------------------------------------------------------------- buildRenderPlan options
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render-options-"));
const out = (name: string) => path.join(dir, name);
// A fake video asset: the plan is only built, never run, so the file need not exist.
const videoAsset = { id: "v1", filename: "v.mp4", kind: "video", hasAudio: 1, width: 1280, height: 720, duration: 4 } as any;
const assets = new Map([["v1", videoAsset]]);
const tl = () => normalizeTimeline({
  resolution: { width: 1280, height: 720 },
  clips: [normalizeClip({ id: "c1", assetId: "v1", track: "video", start: 0, inPoint: 0, outPoint: 2 })],
});

function planFor(name: string, options: Record<string, unknown>) {
  const p = buildRenderPlan(tl(), assets, dir, dir, name, out(name), options as any);
  p.tempFiles.forEach((f) => fs.rmSync(f, { force: true }));
  return p;
}

check(() => {
  const p = planFor("default.mp4", {});
  const i = p.args.indexOf("-crf");
  assert.equal(p.args[i + 1], "20", "default CRF stays 20");
  assert.equal(p.args[p.args.indexOf("-preset") + 1], "veryfast", "default preset stays veryfast");
  assert.ok(p.args.includes("-c:a") && p.args.includes("aac"), "audio is kept by default");
});
check(() => {
  const p = planFor("draft.mp4", { quality: "draft" });
  assert.equal(p.args[p.args.indexOf("-crf") + 1], String(RENDER_QUALITIES.draft.crf));
  assert.equal(p.args[p.args.indexOf("-preset") + 1], "ultrafast");
});
check(() => {
  const p = planFor("high.mp4", { quality: "high" });
  assert.equal(p.args[p.args.indexOf("-crf") + 1], "18");
  assert.equal(p.args[p.args.indexOf("-preset") + 1], "faster");
});
check(() => {
  const p = planFor("noaudio.mp4", { audio: false });
  assert.ok(p.args.includes("-an"), "audio-off exports carry -an");
  assert.ok(!p.args.includes("aac"), "audio-off exports drop the aac codec");
  assert.ok(!p.filter.includes("[ca"), "audio-off plans skip the audio mix");
});
check(() => {
  const p = planFor("fps.mp4", { fps: 24 });
  assert.ok(p.filter.includes("fps=24"), "fps override reaches the filter graph");
});
check(() => {
  const p = planFor("wide.mp4", { width: 640 });
  assert.ok(p.filter.includes("s=640x360"), "width option scales the canvas");
});
check(() => {
  const p = planFor("combo.mp4", { quality: "draft", fps: 30, width: 1280 });
  assert.equal(p.args[p.args.indexOf("-crf") + 1], "27");
  assert.ok(p.filter.includes("fps=30"));
  assert.ok(p.filter.includes("s=1280x720"));
});

// ------------------------------------------------------- real configured renders
// Encode an actual source with audio, then verify a configured export's output
// dimensions, frame rate and audio state with ffprobe.
const ffmpegOk = spawnSync("ffmpeg", ["-version"], { timeout: 5000 }).status === 0;
if (!ffmpegOk) {
  console.warn("render-options.spec: ffmpeg absent, skipping real-render checks");
} else {
  const src = path.join(dir, "av1");
  const made = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-f", "mp4", `${src}.mp4`], { encoding: "utf8", timeout: 60000 });
  assert.equal(made.status, 0, made.stderr?.slice(-800));
  fs.copyFileSync(`${src}.mp4`, src); // assets are stored under their id, extension-free
  const avAssets = new Map([["av1", { id: "av1", filename: "av.mp4", kind: "video", hasAudio: 1, width: 320, height: 180, duration: 2 } as any]]);
  const avTl = () => normalizeTimeline({
    resolution: { width: 1280, height: 720 },
    clips: [normalizeClip({ id: "c1", assetId: "av1", track: "video", start: 0, inPoint: 0, outPoint: 2 })],
  });
  const render = (name: string, options: Record<string, unknown>) => {
    const target = path.join(dir, name);
    const plan = buildRenderPlan(avTl(), avAssets, dir, dir, name, target, options as any);
    try {
      const p = spawnSync("ffmpeg", plan.args, { encoding: "utf8", timeout: 120000 });
      assert.equal(p.status, 0, p.stderr?.slice(-1500));
      return target;
    } finally { plan.tempFiles.forEach((f) => fs.rmSync(f, { force: true })); }
  };
  const probe = (file: string) => {
    const p = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", file], { encoding: "utf8", timeout: 30000 });
    assert.equal(p.status, 0, p.stderr);
    return JSON.parse(p.stdout).streams as Array<Record<string, string>>;
  };
  check(() => {
    const streams = probe(render("configured.mp4", { quality: "draft", width: 640, fps: 24, audio: false }));
    const video = streams.find((s) => s.codec_type === "video");
    assert.ok(video, "video stream present");
    assert.equal(video.width, 640, "export width follows the option");
    assert.equal(video.height, 360, "export height keeps the aspect");
    assert.ok(Math.abs(parseFloat(video.r_frame_rate) - 24) < 0.1, `export fps is 24, got ${video.r_frame_rate}`);
    assert.ok(!streams.some((s) => s.codec_type === "audio"), "audio-off export has no audio stream");
  });
  check(() => {
    const streams = probe(render("withaudio.mp4", {}));
    assert.ok(streams.some((s) => s.codec_type === "audio"), "default export keeps the audio stream");
  });
}

console.log(`render-options.spec: ${checks} checks passed`);
