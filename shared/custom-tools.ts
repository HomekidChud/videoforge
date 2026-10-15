/** Custom tools: user-authored timeline automations, written in JavaScript or assembled from blocks. */
import type { TimelineOp } from "./editing";
import type { Clip } from "./timeline";

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
 * shape fields nest into the shape object.
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
  if (op === "add_shape_clip" && args.shape === undefined) {
    args.shape = { type: args.shapeType ?? "rectangle", width: args.width, height: args.height, fill: args.fill };
    delete args.shapeType; delete args.width; delete args.height; delete args.fill;
  }
  return args;
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
 */
export function runCodeTool(code: string, ctx: ToolContext): TimelineOp[] {
  const vf = makeCodeApi(ctx);
  let result: unknown;
  try {
    const fn = new Function("vf", `"use strict";\n${code}`);
    result = fn(vf);
  } catch (e: any) {
    throw new Error(e?.message ? `code error: ${e.message}` : "the code could not run");
  }
  return normalizeOps(result);
}

/** The helper API exposed to code tools. */
export function makeCodeApi(ctx: ToolContext) {
  const op = (o: TimelineOp) => o;
  const needId = (id: unknown) => { if (!id || typeof id !== "string") throw new Error("this helper needs a clip id"); return id; };
  return {
    playhead: ctx.playhead,
    duration: ctx.duration,
    selection: [...ctx.selection],
    clips: ctx.clips.map((c) => ({ ...c })),
    resolution: { ...ctx.resolution },
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
  };
}

/**
 * The child-friendly block palette for the full-screen studio. Each block maps
 * to one timeline operation with ready-made arguments; editors only touch the
 * listed params. Raw operations stay available through the Advanced block.
 */
export type FriendlyBlock = {
  id: string;
  label: string;
  group: "Create" | "Animate" | "Style" | "Clips" | "Timing" | "Advanced";
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
};

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
];
export const BLOCK_MAP = new Map(BLOCK_LIBRARY.map((b) => [b.id, b]));
export const BLOCK_GROUPS = ["Create", "Animate", "Style", "Clips", "Timing", "Advanced"] as const;

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
  // Action nodes: op known, JSON valid.
  for (const n of graph.nodes) {
    if (n.type !== "action") continue;
    const op = n.op ?? (n.block ? BLOCK_MAP.get(n.block)?.op : undefined);
    if (!op) { issues.push({ nodeId: n.id, level: "error", message: "Choose what this block does." }); continue; }
    for (const p of OP_PARAMS[op] ?? []) {
      if (p.type === "json" && typeof n.args?.[p.key] === "string") {
        try { JSON.parse(n.args[p.key] as string); } catch { issues.push({ nodeId: n.id, level: "error", message: `${p.label} is not valid JSON.` }); }
      }
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

