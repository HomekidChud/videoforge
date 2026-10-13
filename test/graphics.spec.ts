// ============================================================================
// Motion-graphics: model, ops, rasteriser, and API integration tests.
//
// Run:  npx tsx test/graphics.spec.ts
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

import { normalizeTimeline, type Timeline } from "@shared/timeline";
import { applyTimelineOp } from "@shared/editing";
import { normalizeGraphic, GRAPHIC_PRESETS, type Graphic } from "@shared/graphics";
import { rasterizeShape } from "../server/shape-raster";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const empty = (): Timeline => normalizeTimeline({ clips: [] });
const getAsset = () => undefined;

// ---------------------------------------------------------------------------
// 1. normalizeGraphic validation
// ---------------------------------------------------------------------------
console.log("1) normalizeGraphic validation");
{
  check("valid rect", normalizeGraphic({ kind: "rect", color: "#3d50f5", width: 0.5, height: 0.1 }).kind === "rect");
  let threw = false;
  try { normalizeGraphic({ kind: "triangle" }); } catch { threw = true; }
  check("unknown kind rejected", threw);
  threw = false;
  try { normalizeGraphic({ kind: "rect", color: "red" }); } catch { threw = true; }
  check("invalid colour rejected", threw);
  check("out-of-range width clamped", normalizeGraphic({ kind: "rect", width: 5 }).width === 1);
  check("bar normalises progress+trackColor", (() => {
    const g = normalizeGraphic({ kind: "bar", progress: 0.5, trackColor: "#111111" });
    return g.progress === 0.5 && g.trackColor === "#111111";
  })());
}

// ---------------------------------------------------------------------------
// 2. add_shape op
// ---------------------------------------------------------------------------
console.log("2) add_shape op");
let tl = empty();
{
  tl = applyTimelineOp(tl, { op: "add_shape", args: { id: "shape1", kind: "rect", color: "#3d50f5", start: 0, duration: 2, width: 0.4, height: 0.1 } }, getAsset);
  check("shape added", tl.clips.length === 1 && tl.clips[0].id === "shape1");
  check("clip has graphic", !!tl.clips[0].graphic);
  check("normalised through timeline", tl.clips[0].graphic!.color === "#3d50f5");

  let dup = false;
  try { applyTimelineOp(tl, { op: "add_shape", args: { id: "shape1", kind: "rect" } }, getAsset); } catch { dup = true; }
  check("duplicate id rejected", dup);
}

// ---------------------------------------------------------------------------
// 3. update_shape op
// ---------------------------------------------------------------------------
console.log("3) update_shape op");
{
  tl = applyTimelineOp(tl, { op: "update_shape", args: { clipId: "shape1", color: "#ff0000", width: 0.8 } }, getAsset);
  check("colour updated", tl.clips[0].graphic!.color === "#ff0000");
  check("width updated", tl.clips[0].graphic!.width === 0.8);
  let threw = false;
  try { applyTimelineOp(tl, { op: "update_shape", args: { clipId: "nonexistent", color: "#fff000" } }, getAsset); } catch { threw = true; }
  check("unknown clipId rejected", threw);
  threw = false;
  try { applyTimelineOp(tl, { op: "update_shape", args: { clipId: "shape1", kind: "triangle" } }, getAsset); } catch { threw = true; }
  check("invalid update rejected", threw);
}

// ---------------------------------------------------------------------------
// 4. apply_graphic_preset op
// ---------------------------------------------------------------------------
console.log("4) apply_graphic_preset op");
{
  tl = applyTimelineOp(tl, { op: "apply_graphic_preset", args: { preset: "lower-third", id: "lt1", start: 1, duration: 3 } }, getAsset);
  const lt = tl.clips.find((c) => c.id === "lt1");
  check("lower-third added", !!lt);
  check("lower-third is a rect", lt?.graphic?.kind === "rect");
  check("placement applied", lt?.x === 0.28 && lt?.y === 0.86);
  let threw = false;
  try { applyTimelineOp(tl, { op: "apply_graphic_preset", args: { preset: "no-such" } }, getAsset); } catch { threw = true; }
  check("unknown preset rejected", threw);
}

// ---------------------------------------------------------------------------
// 5. keyframes on width/height/progress
// ---------------------------------------------------------------------------
console.log("5) Animated shape properties");
{
  tl = applyTimelineOp(tl, { op: "set_keyframes", args: { clipId: "shape1", property: "width", keyframes: [{ time: 0, value: 0.1 }, { time: 2, value: 0.9 }] } }, getAsset);
  const shape = tl.clips.find((c) => c.id === "shape1")!;
  check("width keyframes stored", shape.keyframes?.width?.length === 2);
  // Normalise round-trip preserves them.
  const round = normalizeTimeline(JSON.parse(JSON.stringify(tl)));
  check("keyframes survive normalise", round.clips.find((c) => c.id === "shape1")?.keyframes?.width?.length === 2);
}

// ---------------------------------------------------------------------------
// 6. Rasteriser produces a valid PNG
// ---------------------------------------------------------------------------
console.log("6) Rasteriser");
{
  const tmp = fs.mkdtempSync("/tmp/vf-shape-");
  const p = path.join(tmp, "shape.png");
  const clip = tl.clips.find((c) => c.id === "shape1")!;
  rasterizeShape(clip, clip.graphic!, 64, 64, p);
  const buf = fs.readFileSync(p);
  check("PNG magic", buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  check("IHDR size", w === 64 && h === 64, { w, h });
  // Walk PNG chunks to find IDAT (length + type + data + crc).
  let off = 8, idatChunks: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") idatChunks.push(buf.subarray(off + 8, off + 8 + len));
    off += 8 + len + 4;
    if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = 64 * 4 + 1;
  // Pixel (32,32) should be inside the centred shape.
  const px = 32 * stride + 1 + 32 * 4;
  const r = raw[px], g = raw[px + 1], b = raw[px + 2], a = raw[px + 3];
  check("centre pixel has the shape's colour+alpha", r === 0xff && a === 255, { r, g, b, a });
  // Pixel (2,2) should be transparent (outside the shape).
  const outside = 2 * stride + 1 + 2 * 4;
  check("corner pixel transparent", raw[outside + 3] === 0, { a: raw[outside + 3] });
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 7. Presets are all renderable
// ---------------------------------------------------------------------------
console.log("7) All presets render");
{
  for (const preset of GRAPHIC_PRESETS) {
    const g = normalizeGraphic({ ...preset.graphic });
    const tmp = fs.mkdtempSync("/tmp/vf-preset-");
    const p = path.join(tmp, "p.png");
    try {
      rasterizeShape({ id: "x", assetId: "", track: "overlay", start: 0, inPoint: 0, outPoint: 1, volume: 1, muted: false, x: preset.placement.x, y: preset.placement.y, graphic: g }, g, 64, 64, p);
      const buf = fs.readFileSync(p);
      check(`preset ${preset.id} renders`, buf.length > 50);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
