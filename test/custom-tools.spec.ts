import assert from "node:assert/strict";
import { compileBlocks, runCodeTool, runTool, normalizeOps, loadUserTools, saveUserTools, toolContext, BUILT_IN_TOOLS, OP_PARAMS, validateGraph, compileGraph, blocksToGraph, codeErrorLine, VF_HELPERS, TEMPLATE_DOCS } from "../shared/custom-tools";
import { normalizeTimeline } from "../shared/timeline";
import { applyTimelineOp } from "../shared/editing";

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
