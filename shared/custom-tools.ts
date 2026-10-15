/** Custom tools: user-authored timeline automations, written in JavaScript or assembled from blocks. */
import type { TimelineOp } from "./editing";
import type { Clip } from "./timeline";
import { MOTION_PRESETS } from "./presets";
import { ANIMATABLE, EASINGS } from "./animation";

export type ToolParamType = "text" | "number" | "color" | "select" | "json";
export type ToolParam = {
  key: string;
  label: string;
  type: ToolParamType;
  def: string | number;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

/** A block that runs one operation, repeats a group, walks the timeline's clips, or just documents. */
export type ToolBlock =
  | { kind: "op"; op: string; args?: Record<string, unknown> }
  | { kind: "repeat"; count: number; blocks: ToolBlock[] }
  | { kind: "eachClip"; select?: "all" | "text" | "shape" | "media" | "selected"; blocks: ToolBlock[] }
  | { kind: "comment"; text: string };

export type CustomTool = {
  id: string;
  name: string;
  description: string;
  mode: "blocks" | "code";
  blocks?: ToolBlock[];
  /** Full-screen studio graph (the current block format). */
  graph?: ToolGraph;
  code?: string;
  builtIn?: boolean;
};

/**
 * The studio graph: a plain, versioned model of nodes and connections,
 * independent of the canvas library that edits it.
 */
export type ToolGraphNode = {
  id: string;
  type: "start" | "action" | "repeat" | "eachClip" | "comment" | "clipRef" | "frame" | "function" | "call";
  /** Friendly block id for action nodes, e.g. "add-title". */
  block?: string;
  /** Raw operation name for advanced action nodes. */
  op?: string;
  args?: Record<string, unknown>;
  count?: number;
  select?: string;
  name?: string;
  text?: string;
  clipId?: string;
  /** Frame number at the project fps. */
  frame?: number;
  position?: { x: number; y: number };
};
export type ToolGraphEdge = { id: string; source: string; sourceHandle: string; target: string; targetHandle: string };
export type ToolGraph = { nodes: ToolGraphNode[]; edges: ToolGraphEdge[] };

/** Everything a tool can read about the edit when it runs. */
export type ToolContext = {
  /** Playhead position in seconds. */
  playhead: number;
  /** Timeline duration in seconds. */
  duration: number;
  /** Ids of the selected clips. */
  selection: string[];
  /** Every visual clip with its kind and timing. */
  clips: { id: string; kind: "text" | "shape" | "media"; start: number; duration: number; label?: string }[];
  /** Canvas size. */
  resolution: { width: number; height: number };
  /** Project fps, so frame blocks resolve to seconds. */
  fps: number;
};

export const TOOL_PARAM_TYPES: ToolParamType[] = ["text", "number", "color", "select", "json"];

/**
 * Curated argument editors for the block palette. Values may be literal or
 * template strings: $playhead, $duration, $index, $count, $clipId, $selection.
 */
export const OP_PARAMS: Record<string, ToolParam[]> = {
  add_text_clip: [
    { key: "text", label: "Text", type: "text", def: "New title" },
    { key: "start", label: "Start", type: "number", def: "$playhead", min: 0, max: 86400, step: 0.1 },
    { key: "duration", label: "Duration", type: "number", def: 4, min: 0.1, max: 3600, step: 0.1 },
    { key: "id", label: "Clip id", type: "text", def: "", placeholder: "auto" },
  ],
  add_shape_clip: [
    { key: "id", label: "Clip id", type: "text", def: "" , placeholder: "auto" },
    { key: "shapeType", label: "Shape", type: "select", def: "rectangle", options: ["rectangle", "ellipse", "line"] },
    { key: "width", label: "Width", type: "number", def: 0.35, min: 0.01, max: 1, step: 0.01 },
    { key: "height", label: "Height", type: "number", def: 0.2, min: 0.01, max: 1, step: 0.01 },
    { key: "fill", label: "Fill", type: "color", def: "#f6a447" },
  ],
  update_clip: [
    { key: "clipId", label: "Clip id", type: "text", def: "$clipId", placeholder: "$clipId" },
    { key: "patch", label: "Patch (JSON)", type: "json", def: "{}" },
  ],
  apply_motion: [
    { key: "clipId", label: "Clip id", type: "text", def: "$clipId" },
    { key: "preset", label: "Preset", type: "text", def: "spring" },
    { key: "delay", label: "Delay", type: "number", def: 0, min: 0, max: 60, step: 0.1 },
    { key: "duration", label: "Duration", type: "number", def: 0.8, min: 0.1, max: 60, step: 0.1 },
    { key: "strength", label: "Strength", type: "number", def: 1, min: 0.1, max: 2, step: 0.1 },
  ],
  set_keyframes: [
    { key: "clipId", label: "Clip id", type: "text", def: "$clipId" },
    { key: "property", label: "Property", type: "select", def: "scale", options: ["x", "y", "scale", "rotation", "opacity"] },
    { key: "keyframes", label: "Keyframes (JSON)", type: "json", def: "[{ \"time\": 0, \"value\": 0, \"easing\": \"ease-out\" }, { \"time\": 0.8, \"value\": 1 }]" },
  ],
  stagger_clips: [
    { key: "clipIds", label: "Clip ids", type: "text", def: "$selection", placeholder: "$selection" },
    { key: "start", label: "Start", type: "number", def: "$playhead", min: 0, max: 86400, step: 0.1 },
    { key: "delay", label: "Delay", type: "number", def: 0.15, min: 0, max: 60, step: 0.05 },
  ],
  duplicate_clip: [{ key: "clipId", label: "Clip id", type: "text", def: "$clipId" }],
  remove_clip: [{ key: "clipId", label: "Clip id", type: "text", def: "$clipId" }],
  animate_code: [
    { key: "clipId", label: "Clip id", type: "text", def: "$clipId" },
    { key: "expressions", label: "Expressions (JSON)", type: "json", def: "{ \"rotation\": \"wiggle(2, 4)\" }" },
  ],
  add_beat_markers: [
    { key: "bpm", label: "BPM", type: "number", def: 120, min: 20, max: 300, step: 1 },
    { key: "count", label: "Count", type: "number", def: 8, min: 2, max: 64, step: 1 },
  ],
  snap_to_beats: [
    { key: "clipIds", label: "Clip ids", type: "text", def: "$selection", placeholder: "$selection" },
    { key: "bpm", label: "BPM", type: "number", def: 120, min: 20, max: 300, step: 1 },
  ],
};

export const OP_IDS = Object.keys(OP_PARAMS);

/** Built-in examples that showcase both modes; users can duplicate and edit them. */
export const BUILT_IN_TOOLS: CustomTool[] = [
  {
    id: "builtin-three-beats", name: "Three beat titles", description: "Add three titles at the playhead, staggered 0.4s apart, each springing in.",
    mode: "blocks",
    blocks: [
      { kind: "comment", text: "Runs at the playhead ($playhead)" },
      { kind: "repeat", count: 3, blocks: [
        { kind: "op", op: "add_text_clip", args: { text: "Beat $index", start: "$playhead + $index * 0.4", duration: 3, id: "beat-$index" } },
        { kind: "op", op: "apply_motion", args: { clipId: "beat-$index", preset: "spring", duration: 0.8 } },
      ] },
    ],
  },
  {
    id: "builtin-bold-all", name: "Bold every title", description: "Switch every text clip in the timeline to bold Inter.",
    mode: "blocks",
    blocks: [
      { kind: "eachClip", select: "text", blocks: [
        { kind: "op", op: "update_clip", args: { clipId: "$clipId", patch: "{ \"font\": \"inter\", \"fontWeight\": 700 }" } },
      ] },
    ],
  },
  {
    id: "builtin-orbit", name: "Orbit selection", description: "Give every selected clip a gentle orbit with code.",
    mode: "code",
    code: `// vf has the playhead, selection and every clip.
// Helpers return operations; return an array and it runs atomically.
const ops = [];
for (const id of vf.selection) {
  ops.push(vf.animate(id, { x: "0.5 + 0.15 * cos(t * 1.5)", y: "0.5 + 0.15 * sin(t * 1.5)" }));
}
return ops;`,
  },
];

/** Variables available inside block templates. */
export type ToolVars = ToolContext & { index: number; count: number; clipId: string };

function resolveValue(value: unknown, vars: ToolVars): unknown {
  if (typeof value !== "string") return value;
  let out = value;
  const apply = (name: string, v: string | number) => { out = out.split("$" + name).join(String(v)); };
  apply("playhead", vars.playhead);
  apply("duration", vars.duration);
  apply("index", vars.index);
  apply("count", vars.count);
  apply("clipId", vars.clipId);
  apply("selection", vars.selection.join(","));
  // A template that is now arithmetic ("$playhead + $index * 0.4") is evaluated to a number.
  // A tiny recursive-descent parser: numbers, + - * / and parentheses only — no Function, no globals.
  if (value.includes("$")) {
    const n = evalArithmetic(out);
    if (n !== undefined) return n;
  }
  return out;
}

/** Evaluate + - * / and parentheses over numbers. Returns undefined for anything else. */
function evalArithmetic(expr: string): number | undefined {
  let pos = 0;
  const skip = () => { while (pos < expr.length && /\s/.test(expr[pos])) pos++; };
  const parseNum = (): number | undefined => {
    skip();
    const m = /^\d+(\.\d+)?/.exec(expr.slice(pos));
    if (!m) return undefined;
    pos += m[0].length;
    return Number(m[0]);
  };
  const parsePrimary = (): number | undefined => {
    skip();
    if (expr[pos] === "(") { pos++; const v = parseExpr(); skip(); if (expr[pos] !== ")") return undefined; pos++; return v; }
    if (expr[pos] === "-") { pos++; const v = parsePrimary(); return v === undefined ? undefined : -v; }
    return parseNum();
  };
  const parseMul = (): number | undefined => {
    let v = parsePrimary();
    if (v === undefined) return undefined;
    for (;;) {
      skip();
      const op = expr[pos];
      if (op !== "*" && op !== "/") return v;
      pos++;
      const r = parsePrimary();
      if (r === undefined) return undefined;
      if (op === "/") { if (r === 0) return undefined; v = v / r; } else v = v * r;
    }
  };
  const parseExpr = (): number | undefined => {
    let v = parseMul();
    if (v === undefined) return undefined;
    for (;;) {
      skip();
      const op = expr[pos];
      if (op !== "+" && op !== "-") return v;
      pos++;
      const r = parseMul();
      if (r === undefined) return undefined;
      v = op === "+" ? v + r : v - r;
    }
  };
  const result = parseExpr();
  skip();
  return result !== undefined && pos === expr.length && Number.isFinite(result) ? result : undefined;
}

function resolveArgs(args: Record<string, unknown> | undefined, vars: ToolVars): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) out[k] = resolveValue(v, vars);
  return out;
}

/**
 * The shared argument conversions: JSON params parse (update_clip patches merge in),
 * number params coerce (templates included), id lists become arrays, and the flat
 * shape fields nest into the shape object. Friendly from/to animation and text
 * effect blocks expand here into the keyframes and patches the timeline ops need.
 */
export function convertOpArgs(op: string, args: Record<string, unknown>): Record<string, unknown> {
  for (const p of OP_PARAMS[op] ?? []) {
    if (typeof args[p.key] !== "string") continue;
    if (p.type === "json") {
      let parsed: unknown;
      try { parsed = JSON.parse(args[p.key] as string); } catch { throw new Error(`${op}: ${p.label} must be valid JSON`); }
      if (parsed && typeof parsed === "object") {
        if (op === "update_clip" && p.key === "patch") { delete args.patch; Object.assign(args, parsed); }
        else args[p.key] = parsed;
      }
    }
    if (p.type === "number") {
      const n = Number(args[p.key]);
      if (Number.isFinite(n)) args[p.key] = n;
    }
    if (p.key === "clipIds") {
      const list = (args[p.key] as string).split(",").map((x) => x.trim()).filter(Boolean);
      if (list.length) args[p.key] = list;
    }
  }
  // Animate-property blocks: from/to/duration/delay/easing expand into keyframes.
  if (op === "set_keyframes" && args.keyframes === undefined && args.from !== undefined && args.to !== undefined) {
    const from = Number(args.from), to = Number(args.to);
    const duration = Math.max(0.01, Number(args.duration) || 1);
    const delay = Math.max(0, Number(args.delay) || 0);
    const easing = typeof args.easing === "string" && args.easing ? args.easing : "ease-out";
    delete args.from; delete args.to; delete args.duration; delete args.delay; delete args.easing;
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error("set_keyframes: from and to must be numbers");
    args.keyframes = keyframesFromTo(from, to, duration, delay, easing);
  }
  // Text-effect blocks: mode/duration/delay expand into the textReveal patch.
  if (op === "update_clip" && typeof args.__textRevealMode === "string") {
    const mode = args.__textRevealMode;
    delete args.__textRevealMode;
    if (mode === "typewriter" || mode === "words" || mode === "lines") {
      const duration = Math.max(0.1, Number(args.duration) || 1.5);
      const delay = Math.max(0, Number(args.delay) || 0);
      delete args.duration; delete args.delay;
      args.textReveal = { mode, duration, delay };
    }
  }
  // Colour-cycle blocks: the colour list and cycle time expand into the textColorCycle patch.
  if (op === "update_clip" && typeof args.__colorCycle === "string") {
    const steps = String(args.__colorCycle).split(",").map((s) => s.trim()).filter((s) => /^#[0-9a-fA-F]{6}$/.test(s)).slice(0, 8);
    const duration = Math.max(0.2, Number(args.cycleDuration) || 2);
    delete args.__colorCycle; delete args.cycleDuration;
    if (steps.length >= 2) args.textColorCycle = { steps, duration };
  }
  if (op === "add_shape_clip" && args.shape === undefined) {
    args.shape = { type: args.shapeType ?? "rectangle", width: args.width, height: args.height, fill: args.fill };
    delete args.shapeType; delete args.width; delete args.height; delete args.fill;
  }
  return args;
}

/** Standard ease-out bounce (a ball landing). */
function bounceOut(t: number): number {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
  if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
  t -= 2.625 / d1; return n1 * t * t + 0.984375;
}

/** Standard ease-out elastic (a spring wobbling to rest). */
function elasticOut(t: number): number {
  const c4 = (2 * Math.PI) / 3;
  return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/**
 * Two keyframes from → to, or — for bounce/elastic, which the engine's bezier
 * easings cannot express — a sampled curve of linear keyframes that approximates
 * the same motion. Used identically by blocks and by the vf code helper.
 */
export function keyframesFromTo(from: number, to: number, duration: number, delay: number, easing: string): { time: number; value: number; easing?: string }[] {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  if (easing === "bounce-out" || easing === "elastic-out") {
    const curve = easing === "bounce-out" ? bounceOut : elasticOut;
    const steps = 14;
    const out: { time: number; value: number; easing?: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = curve(i / steps);
      out.push({ time: r(delay + (duration * i) / steps), value: r(from + (to - from) * p) });
    }
    return out;
  }
  return [{ time: r(delay), value: from, easing }, { time: r(delay + duration), value: to }];
}

/** Compile a block program into timeline operations for one context. Throws readable errors. */
export function compileBlocks(blocks: ToolBlock[], ctx: ToolContext, into: TimelineOp[] = []): TimelineOp[] {
  const base: ToolVars = { ...ctx, index: 0, count: 1, clipId: "" };
  const walk = (list: ToolBlock[], vars: ToolVars) => {
    for (const block of list) {
      if (block.kind === "comment") continue;
      if (block.kind === "op") {
        if (!block.op || typeof block.op !== "string") throw new Error("an op block needs an operation name");
        const args = convertOpArgs(block.op, resolveArgs(block.args, vars));
        if (into.length >= 100) throw new Error("the tool expands to more than 100 operations; the batch limit");
        into.push({ op: block.op, args });
      } else if (block.kind === "repeat") {
        const count = Math.max(0, Math.min(1000, Math.round(Number(block.count) || 0)));
        for (let i = 0; i < count; i++) walk(block.blocks, { ...vars, index: i, count });
      } else if (block.kind === "eachClip") {
        const select = block.select ?? "all";
        const clips = ctx.clips.filter((c) => select === "all" || (select === "selected" ? ctx.selection.includes(c.id) : c.kind === select));
        clips.forEach((c, i) => walk(block.blocks, { ...vars, clipId: c.id, index: i, count: clips.length }));
      }
    }
  };
  walk(blocks, base);
  return into;
}

/** Validate that a tool result is a list of operations. Returns a normalized copy. */
export function normalizeOps(result: unknown): TimelineOp[] {
  const ops = Array.isArray(result) ? result : result == null ? [] : [result];
  const out: TimelineOp[] = [];
  for (const op of ops) {
    if (!op || typeof op !== "object" || typeof (op as TimelineOp).op !== "string" || !(op as TimelineOp).op) {
      throw new Error("a tool must return operations: { op, args } objects");
    }
    const args = (op as TimelineOp).args;
    if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) throw new Error(`op "${(op as TimelineOp).op}" needs an args object`);
    out.push({ op: (op as TimelineOp).op, args: args ?? {} });
  }
  if (out.length > 100) throw new Error("a tool may run at most 100 operations; the batch limit");
  return out;
}

/**
 * Run a JavaScript tool. The code sees one argument, `vf`, with the context and
 * helper functions that build operations; it returns them for an atomic batch.
 * Runtime errors carry a "(line N)" hint pointing at the user's code.
 */
let userLineOffset: number | null | undefined;

/** Engines number `new Function` bodies with an engine-specific header offset; measure it once. */
function measureUserLineOffset(): number | null {
  if (userLineOffset !== undefined) return userLineOffset;
  userLineOffset = null;
  try {
    // The throw sits on user line 1; whatever line the stack reports tells us the offset.
    new Function("vf", '"use strict";\nthrow new Error("calibrate");')({});
  } catch (e: any) {
    const m = /<anonymous>:(\d+):\d+/.exec(typeof e?.stack === "string" ? e.stack : "");
    if (m) userLineOffset = Number(m[1]) - 1;
  }
  return userLineOffset;
}

export function runCodeTool(code: string, ctx: ToolContext): TimelineOp[] {
  const vf = makeCodeApi(ctx);
  let result: unknown;
  try {
    const fn = new Function("vf", `"use strict";\n${code}`);
    result = fn(vf);
  } catch (e: any) {
    throw new Error(`${codeErrorMessage(e)}${codeErrorLineHint(e)}`);
  }
  return normalizeOps(result);
}

function codeErrorMessage(e: any): string {
  const raw = typeof e?.message === "string" && e.message ? e.message : "the code could not run";
  return raw.startsWith("code error:") ? raw : `code error: ${raw}`;
}

/** The user's code starts after the injected "use strict"; the measured offset converts stack lines. */
function codeErrorLineHint(e: any): string {
  const offset = measureUserLineOffset();
  if (offset == null) return "";
  const m = /<anonymous>:(\d+):\d+/.exec(typeof e?.stack === "string" ? e.stack : "");
  if (!m) return "";
  const line = Number(m[1]) - offset;
  return line >= 1 ? ` (line ${line})` : "";
}

/**
 * The helper API exposed to code tools.
 */
export function makeCodeApi(ctx: ToolContext) {
  const op = (o: TimelineOp) => o;
  const needId = (id: unknown) => { if (!id || typeof id !== "string") throw new Error("this helper needs a clip id"); return id; };
  return {
    playhead: ctx.playhead,
    duration: ctx.duration,
    selection: [...ctx.selection],
    clips: ctx.clips.map((c) => ({ ...c })),
    resolution: { ...ctx.resolution },
    fps: ctx.fps,
    addText: (args: Record<string, unknown> = {}) => op({ op: "add_text_clip", args: { start: ctx.playhead, ...args } }),
    addShape: (args: Record<string, unknown> = {}) => op({ op: "add_shape_clip", args }),
    update: (id: string, patch: Record<string, unknown>) => op({ op: "update_clip", args: { clipId: needId(id), ...patch } }),
    remove: (id: string) => op({ op: "remove_clip", args: { clipId: needId(id) } }),
    duplicate: (id: string, start?: number) => op({ op: "duplicate_clip", args: { clipId: needId(id), ...(start !== undefined ? { start } : {}) } }),
    motion: (id: string, preset: string, opts: Record<string, unknown> = {}) => op({ op: "apply_motion", args: { clipId: needId(id), preset, ...opts } }),
    stagger: (ids: string[], opts: Record<string, unknown> = {}) => op({ op: "stagger_clips", args: { clipIds: ids, start: ctx.playhead, ...opts } }),
    keyframes: (id: string, property: string, keyframes: unknown[]) => op({ op: "set_keyframes", args: { clipId: needId(id), property, keyframes } }),
    animate: (id: string, expressions: Record<string, string>) => op({ op: "animate_code", args: { clipId: needId(id), expressions } }),
    markers: (bpm = 120, count = 8) => op({ op: "add_beat_markers", args: { bpm, count } }),
    /** Animate a property from one value to another — the friendly keyframe block as code. */
    animateProperty: (id: string, property: string, from: number, to: number, opts: { duration?: number; delay?: number; easing?: string } = {}) =>
      op({ op: "set_keyframes", args: { clipId: needId(id), property, keyframes: keyframesFromTo(from, to, Math.max(0.01, opts.duration ?? 1), Math.max(0, opts.delay ?? 0), opts.easing ?? "ease-out") } }),
    /** Type text on (typewriter), or reveal it word by word / line by line. */
    textEffect: (id: string, mode: "typewriter" | "words" | "lines", opts: { duration?: number; delay?: number } = {}) =>
      op({ op: "update_clip", args: { clipId: needId(id), textReveal: { mode, duration: Math.max(0.1, opts.duration ?? 1.5), delay: Math.max(0, opts.delay ?? 0) } } }),
    /** Step a text clip's colour through a list of colours. */
    colorCycle: (id: string, steps: string[], duration = 2) => {
      const clean = steps.filter((s) => /^#[0-9a-fA-F]{6}$/.test(s)).slice(0, 8);
      if (clean.length < 2) throw new Error("colorCycle needs at least two colours, like #e74c3c");
      return op({ op: "update_clip", args: { clipId: needId(id), textColorCycle: { steps: clean, duration: Math.max(0.2, duration) } } });
    },
  };
}

/** One entry of the code editor's helper reference. */
export type VfHelperDoc = { name: string; signature: string; description: string; example: string };

/**
 * The code editor's live reference: every `vf` helper with a signature, a
 * friendly description and a one-line example you can click to insert.
 * Keep in sync with makeCodeApi.
 */
export const VF_HELPERS: VfHelperDoc[] = [
  { name: "vf.playhead", signature: "vf.playhead", description: "Where the playhead is right now, in seconds.", example: `return [vf.addText({ text: "At " + vf.playhead })];` },
  { name: "vf.duration", signature: "vf.duration", description: "How long the timeline is, in seconds.", example: `return [vf.addText({ text: vf.duration + "s long" })];` },
  { name: "vf.selection", signature: "vf.selection", description: "The ids of the clips you selected.", example: `const ops = [];\nfor (const id of vf.selection) ops.push(vf.motion(id, "spring"));\nreturn ops;` },
  { name: "vf.clips", signature: "vf.clips", description: "Every visual clip: id, kind, start and duration.", example: `const ops = [];\nfor (const c of vf.clips) if (c.kind === "text") ops.push(vf.update(c.id, { fontWeight: 700 }));\nreturn ops;` },
  { name: "vf.resolution", signature: "vf.resolution", description: "The canvas size: { width, height }.", example: `return [vf.addShape({ shape: { type: "ellipse", width: 0.3, height: 0.3, fill: "#f6a447" } })];` },
  { name: "vf.fps", signature: "vf.fps", description: "The project's frames per second — handy with frame blocks.", example: `return [vf.addText({ text: "frame 30 = " + 30 / vf.fps + "s" })];` },
  { name: "vf.addText", signature: "vf.addText({ text, start?, duration?, ... })", description: "Adds a text clip. start defaults to the playhead.", example: `return [vf.addText({ text: "Hello", duration: 3 })];` },
  { name: "vf.addShape", signature: "vf.addShape({ shape, duration? })", description: "Adds a rectangle, ellipse or line.", example: `return [vf.addShape({ shape: { type: "rectangle", width: 0.3, height: 0.2, fill: "#4a8fd6" } })];` },
  { name: "vf.update", signature: "vf.update(id, patch)", description: "Changes any clip fields: position, colour, speed and more.", example: `return [vf.update("clip1", { x: 0.5, y: 0.4 })];` },
  { name: "vf.remove", signature: "vf.remove(id)", description: "Deletes a clip.", example: `return [vf.remove("clip1")];` },
  { name: "vf.duplicate", signature: "vf.duplicate(id, start?)", description: "Copies a clip, optionally at a new start time.", example: `return [vf.duplicate("clip1", vf.playhead + 1)];` },
  { name: "vf.motion", signature: "vf.motion(id, preset, opts?)", description: "Applies a motion preset: fade, spring, pop, shake...", example: `return [vf.motion("clip1", "spring", { duration: 0.8 })];` },
  { name: "vf.stagger", signature: "vf.stagger(ids, opts?)", description: "Spreads clips out in time, one after another.", example: `return [vf.stagger(vf.selection, { delay: 0.2 })];` },
  { name: "vf.keyframes", signature: "vf.keyframes(id, property, keys)", description: "Animates a property over time with keyframes.", example: `return [vf.keyframes("clip1", "scale", [{ time: 0, value: 0.2, easing: "back-out" }, { time: 0.8, value: 1 }])];` },
  { name: "vf.animate", signature: "vf.animate(id, expressions)", description: "Animates with small formulas of t, like wiggle(2, 4).", example: `return [vf.animate("clip1", { rotation: "wiggle(2, 4)" })];` },
  { name: "vf.animateProperty", signature: "vf.animateProperty(id, property, from, to, opts)", description: "Animates any property from one value to another, with an easing.", example: `return [vf.animateProperty("clip1", "scale", 0.2, 1, { duration: 0.8, easing: "back-out" })];` },
  { name: "vf.textEffect", signature: "vf.textEffect(id, mode, opts)", description: "Types text on (typewriter) or reveals it word by word / line by line.", example: `return [vf.textEffect("clip1", "typewriter", { duration: 1.5 })];` },
  { name: "vf.colorCycle", signature: "vf.colorCycle(id, colors, duration)", description: "Steps a text clip's colour through a list of colours.", example: `return [vf.colorCycle("clip1", ["#e74c3c", "#f1c40f", "#2ecc71"], 2)];` },
  { name: "vf.markers", signature: "vf.markers(bpm, count)", description: "Drops timeline markers on every beat.", example: `return [vf.markers(120, 8)];` },
];

/** The $-templates available in block fields, with their vf equivalents for code. */
export const TEMPLATE_DOCS: { template: string; becomes: string; code: string }[] = [
  { template: "$playhead", becomes: "the playhead position in seconds", code: "vf.playhead" },
  { template: "$duration", becomes: "the timeline duration in seconds", code: "vf.duration" },
  { template: "$index / $count", becomes: "position inside a repeat or for-each group", code: "your loop variable" },
  { template: "$clipId", becomes: "the current clip inside a for-each group", code: "c.id" },
  { template: "$selection", becomes: "the selected clip ids", code: "vf.selection" },
];

/** Run errors from code tools, with the offending line when it can be found. */
export function codeErrorLine(error: string): number | null {
  const m = /\(line (\d+)\)/.exec(error);
  return m ? Number(m[1]) : null;
}

/**
 * The child-friendly block palette for the full-screen studio. Each block maps
 * to one timeline operation with ready-made arguments; editors only touch the
 * listed params. Raw operations stay available through the Advanced block.
 */
export type FriendlyBlock = {
  id: string;
  label: string;
  group: "Create" | "Entrances" | "Exits" | "Attention" | "Springy" | "Camera" | "Animate" | "Text" | "Style" | "Clips" | "Timing" | "Advanced";
  op: string;
  args?: Record<string, unknown>;
  params: ToolParam[];
  description: string;
};

const P = {
  clipId: { key: "clipId", label: "Clip", type: "text", def: "$clipId", placeholder: "$clipId or connect a clip" } as ToolParam,
  start: { key: "start", label: "Start (s)", type: "number", def: "$playhead", min: 0, max: 86400, step: 0.1 } as ToolParam,
  duration: { key: "duration", label: "Duration (s)", type: "number", def: 3, min: 0.1, max: 3600, step: 0.1 } as ToolParam,
  preset: (id: string) => ({ key: "preset", label: "Preset", type: "select", def: id, options: [id] } as ToolParam),
  motionDuration: { key: "duration", label: "Duration (s)", type: "number", def: 0.8, min: 0.1, max: 60, step: 0.1 } as ToolParam,
  motionDelay: { key: "delay", label: "Delay (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 } as ToolParam,
  strength: { key: "strength", label: "Strength", type: "number", def: 1, min: 0.1, max: 2, step: 0.1 } as ToolParam,
  animDuration: { key: "duration", label: "Duration (s)", type: "number", def: 1, min: 0.1, max: 60, step: 0.1 } as ToolParam,
  animDelay: { key: "delay", label: "Delay (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 } as ToolParam,
};

/** The motion presets, grouped the way the palette shows them. */
const PRESET_IDS: string[] = MOTION_PRESETS.map((p) => p.id);
const presetOptions = (ids: string[]) => ({ key: "preset", label: "Move", type: "select", def: ids[0], options: ids } as ToolParam);
const MOTION_GROUPS: { group: "Entrances" | "Exits" | "Attention" | "Springy" | "Camera"; ids: string[]; label: string; description: string }[] = [
  { group: "Entrances", ids: ["fade", "slide-left", "slide-right", "rise", "drop", "pop", "zoom-out", "swing", "spin", "reveal"], label: "Enter the scene", description: "Brings a clip in with a move like fade, slide, pop or swing." },
  { group: "Exits", ids: ["exit-left", "exit-right", "exit-up", "exit-down", "fade-out", "shrink-out", "spin-out", "pop-out", "reveal-out"], label: "Make an exit", description: "Sends a clip away — slide out, fade out, shrink or spin." },
  { group: "Attention", ids: ["pulse", "shake", "wobble", "tada", "heartbeat", "blink", "flash", "glitch"], label: "Get attention", description: "Shakes, pulses or wobbles a clip so people look at it." },
  { group: "Springy", ids: ["spring", "whip", "rubber", "bounce-in"], label: "Springy move", description: "Bouncy, elastic moves that overshoot and settle." },
  { group: "Camera", ids: ["zoom", "drift"], label: "Camera move", description: "Slow zooms and drifts, like a camera moving." },
];

const ANIMATE_PROPERTY_OPTIONS = ["x", "y", "scale", "rotation", "opacity", "brightness", "contrast", "saturation", "reveal", "volume"];
const EASING_OPTIONS = ["ease-out", "ease-in", "ease-in-out", "linear", "back-out", "snappy", "anticipate", "bounce-out", "elastic-out", "hold"];

export const BLOCK_LIBRARY: FriendlyBlock[] = [
  { id: "add-title", label: "Add title", group: "Create", op: "add_text_clip", description: "Adds a text clip with your words.",
    args: { text: "Your title", duration: 3 },
    params: [{ key: "text", label: "Text", type: "text", def: "Your title" }, P.start, P.duration, { key: "font", label: "Font", type: "select", def: "inter", options: ["inter", "playfair-display", "anton", "bebas-neue", "caveat"] }] },
  { id: "add-shape", label: "Add shape", group: "Create", op: "add_shape_clip", description: "Adds a rectangle, ellipse or line.",
    args: { duration: 3, shapeType: "rectangle", width: 0.3, height: 0.2, fill: "#f6a447" },
    params: [{ key: "shapeType", label: "Shape", type: "select", def: "rectangle", options: ["rectangle", "ellipse", "line"] }, { key: "width", label: "Width", type: "number", def: 0.3, min: 0.01, max: 1, step: 0.01 }, { key: "height", label: "Height", type: "number", def: 0.2, min: 0.01, max: 1, step: 0.01 }, { key: "fill", label: "Colour", type: "color", def: "#f6a447" }, P.start, P.duration] },
  { id: "move", label: "Move", group: "Animate", op: "update_clip", description: "Moves a clip to a position.",
    args: { x: 0.3, y: 0.5 },
    params: [P.clipId, { key: "x", label: "X (0..1)", type: "number", def: 0.3, min: 0, max: 1, step: 0.01 }, { key: "y", label: "Y (0..1)", type: "number", def: 0.5, min: 0, max: 1, step: 0.01 }] },
  { id: "grow", label: "Grow", group: "Animate", op: "set_keyframes", description: "Grows a clip from small to full size.",
    args: { property: "scale", keyframes: "[{ \"time\": 0, \"value\": 0.2, \"easing\": \"back-out\" }, { \"time\": 0.8, \"value\": 1 }]" },
    params: [P.clipId, { key: "keyframes", label: "Keyframes (JSON)", type: "json", def: "[{ \"time\": 0, \"value\": 0.2, \"easing\": \"back-out\" }, { \"time\": 0.8, \"value\": 1 }]" }] },
  { id: "spin", label: "Spin", group: "Animate", op: "set_keyframes", description: "Spins a clip all the way around.",
    args: { property: "rotation", keyframes: "[{ \"time\": 0, \"value\": 0 }, { \"time\": 1.2, \"value\": 360 }]" },
    params: [P.clipId, { key: "keyframes", label: "Keyframes (JSON)", type: "json", def: "[{ \"time\": 0, \"value\": 0 }, { \"time\": 1.2, \"value\": 360 }]" }] },
  { id: "fade-in", label: "Fade in", group: "Animate", op: "apply_motion", description: "Fades a clip in softly.",
    args: { preset: "fade", duration: 0.8 }, params: [P.clipId, P.preset("fade"), { key: "duration", label: "Duration (s)", type: "number", def: 0.8, min: 0.1, max: 60, step: 0.1 }] },
  { id: "spring-in", label: "Spring in", group: "Animate", op: "apply_motion", description: "Bounces a clip into place.",
    args: { preset: "spring", duration: 0.8 }, params: [P.clipId, P.preset("spring"), { key: "duration", label: "Duration (s)", type: "number", def: 0.8, min: 0.1, max: 60, step: 0.1 }] },
  { id: "bounce-in", label: "Drop in", group: "Animate", op: "apply_motion", description: "Drops a clip from above.",
    args: { preset: "bounce-in", duration: 0.9 }, params: [P.clipId, P.preset("bounce-in"), { key: "duration", label: "Duration (s)", type: "number", def: 0.9, min: 0.1, max: 60, step: 0.1 }] },
  { id: "wobble", label: "Wobble", group: "Animate", op: "apply_motion", description: "Rocks a clip side to side.",
    args: { preset: "wobble", duration: 1 }, params: [P.clipId, P.preset("wobble"), { key: "duration", label: "Duration (s)", type: "number", def: 1, min: 0.1, max: 60, step: 0.1 }] },
  { id: "orbit", label: "Orbit", group: "Animate", op: "animate_code", description: "Floats a clip in a circle forever.",
    args: { expressions: "{ \"x\": \"0.5 + 0.15 * cos(t * 1.5)\", \"y\": \"0.5 + 0.15 * sin(t * 1.5)\" }" },
    params: [P.clipId, { key: "expressions", label: "Expressions (JSON)", type: "json", def: "{ \"x\": \"0.5 + 0.15 * cos(t * 1.5)\", \"y\": \"0.5 + 0.15 * sin(t * 1.5)\" }" }] },
  { id: "bold-text", label: "Bold text", group: "Style", op: "update_clip", description: "Makes a text clip bold Inter.",
    args: { patch: "{ \"font\": \"inter\", \"fontWeight\": 700 }" },
    params: [P.clipId, { key: "patch", label: "Patch (JSON)", type: "json", def: "{ \"font\": \"inter\", \"fontWeight\": 700 }" }] },
  { id: "color-text", label: "Text colour", group: "Style", op: "update_clip", description: "Changes a text clip's colour.",
    args: { patch: "{ \"textColor\": \"#f6a447\" }" },
    params: [P.clipId, { key: "patch", label: "Patch (JSON)", type: "json", def: "{ \"textColor\": \"#f6a447\" }" }] },
  { id: "delete-clip", label: "Delete clip", group: "Clips", op: "remove_clip", description: "Removes a clip from the timeline.",
    args: {}, params: [P.clipId] },
  { id: "duplicate-clip", label: "Duplicate clip", group: "Clips", op: "duplicate_clip", description: "Copies a clip.",
    args: {}, params: [P.clipId, { key: "start", label: "Start (s)", type: "number", def: "$playhead", min: 0, max: 86400, step: 0.1 }] },
  { id: "stagger", label: "Stagger selection", group: "Timing", op: "stagger_clips", description: "Spreads the selected clips out in time.",
    args: { delay: 0.15 }, params: [{ key: "clipIds", label: "Clips", type: "text", def: "$selection", placeholder: "$selection" }, { key: "start", label: "Start (s)", type: "number", def: "$playhead", min: 0, max: 86400, step: 0.1 }, { key: "delay", label: "Gap (s)", type: "number", def: 0.15, min: 0, max: 60, step: 0.05 }] },
  { id: "beat-markers", label: "Beat markers", group: "Timing", op: "add_beat_markers", description: "Drops markers on every beat.",
    args: { bpm: 120, count: 8 }, params: [{ key: "bpm", label: "BPM", type: "number", def: 120, min: 20, max: 300, step: 1 }, { key: "count", label: "Count", type: "number", def: 8, min: 2, max: 64, step: 1 }] },
  { id: "advanced", label: "Advanced op", group: "Advanced", op: "update_clip", description: "Any timeline operation, with raw JSON.",
    args: { clipId: "$clipId", patch: "{}" },
    params: [{ key: "__op", label: "Operation", type: "select", def: "update_clip", options: OP_IDS }, { key: "args", label: "Arguments (JSON)", type: "json", def: "{}" }] },
  // Motion presets, grouped for the palette.
  ...MOTION_GROUPS.map((g) => ({
    id: `motion-${g.group.toLowerCase()}`, label: g.label, group: g.group, op: "apply_motion", description: g.description,
    args: { preset: g.ids[0], duration: 0.8 },
    params: [P.clipId, presetOptions(g.ids), P.motionDuration, P.motionDelay, P.strength],
  })),
  // Keyframe animation: any property, from one value to another, with an easing.
  { id: "animate-property", label: "Animate a property", group: "Animate", op: "set_keyframes", description: "Changes any property over time — position, size, spin, see-through, colour and more.",
    args: { property: "scale", from: 0.2, to: 1, duration: 1, delay: 0, easing: "back-out" },
    params: [P.clipId, { key: "property", label: "Property", type: "select", def: "scale", options: ANIMATE_PROPERTY_OPTIONS }, { key: "from", label: "From", type: "number", def: 0.2, min: -360, max: 360, step: 0.01 }, { key: "to", label: "To", type: "number", def: 1, min: -360, max: 360, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "back-out", options: EASING_OPTIONS }] },
  { id: "slide-in-left", label: "Slide in from left", group: "Animate", op: "set_keyframes", description: "Slides a clip in from the left edge.",
    args: { property: "x", from: 0.15, to: 0.5, duration: 0.8, easing: "ease-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: 0.15, min: 0, max: 1, step: 0.01 }, { key: "to", label: "To", type: "number", def: 0.5, min: 0, max: 1, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-out", options: EASING_OPTIONS }] },
  { id: "slide-in-right", label: "Slide in from right", group: "Animate", op: "set_keyframes", description: "Slides a clip in from the right edge.",
    args: { property: "x", from: 0.85, to: 0.5, duration: 0.8, easing: "ease-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: 0.85, min: 0, max: 1, step: 0.01 }, { key: "to", label: "To", type: "number", def: 0.5, min: 0, max: 1, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-out", options: EASING_OPTIONS }] },
  { id: "rise-up", label: "Rise up", group: "Animate", op: "set_keyframes", description: "Floats a clip up into place.",
    args: { property: "y", from: 0.65, to: 0.5, duration: 0.9, easing: "ease-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: 0.65, min: 0, max: 1, step: 0.01 }, { key: "to", label: "To", type: "number", def: 0.5, min: 0, max: 1, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-out", options: EASING_OPTIONS }] },
  { id: "drop-down", label: "Drop down", group: "Animate", op: "set_keyframes", description: "Drops a clip down into place.",
    args: { property: "y", from: 0.35, to: 0.5, duration: 0.9, easing: "bounce-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: 0.35, min: 0, max: 1, step: 0.01 }, { key: "to", label: "To", type: "number", def: 0.5, min: 0, max: 1, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "bounce-out", options: EASING_OPTIONS }] },
  { id: "zoom-in", label: "Zoom in", group: "Animate", op: "set_keyframes", description: "Grows a clip from small to full size.",
    args: { property: "scale", from: 0.3, to: 1, duration: 1, easing: "back-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: 0.3, min: 0.1, max: 2, step: 0.01 }, { key: "to", label: "To", type: "number", def: 1, min: 0.1, max: 2, step: 0.01 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "back-out", options: EASING_OPTIONS }] },
  { id: "spin-in", label: "Spin in", group: "Animate", op: "set_keyframes", description: "Twists a clip into place.",
    args: { property: "rotation", from: -120, to: 0, duration: 1, easing: "ease-out" },
    params: [P.clipId, { key: "from", label: "From", type: "number", def: -120, min: -360, max: 360, step: 1 }, { key: "to", label: "To", type: "number", def: 0, min: -360, max: 360, step: 1 }, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-out", options: EASING_OPTIONS }] },
  { id: "fade-in-soft", label: "Fade in slowly", group: "Animate", op: "set_keyframes", description: "Fades a clip in over time — great for subtitles.",
    args: { property: "opacity", from: 0, to: 1, duration: 2, easing: "ease-out" },
    params: [P.clipId, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-out", options: EASING_OPTIONS }] },
  { id: "fade-out-soft", label: "Fade out slowly", group: "Animate", op: "set_keyframes", description: "Fades a clip out over time.",
    args: { property: "opacity", from: 1, to: 0, duration: 2, easing: "ease-in" },
    params: [P.clipId, P.animDuration, P.animDelay, { key: "easing", label: "Easing", type: "select", def: "ease-in", options: EASING_OPTIONS }] },
  { id: "draw-on", label: "Draw on", group: "Animate", op: "set_keyframes", description: "Uncovers a shape or video left to right, like it is being drawn.",
    args: { property: "reveal", from: 0, to: 1, duration: 1.2, easing: "linear" },
    params: [P.clipId, P.animDuration, P.animDelay] },
  { id: "pulse-glow", label: "Pulsing glow", group: "Animate", op: "animate_code", description: "Makes a clip gently pulse brighter and dimmer, forever.",
    args: { expressions: "{ \"brightness\": \"0.15 * sin(t * 3)\" }" },
    params: [P.clipId, { key: "expressions", label: "Expressions (JSON)", type: "json", def: "{ \"brightness\": \"0.15 * sin(t * 3)\" }" }] },
  { id: "parallax", label: "Parallax float", group: "Animate", op: "animate_code", description: "Floats a clip slowly sideways and up-down, like a background layer.",
    args: { expressions: "{ \"x\": \"0.5 + 0.05 * sin(t * 0.4)\", \"y\": \"0.5 + 0.03 * cos(t * 0.3)\" }" },
    params: [P.clipId, { key: "expressions", label: "Expressions (JSON)", type: "json", def: "{ \"x\": \"0.5 + 0.05 * sin(t * 0.4)\", \"y\": \"0.5 + 0.03 * cos(t * 0.3)\" }" }] },
  // Text effects.
  { id: "typewriter", label: "Typewriter", group: "Text", op: "update_clip", description: "Types a text clip on, character by character.",
    args: { __textRevealMode: "typewriter", duration: 1.5, delay: 0 },
    params: [P.clipId, { key: "duration", label: "Type time (s)", type: "number", def: 1.5, min: 0.2, max: 30, step: 0.1 }, { key: "delay", label: "Wait (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 }] },
  { id: "reveal-words", label: "Reveal word by word", group: "Text", op: "update_clip", description: "Shows a text clip one word at a time.",
    args: { __textRevealMode: "words", duration: 1.5, delay: 0 },
    params: [P.clipId, { key: "duration", label: "Reveal time (s)", type: "number", def: 1.5, min: 0.2, max: 30, step: 0.1 }, { key: "delay", label: "Wait (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 }] },
  { id: "reveal-lines", label: "Reveal line by line", group: "Text", op: "update_clip", description: "Shows a text clip one line at a time.",
    args: { __textRevealMode: "lines", duration: 1.5, delay: 0 },
    params: [P.clipId, { key: "duration", label: "Reveal time (s)", type: "number", def: 1.5, min: 0.2, max: 30, step: 0.1 }, { key: "delay", label: "Wait (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 }] },
  { id: "color-cycle-text", label: "Colour cycle", group: "Text", op: "update_clip", description: "Steps a text clip through a rainbow of colours over time.",
    args: { __colorCycle: "#e74c3c,#f1c40f,#2ecc71,#3498db,#9b59b6", cycleDuration: 2 },
    params: [P.clipId, { key: "__colorCycle", label: "Colours (comma separated)", type: "text", def: "#e74c3c,#f1c40f,#2ecc71,#3498db,#9b59b6" }, { key: "cycleDuration", label: "Cycle time (s)", type: "number", def: 2, min: 0.5, max: 60, step: 0.1 }] },
  { id: "stop-text-effects", label: "Stop text effects", group: "Text", op: "update_clip", description: "Turns the typewriter and colour effects off.",
    args: { patch: "{ \"textReveal\": null, \"textColorCycle\": null }" },
    params: [P.clipId, { key: "patch", label: "Patch (JSON)", type: "json", def: "{ \"textReveal\": null, \"textColorCycle\": null }" }] },
  // Timing.
  { id: "speed-up", label: "Speed up", group: "Timing", op: "update_clip", description: "Plays a clip faster (2 = double speed).",
    args: { patch: "{ \"speed\": 1.5 }" },
    params: [P.clipId, { key: "patch", label: "Patch (JSON)", type: "json", def: "{ \"speed\": 1.5 }" }] },
  { id: "slow-mo", label: "Slow motion", group: "Timing", op: "update_clip", description: "Plays a clip in slow motion (0.5 = half speed).",
    args: { patch: "{ \"speed\": 0.5 }" },
    params: [P.clipId, { key: "patch", label: "Patch (JSON)", type: "json", def: "{ \"speed\": 0.5 }" }] },
  { id: "reverse-motion", label: "Play motion backwards", group: "Timing", op: "reverse_animation", description: "Reverses a clip's animation, so it plays backwards.",
    args: {}, params: [P.clipId] },
  { id: "retime-motion", label: "Stretch motion", group: "Timing", op: "retime_animation", description: "Stretches or squeezes a clip's animation into a new time window.",
    args: { duration: 2, delay: 0 },
    params: [P.clipId, { key: "duration", label: "New duration (s)", type: "number", def: 2, min: 0.1, max: 60, step: 0.1 }, { key: "delay", label: "Delay (s)", type: "number", def: 0, min: 0, max: 60, step: 0.1 }] },
];
export const BLOCK_MAP = new Map(BLOCK_LIBRARY.map((b) => [b.id, b]));
export const BLOCK_GROUPS = ["Create", "Entrances", "Exits", "Attention", "Springy", "Camera", "Animate", "Text", "Style", "Clips", "Timing", "Advanced"] as const;

/** Params of a friendly block that a clip can connect to. */
export function clipConnectableKeys(block: FriendlyBlock): string[] {
  return block.params.filter((p) => p.key === "clipId" || p.key === "clipIds").map((p) => p.key);
}

/** Params of a friendly block that a frame can connect to (they become seconds). */
export function frameConnectableKeys(block: FriendlyBlock): string[] {
  return block.params.filter((p) => ["start", "delay"].includes(p.key)).map((p) => p.key);
}

/** The params of an operation that a clip or frame connection can fill. */
export function connectableParamKeys(op: string): { clip: string[]; frame: string[] } {
  const params = OP_PARAMS[op] ?? [];
  const keys = params.map((p) => p.key);
  return {
    clip: keys.filter((k) => k === "clipId" || k === "clipIds"),
    frame: keys.filter((k) => k === "start" || k === "delay"),
  };
}

export type GraphIssue = { nodeId?: string; level: "error" | "warning"; message: string };

/**
 * Validate a studio graph and return readable, node-specific issues.
 * Detached blocks are warnings; anything that would break the run is an error.
 */
export function validateGraph(graph: ToolGraph, ctx: ToolContext): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id: string) => {
    const n = nodes.get(id);
    if (!n) return "a deleted block";
    if (n.type === "action") return n.block ? BLOCK_MAP.get(n.block)?.label ?? n.block : n.op ?? "a block";
    return n.type;
  };
  const starts = graph.nodes.filter((n) => n.type === "start");
  if (!starts.length) issues.push({ level: "error", message: "The tool needs a Start block." });
  const nextCount = new Map<string, number>(), bodyCount = new Map<string, number>(), inCount = new Map<string, number>();
  const outgoing = new Map<string, ToolGraphEdge[]>();
  for (const e of graph.edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) { issues.push({ level: "error", message: "A connection points at a deleted block." }); continue; }
    if (e.source === e.target) issues.push({ nodeId: e.source, level: "error", message: "A block cannot connect to itself." });
    if (e.sourceHandle === "next") nextCount.set(e.source, (nextCount.get(e.source) ?? 0) + 1);
    if (e.sourceHandle === "body") bodyCount.set(e.source, (bodyCount.get(e.source) ?? 0) + 1);
    if (e.targetHandle === "in") inCount.set(e.target, (inCount.get(e.target) ?? 0) + 1);
    if (e.sourceHandle === "next" || e.sourceHandle === "body") {
      outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    }
  }
  for (const [id, c] of Array.from(nextCount)) if (c > 1) issues.push({ nodeId: id, level: "error", message: "A block can only have one block after it." });
  for (const [id, c] of Array.from(bodyCount)) if (c > 1) issues.push({ nodeId: id, level: "error", message: "A repeat or function can only have one first block in its body." });
  for (const [id, c] of Array.from(inCount)) if (c > 1) issues.push({ nodeId: id, level: "error", message: "A block can only have one block before it." });
  // Reachability and cycle detection from every start (and function bodies are entered via "body").
  const reachable = new Set<string>();
  const cycle = (startId: string): string | undefined => {
    const stack: { id: string; path: Set<string> }[] = [{ id: startId, path: new Set() }];
    while (stack.length) {
      const { id, path } = stack.pop()!;
      if (path.has(id)) return id;
      reachable.add(id);
      for (const o of Array.from(outgoing.get(id) ?? [])) stack.push({ id: o.target, path: new Set(Array.from(path).concat([id])) });
    }
    return undefined;
  };
  for (const s of starts) {
    const c = cycle(s.id);
    if (c) issues.push({ nodeId: c, level: "error", message: "These blocks form a loop — remove the connection that closes it." });
  }
  for (const n of graph.nodes) {
    if (n.type === "start" || n.type === "clipRef" || n.type === "frame" || n.type === "function" || n.type === "comment") continue;
    if (!reachable.has(n.id)) issues.push({ nodeId: n.id, level: "warning", message: `"${label(n.id)}" is not connected to Start, so it will not run.` });
  }
  // Action nodes: op known, JSON valid, friendly fields sane.
  const ANIMATABLE_KEYS = Object.keys(ANIMATABLE);
  const EASING_IDS = [...Object.keys(EASINGS), "hold", "step-start", "bounce-out", "elastic-out"];
  const numericish = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && (v.includes("$") || Number.isFinite(Number(v))));
  for (const n of graph.nodes) {
    if (n.type !== "action") continue;
    const op = n.op ?? (n.block ? BLOCK_MAP.get(n.block)?.op : undefined);
    if (!op) { issues.push({ nodeId: n.id, level: "error", message: "Choose what this block does." }); continue; }
    for (const p of OP_PARAMS[op] ?? []) {
      if (p.type === "json" && typeof n.args?.[p.key] === "string") {
        try { JSON.parse(n.args[p.key] as string); } catch { issues.push({ nodeId: n.id, level: "error", message: `${p.label} is not valid JSON.` }); }
      }
    }
    // Motion blocks: the preset must exist in the engine.
    if (op === "apply_motion" && typeof n.args?.preset === "string" && !PRESET_IDS.includes(n.args.preset)) {
      issues.push({ nodeId: n.id, level: "error", message: `"${n.args.preset}" is not a motion preset — pick one from the list.` });
    }
    // Animate-property blocks: property, easing and from/to must make sense.
    if (op === "set_keyframes" && n.args?.keyframes === undefined && n.args?.from !== undefined) {
      if (typeof n.args.property !== "string" || !ANIMATABLE_KEYS.includes(n.args.property)) issues.push({ nodeId: n.id, level: "error", message: "Pick a property to animate." });
      if (typeof n.args.easing === "string" && n.args.easing && !EASING_IDS.includes(n.args.easing)) issues.push({ nodeId: n.id, level: "error", message: `"${n.args.easing}" is not an easing — pick one from the list.` });
      if (!numericish(n.args.from) || !numericish(n.args.to)) issues.push({ nodeId: n.id, level: "error", message: "From and To must be numbers." });
    }
    // Text-effect blocks: mode, duration and delay must make sense.
    if (op === "update_clip" && typeof n.args?.__textRevealMode === "string" && !["typewriter", "words", "lines"].includes(n.args.__textRevealMode)) {
      issues.push({ nodeId: n.id, level: "error", message: "Pick a text effect: typewriter, words or lines." });
    }
  }
  // Control nodes.
  for (const n of graph.nodes) {
    if (n.type === "repeat" && !(Number(n.count) >= 1)) issues.push({ nodeId: n.id, level: "error", message: "Repeat needs a count of at least 1." });
    if (n.type === "eachClip" && !["all", "text", "shape", "media", "selected"].includes(n.select ?? "all")) issues.push({ nodeId: n.id, level: "error", message: "For each clip needs a valid clip filter." });
  }
  // Functions: names, calls, recursion.
  const fnNodes = graph.nodes.filter((n) => n.type === "function");
  const fnNames = new Map<string, number>();
  for (const f of fnNodes) if (f.name) fnNames.set(f.name, (fnNames.get(f.name) ?? 0) + 1);
  for (const [name, c] of Array.from(fnNames)) if (c > 1) issues.push({ level: "error", message: `Two functions are both called "${name}".` });
  for (const n of graph.nodes) {
    if (n.type === "call" && !(fnNames.has(n.name ?? "") && (fnNames.get(n.name!) ?? 0) === 1)) issues.push({ nodeId: n.id, level: "error", message: `There is no function called "${n.name ?? ""}".` });
  }
  const fnById = new Map<string, ToolGraphNode>();
  for (const f of fnNodes) if (f.name && (fnNames.get(f.name) ?? 0) === 1) fnById.set(f.name, f);
  for (const f of fnNodes) {
    // Recursion: can the function's body reach the function itself (directly or through calls)?
    const seen = new Set<string>();
    const stack: string[] = Array.from(outgoing.get(f.id) ?? []).map((o) => o.target);
    let selfRef = false;
    while (stack.length) {
      const id = stack.pop()!;
      if (id === f.id) { selfRef = true; break; }
      if (seen.has(id)) continue;
      seen.add(id);
      for (const o of Array.from(outgoing.get(id) ?? [])) stack.push(o.target);
      const n = nodes.get(id);
      if (n?.type === "call" && n.name && fnById.has(n.name)) stack.push(fnById.get(n.name)!.id);
    }
    if (selfRef) issues.push({ nodeId: f.id, level: "error", message: `Function "${f.name}" cannot call itself.` });
  }
  // Param connections: clip and frame sources must land on matching fields.
  for (const e of graph.edges) {
    if (!e.targetHandle?.startsWith("param:")) continue;
    const key = e.targetHandle.slice(6);
    const src = nodes.get(e.source), dst = nodes.get(e.target);
    if (src?.type === "clipRef" && !["clipId", "clipIds"].includes(key)) issues.push({ nodeId: e.target, level: "error", message: "A clip can only connect to a clip field." });
    if (src?.type === "frame" && !["start", "delay"].includes(key)) issues.push({ nodeId: e.target, level: "error", message: "A frame can only connect to a time field." });
    if (dst?.type !== "action") issues.push({ nodeId: e.target, level: "error", message: "Connections only fit on action blocks." });
  }
  // Clip references must still exist; frames must be whole numbers.
  for (const n of graph.nodes) {
    if (n.type === "clipRef" && n.clipId && !ctx.clips.some((c) => c.id === n.clipId)) issues.push({ nodeId: n.id, level: "error", message: "This clip no longer exists in the timeline." });
    if (n.type === "frame" && (!(Number(n.frame) >= 0) || !Number.isInteger(Number(n.frame)))) issues.push({ nodeId: n.id, level: "error", message: "A frame needs to be a whole number, 0 or more." });
  }
  return issues;
}

/**
 * Compile a studio graph into timeline operations: walk the chain from Start,
 * expand Repeat and For-each-clip bodies, inline function calls, and resolve
 * clip and frame connections into argument values. Throws on invalid graphs.
 */
export function compileGraph(graph: ToolGraph, ctx: ToolContext): TimelineOp[] {
  const fatal = validateGraph(graph, ctx).find((i) => i.level === "error");
  if (fatal) throw new Error(fatal.message);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const next = new Map<string, string>(), body = new Map<string, string>();
  const paramIn = new Map<string, ToolGraphEdge>();
  for (const e of graph.edges) {
    if (e.sourceHandle === "next") next.set(e.source, e.target);
    else if (e.sourceHandle === "body") body.set(e.source, e.target);
    else if (e.targetHandle?.startsWith("param:")) paramIn.set(`${e.target}:${e.targetHandle.slice(6)}`, e);
  }
  const functions = new Map<string, ToolGraphNode>();
  for (const n of graph.nodes) if (n.type === "function" && n.name) functions.set(n.name, n);
  const ops: TimelineOp[] = [];
  const push = (op: string, args: Record<string, unknown>) => {
    if (ops.length >= 100) throw new Error("the tool expands to more than 100 operations; the batch limit");
    ops.push({ op, args });
  };
  const connectable = (op: string, key: string, kind: "clipRef" | "frame"): boolean => {
    if (kind === "clipRef") return ["clipId", "clipIds"].includes(key);
    return ["start", "delay"].includes(key);
  };
  const runChain = (id: string | undefined, vars: ToolVars, visited: Set<string>) => {
    while (id) {
      if (visited.has(id)) throw new Error("the blocks form a loop; remove the cycle");
      visited.add(id);
      const node = nodes.get(id);
      if (!node) break;
      if (node.type === "action") {
        const op = node.op ?? (node.block ? BLOCK_MAP.get(node.block)?.op : undefined);
        if (!op) throw new Error("a block is missing its operation");
        const args = resolveArgs(node.args, vars);
        // Connected clip and frame values override the editable fields.
        for (const [slot, e] of Array.from(paramIn)) {
          if (!slot.startsWith(`${node.id}:`)) continue;
          const key = slot.split(":")[1];
          const src = nodes.get(e.source);
          if (!src || !connectable(op, key, src.type === "clipRef" ? "clipRef" : "frame")) continue;
          if (src.type === "clipRef") args[key] = src.clipId ?? "";
          else if (src.type === "frame") args[key] = (src.frame ?? 0) / Math.max(1, ctx.fps);
        }
        push(op, convertOpArgs(op, args));
      } else if (node.type === "repeat") {
        const count = Math.max(0, Math.min(1000, Math.round(Number(node.count) || 0)));
        for (let i = 0; i < count; i++) runChain(body.get(id), { ...vars, index: i, count }, new Set(visited));
      } else if (node.type === "eachClip") {
        const select = node.select ?? "all";
        const clips = ctx.clips.filter((c) => select === "all" || (select === "selected" ? ctx.selection.includes(c.id) : c.kind === select));
        clips.forEach((c, i) => runChain(body.get(id ?? ""), { ...vars, clipId: c.id, index: i, count: clips.length }, new Set(visited)));
      } else if (node.type === "call") {
        const fn = functions.get(node.name ?? "");
        if (!fn) throw new Error(`there is no function called "${node.name ?? ""}"`);
        runChain(body.get(fn.id), { ...vars }, new Set(visited));
      }
      id = next.get(id);
    }
  };
  const start = graph.nodes.find((n) => n.type === "start");
  runChain(start ? next.get(start.id) : undefined, { ...ctx, index: 0, count: 1, clipId: "" }, new Set());
  return ops;
}

/** Migrate a saved nested-blocks tool to the studio graph. */
export function blocksToGraph(blocks: ToolBlock[]): ToolGraph {
  const nodes: ToolGraphNode[] = [{ id: "start", type: "start", position: { x: 60, y: 60 } }];
  const edges: ToolGraphEdge[] = [];
  let y = 60;
  const chain = (list: ToolBlock[], parentId: string, parentHandle: "next" | "body") => {
    for (const block of list) {
      const id = `n${nodes.length}`;
      y += 140;
      if (block.kind === "op") nodes.push({ id, type: "action", op: block.op, args: { ...block.args }, position: { x: 60, y } });
      else if (block.kind === "comment") nodes.push({ id, type: "comment", text: block.text, position: { x: 60, y } });
      else if (block.kind === "repeat") { nodes.push({ id, type: "repeat", count: block.count, position: { x: 60, y } }); chain(block.blocks, id, "body"); }
      else if (block.kind === "eachClip") { nodes.push({ id, type: "eachClip", select: block.select, position: { x: 60, y } }); chain(block.blocks, id, "body"); }
      edges.push({ id: `e${edges.length}`, source: parentId, sourceHandle: parentHandle, target: id, targetHandle: "in" });
      parentId = id;
      parentHandle = "next";
    }
  };
  chain(blocks, "start", "next");
  return { nodes, edges };
}

/** Run a tool in any mode. */
export function runTool(tool: CustomTool, ctx: ToolContext): TimelineOp[] {
  if (tool.mode === "code") return runCodeTool(tool.code ?? "", ctx);
  if (tool.graph) return compileGraph(tool.graph, ctx);
  return compileBlocks(tool.blocks ?? [], ctx);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Blocks → code: turn a studio graph into readable, commented JavaScript that
 * uses the vf helper and produces the exact same operations as compileGraph.
 * ────────────────────────────────────────────────────────────────────────── */

/** The JS expressions standing in for the $-templates at this point in the code. */
type CodeVars = { playhead: string; duration: string; index: string; count: string; clipId: string; selection: string };

const TOP_VARS: CodeVars = { playhead: "vf.playhead", duration: "vf.duration", index: "0", count: "1", clipId: '""', selection: 'vf.selection.join(",")' };
const TEMPLATE_TOKEN = /\$(playhead|duration|index|count|clipId|selection)/;

/** Split a template string into literal chunks and $-template names. */
function templateChunks(value: string): { lit?: string; name?: string }[] {
  const out: { lit?: string; name?: string }[] = [];
  let rest = value;
  for (;;) {
    const m = TEMPLATE_TOKEN.exec(rest);
    if (!m) { if (rest) out.push({ lit: rest }); return out; }
    if (m.index > 0) out.push({ lit: rest.slice(0, m.index) });
    out.push({ name: m[1] });
    rest = rest.slice(m.index + m[0].length);
  }
}

function hasTemplate(value: string): boolean { return TEMPLATE_TOKEN.test(value); }

/** Does resolveValue's arithmetic path apply (substituted text is only numbers and operators)? */
function isArithmeticTemplate(value: string): boolean {
  if (!hasTemplate(value)) return false;
  const substituted = value.replace(/\$(playhead|duration|index|count|clipId|selection)/g, "1");
  return /^[0-9+\-*/().\s]+$/.test(substituted) && /\d/.test(substituted);
}

/** A $-template as a parenthesised JS expression. */
function templateExpr(name: string, vars: CodeVars): string {
  return `(${vars[name as keyof CodeVars]})`;
}

/** A template string as a JS string-concatenation expression (mirrors resolveValue's substitution). */
function concatExpr(value: string, vars: CodeVars): string {
  const parts = templateChunks(value).map((c) => (c.name ? templateExpr(c.name, vars) : JSON.stringify(c.lit)));
  return parts.length ? parts.join(" + ") : '""';
}

/** A pure-arithmetic template as a numeric JS expression. */
function arithmeticExpr(value: string, vars: CodeVars): string {
  return templateChunks(value).map((c) => (c.name ? templateExpr(c.name, vars) : c.lit ?? "")).join("").replace(/\s+/g, " ");
}

/** A JSON param's string as code: literal object when static, JSON.parse(concatenation) when templated. */
function jsonArgExpr(value: string, vars: CodeVars): string {
  if (!hasTemplate(value)) {
    try { return JSON.stringify(JSON.parse(value)); } catch { /* fall through to runtime parse */ }
  }
  const parts = templateChunks(value).map((c) => (c.name ? templateExpr(c.name, vars) : JSON.stringify(c.lit)));
  return `JSON.parse(${parts.join(" + ")})`;
}

/** A clipIds list as code: arrays exactly like convertOpArgs produces. */
function clipIdsExpr(value: string, vars: CodeVars): string {
  if (value === "$selection") return "vf.selection.slice()";
  if (!hasTemplate(value)) {
    const list = value.split(",").map((x) => x.trim()).filter(Boolean);
    return JSON.stringify(list);
  }
  return `String(${concatExpr(value, vars)}).split(",").map((s) => s.trim()).filter(Boolean)`;
}

/** Render one argument value as a JS expression, mirroring resolveArgs + convertOpArgs. */
function argExpr(key: string, value: unknown, op: string, vars: CodeVars): string {
  const param = (OP_PARAMS[op] ?? []).find((p) => p.key === key);
  if (value === null || value === undefined) return "undefined";
  // Frame connections become seconds against the runtime fps, like compileGraph.
  if (typeof value === "object" && value !== null && "__frame" in (value as Record<string, unknown>)) {
    return `${(value as { __frame: number }).__frame} / Math.max(1, vf.fps)`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value !== "string") return JSON.stringify(value);
  if (key === "clipIds") return clipIdsExpr(value, vars);
  if (param?.type === "json") return jsonArgExpr(value, vars);
  if (isArithmeticTemplate(value)) return arithmeticExpr(value, vars);
  if (hasTemplate(value)) return concatExpr(value, vars);
  if (param?.type === "number" && Number.isFinite(Number(value))) return String(Number(value));
  return JSON.stringify(value);
}

/** Render every arg of an action node, applying convertOpArgs's static transforms. */
function renderArgs(op: string, args: Record<string, unknown>, vars: CodeVars): { exprs: string[]; shape?: string } {
  const exprs: string[] = [];
  let shape: string | undefined;
  const textRevealBlock = op === "update_clip" && typeof args.__textRevealMode === "string";
  const colorCycleBlock = op === "update_clip" && typeof args.__colorCycle === "string";
  for (const key of Object.keys(args)) {
    if (op === "update_clip" && key === "patch") continue; // merged below
    if (textRevealBlock && (key === "__textRevealMode" || key === "duration" || key === "delay")) continue; // synthesized below
    if (colorCycleBlock && (key === "__colorCycle" || key === "cycleDuration")) continue; // synthesized below
    if (op === "add_shape_clip" && ["shapeType", "width", "height", "fill"].includes(key)) continue; // nested into shape
    exprs.push(`${JSON.stringify(key)}: ${argExpr(key, args[key], op, vars)}`);
  }
  if (op === "update_clip" && typeof args.patch === "string") exprs.push(`...(${jsonArgExpr(args.patch, vars)})`);
  if (textRevealBlock && ["typewriter", "words", "lines"].includes(args.__textRevealMode as string)) {
    exprs.push(`textReveal: { mode: ${JSON.stringify(args.__textRevealMode)}, duration: Math.max(0.1, Number(${argExpr("duration", args.duration ?? 1.5, op, vars)}) || 1.5), delay: Math.max(0, Number(${argExpr("delay", args.delay ?? 0, op, vars)}) || 0) }`);
  }
  if (colorCycleBlock) {
    const steps = String(args.__colorCycle).split(",").map((s) => s.trim()).filter((s) => /^#[0-9a-fA-F]{6}$/.test(s)).slice(0, 8);
    if (steps.length >= 2) exprs.push(`textColorCycle: { steps: ${JSON.stringify(steps)}, duration: Math.max(0.2, Number(${argExpr("cycleDuration", args.cycleDuration ?? 2, op, vars)}) || 2) }`);
  }
  if (op === "add_shape_clip" && args.shape === undefined) {
    shape = `{ type: ${argExpr("shapeType", args.shapeType ?? "rectangle", op, vars)}, width: ${argExpr("width", args.width ?? 0.35, op, vars)}, height: ${argExpr("height", args.height ?? 0.2, op, vars)}, fill: ${argExpr("fill", args.fill ?? "#f6a447", op, vars)} }`;
  }
  return { exprs, shape };
}

const JS_RESERVED = new Set(["await","break","case","catch","class","const","continue","debugger","default","delete","do","else","enum","export","extends","false","finally","for","function","if","import","in","instanceof","new","null","return","super","switch","this","throw","true","try","typeof","var","void","while","with","yield","let","static","async","of"]);

/** A safe JS identifier for a function name from the graph. */
function safeFnName(name: string, taken: Set<string>): string {
  const base = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !JS_RESERVED.has(name) ? name : "fn";
  let out = base, n = 2;
  while (taken.has(out)) out = `${base}${n++}`;
  taken.add(out);
  return out;
}

/**
 * Convert a studio graph into readable, commented JavaScript that runs through
 * the vf helper and produces the same operations as compileGraph — so kids can
 * see how their blocks look as code. Expects a graph that already validates.
 */
export function graphToCode(graph: ToolGraph): string {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const next = new Map<string, string>(), body = new Map<string, string>();
  const paramIn = new Map<string, ToolGraphEdge>();
  for (const e of graph.edges) {
    if (e.sourceHandle === "next") next.set(e.source, e.target);
    else if (e.sourceHandle === "body") body.set(e.source, e.target);
    else if (e.targetHandle?.startsWith("param:")) paramIn.set(`${e.target}:${e.targetHandle.slice(6)}`, e);
  }
  const fnNodes = graph.nodes.filter((n) => n.type === "function" && n.name);
  const taken = new Set<string>();
  const fnNames = new Map<string, string>();
  for (const f of fnNodes) fnNames.set(f.id, safeFnName(f.name ?? "", taken));

  const lines: string[] = [];
  const emit = (depth: number, line: string) => lines.push("  ".repeat(depth) + line);

  /** The args of an action node with clip/frame connections applied (as at run time). */
  const nodeArgs = (node: ToolGraphNode): Record<string, unknown> => {
    const args: Record<string, unknown> = { ...(node.args ?? {}) };
    for (const [slot, e] of Array.from(paramIn)) {
      if (!slot.startsWith(`${node.id}:`)) continue;
      const key = slot.split(":")[1];
      const src = nodes.get(e.source);
      if (!src) continue;
      if (src.type === "clipRef" && ["clipId", "clipIds"].includes(key)) args[key] = src.clipId ?? "";
      else if (src.type === "frame" && ["start", "delay"].includes(key)) args[key] = { __frame: src.frame ?? 0 };
    }
    return args;
  };

  /** One action node as a statement. Raw pushes cover ops the helpers can't express losslessly. */
  const emitAction = (node: ToolGraphNode, vars: CodeVars, depth: number) => {
    const op = node.op ?? (node.block ? BLOCK_MAP.get(node.block)?.op : undefined) ?? "";
    const block = node.block ? BLOCK_MAP.get(node.block) : undefined;
    const label = block?.label ?? op ?? "Advanced op";
    emit(depth, `// ${label}${block?.description ? " — " + block.description.toLowerCase() : ""}`);
    const args = nodeArgs(node);
    const rendered = renderArgs(op, args, vars);
    const entries = (skip: string[] = []) => rendered.exprs.filter((e) => !skip.some((k) => e.startsWith(JSON.stringify(k) + ":")));
    const obj = (list: string[]) => `{ ${list.join(", ")} }`;
    /** vf helpers refuse empty clip ids; raw pushes reproduce compileGraph exactly. */
    const safeId = (expr: string) => {
      const inner = expr.startsWith("(") && expr.endsWith(")") ? expr.slice(1, -1) : expr;
      return /^c\d+\.id$/.test(inner) || /^"[^"]+"$/.test(inner);
    };
    const idExpr = argExpr("clipId", args.clipId ?? "$clipId", op, vars);
    const rawPush = () => `ops.push({ op: ${JSON.stringify(op)}, args: ${obj(rendered.exprs)} });`;
    let stmt: string;
    if (op === "update_clip" && typeof args.__textRevealMode === "string" && safeId(idExpr)) {
      const mode = JSON.stringify(args.__textRevealMode);
      const dur = `Math.max(0.1, Number(${argExpr("duration", args.duration ?? 1.5, op, vars)}) || 1.5)`;
      const del = `Math.max(0, Number(${argExpr("delay", args.delay ?? 0, op, vars)}) || 0)`;
      stmt = `ops.push(vf.textEffect(${idExpr}, ${mode}, { duration: ${dur}, delay: ${del} }));`;
    } else if (op === "update_clip" && typeof args.__colorCycle === "string" && safeId(idExpr)) {
      const steps = JSON.stringify(String(args.__colorCycle).split(",").map((s) => s.trim()).filter((s) => /^#[0-9a-fA-F]{6}$/.test(s)).slice(0, 8));
      const dur = `Math.max(0.2, Number(${argExpr("cycleDuration", args.cycleDuration ?? 2, op, vars)}) || 2)`;
      stmt = `ops.push(vf.colorCycle(${idExpr}, ${steps}, ${dur}));`;
    } else if (op === "update_clip" && safeId(idExpr)) {
      const patch = obj(entries(["clipId"]));
      stmt = `ops.push(vf.update(${idExpr}, ${patch}));`;
    } else if (op === "remove_clip" && safeId(idExpr)) {
      stmt = `ops.push(vf.remove(${idExpr}));`;
    } else if (op === "duplicate_clip" && args.newId === undefined && safeId(idExpr)) {
      stmt = args.start === undefined ? `ops.push(vf.duplicate(${idExpr}));` : `ops.push(vf.duplicate(${idExpr}, ${argExpr("start", args.start, op, vars)}));`;
    } else if (op === "apply_motion" && Object.keys(args).every((k) => ["clipId", "preset", "duration", "delay", "strength"].includes(k)) && safeId(idExpr)) {
      const preset = argExpr("preset", args.preset ?? "", op, vars);
      const opts = obj(entries(["clipId", "preset"]));
      stmt = `ops.push(vf.motion(${idExpr}, ${preset}, ${opts}));`;
    } else if (op === "set_keyframes" && ["clipId", "property", "keyframes"].every((k) => k in args) && safeId(idExpr)) {
      const prop = argExpr("property", args.property, op, vars);
      const keys = argExpr("keyframes", args.keyframes, op, vars);
      stmt = `ops.push(vf.keyframes(${idExpr}, ${prop}, ${keys}));`;
    } else if (op === "set_keyframes" && args.keyframes === undefined && args.from !== undefined && args.to !== undefined && safeId(idExpr)) {
      // The friendly from/to animation block, as readable code.
      const prop = argExpr("property", args.property ?? "scale", op, vars);
      const from = `Number(${argExpr("from", args.from, op, vars)})`;
      const to = `Number(${argExpr("to", args.to, op, vars)})`;
      const dur = `Math.max(0.01, Number(${argExpr("duration", args.duration ?? 1, op, vars)}) || 1)`;
      const del = `Math.max(0, Number(${argExpr("delay", args.delay ?? 0, op, vars)}) || 0)`;
      const ease = argExpr("easing", args.easing ?? "ease-out", op, vars);
      stmt = `ops.push(vf.animateProperty(${idExpr}, ${prop}, ${from}, ${to}, { duration: ${dur}, delay: ${del}, easing: ${ease} }));`;
    } else if (op === "animate_code" && ["clipId", "expressions"].every((k) => k in args) && safeId(idExpr)) {
      const expr = argExpr("expressions", args.expressions, op, vars);
      stmt = `ops.push(vf.animate(${idExpr}, ${expr}));`;
    } else if (op === "add_text_clip" && args.start !== undefined) {
      stmt = `ops.push(vf.addText(${obj(entries())}));`;
    } else if (op === "add_shape_clip") {
      stmt = `ops.push(vf.addShape(${obj([...entries(["shapeType", "width", "height", "fill"]), rendered.shape ? `shape: ${rendered.shape}` : ""].filter(Boolean))}));`;
    } else if (op === "stagger_clips" && args.start !== undefined) {
      const ids = argExpr("clipIds", args.clipIds ?? "$selection", op, vars);
      stmt = `ops.push(vf.stagger(${ids}, ${obj(entries(["clipIds"]))}));`;
    } else if (op === "add_beat_markers" && args.bpm !== undefined) {
      stmt = `ops.push(vf.markers(${argExpr("bpm", args.bpm, op, vars)}, ${argExpr("count", args.count ?? 8, op, vars)}));`;
    } else {
      stmt = rawPush();
    }
    emit(depth, stmt);
  };

  const LOOP_VARS = ["i", "j", "k", "m", "n", "p", "q", "r"];
  let loopDepth = 0;

  /** Walk a chain of blocks, the way compileGraph does. */
  const walkChain = (id: string | undefined, vars: CodeVars, depth: number, visited: Set<string>) => {
    while (id) {
      const node = nodes.get(id);
      if (!node || visited.has(id)) break;
      visited.add(id);
      if (node.type === "comment") {
        emit(depth, `// ${node.text ?? ""}`);
      } else if (node.type === "action") {
        emitAction(node, vars, depth);
      } else if (node.type === "repeat") {
        const count = Math.max(0, Math.min(1000, Math.round(Number(node.count) || 0)));
        const v = LOOP_VARS[Math.min(loopDepth, LOOP_VARS.length - 1)];
        loopDepth++;
        emit(depth, `// Repeat ${count} times`);
        emit(depth, `for (let ${v} = 0; ${v} < ${count}; ${v}++) {`);
        walkChain(body.get(id), { ...vars, index: v, count: String(count) }, depth + 1, new Set(visited));
        emit(depth, "}");
        loopDepth--;
      } else if (node.type === "eachClip") {
        const select = node.select ?? "all";
        const v = LOOP_VARS[Math.min(loopDepth, LOOP_VARS.length - 1)];
        loopDepth++;
        const arr = `clips${loopDepth}`;
        const iter = `c${loopDepth}`;
        const filter = select === "all" ? "vf.clips" : select === "selected" ? "vf.clips.filter((c) => vf.selection.includes(c.id))" : `vf.clips.filter((c) => c.kind === ${JSON.stringify(select)})`;
        emit(depth, `// For every ${select === "all" ? "" : select + " "}clip`);
        emit(depth, `const ${arr} = ${filter};`);
        emit(depth, `let ${v} = 0;`);
        emit(depth, `for (const ${iter} of ${arr}) {`);
        walkChain(body.get(id), { ...vars, clipId: `${iter}.id`, index: v, count: `${arr}.length` }, depth + 1, new Set(visited));
        emit(depth, `  ${v}++;`);
        emit(depth, "}");
        loopDepth--;
      } else if (node.type === "call") {
        const fn = fnNodes.find((f) => f.name === node.name);
        const target = fn ? fnNames.get(fn.id) : undefined;
        if (target) {
          emit(depth, `// Call ${node.name}`);
          emit(depth, `${target}(${vars.index}, ${vars.count}, ${vars.clipId});`);
        }
      }
      id = next.get(id);
    }
  };

  lines.push("// Blocks were converted to code — this tool now runs the code.");
  lines.push("// vf has the playhead, selection, every clip and the project fps.");
  lines.push("// Build a list of operations and return it; they run as one undoable step.");
  lines.push("");
  lines.push("const ops = [];");
  lines.push("");

  // Function definitions come first so the chain can call them.
  for (const f of fnNodes) {
    const name = fnNames.get(f.id) ?? "fn";
    lines.push(`// Function "${f.name}" — a named group of blocks.`);
    lines.push(`const ${name} = (index, count, clipId) => {`);
    walkChain(body.get(f.id), { ...TOP_VARS, index: "index", count: "count", clipId: "clipId" }, 1, new Set());
    lines.push("};");
    lines.push("");
  }

  lines.push("// When the tool runs:");
  const start = graph.nodes.find((n) => n.type === "start");
  walkChain(start ? next.get(start.id) : undefined, TOP_VARS, 0, new Set());
  if (start && next.get(start.id) === undefined) lines.push("// (nothing is connected to Start yet)");
  lines.push("");
  lines.push("return ops;");
  return lines.join("\n");
}

/** Persistence (localStorage) for user tools. */
const STORAGE_KEY = "vf.custom-tools.v1";

export function loadUserTools(storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }): CustomTool[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is CustomTool => !!t && typeof t === "object" && typeof t.name === "string" && (t.mode === "blocks" || t.mode === "code"));
  } catch { return []; }
}

export function saveUserTools(tools: CustomTool[], storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(tools));
}

/** Build a context from a live timeline. */
export function toolContext(timeline: { clips: Clip[]; resolution: { width: number; height: number }; fps?: number }, playhead: number, selection: string[], duration: number): ToolContext {
  const clips = timeline.clips
    .filter((c) => c.track !== "audio")
    .map((c) => ({ id: c.id, kind: (c.shape ? "shape" : c.assetId ? "media" : "text") as "text" | "shape" | "media", start: c.start, duration: (c.outPoint - c.inPoint) / (c.speed ?? 1), label: c.label ?? c.text?.slice(0, 40) }));
  return { playhead, duration, selection: [...selection], clips, resolution: { ...timeline.resolution }, fps: timeline.fps ?? 30 };
}

