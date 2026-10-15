import assert from "node:assert/strict";
import { compileBlocks, runCodeTool, runTool, normalizeOps, loadUserTools, saveUserTools, toolContext, BUILT_IN_TOOLS, OP_PARAMS } from "../shared/custom-tools";
import { normalizeTimeline } from "../shared/timeline";
import { applyTimelineOp } from "../shared/editing";

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) { await fn(); checks++; }

const TOOL_TYPES = ["text", "number", "color", "select", "json"];

const ctx = {
  playhead: 2.5, duration: 12, selection: ["a", "b"],
  clips: [
    { id: "a", kind: "text" as const, start: 0, duration: 4 },
    { id: "b", kind: "shape" as const, start: 1, duration: 4 },
    { id: "c", kind: "media" as const, start: 2, duration: 4 },
  ],
  resolution: { width: 1280, height: 720 },
};

// Blocks compile to ops, templates resolve, comments are skipped.
await check("compile blocks", async () => {
  const ops = compileBlocks([
    { kind: "comment", text: "ignored" },
    { kind: "op", op: "add_text_clip", args: { text: "At $playhead", start: "$playhead + 0.5", duration: 3 } },
  ], ctx);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "add_text_clip");
  assert.deepEqual(ops[0].args, { text: "At 2.5", start: 3, duration: 3 });
});

// Repeat iterates with $index and $count; eachClip walks clips by kind or selection.
await check("repeat and eachClip", async () => {
  const ops = compileBlocks([
    { kind: "repeat", count: 3, blocks: [{ kind: "op", op: "add_text_clip", args: { text: "Beat $index of $count", start: "$playhead + $index * 0.4" } }] },
  ], ctx);
  assert.equal(ops.length, 3);
  assert.equal(ops[2].args.text, "Beat 2 of 3");
  assert.equal(ops[2].args.start, 2.5 + 0.8);

  const texts = compileBlocks([{ kind: "eachClip", select: "text", blocks: [{ kind: "op", op: "update_clip", args: { clipId: "$clipId" } }] }], ctx);
  assert.deepEqual(texts.map((o) => o.args.clipId), ["a"]);

  const selected = compileBlocks([{ kind: "eachClip", select: "selected", blocks: [{ kind: "op", op: "remove_clip", args: { clipId: "$clipId" } }] }], ctx);
  assert.equal(selected.length, 2);

  const all = compileBlocks([{ kind: "eachClip", blocks: [{ kind: "op", op: "duplicate_clip", args: { clipId: "$clipId" } }] }], ctx);
  assert.equal(all.length, 3);
});

// Code tools see the vf API and must return operations.
await check("code tools", async () => {
  const ops = runCodeTool(`return [vf.addText({ text: "hi", duration: 2 })];`, ctx);
  assert.equal(ops[0].op, "add_text_clip");
  assert.equal(ops[0].args.start, 2.5); // defaults to the playhead
  assert.throws(() => runCodeTool(`return 42;`, ctx), /must return operations/);
  assert.throws(() => runCodeTool(`throw new Error("boom");`, ctx), /code error: boom/);
  const motion = runCodeTool(`return vf.motion("a", "spring", { duration: 1.2 });`, ctx);
  assert.deepEqual(motion[0].args, { clipId: "a", preset: "spring", duration: 1.2 });
  assert.throws(() => runCodeTool(`return vf.motion("", "spring");`, ctx), /needs a clip id/);
  // Selection is a copy: mutating it inside the tool does not leak.
  runCodeTool(`vf.selection.push("z"); return [];`, ctx);
  assert.equal(ctx.selection.length, 2);
});

// Generated ops actually run against the timeline, atomically.
await check("ops apply to a timeline", async () => {
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [] });
  const ops = runTool(BUILT_IN_TOOLS[0], ctx); // three beat titles
  assert.equal(ops.length, 6);
  const applied = ops.reduce((t, op) => applyTimelineOp(t, op, () => undefined), tl);
  assert.equal(applied.clips.length, 3);
  assert.deepEqual(applied.clips.map((c) => c.text), ["Beat 0", "Beat 1", "Beat 2"]);
  // The bold-all built-in updates only text clips.
  const tl2 = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [{ id: "t", assetId: "", track: "overlay", text: "Hello", start: 0, outPoint: 4, volume: 1, muted: false }, { id: "s", assetId: "", track: "overlay", start: 0, outPoint: 4, volume: 1, muted: false, shape: { type: "rectangle", width: 0.3, height: 0.2, fill: "#ffffff" } }] });
  const ops2 = runTool(BUILT_IN_TOOLS[1], toolContext(tl2, 0, [], 4));
  const applied2 = ops2.reduce((t, op) => applyTimelineOp(t, op, () => undefined), tl2);
  const text = applied2.clips.find((c) => c.id === "t")!;
  assert.equal(text.font, "inter");
  assert.equal(text.fontWeight, 700);
});

// Result validation caps batches at the API limit.
await check("normalizeOps guards", async () => {
  const many = Array.from({ length: 101 }, () => ({ op: "add_text_clip", args: {} }));
  assert.throws(() => normalizeOps(many), /at most 100/);
  assert.deepEqual(normalizeOps({ op: "add_text_clip", args: { text: "x" } }), [{ op: "add_text_clip", args: { text: "x" } }]);
  assert.throws(() => normalizeOps([{ op: "", args: {} }]), /must return operations/);
  assert.throws(() => normalizeOps([{ op: "x", args: [] }]), /needs an args object/);
});

// Persistence round-trips user tools and ignores junk.
await check("localStorage persistence", async () => {
  const store: Record<string, string> = {};
  const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  assert.deepEqual(loadUserTools(storage), []);
  saveUserTools([{ id: "u1", name: "My tool", description: "", mode: "code", code: "return [];" }], storage);
  const loaded = loadUserTools(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].code, "return [];");
  storage.setItem("vf.custom-tools.v1", "not json");
  assert.deepEqual(loadUserTools(storage), []);
  storage.setItem("vf.custom-tools.v1", JSON.stringify([{ name: "no mode" }, 5, null]));
  assert.deepEqual(loadUserTools(storage), []);
});

// Every curated op has editable params, and built-ins are valid tools.
await check("catalog well formed", async () => {
  for (const [op, params] of Object.entries(OP_PARAMS)) {
    assert.ok(params.length, `${op} needs params`);
    for (const p of params) assert.ok(p.key && p.label && TOOL_TYPES.includes(p.type), `${op}.${p.key} malformed`);
  }
  for (const tool of BUILT_IN_TOOLS) {
    assert.ok(tool.id && tool.name && tool.description);
    const ops = runTool(tool, ctx);
    assert.ok(Array.isArray(ops));
  }
});

// Flat shape fields nest into the shape object; clip id lists become arrays; JSON arrays parse.
await check("block arg conversion", async () => {
  const ops = compileBlocks([
    { kind: "op", op: "add_shape_clip", args: { shapeType: "ellipse", width: 0.3, height: 0.2, fill: "#f6a447" } },
    { kind: "op", op: "stagger_clips", args: { clipIds: "$selection", delay: "0.15" } },
    { kind: "op", op: "set_keyframes", args: { clipId: "a", property: "scale", keyframes: "[{ \"time\": 0, \"value\": 0 }]" } },
    { kind: "op", op: "add_text_clip", args: { text: "hi", start: "$playhead + 0.4", duration: "3" } },
  ], ctx);
  assert.deepEqual(ops[0].args.shape, { type: "ellipse", width: 0.3, height: 0.2, fill: "#f6a447" });
  assert.deepEqual(ops[1].args.clipIds, ["a", "b"]);
  assert.equal(ops[1].args.delay, 0.15, "numeric params become numbers");
  assert.deepEqual(ops[2].args.keyframes, [{ time: 0, value: 0 }], "JSON arrays parse");
  assert.equal(ops[3].args.start, 2.9, "template arithmetic is computed");
  assert.equal(ops[3].args.duration, 3, "numeric strings become numbers");
  assert.throws(() => compileBlocks([{ kind: "op", op: "set_keyframes", args: { clipId: "a", property: "x", keyframes: "not json" } }], ctx), /valid JSON/);
});

// Block expansion honours the 100-operation batch limit.
await check("block limit", async () => {
  const blocks: any[] = [{ kind: "repeat", count: 60, blocks: [{ kind: "op", op: "add_text_clip", args: { text: "x" } }, { kind: "op", op: "add_text_clip", args: { text: "y" } }] }];
  assert.throws(() => compileBlocks(blocks, ctx), /more than 100 operations/);
  const ok = compileBlocks([{ kind: "repeat", count: 50, blocks: [{ kind: "op", op: "add_text_clip", args: { text: "x" } }] }] as any, ctx);
  assert.equal(ok.length, 50);
});

console.log(`custom-tools.spec: ${checks} checks passed`);
