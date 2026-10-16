import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { compileBlocks, runCodeTool, runTool, normalizeOps, loadUserTools, saveUserTools, toolContext, BUILT_IN_TOOLS, OP_PARAMS, validateGraph, compileGraph, blocksToGraph, graphToCode, codeErrorLine, VF_HELPERS, TEMPLATE_DOCS, BLOCK_LIBRARY, BLOCK_GROUPS, convertOpArgs, selectCtxClips } from "../shared/custom-tools";
import { MOTION_PRESETS } from "../shared/presets";
import { normalizeTimeline } from "../shared/timeline";
import { applyTimelineOp } from "../shared/editing";
import { buildRenderPlan } from "../server/render";

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) { await fn(); checks++; }

const TOOL_TYPES = ["text", "number", "color", "select", "json"];

const ctx = {
  playhead: 2.5, duration: 12, selection: ["a", "b"], fps: 30,
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

// Runtime errors point at the user's line (line 1 is the injected "use strict").
await check("code error line hints", async () => {
  assert.throws(() => runCodeTool("const a = 1;\nconst b = 2;\nthrow new Error(\"boom\");", ctx), /code error: boom \(line 3\)/);
  assert.throws(() => runCodeTool("return notDefinedAtAll;", ctx), /code error: .*\(line 1\)/);
  assert.throws(() => runCodeTool("const ops = ;", ctx), /code error: /); // syntax error: no line hint
  assert.throws(() => runCodeTool("return vf.motion(\"\", \"spring\");", ctx), /needs a clip id/);
  assert.equal(codeErrorLine("code error: boom (line 3)"), 3);
  assert.equal(codeErrorLine("code error: boom"), null);
});

// The editor's reference catalog stays in sync with the vf API.
await check("vf reference catalog", async () => {
  assert.ok(VF_HELPERS.length >= 14, "every vf helper is documented");
  for (const h of VF_HELPERS) assert.ok(h.name.startsWith("vf.") && h.signature && h.description && h.example, `${h.name} malformed`);
  for (const t of TEMPLATE_DOCS) assert.ok(t.template.startsWith("$") && t.becomes && t.code, `${t.template} malformed`);
});

await check("graph compiles to code", async () => {
  const ctxA = { ...ctx, playhead: 4, selection: ["b"] };
  const ctxB = { ...ctx, playhead: 2.25, selection: ["b", "c"] };
  const graph: ToolGraph = {
    nodes: [
      { id: "start", type: "start" },
      { id: "t1", type: "action", block: "add-title", args: { text: "Your title", duration: 3, start: "$playhead", font: "inter" } },
      { id: "c1", type: "comment", text: "Now animate it" },
      { id: "m1", type: "action", block: "fade-in", args: { clipId: "$clipId", preset: "fade", duration: 0.8 } },
      { id: "r1", type: "repeat", count: 3 },
      { id: "s1", type: "action", block: "stagger", args: { clipIds: "$selection", start: "$playhead + $index * 0.4", delay: 0.15 } },
      { id: "f1", type: "frame", frame: 45 },
      { id: "cr1", type: "clipRef", clipId: "a" },
      { id: "m2", type: "action", block: "move", args: { clipId: "a", x: 0.3, y: 0.5 } },
      { id: "m3", type: "action", block: "grow", args: { clipId: "a", property: "scale", keyframes: "[{ \"time\": 0, \"value\": 0.2, \"easing\": \"back-out\" }, { \"time\": 0.8, \"value\": 1 }]" } },
      { id: "fn1", type: "function", name: "polish" },
      { id: "u1", type: "action", block: "color-text", args: { clipId: "$clipId", patch: "{ \"textColor\": \"#f6a447\" }" } },
      { id: "call1", type: "call", name: "polish" },
      { id: "e1", type: "eachClip", select: "text" },
      { id: "u2", type: "action", block: "bold-text", args: { clipId: "$clipId", patch: "{ \"font\": \"inter\", \"fontWeight\": 700 }" } },
      { id: "k1", type: "action", block: "spin", args: { clipId: "$clipId", property: "rotation", keyframes: "[{ \"time\": 0, \"value\": 0 }, { \"time\": 1.2, \"value\": 360 }]" } },
      { id: "adv", type: "action", op: "trim_clip", args: { clipId: "$clipId", inPoint: 0, outPoint: "$duration / 2" } },
      { id: "shape", type: "action", block: "add-shape", args: { duration: 3, shapeType: "ellipse", width: 0.3, height: 0.2, fill: "#4a8fd6" } },
    ],
    edges: [
      { id: "e1", source: "start", sourceHandle: "next", target: "t1", targetHandle: "in" },
      { id: "e2", source: "t1", sourceHandle: "next", target: "m1", targetHandle: "in" },
      { id: "e3", source: "m1", sourceHandle: "next", target: "r1", targetHandle: "in" },
      { id: "e4", source: "r1", sourceHandle: "body", target: "s1", targetHandle: "in" },
      { id: "e5", source: "r1", sourceHandle: "next", target: "m2", targetHandle: "in" },
      { id: "e6", source: "m2", sourceHandle: "next", target: "m3", targetHandle: "in" },
      { id: "e7", source: "m3", sourceHandle: "next", target: "call1", targetHandle: "in" },
      { id: "e8", source: "call1", sourceHandle: "next", target: "e1", targetHandle: "in" },
      { id: "e9", source: "e1", sourceHandle: "body", target: "u2", targetHandle: "in" },
      { id: "e10", source: "u2", sourceHandle: "next", target: "adv", targetHandle: "in" },
      { id: "e11", source: "fn1", sourceHandle: "body", target: "u1", targetHandle: "in" },
      { id: "e12", source: "f1", sourceHandle: "time", target: "t1", targetHandle: "param:start" },
      { id: "e13", source: "cr1", sourceHandle: "clip", target: "m1", targetHandle: "param:clipId" },
      { id: "e14", source: "e1", sourceHandle: "next", target: "shape", targetHandle: "in" },
      { id: "e15", source: "shape", sourceHandle: "next", target: "k1", targetHandle: "in" },
    ],
  };
  const opsA = compileGraph(graph, ctxA);
  const code = graphToCode(graph);
  assert.ok(code.includes("for (let i = 0; i < 3; i++)"), "repeat becomes a for loop");
  assert.ok(code.includes("const polish = (index, count, clipId) =>"), "function becomes a const arrow");
  assert.ok(code.includes("vf.clips.filter"), "eachClip filters vf.clips");
  assert.ok(code.includes("45 / Math.max(1, vf.fps)"), "frame connections convert at runtime");
  assert.deepEqual(runCodeTool(code, ctxA), opsA, "converted code produces identical ops (ctx A)");
  assert.deepEqual(runCodeTool(code, ctxB), compileGraph(graph, ctxB), "converted code produces identical ops (ctx B)");
  assert.deepEqual(runCodeTool(code, { ...ctxB, fps: 60 }), compileGraph(graph, { ...ctxB, fps: 60 }), "fps changes are runtime-faithful");
});

// The animation expansion: motion groups, from/to keyframe synthesis, text effects.
await check("motion and animation blocks", async () => {
  const ids = BLOCK_LIBRARY.map((b) => b.id);
  for (const id of ["motion-entrances", "motion-exits", "motion-attention", "motion-springy", "motion-camera", "animate-property", "slide-in-left", "slide-in-right", "rise-up", "drop-down", "zoom-in", "spin-in", "fade-in-soft", "fade-out-soft", "draw-on", "pulse-glow", "parallax", "typewriter", "reveal-words", "reveal-lines", "color-cycle-text", "stop-text-effects", "speed-up", "slow-mo", "reverse-motion", "retime-motion"]) {
    assert.ok(ids.includes(id), `${id} is in the library`);
  }
  // Every motion preset option the palette offers exists in the engine.
  const engineIds = MOTION_PRESETS.map((p) => p.id);
  for (const block of BLOCK_LIBRARY.filter((b) => b.op === "apply_motion" && b.id.startsWith("motion-"))) {
    const options = (block.params.find((p) => p.key === "preset")?.options ?? []);
    assert.ok(options.length >= 2, `${block.id} offers presets`);
    for (const o of options) assert.ok(engineIds.includes(o), `${block.id}: preset "${o}" exists in MOTION_PRESETS`);
  }
  // Animate-property blocks carry the full parameter set.
  const ap = BLOCK_LIBRARY.find((b) => b.id === "animate-property");
  assert.ok(ap && ap.params.some((p) => p.key === "property" && (p.options ?? []).includes("volume")), "property options include volume");
  assert.ok(ap && ap.params.some((p) => p.key === "easing" && (p.options ?? []).includes("bounce-out")), "easing options include bounce-out");
});

await check("from/to blocks synthesize keyframes", async () => {
  const graph: ToolGraph = {
    nodes: [
      { id: "start", type: "start" },
      { id: "a", type: "action", block: "animate-property", args: { clipId: "a", property: "scale", from: 0.2, to: 1, duration: 1, delay: 0.5, easing: "back-out" } },
      { id: "b", type: "action", block: "drop-down", args: { clipId: "a", property: "y", from: 0.35, to: 0.5, duration: 1, easing: "bounce-out" } },
    ],
    edges: [
      { id: "e1", source: "start", sourceHandle: "next", target: "a", targetHandle: "in" },
      { id: "e2", source: "a", sourceHandle: "next", target: "b", targetHandle: "in" },
    ],
  };
  const ops = compileGraph(graph, ctx);
  assert.deepEqual(ops[0].args.keyframes, [{ time: 0.5, value: 0.2, easing: "back-out" }, { time: 1.5, value: 1 }]);
  const bounce = ops[1].args.keyframes as { time: number; value: number }[];
  assert.equal(bounce.length, 15, "bounce easing is sampled into 15 linear keyframes");
  assert.equal(bounce[0].value, 0.35);
  assert.equal(bounce[14].value, 0.5);
  assert.ok(bounce.every((k) => k.value >= 0.35 - 1e-9 && k.value <= 0.35 + (0.5 - 0.35) * 1.5), "bounce stays near the from..to range");
  // The converted code runs the same ops.
  const code = graphToCode(graph);
  assert.ok(code.includes("vf.animateProperty"), "from/to blocks become vf.animateProperty");
  assert.deepEqual(runCodeTool(code, ctx), ops);
  // Non-numeric from/to is rejected with a readable error.
  assert.throws(() => convertOpArgs("set_keyframes", { from: "abc", to: 1 }), /from and to must be numbers/);
});

await check("text effect blocks synthesize patches", async () => {
  const graph: ToolGraph = {
    nodes: [
      { id: "start", type: "start" },
      { id: "t", type: "action", block: "typewriter", args: { clipId: "a", __textRevealMode: "typewriter", duration: 2, delay: 0.5 } },
      { id: "c", type: "action", block: "color-cycle-text", args: { clipId: "a", __colorCycle: "#e74c3c, #f1c40f, #2ecc71", cycleDuration: 3 } },
    ],
    edges: [
      { id: "e1", source: "start", sourceHandle: "next", target: "t", targetHandle: "in" },
      { id: "e2", source: "t", sourceHandle: "next", target: "c", targetHandle: "in" },
    ],
  };
  const ops = compileGraph(graph, ctx);
  assert.deepEqual(ops[0].args.textReveal, { mode: "typewriter", duration: 2, delay: 0.5 });
  assert.deepEqual(ops[1].args.textColorCycle, { steps: ["#e74c3c", "#f1c40f", "#2ecc71"], duration: 3 });
  const code = graphToCode(graph);
  assert.ok(code.includes("vf.textEffect") && code.includes("vf.colorCycle"), "text blocks use the vf helpers");
  assert.deepEqual(runCodeTool(code, ctx), ops);
  // The vf helpers work directly in code tools too.
  const direct = runCodeTool("return [vf.textEffect(\"a\", \"words\", { duration: 2 }), vf.colorCycle(\"a\", [\"#e74c3c\", \"#f1c40f\"], 2)];", ctx);
  assert.deepEqual(direct[0].args.textReveal, { mode: "words", duration: 2, delay: 0 });
  assert.deepEqual(direct[1].args.textColorCycle, { steps: ["#e74c3c", "#f1c40f"], duration: 2 });
  assert.throws(() => runCodeTool("return [vf.colorCycle(\"a\", [\"#e74c3c\"], 2)];", ctx), /at least two colours/);
});

await check("animation validation is live", async () => {
  const graph = (args: Record<string, unknown>, block = "animate-property"): ToolGraph => ({
    nodes: [
      { id: "start", type: "start" },
      { id: "a", type: "action", block, args },
    ],
    edges: [{ id: "e1", source: "start", sourceHandle: "next", target: "a", targetHandle: "in" }],
  });
  const issues = (g: ToolGraph) => validateGraph(g, ctx).filter((i) => i.level === "error");
  assert.equal(issues(graph({ clipId: "a", property: "scale", from: 0, to: 1 })).length, 0, "valid animate-property has no errors");
  assert.ok(issues(graph({ clipId: "a", property: "nope", from: 0, to: 1 })).some((i) => /property/i.test(i.message)), "unknown property is flagged");
  assert.ok(issues(graph({ clipId: "a", property: "scale", from: "abc", to: 1 })).some((i) => /numbers/i.test(i.message)), "non-numeric from/to is flagged");
  assert.ok(issues(graph({ clipId: "a", property: "scale", from: 0, to: 1, easing: "warp" })).some((i) => /easing/i.test(i.message)), "unknown easing is flagged");
  const motion = { nodes: [{ id: "start", type: "start" }, { id: "m", type: "action", block: "motion-entrances", args: { clipId: "a", preset: "teleport" } }], edges: [{ id: "e1", source: "start", sourceHandle: "next", target: "m", targetHandle: "in" }] } as ToolGraph;
  assert.ok(validateGraph(motion, ctx).some((i) => i.level === "error" && /motion preset/i.test(i.message)), "unknown motion preset is flagged");
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



// ── Graph studio engine ──────────────────────────────────────────
const G = (nodes: any[], edges: any[]) => ({ nodes, edges });
const e = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({ id: `e-${source}-${target}-${Math.random().toString(36).slice(2, 6)}`, source, sourceHandle, target, targetHandle });
const pos = { x: 0, y: 0 };

// The studio graph compiles a chain from Start.
await check("compile graph chain", async () => {
  const ops = compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "t", type: "action", block: "add-title", args: { text: "Hi", start: "$playhead", duration: 2 }, position: pos },
  ], [e("s", "next", "t", "in")]), ctx);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "add_text_clip");
  assert.equal(ops[0].args.start, 2.5);
});

// Repeat and eachClip run their body; clip connections override param fields.
await check("graph repeat, eachClip and clip connection", async () => {
  const ops = compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "r", type: "repeat", count: 2, position: pos },
    { id: "m", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
    { id: "each", type: "eachClip", select: "shape", position: pos },
    { id: "u", type: "action", block: "fade-in", args: { clipId: "a", duration: 1 }, position: pos },
    { id: "clip", type: "clipRef", clipId: "b", select: "shape", position: pos },
  ], [
    e("s", "next", "r", "in"), e("r", "body", "m", "in"), e("r", "next", "each", "in"),
    e("each", "body", "u", "in"), e("clip", "clip", "u", "param:clipId"),
  ]), ctx);
  assert.equal(ops.length, 3); // 2 spins + 1 fade-in for clip b (connected)
  assert.deepEqual(ops[2].args, { clipId: "b", duration: 1 });
});

// A frame node connects into a time field and becomes seconds at the project fps.
await check("graph frame connection becomes seconds", async () => {
  const run = (frame: number) => compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "f", type: "frame", frame, position: pos },
    { id: "t", type: "action", block: "add-title", args: { text: "x", duration: 2 }, position: pos },
  ], [e("s", "next", "t", "in"), e("f", "time", "t", "param:start")]), ctx);
  assert.equal(run(60)[0].args.start, 2); // 60 frames / 30 fps
  assert.ok(Math.abs((run(1)[0].args.start as number) - 1 / 30) < 1e-9); // frame 1 is not rounded away
  assert.ok(Math.abs((run(29)[0].args.start as number) - 29 / 30) < 1e-9);
});

// A repeat can only have one first block in its body.
await check("graph body multiplicity", async () => {
  const issues = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "r", type: "repeat", count: 2, position: pos },
    { id: "a", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
    { id: "b", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
  ], [e("s", "next", "r", "in"), e("r", "body", "a", "in"), e("r", "body", "b", "in")]), ctx);
  assert.ok(issues.some((i) => i.level === "error" && /one first block/.test(i.message)));
});

// Functions are defined by name and inlined at call sites.
await check("graph functions and calls", async () => {
  const ops = compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "c", type: "call", name: "intro", position: pos },
    { id: "fn", type: "function", name: "intro", position: pos },
    { id: "t", type: "action", block: "add-title", args: { text: "Intro" }, position: pos },
  ], [
    e("s", "next", "c", "in"), e("fn", "body", "t", "in"),
  ]), ctx);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].args.text, "Intro");
  assert.throws(() => compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "c", type: "call", name: "nope", position: pos },
  ], [e("s", "next", "c", "in")]), ctx), /no function called/);
});

// Validation errors block running: cycles, missing start, two successors.
await check("validate graph", async () => {
  const two = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "a", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
    { id: "b", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
  ], [e("s", "next", "a", "in"), e("s", "next", "b", "in")]), ctx);
  assert.ok(two.some((i) => i.level === "error" && /one block after/.test(i.message)));

  const noStart = validateGraph(G([{ id: "a", type: "action", block: "spin", args: { clipId: "a" }, position: pos }], []), ctx);
  assert.ok(noStart.some((i) => /Start block/.test(i.message)));

  const cycle = G([
    { id: "s", type: "start", position: pos },
    { id: "a", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
    { id: "b", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
  ], [e("s", "next", "a", "in"), e("a", "next", "b", "in"), e("b", "next", "a", "in")]);
  const cycleIssues = validateGraph(cycle, ctx);
  assert.ok(cycleIssues.some((i) => i.level === "error" && /loop/.test(i.message)));
  assert.throws(() => compileGraph(cycle, ctx), /loop|cycle|before it/);

  const unreachable = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "a", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
    { id: "lost", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
  ], [e("s", "next", "a", "in")]), ctx);
  assert.ok(unreachable.some((i) => i.level === "warning" && /not connected/.test(i.message)));

  const badJson = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "t", type: "action", block: "bold-text", args: { clipId: "a", patch: "{oops" }, position: pos },
  ], [e("s", "next", "t", "in")]), ctx);
  assert.ok(badJson.some((i) => i.level === "error" && /JSON/.test(i.message)));

  const recursion = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "c", type: "call", name: "f", position: pos },
    { id: "fn", type: "function", name: "f", position: pos },
    { id: "t", type: "action", block: "spin", args: { clipId: "a" }, position: pos },
  ], [e("s", "next", "c", "in"), e("fn", "body", "t", "in"), e("t", "next", "c", "in")]), ctx);
  assert.ok(recursion.some((i) => i.level === "error" && /itself/.test(i.message)));
});

// Old nested tools migrate to the graph without changing behaviour.
await check("blocks migrate to graph", async () => {
  const graph = blocksToGraph([
    { kind: "comment", text: "note" },
    { kind: "op", op: "add_text_clip", args: { text: "Hi" } },
    { kind: "repeat", count: 2, blocks: [{ kind: "op", op: "remove_clip", args: { clipId: "a" } }] },
  ]);
  assert.ok(graph.nodes.some((n) => n.type === "start"));
  assert.equal(graph.nodes.filter((n) => n.type === "repeat").length, 1);
  const ops = compileGraph(graph, ctx);
  assert.equal(ops.length, 3); // 1 add + 2 removes
  assert.equal(ops[0].args.text, "Hi");
});

// runTool prefers the graph when present.
await check("runTool with graph", async () => {
  const graph = G([
    { id: "s", type: "start", position: pos },
    { id: "t", type: "action", block: "add-title", args: { text: "G", start: "$playhead", duration: 1 }, position: pos },
  ], [e("s", "next", "t", "in")]);
  const ops = runTool({ id: "x", name: "g", description: "", mode: "blocks", graph } as any, ctx);
  assert.equal(ops.length, 1);
});

// The graph engine enforces the same 100-op cap.
await check("graph op limit", async () => {
  const nodes: any[] = [{ id: "s", type: "start", position: pos }];
  const edges: any[] = [];
  for (let i = 0; i < 60; i++) {
    const id = `r${i}`;
    nodes.push({ id, type: "repeat", count: 3, position: pos }, { id: `a${i}`, type: "action", block: "spin", args: { clipId: "a" }, position: pos });
    edges.push(e(i === 0 ? "s" : `a${i - 1}`, "next", id, "in"), e(id, "body", `a${i}`, "in"));
  }
  assert.throws(() => compileGraph(G(nodes, edges), ctx), /more than 100 operations/);
});

console.log(`custom-tools.spec: ${checks} checks passed`);

// ── Edit tools: friendly blocks that change clips you already have ──
const ectx = {
  ...ctx,
  clips: [
    { id: "a", kind: "text" as const, start: 0, duration: 4, color: "#e74c3c", text: "Hello world" },
    { id: "b", kind: "shape" as const, start: 1, duration: 4, color: "#f6a447" },
    { id: "c", kind: "media" as const, start: 2, duration: 4 },
  ],
};

await check("edit blocks in the palette", async () => {
  const ids = ["edit-move", "edit-scale", "edit-rotate", "edit-flip", "edit-mirror", "edit-align", "edit-snap", "edit-crop", "edit-opacity", "edit-filter", "edit-brightness", "edit-contrast", "edit-saturation", "edit-blur", "edit-speed", "edit-duration", "edit-volume", "edit-mute", "edit-fade-in-sound", "edit-fade-out-sound", "edit-track", "edit-front", "edit-back", "edit-layer-up", "edit-layer-down", "edit-copy-offset", "edit-replace-text"];
  for (const id of ids) {
    const block = BLOCK_LIBRARY.find((b) => b.id === id);
    assert.ok(block, `${id} is in the library`);
    assert.equal(block?.group, "Edit", `${id} is in the Edit group`);
    assert.ok(block?.description, `${id} has a friendly description`);
    assert.ok(block?.params.length, `${id} has params`);
  }
  assert.ok((BLOCK_GROUPS as readonly string[]).includes("Edit"), "Edit is a palette group");
  assert.ok(OP_PARAMS["align_clips"] && OP_PARAMS["snap_to_grid"], "new ops are in the catalog");
});

await check("palette categories cover every block", async () => {
  for (const block of BLOCK_LIBRARY) {
    assert.ok((BLOCK_GROUPS as readonly string[]).includes(block.group), `${block.id} sits in a known category`);
  }
  for (const group of BLOCK_GROUPS) {
    assert.ok(BLOCK_LIBRARY.some((b) => b.group === group), `${group} has at least one block`);
  }
});

await check("edit blocks compile, coerce and convert identically", async () => {
  const graph: ToolGraph = {
    nodes: [
      { id: "start", type: "start" },
      { id: "bright", type: "action", block: "edit-brightness", args: { clipId: "a", brightness: "0.2" } },
      { id: "flip", type: "action", block: "edit-mirror", args: { clipId: "a", flipX: "true" } },
      { id: "align", type: "action", block: "edit-align", args: { clipIds: "a,b", mode: "distribute-h" } },
      { id: "snap", type: "action", block: "edit-snap", args: { clipIds: "$selection", grid: "0.25" } },
      { id: "copy", type: "action", block: "edit-copy-offset", args: { clipId: "a", dx: "0.05", dy: "0" } },
      { id: "track", type: "action", block: "edit-back", args: { clipId: "a", direction: "back" } },
    ],
    edges: [
      { id: "e1", source: "start", sourceHandle: "next", target: "bright", targetHandle: "in" },
      { id: "e2", source: "bright", sourceHandle: "next", target: "flip", targetHandle: "in" },
      { id: "e3", source: "flip", sourceHandle: "next", target: "align", targetHandle: "in" },
      { id: "e4", source: "align", sourceHandle: "next", target: "snap", targetHandle: "in" },
      { id: "e5", source: "snap", sourceHandle: "next", target: "copy", targetHandle: "in" },
      { id: "e6", source: "copy", sourceHandle: "next", target: "track", targetHandle: "in" },
    ],
  };
  const ops = compileGraph(graph, ectx);
  assert.deepEqual(ops[0].args, { clipId: "a", brightness: 0.2 }, "string numbers become numbers");
  assert.deepEqual(ops[1].args, { clipId: "a", flipX: true }, "string booleans become booleans");
  assert.deepEqual(ops[2].args, { clipIds: ["a", "b"], mode: "distribute-h" }, "clip id lists become arrays");
  assert.deepEqual(ops[3].args, { clipIds: ["a", "b"], grid: 0.25 });
  assert.deepEqual(ops[4].args, { clipId: "a", dx: 0.05, dy: 0 });
  assert.deepEqual(ops[5].args, { clipId: "a", direction: "back" });
  // The converted code produces the exact same operations.
  const code = graphToCode(graph);
  assert.ok(code.includes("vf.update"), "direct fields use vf.update");
  assert.deepEqual(runCodeTool(code, ectx), ops, "edit blocks convert to identical code");
});

await check("for-each colour and text filters", async () => {
  const walk = (select: string) => compileBlocks([{ kind: "eachClip", select, blocks: [{ kind: "op", op: "update_clip", args: { clipId: "$clipId" } }] }], ectx);
  assert.deepEqual(walk("colour:#e74c3c").map((o) => o.args.clipId), ["a"], "colour filter matches the red text clip");
  assert.deepEqual(walk("contains:world").map((o) => o.args.clipId), ["a"], "text filter matches by content");
  assert.equal(walk("contains:").length, 0, "an empty phrase matches nothing");
  // An invalid colour is flagged live.
  const issues = validateGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "e", type: "eachClip", select: "colour:red", position: pos },
  ], [e("s", "next", "e", "in")]), ectx);
  assert.ok(issues.some((i) => i.level === "error" && /clip filter/.test(i.message)));
  // The graph compiles and converts to the same ops as the generated code.
  const graph = G([
    { id: "s", type: "start", position: pos },
    { id: "f", type: "eachClip", select: "colour:#e74c3c", position: pos },
    { id: "u", type: "action", block: "edit-brightness", args: { clipId: "$clipId", brightness: 0.1 }, position: pos },
  ], [e("s", "next", "f", "in"), e("f", "body", "u", "in")]);
  const ops = compileGraph(graph, ectx);
  assert.deepEqual(ops.map((o) => o.args.clipId), ["a"]);
  const code = graphToCode(graph);
  assert.ok(code.includes("c.color"), "the colour filter appears in the code");
  assert.deepEqual(runCodeTool(code, ectx), ops, "colour-filtered code runs identically");
});

await check("edit ops apply to a timeline", async () => {
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "t1", assetId: "", track: "overlay", text: "One", start: 0, outPoint: 3, volume: 1, muted: false, x: 0.11, y: 0.52 },
    { id: "t2", assetId: "", track: "overlay", text: "Two", start: 0, outPoint: 3, volume: 1, muted: false, x: 0.77, y: 0.48 },
    { id: "t3", assetId: "", track: "overlay", text: "Three", start: 0, outPoint: 3, volume: 1, muted: false, x: 0.44, y: 0.61 },
  ] });
  const apply = (op: any) => applyTimelineOp(tl, op, () => undefined);
  // Distribute spreads the clips evenly across the frame.
  const spread = apply({ op: "align_clips", args: { clipIds: ["t1", "t2", "t3"], mode: "distribute-h" } });
  assert.deepEqual(spread.clips.map((c) => c.x ?? 0.5), [0.25, 0.5, 0.75]); // 0.5 is the default position
  // Align left lines them up on the leftmost clip.
  const left = apply({ op: "align_clips", args: { clipIds: ["t1", "t2", "t3"], mode: "left" } });
  assert.deepEqual(left.clips.map((c) => c.x ?? 0.5), [0.25, 0.25, 0.25]); // fixed frame position
  // Snap to grid rounds positions.
  const snapped = apply({ op: "snap_to_grid", args: { clipIds: ["t1", "t2", "t3"], grid: 0.25 } });
  assert.deepEqual(snapped.clips.map((c) => c.x ?? 0.5), [0, 0.75, 0.5]);
  assert.deepEqual(snapped.clips.map((c) => c.y ?? 0.5), [0.5, 0.5, 0.5]);
  // Duplicate with offset nudges the copy.
  const copied = apply({ op: "duplicate_clip", args: { clipId: "t1", dx: 0.1, dy: -0.1 } });
  const dupe = copied.clips.find((c) => c.id !== "t1" && c.text === "One");
  assert.ok(dupe, "the copy exists");
  assert.equal(dupe?.x, 0.21);
  assert.equal(dupe?.y, 0.42);
  assert.equal(dupe?.start, 3, "the copy starts after the original ends");
  // Audio clips cannot be aligned, and bad input throws readably.
  const audioTl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "s1", assetId: "snd", track: "audio", start: 0, outPoint: 3, volume: 1, muted: false },
  ] });
  assert.throws(() => applyTimelineOp(audioTl, { op: "align_clips", args: { clipIds: ["s1"], mode: "left" } }, () => undefined), /no visual clips/);
  assert.throws(() => apply({ op: "snap_to_grid", args: { clipIds: ["t1"], grid: 9 } }), /grid must be/);
});

await check("layering, crop and motion easing", async () => {
  // True stacking order: z decides who draws on top within a track.
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "t1", assetId: "", track: "overlay", text: "One", start: 0, outPoint: 3, volume: 1, muted: false },
    { id: "t2", assetId: "", track: "overlay", text: "Two", start: 0, outPoint: 3, volume: 1, muted: false },
  ] });
  const paintOrder = (t: any) => t.clips.filter((c: any) => c.track === "overlay").sort((a: any, b: any) => ((a.z ?? 0) - (b.z ?? 0)) || (a.start - b.start)).map((c: any) => c.id);
  const front = applyTimelineOp(tl, { op: "move_layer", args: { clipId: "t1", direction: "front" } }, () => undefined);
  assert.deepEqual(paintOrder(front), ["t2", "t1"], "front puts the clip on top of its track");
  const down = applyTimelineOp(tl, { op: "move_layer", args: { clipId: "t2", direction: "back" } }, () => undefined);
  assert.deepEqual(paintOrder(down), ["t2", "t1"], "back puts the clip at the bottom of its track");
  assert.throws(() => applyTimelineOp(tl, { op: "move_layer", args: { clipId: "nope", direction: "front" } }, () => undefined), /not found/);

  // One step swaps with exactly the next clip in paint order — even when ranks
  // are far apart, or when ties would make numeric steps ambiguous.
  const gap = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "a", assetId: "", track: "overlay", text: "A", start: 0, outPoint: 3, volume: 1, muted: false, z: 0 },
    { id: "b", assetId: "", track: "overlay", text: "B", start: 0, outPoint: 3, volume: 1, muted: false, z: 3 },
  ] });
  const fwd = applyTimelineOp(gap, { op: "move_layer", args: { clipId: "a", direction: "forward" } }, () => undefined);
  assert.deepEqual(paintOrder(fwd), ["b", "a"], "forward swaps past the next clip up, whatever the ranks");
  const back = applyTimelineOp(fwd, { op: "move_layer", args: { clipId: "a", direction: "backward" } }, () => undefined);
  assert.deepEqual(paintOrder(back), ["a", "b"], "backward swaps past the next clip down");

  // Tied ranks: three clips at z=0 — one step forward moves past exactly one.
  const tie = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "x", assetId: "", track: "overlay", text: "X", start: 0, outPoint: 3, volume: 1, muted: false },
    { id: "y", assetId: "", track: "overlay", text: "Y", start: 0, outPoint: 3, volume: 1, muted: false },
    { id: "z", assetId: "", track: "overlay", text: "Z", start: 0, outPoint: 3, volume: 1, muted: false },
  ] });
  const tied = applyTimelineOp(tie, { op: "move_layer", args: { clipId: "x", direction: "forward" } }, () => undefined);
  assert.deepEqual(paintOrder(tied), ["y", "x", "z"], "one step forward passes exactly one tied clip");
  const topEdge = applyTimelineOp(tie, { op: "move_layer", args: { clipId: "z", direction: "forward" } }, () => undefined);
  assert.deepEqual(paintOrder(topEdge), ["x", "y", "z"], "forward at the top changes nothing");
  // Text and shapes cannot hide on the video track, below the footage.
  assert.throws(() => applyTimelineOp(tl, { op: "move_clip", args: { clipId: "t1", track: "video" } }, () => undefined), /overlay track/);

  // The crop block expands its four trims into the crop box.
  const cropOps = compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "c", type: "action", block: "edit-crop", args: { clipId: "m", __crop: true, trimLeft: "0.1", trimRight: 0, trimTop: 0, trimBottom: "0.2" }, position: pos },
  ], [e("s", "next", "c", "in")]), ectx);
  assert.deepEqual(cropOps[0].args.crop, { x: 0.1, y: 0, w: 0.9, h: 0.8 });
  const cropCode = graphToCode(G([
    { id: "s", type: "start", position: pos },
    { id: "c", type: "action", block: "edit-crop", args: { clipId: "m", __crop: true, trimLeft: "0.1", trimRight: 0, trimTop: 0, trimBottom: "0.2" }, position: pos },
  ], [e("s", "next", "c", "in")]));
  assert.deepEqual(runCodeTool(cropCode, ectx), cropOps, "crop blocks convert to identical code");
  // And the op applies to a media clip.
  const mtl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "m", assetId: "vid", track: "video", start: 0, outPoint: 3, volume: 1, muted: false },
  ] });
  const cropped = cropOps.reduce((t, op) => applyTimelineOp(t, op, () => undefined), mtl);
  assert.deepEqual(cropped.clips[0].crop, { x: 0.1, y: 0, w: 0.9, h: 0.8 });
  // Text and shapes cannot be cropped — a readable error, nothing breaks.
  const ttl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [{ id: "t", assetId: "", track: "overlay", text: "Hi", start: 0, outPoint: 3, volume: 1, muted: false }] });
  assert.throws(() => applyTimelineOp(ttl, { op: "update_clip", args: { clipId: "t", crop: { x: 0, y: 0, w: 0.5, h: 0.5 } } }, () => undefined), /picture and video/);

  // Motion presets accept an easing that replaces the curves' own.
  const eased = applyTimelineOp(tl, { op: "apply_motion", args: { clipId: "t1", preset: "fade", easing: "back-out" } }, () => undefined);
  const easedKeys = Object.values(eased.clips.find((c) => c.id === "t1")?.keyframes ?? {});
  assert.ok(easedKeys.length > 0 && easedKeys.every((frames) => (frames as { easing?: string }[]).every((k) => k.easing === undefined || k.easing === "back-out")), "the easing replaces the preset's own");
  // "preset" leaves the curves untouched.
  const own = applyTimelineOp(tl, { op: "apply_motion", args: { clipId: "t1", preset: "fade", easing: "preset" } }, () => undefined);
  const ownKeys = Object.values(own.clips.find((c) => c.id === "t1")?.keyframes ?? {});
  assert.ok(ownKeys.length > 0 && ownKeys.some((frames) => (frames as { easing?: string }[]).some((k) => k.easing === "ease-out")), "preset keeps the built-in easing");

  // An opacity-only fade with an easing must not touch an existing x animation
  // or the x expression driving it — the preset owns only what it animates.
  const driven = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "d", assetId: "", track: "overlay", text: "D", start: 0, outPoint: 3, volume: 1, muted: false,
      keyframes: { x: [{ time: 0, value: 0.2, easing: "linear" }, { time: 1, value: 0.8, easing: "linear" }] },
      expressions: { x: "0.5+0.1*sin(t*2)" } },
  ] });
  const faded = applyTimelineOp(driven, { op: "apply_motion", args: { clipId: "d", preset: "fade", easing: "back-out" } }, () => undefined);
  const dc = faded.clips.find((c) => c.id === "d");
  assert.deepEqual(dc?.keyframes?.x, [{ time: 0, value: 0.2, easing: "linear" }, { time: 1, value: 0.8, easing: "linear" }], "the x keyframes survive the fade");
  assert.equal(dc?.expressions?.x, "0.5+0.1*sin(t*2)", "the x expression survives the fade");
  assert.ok((dc?.keyframes?.opacity ?? []).every((k) => k.easing === undefined || k.easing === "back-out"), "the fade's own curves take the easing");
});

await check("friendly fields validate live", async () => {
  const node = (args: Record<string, unknown>) => G([
    { id: "s", type: "start", position: pos },
    { id: "b", type: "action", block: "edit-brightness", args, position: pos },
  ], [e("s", "next", "b", "in")]);
  assert.ok(validateGraph(node({ clipId: "a", brightness: "abc" }), ectx).some((i) => i.level === "error" && /must be a number/.test(i.message)), "non-numeric brightness is flagged");
  assert.ok(validateGraph(node({ clipId: "a", brightness: "5" }), ectx).some((i) => i.level === "error" && /between -0.5 and 0.5/.test(i.message)), "out-of-range brightness is flagged");
  assert.equal(validateGraph(node({ clipId: "a", brightness: "0.2" }), ectx).filter((i) => i.level === "error").length, 0, "in-range brightness is clean");
  assert.ok(validateGraph(node({ clipId: "a", brightness: "$playhead" }), ectx).filter((i) => i.level === "error").length === 0, "templates are left alone");
});

await check("colour filters skip media, audio clips are walkable", async () => {
  // Media clips have no colour, so a white filter must not catch them.
  assert.equal(selectCtxClips("colour:#ffffff", ectx).length, 0, "media clips carry no colour");
  // Audio clips appear in the context and for-each can walk them.
  const atl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "snd", assetId: "snd", track: "audio", start: 0, outPoint: 3, volume: 1, muted: false },
    { id: "t", assetId: "", track: "overlay", text: "Hi", start: 0, outPoint: 3, volume: 1, muted: false },
  ] });
  const actx = toolContext(atl, 0, [], 3);
  assert.deepEqual(actx.clips.map((c) => c.kind), ["audio", "text"], "audio clips are included");
  const vol = compileBlocks([{ kind: "eachClip", select: "audio", blocks: [{ kind: "op", op: "update_clip", args: { clipId: "$clipId", volume: 0.5 } }] }], actx);
  assert.deepEqual(vol.map((o) => o.args.clipId), ["snd"], "for-each audio changes the sound clip");
  // An empty selection resolves to an empty list — and the converted code agrees.
  const emptyCtx = { ...ectx, selection: [] };
  const ops = compileGraph(G([
    { id: "s", type: "start", position: pos },
    { id: "a", type: "action", block: "edit-align", args: { clipIds: "$selection", mode: "center" }, position: pos },
  ], [e("s", "next", "a", "in")]), emptyCtx);
  assert.deepEqual(ops[0].args.clipIds, []);
  assert.deepEqual(runCodeTool(graphToCode(G([
    { id: "s", type: "start", position: pos },
    { id: "a", type: "action", block: "edit-align", args: { clipIds: "$selection", mode: "center" }, position: pos },
  ], [e("s", "next", "a", "in")])), emptyCtx), ops, "empty selections match between blocks and code");
});

console.log(`custom-tools.spec: ${checks} checks passed`);

await check("renderer stacks overlay visuals by z across types", async () => {
  // Mixed overlay visuals: a picture (z 0), a shape (z 5) and text (z -5).
  // One stacking order must run across all three kinds: text, then picture, then shape.
  const tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [
    { id: "vid", assetId: "v", track: "video", x: 0.5, y: 0.5, start: 0, outPoint: 4, crop: { x: 0.1, y: 0, w: 0.9, h: 0.8 } },
    { id: "pic", assetId: "i", track: "overlay", x: 0.3, y: 0.3, start: 0, outPoint: 4 },
    { id: "shp", track: "overlay", x: 0.5, y: 0.5, start: 0, outPoint: 4, z: 5, shape: { type: "rectangle", width: 0.2, height: 0.1, fill: "#ff0000" } },
    { id: "txt", track: "overlay", x: 0.5, y: 0.2, start: 0, outPoint: 4, z: -5, text: "Hi" },
  ] });
  const assets = new Map<any, any>([
    ["v", { id: "v", kind: "video", filename: "v.mp4", width: 1920, height: 1080, duration: 5 }],
    ["i", { id: "i", kind: "image", filename: "i.png", width: 800, height: 600, duration: 0 }],
  ]);
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(tmpdir() + "/vf-test-"));
  const plan = buildRenderPlan(tl, assets, dir, dir, "t", dir + "/out.mp4");
  const order: string[] = [];
  const re = /\[base\d+\]\[(cv|ct|cg)\d+\]overlay=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plan.filter))) order.push(m[1]);
  assert.deepEqual(order, ["cv", "ct", "cv", "cg"], "overlay visuals stack by z across media, shapes and text");
  // The crop keeps the layer box: cut, then padded back at its original offset.
  assert.match(plan.filter, /crop=\d+:\d+:\d+:\d+,pad=1280:720:\d+:\d+:color=black@0/, "crop is padded back into the layer box");
});
console.log(`custom-tools.spec: ${checks} checks passed`);
