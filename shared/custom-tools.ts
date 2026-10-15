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
  code?: string;
  builtIn?: boolean;
};

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
  if (value.includes("$")) {
    try { const n = Function(`"use strict";return (${out})`)(); if (Number.isFinite(n)) return n; } catch { /* keep string */ }
  }
  return out;
}

function resolveArgs(args: Record<string, unknown> | undefined, vars: ToolVars): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) out[k] = resolveValue(v, vars);
  return out;
}

/** Compile a block program into timeline operations for one context. Throws readable errors. */
export function compileBlocks(blocks: ToolBlock[], ctx: ToolContext, into: TimelineOp[] = []): TimelineOp[] {
  const base: ToolVars = { ...ctx, index: 0, count: 1, clipId: "" };
  const walk = (list: ToolBlock[], vars: ToolVars) => {
    for (const block of list) {
      if (block.kind === "comment") continue;
      if (block.kind === "op") {
        if (!block.op || typeof block.op !== "string") throw new Error("an op block needs an operation name");
        const args = resolveArgs(block.args, vars);
        // JSON-typed params are parsed into objects; update_clip patches merge into the op args.
        for (const p of OP_PARAMS[block.op] ?? []) {
          if (p.type !== "json" || typeof args[p.key] !== "string") continue;
          let parsed: unknown;
          try { parsed = JSON.parse(args[p.key] as string); } catch { throw new Error(`${block.op}: ${p.label} must be valid JSON`); }
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            if (block.op === "update_clip" && p.key === "patch") { delete args.patch; Object.assign(args, parsed); }
            else args[p.key] = parsed;
          }
        }
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

/** Run a tool in either mode. */
export function runTool(tool: CustomTool, ctx: ToolContext): TimelineOp[] {
  if (tool.mode === "code") return runCodeTool(tool.code ?? "", ctx);
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
export function toolContext(timeline: { clips: Clip[]; resolution: { width: number; height: number } }, playhead: number, selection: string[], duration: number): ToolContext {
  const clips = timeline.clips
    .filter((c) => c.track !== "audio")
    .map((c) => ({ id: c.id, kind: (c.shape ? "shape" : c.assetId ? "media" : "text") as "text" | "shape" | "media", start: c.start, duration: (c.outPoint - c.inPoint) / (c.speed ?? 1), label: c.label ?? c.text?.slice(0, 40) }));
  return { playhead, duration, selection: [...selection], clips, resolution: { ...timeline.resolution } };
}

