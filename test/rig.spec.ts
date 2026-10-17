import assert from "node:assert/strict";
import { normalizeTimeline } from "../shared/timeline";
import { applyTimelineOp } from "../shared/editing";
import { runTool, toolContext, graphScope } from "../shared/custom-tools";
import {
  newAnimation, addParts, setParent, setPivot, setKey, clipPoseAt, localFromClip, bakeAnimation, spanOf, applyAnimationToClips,
  applyPreset, stickFigure, normalizeAnimation, loadAnimations, saveAnimations, animationsByName, wouldCycle, removePart, partTree, moveKey, trimToLength,
} from "../shared/rig";

let checks = 0;
function check(label: string, fn: () => void) { fn(); checks++; }
const res = { width: 1280, height: 720 };
const near = (a: number, b: number, eps = 1e-3, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

const tl = normalizeTimeline({
  resolution: res,
  clips: [
    { id: "arm", assetId: "", track: "overlay", start: 0, inPoint: 0, outPoint: 4, volume: 0, muted: true, text: "Arm", x: 0.5, y: 0.5 },
    { id: "hand", assetId: "", track: "overlay", start: 0, inPoint: 0, outPoint: 4, volume: 0, muted: true, text: "Hand", x: 0.6, y: 0.5 },
  ],
} as any);
const clips = tl.clips;

check("a root part with no parent bakes to exactly its own keys", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setKey(a, "arm", "x", 0, 0.5, "ease-out"); a = setKey(a, "arm", "x", 2, 0.8);
  const baked = bakeAnimation(a, clips.map(spanOf), res);
  assert.deepEqual(baked.arm.x, [{ time: 0, value: 0.5, easing: "ease-out" }, { time: 2, value: 0.8 }]);
  assert.equal(baked.arm.y, null, "untouched properties are cleared");
  assert.equal(baked.hand.x, null, "an untouched part stays untouched");
});

check("a child follows a rotating parent about the parent's joint", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setParent(a, "hand", "arm");
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 90);
  // At t=2 the arm has turned 90° clockwise about its centre; the hand sat 0.1 frame-widths to its right.
  const p = clipPoseAt(a, "hand", 2, res);
  near(p.rotation, 90, 1e-6, "rotation inherited");
  near(p.x * 1280, 0.5 * 1280, 0.01, "hand is now directly below the arm");
  near(p.y * 720, 0.5 * 720 + 0.1 * 1280, 0.01, "hand swung 128px down");
  const rest = clipPoseAt(a, "hand", 0, res);
  near(rest.x, 0.6, 1e-6); near(rest.y, 0.5, 1e-6);
});

check("a pivot makes the part itself orbit its joint", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), [clips[0]]);
  a = setPivot(a, "arm", 0, -0.1); // joint above the centre
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 180);
  const p = clipPoseAt(a, "arm", 2, res);
  near(p.y * 720, 0.5 * 720 - 0.2 * 720, 0.01, "centre swung to the other side of the joint");
  near(p.x, 0.5, 1e-6);
});

check("dragging a child on screen maps back to the right local pose", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setParent(a, "hand", "arm"); a = setPivot(a, "arm", 0.05, 0);
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 47);
  a = setKey(a, "arm", "scale", 0, 1); a = setKey(a, "arm", "scale", 2, 1.4);
  const local0 = { x: 0.62, y: 0.46, scale: 0.9, rotation: 12, opacity: 1 };
  let b = a;
  for (const [prop, v] of Object.entries(local0)) { b = setKey(b, "hand", prop as any, 0, v); b = setKey(b, "hand", prop as any, 2, v); }
  const world = clipPoseAt(b, "hand", 1.3, res);
  const back = localFromClip(b, "hand", 1.3, world, res);
  // convert expected local joint (pivot is 0 for the hand, so joint == centre)
  near(back.x, local0.x, 2e-3); near(back.y, local0.y, 2e-3); near(back.scale, local0.scale, 2e-3); near(back.rotation, local0.rotation, 0.02);
});

check("baking a child samples the arc and stays within 64 keys", () => {
  let a = addParts(newAnimation("a", "t", 0, 3), clips);
  a = setParent(a, "hand", "arm");
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 1.5, 90); a = setKey(a, "arm", "rotation", 3, 0);
  const baked = bakeAnimation(a, clips.map(spanOf), res);
  const xs = baked.hand.x!, rot = baked.hand.rotation!;
  assert.ok(xs.length > 4 && xs.length <= 64, `x keys ${xs.length}`);
  near(rot[Math.floor(rot.length / 2)].value > 80 ? 90 : 0, 90, 0.1, "mid rotation reaches 90");
  assert.ok(xs.every((k) => k.time >= 0 && k.time <= 4));
});

check("apply writes normalised keyframes and drops competing expressions", () => {
  const withExpr = clips.map((c) => (c.id === "arm" ? { ...c, expressions: { rotation: "wiggle(2, 4)" } } : c));
  let a = addParts(newAnimation("a", "t", 0, 2), withExpr);
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 30);
  const { clips: out, changed } = applyAnimationToClips(a, withExpr, res);
  assert.deepEqual(changed.sort(), ["arm", "hand"]);
  const arm = out.find((c) => c.id === "arm")!;
  assert.equal(arm.expressions, undefined);
  assert.equal(arm.keyframes!.rotation!.length, 2);
});

check("an animation shorter than the clip leaves the clip untouched after it, and starts mid-clip", () => {
  let a = addParts(newAnimation("a", "t", 1, 2), clips); // starts at 1s
  a = setKey(a, "arm", "x", 0, 0.2); a = setKey(a, "arm", "x", 2, 0.8);
  const baked = bakeAnimation(a, clips.map(spanOf), res);
  const k = baked.arm.x!;
  near(k[0].time, 1, 1e-6); near(k[k.length - 1].time, 3, 1e-6);
  near(k[0].value, 0.2); near(k[k.length - 1].value, 0.8);
});

check("cycles are refused", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setParent(a, "hand", "arm");
  assert.ok(wouldCycle(a, "arm", "hand"));
  assert.throws(() => setParent(a, "arm", "hand"), /ancestor/);
  assert.throws(() => setParent(a, "arm", "arm"), /ancestor/);
});

check("removing a part orphans its children and drops its track", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setParent(a, "hand", "arm"); a = setKey(a, "arm", "x", 0, 0.4);
  a = removePart(a, "arm");
  assert.equal(a.parts.length, 1); assert.equal(a.parts[0].parentId, undefined); assert.equal(a.tracks.arm, undefined);
  assert.equal(partTree(a).length, 1);
});

check("moving and trimming keys", () => {
  let a = addParts(newAnimation("a", "t", 0, 4), clips);
  a = setKey(a, "arm", "x", 1, 0.4); a = moveKey(a, "arm", "x", 1, 3);
  assert.equal(a.tracks.arm.x![0].time, 3);
  a = trimToLength(a, 2);
  assert.equal(a.length, 2); assert.equal(a.tracks.arm.x, undefined);
});

check("presets write keys relative to the rest pose", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = applyPreset(a, "bounce", ["arm"], res);
  const ys = a.tracks.arm.y!;
  assert.ok(ys.length >= 3); assert.ok(Math.min(...ys.map((k) => k.value)) < 0.5); near(ys[0].value, 0.5);
  a = applyPreset(a, "pop-in", ["hand"], res);
  assert.equal(a.tracks.hand.opacity![0].value, 0);
});

check("the stick figure is a valid rig that walks", () => {
  let n = 0;
  const fig = stickFigure(res, 0, 4, () => `p${n++}`);
  assert.equal(fig.clips.length, 10);
  let tl2 = normalizeTimeline({ resolution: res, clips: fig.clips } as any);
  let a = addParts(newAnimation("a", "walk", 0, 2), tl2.clips);
  for (const p of fig.parts) { a = setPivot(a, p.clipId, 0, p.pivotY); if (p.parentId) a = setParent(a, p.clipId, p.parentId); }
  a = applyPreset(a, "walk", a.parts.map((p) => p.clipId), res);
  const { clips: out } = applyAnimationToClips(a, tl2.clips, res);
  normalizeTimeline({ resolution: res, clips: out } as any); // must stay valid
  const shin = a.parts.find((p) => p.name === "Left shin")!;
  const thigh = a.parts.find((p) => p.name === "Left thigh")!;
  // The knee (thigh's lower joint) must stay attached to the thigh: shin joint moves with the thigh swing.
  const t0 = clipPoseAt(a, shin.clipId, 0, res), t1 = clipPoseAt(a, shin.clipId, 1, res);
  assert.ok(Math.abs(t0.x - t1.x) > 0.001, "shin travels with the thigh");
  assert.ok(thigh);
});

check("the rig_bake op bakes through the shared timeline engine", () => {
  let a = addParts(newAnimation("a", "t", 0, 2), clips);
  a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 30);
  const out = applyTimelineOp(tl, { op: "rig_bake", args: { animation: a } }, () => undefined);
  assert.equal(out.clips.find((c) => c.id === "arm")!.keyframes!.rotation!.length, 2);
  assert.throws(() => applyTimelineOp(tl, { op: "rig_bake", args: { animation: { ...a, parts: [{ clipId: "missing" }] } } }, () => undefined), /clip missing not found/);
});

check("rig_pose animates clips from where they are", () => {
  const out = applyTimelineOp(tl, { op: "rig_pose", args: { clipIds: ["arm", "hand"], rotation: 45, scale: 1.2, duration: 1, delay: 0.5, easing: "ease-out" } }, () => undefined);
  const arm = out.clips.find((c) => c.id === "arm")!;
  assert.deepEqual(arm.keyframes!.rotation!.map((k) => [k.time, k.value]), [[0.5, 0], [1.5, 45]]);
  assert.equal(arm.keyframes!.x, undefined);
});

check("rig_follow makes a child ride a parent's existing keyframes", () => {
  let t2 = applyTimelineOp(tl, { op: "set_keyframes", args: { clipId: "arm", property: "rotation", keyframes: [{ time: 0, value: 0 }, { time: 2, value: 90 }] } }, () => undefined);
  t2 = applyTimelineOp(t2, { op: "rig_follow", args: { childId: "hand", parentId: "arm" } }, () => undefined);
  const hand = t2.clips.find((c) => c.id === "hand")!;
  const last = hand.keyframes!.rotation!.at(-1)!;
  near(last.value, 90, 0.5); near(hand.keyframes!.y!.at(-1)!.value, 0.5 + (0.1 * 1280) / 720, 0.01, "hand swings below");
  assert.throws(() => applyTimelineOp(t2, { op: "rig_follow", args: { childId: "arm", parentId: "arm" } }, () => undefined), /itself/);
});

check("normalizeAnimation rejects bad input", () => {
  assert.throws(() => normalizeAnimation(null), /object/);
  assert.throws(() => normalizeAnimation({ length: 0.01, parts: [{ clipId: "a" }] }), /length/);
  assert.throws(() => normalizeAnimation({ length: 2, parts: [{ clipId: "a", parentId: "b" }] }), /unknown parent/);
  assert.throws(() => normalizeAnimation({ length: 2, parts: [{ clipId: "a", parentId: "b" }, { clipId: "b", parentId: "a" }] }), /cycle/);
  assert.throws(() => normalizeAnimation({ length: 2, parts: [{ clipId: "a" }], tracks: { a: { volume: [] } } }), /cannot animate/);
});

check("animations survive storage and skip damaged entries", () => {
  const mem: Record<string, string> = {};
  const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  let a = addParts(newAnimation("a", "Wave", 0, 2), clips); a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 1, 20);
  saveAnimations(store, "p1", [a, newAnimation("b", "Empty", 0, 1)]);
  mem["vf.animator.v1.p1"] = JSON.stringify([...JSON.parse(mem["vf.animator.v1.p1"]), { parts: "nope" }]);
  const back = loadAnimations(store, "p1");
  assert.equal(back.length, 2); assert.deepEqual(Object.keys(animationsByName(back)), ["Wave"]);
  assert.deepEqual(loadAnimations(store, "other"), []);
});

check("a block can play a saved animation by name", () => {
  let a = addParts(newAnimation("a", "Wave", 0, 2), clips); a = setKey(a, "arm", "rotation", 0, 0); a = setKey(a, "arm", "rotation", 2, 40);
  const ctx = toolContext(tl, 0, [], 4, animationsByName([a]));
  const ops = runTool({ id: "t", name: "t", description: "", mode: "blocks", graph: { nodes: [{ id: "start", type: "start" }, { id: "n", type: "action", block: "rig-play", args: { animation: "Wave" } }], edges: [{ id: "e", source: "start", sourceHandle: "next", target: "n", targetHandle: "in" }] } }, ctx);
  assert.equal(ops[0].op, "rig_bake");
  const out = applyTimelineOp(tl, ops[0], () => undefined);
  assert.equal(out.clips.find((c) => c.id === "arm")!.keyframes!.rotation!.length, 2);
  assert.throws(() => runTool({ id: "t", name: "t", description: "", mode: "blocks", graph: { nodes: [{ id: "start", type: "start" }, { id: "n", type: "action", block: "rig-play", args: { animation: "Nope" } }], edges: [{ id: "e", source: "start", sourceHandle: "next", target: "n", targetHandle: "in" }] } }, ctx), /No Animator animation called "Nope"/);
});

check("the green block's scope picks which clips the blocks work on", () => {
  const ctx = toolContext(tl, 0, ["arm"], 4);
  const g = (scope?: string) => ({ nodes: [{ id: "start", type: "start" as const, ...(scope ? { args: { scope } } : {}) }, { id: "n", type: "action" as const, block: "rig-pose", args: { clipIds: "$selection", rotation: 10 } }], edges: [{ id: "e", source: "start", sourceHandle: "next", target: "n", targetHandle: "in" }] });
  const ids = (scope?: string) => String((runTool({ id: "t", name: "t", description: "", mode: "blocks", graph: g(scope) }, ctx)[0].args as any).clipIds);
  assert.equal(ids(), "arm"); assert.equal(ids("selection"), "arm");
  assert.equal(ids("all"), "arm,hand"); assert.equal(ids("text"), "arm,hand"); assert.equal(ids("shape"), "");
  assert.equal(graphScope(g("nonsense")), "selection");
});

console.log(`rig: ${checks} checks passed`);
