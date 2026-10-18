// ============================================================================
// Regression tests for the add_clip / timeline outPoint default.
//
// Bug: clips added without an outPoint were silently capped at 5 seconds
// regardless of the asset's real length, so long audio stopped early in
// rendered output. The default is now the asset's full duration.
//
// Run:
//   npx tsx test/timeline-defaults.spec.ts
// ============================================================================

import assert from "node:assert/strict";
import { applyTimelineOp } from "../shared/editing";
import { clipDuration, normalizeTimeline, type Timeline } from "../shared/timeline";

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS: ${name}`); }
  catch (e: any) { failed++; console.log(`FAIL: ${name}: ${e.message}`); }
};

const empty = (fps = 30): Timeline => ({ version: 4, fps, resolution: { width: 640, height: 360 }, clips: [] });
const getAsset = (id: string) => ({ a20: { kind: "audio", duration: 20, width: 0, height: 0 }, v12: { kind: "video", duration: 12, width: 1280, height: 720 }, img: { kind: "image", duration: 0, width: 64, height: 64 } } as any)[id];

test("add_clip without outPoint uses the audio asset's full duration", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "a20" } }, getAsset);
  const c = tl.clips[0];
  assert.equal(c.outPoint, 20, "outPoint defaults to the asset duration");
  assert.equal(clipDuration(c), 20, "a 20s audio clip renders all 20 seconds");
});

test("add_clip without outPoint uses the video asset's full duration", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "v12" } }, getAsset);
  assert.equal(tl.clips[0].outPoint, 12);
  assert.equal(clipDuration(tl.clips[0]), 12);
});

test("add_clip with a nonzero inPoint still plays to the end of the asset", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "a20", inPoint: 5 } }, getAsset);
  const c = tl.clips[0];
  assert.equal(c.inPoint, 5);
  assert.equal(c.outPoint, 20, "outPoint is the absolute end of the source window");
  assert.equal(clipDuration(c), 15);
});

test("an explicit outPoint is never overridden", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "a20", outPoint: 3 } }, getAsset);
  assert.equal(tl.clips[0].outPoint, 3);
  assert.equal(clipDuration(tl.clips[0]), 3);
});

test("images keep the 5-second display default", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "img" } }, getAsset);
  assert.equal(clipDuration(tl.clips[0]), 5);
});

test("normalizeTimeline with an asset resolver applies the same default", () => {
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 640, height: 360 }, clips: [{ assetId: "a20", track: "audio", start: 0 }] }, (id) => {
    const a = getAsset(id);
    return a && a.kind !== "image" && a.duration > 0 ? a.duration : undefined;
  });
  assert.equal(tl.clips[0].outPoint, 20, "raw timelines saved without an outPoint keep the asset's full length");
});

test("normalizeTimeline without a resolver keeps the old 5-second fallback", () => {
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 640, height: 360 }, clips: [{ assetId: "a20", track: "audio", start: 0 }] });
  assert.equal(clipDuration(tl.clips[0]), 5, "the browser client (no asset access) is unchanged");
});

test("speed still shortens the displayed duration of a full-length clip", () => {
  const tl = applyTimelineOp(empty(), { op: "add_clip", args: { assetId: "a20", speed: 2 } }, getAsset);
  const c = tl.clips[0];
  assert.equal(c.outPoint, 20);
  assert.equal(clipDuration(c), 10, "20s of source at 2x speed displays as 10s");
});

console.log(failed ? `\n${failed} FAILED` : `\n${passed} checks passed`);
process.exit(failed ? 1 : 0);
