import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel,
  Handle, Position, MarkerType, ReactFlowProvider, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Hash, ToggleLeft, Puzzle, Code2, Film, Timer, Cable, AlignVerticalDistributeCenter, GraduationCap, Languages, Sparkles, Link2, Undo2, Redo2, Clapperboard, Eye, Play, X, Info, Square, Music2, Type as TypeIcon, Plus, Scissors, ArrowUpRight, ArrowDownRight, AlertCircle, Waves, Camera, Pencil, Star, Repeat, MessageSquare } from "lucide-react";
import {
  BLOCK_GROUPS, BLOCK_LIBRARY, BLOCK_MAP, OP_IDS, OP_PARAMS, blocksToGraph, connectableParamKeys, nodeParamKeys, HIDDEN_BLOCKS,
  codeErrorLine, compileGraph, graphToCode, validateGraph, runTool, TEMPLATE_DOCS, VF_HELPERS, APPLY_SCOPES, graphScope, type ApplyScope,
  TOOL_PRESETS, encodeTool, decodeTool, listStickers, stickerArgs, exportStandaloneScript,
  type CustomTool, type ToolContext, type ToolGraph, type ToolGraphNode, type ToolParam, type ToolPreset,
} from "@shared/custom-tools";
import type { TimelineOp } from "@shared/editing";
import { loadLang, saveLang, trLabel, trDescription, trGroup, trHeading, trUI, matchesSearch, type BlockLang } from "@shared/block-i18n";

/** The studio's language, so palette chips and node titles can speak it. */
const LangContext = createContext<BlockLang>("en");

type NodeData = { node: ToolGraphNode; hasError: boolean; hasWarning: boolean; fps: number; functionNames: string[]; connectedParams: Set<string> };
type StudioProps = {
  tool: CustomTool;
  ctx: ToolContext;
  readOnly: boolean;
  onChange: (tool: CustomTool) => void;
  onClose: () => void;
  onRun: (ops: TimelineOp[]) => void;
  /** Opens the clip Animator from the studio header. */
  onOpenAnimator?: () => void;
  /** True when the script was just created with "New blocks", opens the tutorial. */
  fresh?: boolean;
  /** False when opened from a place that only edits code, hides the Blocks tab. */
  allowBlocks?: boolean;
};

const uid = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** One line of help per category, shown as a tooltip on the rail and under the palette title. */
const CATEGORY_HELP: Record<string, string> = {
  Create: "Add new things to your video: titles, shapes, music notes",
  Edit: "Change clips you already have: move, resize, colour, layer",
  Animate: "Make clips move: zoom, slide, spin, pop, glow",
  Rig: "Make clips act like parts of a puppet: pose them together, follow, play Animator animations",
  Text: "Type-on effects, word reveals and colour changes",
  Style: "Looks: filters, brightness, blur, borders",
  Clips: "Copy, delete and reorder clips",
  Timing: "Speed, pauses, fades and start times",
  Stickers: "Clips you saved as reusable building blocks",
  Values: "Text, number and yes/no boxes that plug into any field",
  Flow: "Repeat, loops, functions and notes",
};

/** Palette categories: the shared block groups plus stickers, values and flow. */
const CATEGORIES: Array<{ id: string; label: string; help: string }> = [
  ...BLOCK_GROUPS.map((g) => ({ id: g as string, label: g as string, help: CATEGORY_HELP[g as string] ?? `${g} blocks` })),
  { id: "Stickers", label: "Stickers", help: CATEGORY_HELP.Stickers },
  { id: "Values", label: "Values", help: CATEGORY_HELP.Values },
  { id: "Flow", label: "Flow", help: CATEGORY_HELP.Flow },
];

/** The first-tool tutorial: a guided tour in three short parts. */
const TUTORIAL_KEY = "vf.tutorial.v1";
const TUTORIAL_SECTIONS = ["Your first blocks", "Connecting things", "Power moves"];
const TUTORIAL_STEPS = [
  {
    section: 0,
    title: "Build your first blocks",
    body: "This tour builds a small set of blocks that adds a title to your edit. It has three parts. You are in the first. Press Next to follow along, or Skip if you already know the studio. You can replay this any time with the Tutorial button.",
    target: '[data-testid="bs-name"]',
  },
  {
    section: 0,
    title: "1. Name your blocks",
    body: "Every set of blocks needs a name. Click the name box at the top and type one, try “My first title”.",
    target: '[data-testid="bs-name"]',
  },
  {
    section: 0,
    title: "2. The block menu",
    body: "The left side is the block menu. The coloured dots pick a category such as Create, Animate or Flow, and the list next to it shows that category's blocks. Drag any block from the list onto the canvas to use it.",
    target: '[data-testid="bs-cat-rail"]',
  },
  {
    section: 0,
    title: "3. Green runs first",
    body: "Your canvas already has two blocks: the green “When Apply is pressed” block and an “Add title” block, joined by a wire from the bottom of one to the top of the next. That wire means “do this, then that”. Blocks run in the order the wires connect them.",
    target: '[data-testid="bs-canvas"]',
  },
  {
    section: 0,
    title: "4. Edit a block",
    body: "Click the “Add title” block on the canvas and change its text, type anything you like. Each block shows its own fields right on it, and the little line under the title explains what the block does.",
    target: '[data-testid="bs-canvas"]',
  },
  {
    section: 0,
    title: "5. Apply it to your edit",
    body: "Press the green Apply to edit button. Everything the blocks describe lands on your timeline as one step you can undo. Not sure yet? Preview lists what would change without touching your edit. If something is wrong, the bar at the bottom of the canvas explains what and clicks to the block.",
    target: '[data-testid="bs-run"]',
  },
  {
    section: 1,
    title: "6. Two kinds of wires",
    body: "Green-to-top wires are the run order. They say what happens after what. The small coloured dots beside a block's fields are different: they are sockets where clips, frames and value blocks plug in. Hover a block and its dots appear; drag from a dot into a field to fill it.",
    target: '[data-testid="bs-canvas"]',
  },
  {
    section: 1,
    title: "7. Bring in your clips",
    body: "The Import clips button lists every clip in your project, click one and it becomes a blue clip block. Add frame makes a time block. Drag from a clip block's right-side dot into a Clip field, or a frame block into a Start field, instead of typing IDs.",
    target: '[data-testid="bs-import"]',
  },
  {
    section: 1,
    title: "8. Value blocks",
    body: "The Values category has Text, Number and Yes/No blocks. Drop one next to a block, type your value, then drag from its dot into any field. It is handy when you want the same words or number in several blocks.",
    target: '[data-testid="bs-cat-rail"]',
  },
  {
    section: 2,
    title: "9. Undo and tidy up",
    body: "Made a mistake? Ctrl+Z undoes it (Ctrl+Shift+Z redoes). The studio keeps its own history. And if the canvas gets messy, the Tidy button lines every block up in a neat column. You can undo that too.",
    target: '[data-testid="bs-undo"]',
  },
  {
    section: 2,
    title: "10. Ready-made recipes",
    body: "The Presets button opens example recipes, connected groups of blocks for titles, zooms and more. Click one and its blocks land on the canvas already wired. Take them apart and make them yours. Nothing changes until you press Apply to edit.",
    target: '[data-testid="bs-presets"]',
  },
  {
    section: 2,
    title: "11. Save and find it later",
    body: "Press the X to close. That saves your blocks to your account. Open it again from the Blocks panel (Open in studio), or press the Blocks tab to jump straight back into your latest tool. Curious about code? The Code tab shows the JavaScript your blocks make.",
    target: '[data-testid="bs-close"]',
  },
];

function tutorialSeen(): boolean {
  try { return window.localStorage.getItem(TUTORIAL_KEY) != null; } catch { return false; }
}

/** The default graph for new blocks: green start → Add title. */
export function defaultGraph(): ToolGraph {
  const action = uid();
  return {
    nodes: [
      { id: "start", type: "start", position: { x: 80, y: 60 } },
      { id: action, type: "action", block: "add-title", args: { text: "Your title", duration: 3, start: "$playhead", font: "inter" }, position: { x: 80, y: 210 } },
    ],
    edges: [{ id: uid(), source: "start", sourceHandle: "next", target: action, targetHandle: "in" }],
  };
}

function ParamField({ param, value, onChange, disabled, connect, connected }: { param: ToolParam; value: unknown; onChange: (v: unknown) => void; disabled: boolean; connect?: "clip" | "frame" | "value"; connected?: boolean }) {
  const str = String(value ?? "");
  const common = { value: str, disabled, "aria-label": param.label, "data-testid": `bs-param-${param.key}` } as Record<string, unknown>;
  const showMap = param.type === "json" && !!value && typeof value === "object" && !Array.isArray(value);
  return (
    <label className="bs-field">
      <span className="bs-field-row">
        {connect ? (
          <Handle type="target" position={Position.Left} id={`param:${param.key}`}
            className={`bs-handle bs-handle-param bs-param-${param.key} bs-param-${connect}${connected ? " bs-handle-param-on" : ""}`}
            title={connect === "clip" ? "Drag from a clip block to fill this field" : connect === "frame" ? "Drag from a frame block to fill this field" : "Drag from a value block to fill this field"} />
        ) : null}
        <span className="bs-field-label">{param.label}</span>
      </span>
      {showMap ? <JsonMapField value={value as Record<string, unknown>} onChange={onChange} disabled={disabled} testId={`bs-param-${param.key}`} />
        : param.type === "color" ? <input type="color" {...common} onChange={(e: any) => onChange(e.target.value)} />
        : param.type === "select" ? <select {...common} onChange={(e: any) => onChange(e.target.value)}>{(param.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input type="text" inputMode={param.type === "number" ? "decimal" : undefined} placeholder={String(param.def)} {...common} onChange={(e: any) => onChange(e.target.value)} />}
    </label>
  );
}

/** A saved object shows up as friendly property rows, name on the left, value you can type. */
function JsonMapField({ value, onChange, disabled, testId }: { value: Record<string, unknown>; onChange: (v: unknown) => void; disabled: boolean; testId: string }) {
  const [newKey, setNewKey] = useState("");
  const rows = Object.keys(value);
  /** Keep each property's type: text stays text, numbers stay numbers, yes/no stays yes/no. */
  const parseVal = (k: string, raw: string) => {
    const t = raw.trim();
    if (t === "") return "";
    const cur = value[k];
    if (typeof cur === "number" || typeof cur === "boolean") {
      try { const p = JSON.parse(t); if (typeof p === typeof cur) return p; } catch { /* keep as text */ }
      return raw;
    }
    if (cur === "" || cur === undefined) {
      // a brand-new property: numbers and yes/no stay typed, everything else is text
      try { const p = JSON.parse(t); if (typeof p === "number" || typeof p === "boolean") return p; } catch { /* text */ }
    }
    return raw;
  };
  const setRow = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const removeRow = (k: string) => { const next = { ...value }; delete next[k]; onChange(next); };
  return (
    <div className="bs-json-map" data-testid={`${testId}-map`}>
      {rows.map((k) => (
        <div key={k} className="bs-json-row">
          <span className="bs-json-key">{k}</span>
          <input className="bs-json-val" disabled={disabled} aria-label={`${k} value`} data-testid={`${testId}-row-${k}`}
            value={typeof value[k] === "object" && value[k] !== null ? JSON.stringify(value[k]) : String(value[k] ?? "")}
            onChange={(e) => setRow(k, parseVal(k, e.target.value))} />
          <button type="button" className="bs-json-del" disabled={disabled} aria-label={`Remove ${k}`} onClick={() => removeRow(k)}><X size={12} /></button>
        </div>
      ))}
      <div className="bs-json-row bs-json-add">
        <input className="bs-json-key-input" disabled={disabled} placeholder="property name" aria-label="New property name" data-testid={`${testId}-new-key`}
          value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <button type="button" className="bs-json-add-btn" disabled={disabled || !newKey.trim()} data-testid={`${testId}-add-btn`}
          onClick={() => { const k = newKey.trim(); if (k) { setRow(k, ""); setNewKey(""); } }}>Add property</button>
      </div>
    </div>
  );
}

const InHandle = () => <Handle type="target" position={Position.Top} id="in" className="bs-handle bs-handle-in" />;
const NextHandle = () => <Handle type="source" position={Position.Bottom} id="next" className="bs-handle bs-handle-next" />;
const BodyHandle = () => <Handle type="source" position={Position.Right} id="body" className="bs-handle bs-handle-body" />;

function NodeShell({ children, tone = "default", hasError, hasWarning, title, icon, onDelete }: any) {
  return (
    <div className={`bs-node bs-tone-${tone}${hasError ? " bs-node-error" : ""}${hasWarning && !hasError ? " bs-node-warn" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon">{icon}</span>
        <b>{title}</b>
        {onDelete ? <button className="bs-node-delete" aria-label="Delete block" onClick={onDelete}><X size={12} /></button> : null}
      </div>
      {children}
      <NextHandle />
    </div>
  );
}

function StartNode({ data }: NodeProps) {
  const node = (data as unknown as NodeData).node, ro = (data as any).__readOnly;
  const scope = APPLY_SCOPES.some((x) => x.id === node.args?.scope) ? (node.args!.scope as ApplyScope) : "selection";
  return (
    <div className="bs-node bs-node-start">
      <div className="bs-node-head"><span className="bs-node-icon"><Play size={13} /></span><b>When Apply is pressed</b></div>
      <p className="bs-hint">The green button runs everything below on your edit, as one step you can undo.</p>
      <label className="bs-start-scope">
        <span>Work on</span>
        <select aria-label="Which clips the blocks work on" data-testid="bs-start-scope" value={scope} disabled={ro}
          onChange={(e) => (data as any).__update(node.id, { args: { ...(node.args ?? {}), scope: e.target.value } })}>
          {APPLY_SCOPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <NextHandle />
    </div>
  );
}

function ActionNode({ data, selected }: NodeProps) {
  const lang = useContext(LangContext);
  const d = data as unknown as NodeData;
  const node = d.node;
  const block = node.block ? BLOCK_MAP.get(node.block) : undefined;
  const advanced = node.block === "advanced" || (!block && !!node.op);
  const params = block && !advanced ? block.params : OP_PARAMS[node.op ?? ""] ?? [];
  const connectable = connectableParamKeys(node.op ?? block?.op ?? "");
  const update = (key: string, value: unknown) => { (data as any).__update(node.id, { args: { ...(node.args ?? {}), [key]: value } }); };
  return (
    <NodeShell tone="action" hasError={d.hasError} hasWarning={d.hasWarning}
      title={block ? trLabel(lang, block) : node.op ?? "Advanced op"} icon={(block ? ({ Create: <Plus size={15} />, Edit: <Scissors size={15} />, Entrances: <ArrowUpRight size={15} />, Exits: <ArrowDownRight size={15} />, Attention: <AlertCircle size={15} />, Springy: <Waves size={15} />, Camera: <Camera size={15} />, Animate: <Sparkles size={15} />, Text: <TypeIcon size={15} />, Style: <Pencil size={15} />, Clips: <Film size={15} />, Timing: <Timer size={15} /> } as Record<string, JSX.Element>)[block.group] : undefined) ?? <Star size={15} />}
      onDelete={(data as any).__delete ? () => (data as any).__delete(node.id) : undefined}>
      {block ? <p className="bs-hint">{trDescription(lang, block)}</p> : null}
      {advanced ? (
        <>
          <ParamField param={{ key: "__op", label: "Operation", type: "select", def: node.op ?? "", options: OP_IDS }} value={node.op} onChange={(v) => (data as any).__update(node.id, { op: v, args: {} })} disabled={(data as any).__readOnly} />
          {(OP_PARAMS[node.op ?? ""] ?? []).map((p) => (
            <ParamField key={p.key} param={p} value={node.args?.[p.key] ?? p.def} onChange={(v) => update(p.key, v)}
              disabled={(data as any).__readOnly}
              connected={d.connectedParams.has(p.key)}
              connect={connectable.clip.includes(p.key) ? "clip" : connectable.frame.includes(p.key) ? "frame" : "value"} />
          ))}
        </>
      ) : params.map((p) => (
        <ParamField key={p.key} param={p} value={node.args?.[p.key] ?? p.def} onChange={(v) => update(p.key, v)}
          disabled={(data as any).__readOnly}
          connected={d.connectedParams.has(p.key)}
          connect={connectable.clip.includes(p.key) ? "clip" : connectable.frame.includes(p.key) ? "frame" : "value"} />
      ))}
    </NodeShell>
  );
}

function RepeatNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const lang = useContext(LangContext);
  const node = d.node;
  return (
    <div className={`bs-node bs-node-control${d.hasError ? " bs-node-error" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon"><Repeat size={15} /></span><b>{trUI(lang, "flow-repeat", "Repeat")}</b>
        <input className="bs-count" data-testid="bs-repeat-count" type="text" inputMode="numeric" aria-label="Repeat count" value={node.count ?? 3}
          onChange={(e) => (data as any).__update(node.id, { count: Number(e.target.value) || 0 })} disabled={(data as any).__readOnly} />
        <span>{trUI(lang, "flow-times", "times")}</span>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <p className="bs-hint">Connect blocks to the right side to repeat them.</p>
      <NextHandle />
      <BodyHandle />
    </div>
  );
}

function EachClipNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  const select = node.select ?? "all";
  const base = select.split(":")[0];
  const setSelect = (v: string) => (data as any).__update(node.id, { select: v });
  return (
    <div className={`bs-node bs-node-control${d.hasError ? " bs-node-error" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon"><Repeat size={15} /></span><b>{useContext(LangContext) === "es" ? "Para cada clip" : "For each clip"}</b>
        <select aria-label="Which clips" value={base} disabled={(data as any).__readOnly}
          onChange={(e) => setSelect(e.target.value === "colour" ? "colour:#ffffff" : e.target.value === "contains" ? "contains:" : e.target.value)}>
          {["all", "text", "shape", "media", "audio", "selected", "colour", "contains"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {base === "colour" ? (
          <input className="bs-count" type="color" aria-label="Clip colour" value={select.slice(7) || "#ffffff"}
            onChange={(e) => setSelect(`colour:${e.target.value}`)} disabled={(data as any).__readOnly} />
        ) : null}
        {base === "contains" ? (
          <input className="bs-name" type="text" aria-label="Text to find" placeholder="words to find" value={select.slice(9)}
            onChange={(e) => setSelect(`contains:${e.target.value}`)} disabled={(data as any).__readOnly} />
        ) : null}
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <p className="bs-hint">Use <code>$clipId</code> inside, or connect a clip into a field.</p>
      <NextHandle />
      <BodyHandle />
    </div>
  );
}

function FunctionNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  return (
    <div className={`bs-node bs-node-fn${d.hasError ? " bs-node-error" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon">ƒ</span><b>{trUI(useContext(LangContext), "flow-function", "Function")}</b>
        <input className="bs-name" type="text" aria-label="Function name" placeholder="name" value={node.name ?? ""}
          onChange={(e) => (data as any).__update(node.id, { name: e.target.value })} disabled={(data as any).__readOnly} />
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <p className="bs-hint">Connect blocks to the right to define what it does.</p>
      <NextHandle />
      <BodyHandle />
    </div>
  );
}

function CallNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  return (
    <div className={`bs-node bs-node-fn${d.hasError ? " bs-node-error" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon"><Code2 size={15} /></span><b>{trUI(useContext(LangContext), "flow-call", "Call")}</b>
        <select aria-label="Function name" value={node.name ?? ""} disabled={(data as any).__readOnly}
          onChange={(e) => (data as any).__update(node.id, { name: e.target.value })}>
          <option value="">choose…</option>
          {d.functionNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <NextHandle />
    </div>
  );
}

function CommentNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  return (
    <div className="bs-node bs-node-comment">
      <span className="bs-node-icon"><MessageSquare size={15} /></span>
      <input className="bs-comment" type="text" aria-label="Note" placeholder="A note for future you" value={node.text ?? ""}
        onChange={(e) => (data as any).__update(node.id, { text: e.target.value })} disabled={(data as any).__readOnly} />
      <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
    </div>
  );
}

function ClipNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  const clip = d.node;
  return (
    <div className={`bs-node bs-node-clip${d.hasError ? " bs-node-error" : ""}`}>
      <div className="bs-node-head">
        <span className="bs-node-icon">{node.select === "media" ? <Film size={13} /> : node.select === "shape" ? <Square size={13} /> : node.select === "audio" ? <Music2 size={13} /> : <TypeIcon size={13} />}</span>
        <b>{node.text || node.clipId}</b>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <p className="bs-hint">{node.select ?? "clip"} · {node.clipId}</p>
      <Handle type="source" position={Position.Right} id="clip" className="bs-handle bs-handle-clip" />
    </div>
  );
}

function FrameNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  const seconds = (Number(node.frame) || 0) / Math.max(1, d.fps);
  return (
    <div className={`bs-node bs-node-frame${d.hasError ? " bs-node-error" : ""}`}>
      <div className="bs-node-head">
        <span className="bs-node-icon"><Timer size={13} /></span><b>Frame</b>
        <input className="bs-count" data-testid="bs-frame-input" type="text" inputMode="numeric" aria-label="Frame number" value={node.frame ?? 0}
          onChange={(e) => (data as any).__update(node.id, { frame: Number(e.target.value) || 0 })} disabled={(data as any).__readOnly} />
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      <p className="bs-hint">{Number(node.frame) || 0} ÷ {d.fps} fps = <b>{seconds.toFixed(2)}s</b></p>
      <button className="bs-mini" onClick={() => (data as any).__update(node.id, { frame: Math.round((data as any).__ctx.playhead * d.fps) })} disabled={(data as any).__readOnly}>Use playhead</button>
      <Handle type="source" position={Position.Right} id="time" className="bs-handle bs-handle-frame" />
    </div>
  );
}

/** A value block: a little typed box that plugs into a block's field. */
function ValueNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  const ro = (data as any).__readOnly;
  const upd = (patch: Partial<ToolGraphNode>) => (data as any).__update(node.id, patch);
  return (
    <div className={`bs-node bs-node-value${d.hasError ? " bs-node-error" : ""}`} data-testid={`bs-value-node-${node.id}`}>
      <div className="bs-node-head">
        <span className="bs-node-icon">{node.valueType === "number" ? <Hash size={13} /> : node.valueType === "yesno" ? <ToggleLeft size={13} /> : <TypeIcon size={13} />}</span>
        <b>{node.valueType === "number" ? trUI(useContext(LangContext), "value-number", "Number") : node.valueType === "yesno" ? trUI(useContext(LangContext), "value-yesno", "Yes / No") : trUI(useContext(LangContext), "value-text", "Text")}</b>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}><X size={12} /></button>
      </div>
      {node.valueType === "yesno" ? (
        <div className="bs-value-row">
          <button type="button" className={`bs-mini${node.value === "yes" ? " bs-value-on" : ""}`} disabled={ro} onClick={() => upd({ value: "yes" })}>Yes</button>
          <button type="button" className={`bs-mini${node.value === "no" ? " bs-value-on" : ""}`} disabled={ro} onClick={() => upd({ value: "no" })}>No</button>
        </div>
      ) : (
        <input className="bs-value-input" data-testid={`bs-value-input-${node.id}`} type={node.valueType === "number" ? "number" : "text"}
          aria-label={node.valueType === "number" ? "Number value" : "Text value"}
          placeholder={node.valueType === "number" ? "0" : "Type here…"}
          value={String(node.value ?? "")} onChange={(e) => upd({ value: e.target.value })} disabled={ro} />
      )}
      <p className="bs-hint">Drag the dot into a block's field</p>
      <Handle type="source" position={Position.Right} id="value" className="bs-handle bs-handle-value" />
    </div>
  );
}

/** An edge with a small remove button at its middle. */
function SnapEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button className={`bs-edge-delete${selected ? " selected" : ""}`} data-testid={`bs-edge-delete-${id}`} aria-label="Remove this connection"
          style={{ position: "absolute", transform: `translate(${labelX - 10}px, ${labelY - 10}px)` }}
          onClick={() => (data as any)?.onDelete?.(id)}><X size={12} /></button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  start: StartNode, action: ActionNode, repeat: RepeatNode, eachClip: EachClipNode,
  function: FunctionNode, call: CallNode, comment: CommentNode, clipRef: ClipNode, frame: FrameNode, value: ValueNode,
};

const edgeTypes = { snap: SnapEdge };

/**
 * The Code tab's editor: line numbers, tab-key support, inline run errors and a
 * live reference of every vf helper (click an example to insert it at the cursor).
 */
function CodeTab({ tool, ctx, readOnly, onChange, runError, notice, onDismissNotice }: { tool: CustomTool; ctx: ToolContext; readOnly: boolean; onChange: (t: CustomTool) => void; runError: string | null; notice: boolean; onDismissNotice: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const value = tool.code ?? "";
  const lineCount = Math.max(1, value.split("\n").length);
  const errLine = runError ? codeErrorLine(runError) : null;

  /** Insert a snippet at the caret, replacing the selection, and keep focus. */
  const insert = (snippet: string) => {
    const el = ta.current;
    if (!el || readOnly) return;
    const start = el.selectionStart, end = el.selectionEnd;
    onChange({ ...tool, code: value.slice(0, start) + snippet + value.slice(end) });
    requestAnimationFrame(() => { el.focus(); const at = start + snippet.length; el.setSelectionRange(at, at); });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !readOnly) { e.preventDefault(); insert("  "); }
  };

  /** Download these blocks as a standalone script that runs against the API. */
  const exportScript = () => {
    const blob = new Blob([exportStandaloneScript(tool)], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tool.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "videoforge-tool"}.mjs`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bs-code-wrap" data-testid="bs-code-panel">
      {notice && (
        <div className="bs-notice" data-testid="bs-converted-notice">
          <span><Info size={14} aria-hidden="true" /> Blocks were converted to code. These blocks now run as code. Switch back to Blocks any time; your blocks are kept.</span>
          <button className="bs-notice-close" aria-label="Dismiss" onClick={onDismissNotice} data-testid="bs-notice-close"><X size={12} /></button>
        </div>
      )}
      <div className="bs-code-main-row">
        <div className="bs-editor-col">
          {runError && (
            <div className="bs-inline-error" data-testid="bs-inline-error">
              <span><X size={12} /></span>
              <span>Run failed: {runError}</span>
              {errLine ? <button className="bs-inline-error-jump" onClick={() => {
                const el = ta.current; if (!el) return;
                const lines = value.split("\n");
                const before = lines.slice(0, errLine - 1).join("\n").length + (errLine > 1 ? 1 : 0);
                el.focus(); el.setSelectionRange(before, before + (lines[errLine - 1] ?? "").length);
              }}>Go to line {errLine}</button> : null}
            </div>
          )}
          <div className="bs-editor">
            <div className="bs-editor-gutter" ref={gutter} aria-hidden="true" data-testid="bs-code-gutter">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className={i + 1 === errLine ? "err" : ""}>{i + 1}</div>
              ))}
            </div>
            <textarea ref={ta} className="bs-code-main" spellCheck={false} wrap="off" aria-label="Tool code"
              data-testid="bs-code" value={value}
              onChange={(e) => onChange({ ...tool, code: e.target.value })}
              onKeyDown={onKeyDown} readOnly={readOnly}
              onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} />
          </div>
        </div>
        <div className="bs-code-side" data-testid="bs-code-ref">
          <p className="bs-ref-title">vf helpers, click to insert</p>
          <button className="bs-ref-export" onClick={exportScript} data-testid="bs-export-script" title="Download these blocks as a standalone script that runs against the API">⬇ Export as standalone script</button>
          {VF_HELPERS.map((h) => (
            <button key={h.name} className="bs-ref-item" onClick={() => insert(h.example)} disabled={readOnly} title={h.description} data-testid={`bs-ref-${h.name}`}>
              <code className="bs-ref-sig">{h.signature}</code>
              <span className="bs-ref-desc">{h.description}</span>
              <code className="bs-ref-example">{h.example}</code>
            </button>
          ))}
          <p className="bs-ref-title">$ templates (blocks) → code</p>
          <div className="bs-ref-tpl">
            {TEMPLATE_DOCS.map((t) => (
              <div key={t.template}><code>{t.template}</code> becomes {t.becomes}. In code: <code>{t.code}</code>.</div>
            ))}
            <div>Arithmetic works in block fields: <code>"$playhead + $index * 0.4"</code>. In code, write it in JavaScript.</div>
          </div>
          <p className="bs-hint">Return an array of operations. Code runs in your browser, unsandboxed. Only run code you trust.</p>
        </div>
      </div>
    </div>
  );
}

function edgeStyle(edge: Edge) {
  if (edge.sourceHandle === "body") return { strokeDasharray: "6 4" };
  if (edge.sourceHandle === "clip" || edge.sourceHandle === "time") return {};
  return {};
}

function Studio({ tool, ctx, readOnly, onChange, onClose, onRun, onOpenAnimator, fresh, allowBlocks = true }: StudioProps) {
  const graph = tool.graph ?? blocksToGraph(tool.blocks ?? []);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"blocks" | "code">(tool.mode === "code" ? "code" : "blocks");
  const [runError, setRunError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [converted, setConverted] = useState(false);
  const [category, setCategory] = useState<string>("Create");
  const [search, setSearch] = useState("");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [shared, setShared] = useState("");
  const [histTick, bumpHist] = useState(0);
  const [lang, setLang] = useState<BlockLang>(() => loadLang(window.localStorage));
  /** Always-on field dots (clip/frame/value sockets) vs hover-revealed ones. */
  const [showHandles, setShowHandles] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const historyRef = useRef<{ past: ToolGraph[]; future: ToolGraph[]; tag: string | null; at: number }>({ past: [], future: [], tag: null, at: 0 });
  const [tutorialStep, setTutorialStep] = useState<number | null>(() =>
    fresh && tool.mode === "blocks" && !tutorialSeen() ? 0 : null);

  // Highlight the element the current tutorial step talks about.
  useEffect(() => {
    if (tutorialStep == null) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    if (!step) return;
    const root = wrapper.current?.closest(".bs-studio");
    const el = (root ?? document).querySelector(step.target);
    if (!el) return;
    el.classList.add("bs-tut-target");
    return () => { el.classList.remove("bs-tut-target"); };
  }, [tutorialStep, tab]);

  const endTutorial = useCallback((done: boolean) => {
    try { window.localStorage.setItem(TUTORIAL_KEY, done ? "done" : "skipped"); } catch { /* storage unavailable */ }
    setTutorialStep(null);
  }, []);

  const setGraph = useCallback((next: ToolGraph) => onChange({ ...tool, graph: next, mode: tab === "code" ? "code" : "blocks" }), [tool, onChange, tab]);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  /** Push the current graph onto the undo stack. `tag` coalesces quick edits (typing). */
  const commitHistory = useCallback((tag?: string) => {
    const h = historyRef.current;
    const now = Date.now();
    if (tag && h.tag === tag && now - h.at < 900) { h.at = now; h.future = []; bumpHist((n) => n + 1); return; }
    h.past.push(graphRef.current);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    h.tag = tag ?? null;
    h.at = now;
    bumpHist((n) => n + 1);
  }, []);
  /** A graph change that can be undone: one history entry per drop, delete or edit. */
  const setGraphCommitted = useCallback((next: ToolGraph, tag?: string) => {
    commitHistory(tag);
    setGraph(next);
  }, [commitHistory, setGraph]);
  const undo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(graphRef.current);
    h.tag = null;
    bumpHist((n) => n + 1);
    setGraph(prev);
  }, [setGraph]);
  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(graphRef.current);
    h.tag = null;
    bumpHist((n) => n + 1);
    setGraph(next);
  }, [setGraph]);
  // Undo/redo keys run in the capture phase and swallow the event, so the editor
  // behind the studio never also undoes the timeline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); e.stopPropagation(); redo(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [undo, redo]);
  const updateNode = useCallback((id: string, patch: Partial<ToolGraphNode>) =>
    setGraphCommitted({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }, `edit:${id}`), [graph, setGraphCommitted]);
  const deleteNode = useCallback((id: string) => setGraphCommitted({
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  }), [graph, setGraphCommitted]);

  const issues = useMemo(() => (tab === "blocks" ? validateGraph(graph, ctx) : []), [graph, ctx, tab]);
  const errorIds = useMemo(() => new Set(issues.filter((i) => i.level === "error" && i.nodeId).map((i) => i.nodeId)), [issues]);
  const warnIds = useMemo(() => new Set(issues.filter((i) => i.level === "warning" && i.nodeId).map((i) => i.nodeId)), [issues]);
  const functionNames = useMemo(() => graph.nodes.filter((n) => n.type === "function" && n.name).map((n) => n.name!), [graph]);
  /** Which param sockets already have something plugged in. Those dots stay visible. */
  const connectedParams = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!e.targetHandle?.startsWith("param:")) continue;
      const set = map.get(e.target) ?? new Set<string>();
      set.add(e.targetHandle.slice(6));
      map.set(e.target, set);
    }
    return map;
  }, [graph]);

  const rfNodes: Node[] = useMemo(() => graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    selected: selectedIds.has(n.id),
    deletable: n.type !== "start",
    position: n.position ?? { x: 60, y: 60 },
    data: {
      node: n, hasError: errorIds.has(n.id), hasWarning: warnIds.has(n.id), fps: ctx.fps,
      functionNames, connectedParams: connectedParams.get(n.id) ?? new Set<string>(), __update: updateNode, __delete: deleteNode, __readOnly: readOnly, __ctx: ctx,
    },
  })), [graph, errorIds, warnIds, ctx, functionNames, connectedParams, updateNode, deleteNode, readOnly, selectedIds]);
  const deleteEdge = useCallback((id: string) => { setSelectedEdgeIds((prev) => { const next = new Set(prev); next.delete(id); return next; }); setGraphCommitted({ ...graph, edges: graph.edges.filter((e) => e.id !== id) }); }, [graph, setGraphCommitted]);
  const rfEdges: Edge[] = useMemo(() => graph.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
    type: "snap",
    selected: selectedEdgeIds.has(e.id),
    animated: e.sourceHandle === "clip" || e.sourceHandle === "time",
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: edgeStyle(e as Edge),
    data: { onDelete: deleteEdge },
  })), [graph, deleteEdge, histTick, selectedEdgeIds]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  /** Can the target reach the source by following next/body edges? (cycle guard) */
  const reaches = useCallback((from: string, to: string) => {
    const out = new Map<string, string[]>();
    for (const e of graph.edges) if (e.sourceHandle === "next" || e.sourceHandle === "body") out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    const seen = new Set<string>(); const stack = [from];
    while (stack.length) { const id = stack.pop()!; if (id === to) return true; if (seen.has(id)) continue; seen.add(id); stack.push(...(out.get(id) ?? [])); }
    return false;
  }, [graph]);

  const isValidConnection = useCallback((c: Edge | Connection) => {
    if (readOnly || c.source === c.target) return false;
    if (c.sourceHandle === "next" || c.sourceHandle === "body") {
      if (c.targetHandle !== "in") return false;
      if (graph.edges.some((e) => e.target === c.target && e.targetHandle === "in")) return false; // one predecessor
      if (graph.edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) return false; // one successor per output
      return !reaches(c.target, c.source); // no cycles
    }
    if (c.sourceHandle === "clip" || c.sourceHandle === "time") {
      if (!c.targetHandle?.startsWith("param:")) return false;
      // A clip only fits clip fields, a frame only fits time fields, of that block's operation.
      const key = c.targetHandle.slice(6);
      const target = graph.nodes.find((n) => n.id === c.target);
      const op = (target?.op ?? (target?.block ? BLOCK_MAP.get(target.block)?.op : undefined)) ?? ""; // an advanced node follows its chosen op, not the compat block's
      const allowed = connectableParamKeys(op);
      if (c.sourceHandle === "clip") return allowed.clip.includes(key);
      return allowed.frame.includes(key);
    }
    if (c.sourceHandle === "value") {
      // A value block plugs into any field that block exposes.
      if (!c.targetHandle?.startsWith("param:")) return false;
      const key = c.targetHandle.slice(6);
      const target = graph.nodes.find((n) => n.id === c.target);
      if (!target) return false;
      const allowed = nodeParamKeys(target);
      return !allowed.length || allowed.includes(key);
    }
    return false;
  }, [graph, readOnly, reaches]);

  const onEdgesChange = useCallback((changes: any[]) => {
    const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
    const selected = changes.filter((c): c is NodeChange & { type: "select"; selected: boolean } => c.type === "select");
    if (selected.length) {
      setSelectedEdgeIds((prev) => {
        const next = new Set(prev);
        for (const c of selected) c.selected ? next.add(c.id) : next.delete(c.id);
        return next;
      });
    }
    if (removed.size) {
      setSelectedEdgeIds((prev) => { const next = new Set(prev); removed.forEach((id) => next.delete(id)); return next; });
      setGraphCommitted({ ...graph, edges: graph.edges.filter((e) => !removed.has(e.id)) });
    }
  }, [graph, setGraphCommitted]);

  const onConnect = useCallback((c: Connection) => {
    const edge = { id: uid(), source: c.source, sourceHandle: c.sourceHandle ?? "", target: c.target, targetHandle: c.targetHandle ?? "" };
    let edges = graph.edges;
    if (c.targetHandle?.startsWith("param:")) {
      // one connection per field: the new one replaces the old
      edges = edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
    }
    setGraphCommitted({ ...graph, edges: [...edges, edge] });
  }, [graph, setGraphCommitted]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const selectionChanges = changes.filter((c): c is NodeChange & { type: "select"; selected: boolean } => c.type === "select");
    if (selectionChanges.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of selectionChanges) c.selected ? next.add(c.id) : next.delete(c.id);
        return next;
      });
    }
    // Apply the whole batch to one snapshot of the graph, so multi-select deletes survive.
    const moved = new Map<string, { x: number; y: number }>();
    const removed = new Set<string>();
    for (const change of changes) {
      if (change.type === "position" && change.position) moved.set(change.id, change.position);
      else if (change.type === "remove") removed.add(change.id);
    }
    const protectedIds = new Set(graph.nodes.filter((n) => n.type === "start").map((n) => n.id));
    for (const id of Array.from(removed)) if (protectedIds.has(id)) removed.delete(id); // Start always stays
    if (removed.size) {
      setGraphCommitted({
        nodes: graph.nodes
          .filter((n) => !removed.has(n.id))
          .map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)),
        edges: graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
      });
    } else if (moved.size) {
      // A drag in progress: the drag-start snapshot is the undo entry, so the
      // per-frame position updates go straight in without new history.
      setGraph({
        nodes: graph.nodes.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)),
        edges: graph.edges,
      });
    }
  }, [graph, setGraph, setGraphCommitted]);

  /** A drag starts: one undo entry covers the whole drag. */
  const onNodeDragStart = useCallback(() => commitHistory("drag"), [commitHistory]);

  const addNode = useCallback((node: ToolGraphNode) => setGraphCommitted({ ...graph, nodes: [...graph.nodes, node] }), [graph, setGraphCommitted]);
  /** A free spot to the right of the flow: below the lowest node there. */
  const freeSpot = useCallback(() => {
    const rights = graph.nodes.filter((n) => (n.position?.x ?? 0) >= 360).map((n) => n.position?.y ?? 0);
    return { x: 440, y: rights.length ? Math.max(...rights) + 190 : 80 };
  }, [graph]);

  /** Rough on-canvas height of a node, so tidy leaves room for its fields. */
  const estHeight = useCallback((n: ToolGraphNode) => {
    if (n.type === "comment") return 50;
    if (n.type === "value" || n.type === "clipRef" || n.type === "frame") return 150;
    const block = n.block ? BLOCK_MAP.get(n.block) : undefined;
    const params = block && n.block !== "advanced" ? block.params : OP_PARAMS[n.op ?? ""] ?? [];
    return 66 + params.length * 48 + (block ? 28 : 0);
  }, []);

  /** Line the blocks up: the run chain down a column on the left, repeat bodies
   *  to its right, helper blocks (values, clips, frames) beside their targets,
   *  and anything else in a far-right column. One undo entry, like a drag. */
  const tidy = useCallback(() => {
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    const nextOf = (id: string) => graph.edges.find((e) => e.source === id && e.sourceHandle === "next")?.target;
    const pos = new Map<string, { x: number; y: number }>();
    const placed = new Set<string>();
    const layChain = (head: string, x: number, y: number) => {
      let cur: string | null = head;
      while (cur && !placed.has(cur)) {
        placed.add(cur);
        pos.set(cur, { x, y });
        y += Math.max(180, estHeight(nodesById.get(cur)!) + 48);
        cur = nextOf(cur) ?? null;
      }
      return y;
    };
    // the main run chain from Start, top to bottom
    let y = 40;
    const start = graph.nodes.find((n) => n.type === "start");
    if (start) y = layChain(start.id, 380, y);
    // detached chains (no Start above them) continue below
    for (const n of graph.nodes) {
      if (placed.has(n.id) || !["action", "repeat", "eachClip", "function", "call"].includes(n.type)) continue;
      if (graph.edges.some((e) => e.target === n.id && e.targetHandle === "in")) continue;
      y = layChain(n.id, 380, y);
    }
    // repeat / for-each / function bodies, to the right of their control block
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const n of graph.nodes) {
        if (!placed.has(n.id) || !["repeat", "eachClip", "function"].includes(n.type)) continue;
        const base = pos.get(n.id);
        if (!base) continue;
        const body = graph.edges.find((e) => e.source === n.id && e.sourceHandle === "body")?.target;
        if (body && !placed.has(body)) { layChain(body, base.x + 340, base.y); moved = true; }
      }
      if (!moved) break;
    }
    // helper blocks: values, clip refs and frames, left of the block they feed
    const helpers = graph.nodes
      .filter((n) => !placed.has(n.id) && ["value", "clipRef", "frame"].includes(n.type))
      .map((n) => ({ n, target: graph.edges.find((e) => e.source === n.id)?.target }))
      .sort((a, b) => (pos.get(a.target ?? "")?.y ?? 0) - (pos.get(b.target ?? "")?.y ?? 0));
    let hy = 40;
    for (const h of helpers) {
      const ty = pos.get(h.target ?? "")?.y;
      hy = Math.max(hy + 170, ty ?? 40);
      placed.add(h.n.id);
      pos.set(h.n.id, { x: 60, y: hy });
    }
    // anything left (notes, strays): a far-right column
    let ry = 40;
    for (const n of graph.nodes) {
      if (placed.has(n.id)) continue;
      pos.set(n.id, { x: 380 + 680, y: ry });
      ry += 160;
    }
    setGraphCommitted({ ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })) });
    requestAnimationFrame(() => rf.fitView({ padding: 0.25, maxZoom: 1.1 }));
  }, [graph, setGraphCommitted, estHeight, rf]);

  const [preview, setPreview] = useState<TimelineOp[] | null>(null);
  /** Dry run: work out what Apply would do, without touching the edit. */
  const showPreview = useCallback(() => {
    setRunError(null);
    try {
      if (tab === "blocks") {
        const fatal = issues.find((i) => i.level === "error");
        if (fatal) { setShowErrors(true); return; }
      }
      const ops = runTool(tab === "code" ? { ...tool, mode: "code" } : { ...tool, graph, mode: "blocks" }, ctx);
      setPreview(ops);
    } catch (e: any) { setRunError(e.message); setShowErrors(true); }
  }, [tool, graph, ctx, issues, tab]);

  const run = useCallback(() => {
    setPreview(null);
    setRunError(null);
    if (tab === "code") {
      try { onRun(runTool({ ...tool, mode: "code" }, ctx)); } catch (e: any) { setRunError(e.message); setShowErrors(true); }
      return;
    }
    const fatal = issues.find((i) => i.level === "error");
    if (fatal) { setShowErrors(true); return; }
    try { onRun(runTool({ ...tool, graph, mode: "blocks" }, ctx)); } catch (e: any) { setRunError(e.message); setShowErrors(true); }
  }, [tool, graph, ctx, issues, onRun, tab]);

  const focusNode = useCallback((id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.position) rf.setCenter(node.position.x + 140, node.position.y + 60, { zoom: 1, duration: 400 });
  }, [graph, rf]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/videoforge") as string;
    const blockId = event.dataTransfer.getData("application/videoforge-block");
    const stickerId = event.dataTransfer.getData("application/videoforge-sticker");
    if (!type && !blockId && !stickerId) return;
    const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const base = { id: uid(), position: { x: position.x - 90, y: position.y - 20 } };
    if (stickerId) {
      const sticker = listStickers(window.localStorage).find((s) => s.id === stickerId);
      if (!sticker) return;
      addNode({ ...base, type: "action", op: "add_clip", args: stickerArgs(sticker) });
    } else if (blockId) {
      const block = BLOCK_MAP.get(blockId)!;
      const args: Record<string, unknown> = { ...(block.args ?? {}) };
      for (const p of block.params) if (args[p.key] === undefined) args[p.key] = p.def;
      addNode({ ...base, type: "action", block: blockId, args });
    } else if (type === "repeat") addNode({ ...base, type: "repeat", count: 3 });
    else if (type === "eachClip") addNode({ ...base, type: "eachClip", select: "text" });
    else if (type === "function") addNode({ ...base, type: "function", name: "" });
    else if (type === "call") addNode({ ...base, type: "call", name: "" });
    else if (type === "comment") addNode({ ...base, type: "comment", text: "" });
    else if (type === "frame") addNode({ ...base, type: "frame", frame: Math.round(ctx.playhead * ctx.fps) });
    else if (type === "value-text") addNode({ ...base, type: "value", valueType: "text", value: "" });
    else if (type === "value-number") addNode({ ...base, type: "value", valueType: "number", value: "0" });
    else if (type === "value-yesno") addNode({ ...base, type: "value", valueType: "yesno", value: "yes" });
  }, [addNode, rf, ctx]);

  /** Drop a preset's blocks on the canvas, wired to each other and joined onto the
   *  end of the existing chain. Nothing runs until the user presses Run. */
  const applyPreset = useCallback((preset: ToolPreset) => {
    const frag = preset.build();
    const maxX = graph.nodes.reduce((m, n) => Math.max(m, n.position?.x ?? 0), 60);
    // Lay the fragment out with height-aware spacing so its blocks never stack on
    // each other. The same rule the Tidy button uses for the whole canvas.
    const fragById = new Map(frag.nodes.map((n) => [n.id, n]));
    const fragNext = (id: string) => frag.edges.find((e) => e.source === id && e.sourceHandle === "next")?.target;
    const placed = new Set<string>();
    let y = 40;
    const placeChain = (head: string, x: number) => {
      let cur: string | null = head;
      while (cur && !placed.has(cur)) {
        placed.add(cur);
        const n = fragById.get(cur)!;
        n.position = { x, y };
        y += Math.max(180, estHeight(n) + 48);
        cur = fragNext(cur) ?? null;
      }
    };
    for (const n of frag.nodes) {
      if (placed.has(n.id)) continue;
      if (frag.edges.some((e) => e.target === n.id && e.targetHandle === "in")) continue;
      placeChain(n.id, maxX + 300);
    }
    for (const n of frag.nodes) {
      if (placed.has(n.id)) continue;
      n.position = { x: maxX + 640, y };
      y += 160;
      placed.add(n.id);
    }
    const nodes = frag.nodes.map((n) => ({ ...n }));
    const edges = frag.edges.map((e) => ({ ...e }));
    // the head of the preset chain: its first connectable node (notes have no in)
    const head = frag.nodes.find((n) => n.type !== "comment");
    // join onto the tail of the start chain so the preset runs after what's there
    const nextOf = (id: string) => graph.edges.find((e) => e.source === id && e.sourceHandle === "next")?.target;
    let tail = graph.nodes.find((n) => n.type === "start")?.id ?? null;
    if (tail) { let guard = 0; while (nextOf(tail) && guard++ < 500) tail = nextOf(tail)!; }
    if (tail && head) edges.push({ id: uid(), source: tail, sourceHandle: "next", target: head.id, targetHandle: "in" });
    setGraphCommitted({ nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges] });
    setPresetsOpen(false);
    // bring the new blocks into view
    requestAnimationFrame(() => rf.fitView({ padding: 0.25, maxZoom: 1.1 }));
  }, [graph, setGraphCommitted, rf]);

  /** Switching Blocks → Code converts the graph into readable code the tool now runs. */
  const switchToCode = useCallback(() => {
    if (tab === "code" || readOnly) return;
    if (tool.mode === "code") { setTab("code"); return; } // already a code tool. Nothing to convert
    try {
      compileGraph(graph, ctx); // validates before converting; invalid graphs stay in Blocks
      setTab("code");
      setConverted(true);
      onChange({ ...tool, graph, code: graphToCode(graph), mode: "code" });
    } catch (e: any) {
      setRunError(`Could not convert: ${e.message}`);
      setShowErrors(true);
    }
  }, [tab, readOnly, tool, graph, ctx, onChange]);

  const switchToBlocks = useCallback(() => {
    if (!allowBlocks) return; // code-only entry points keep the tool in code mode
    setTab("blocks");
    setConverted(false);
    onChange({ ...tool, mode: "blocks" });
  }, [tool, onChange, allowBlocks]);

  const errorCount = issues.filter((i) => i.level === "error").length + (runError ? 1 : 0);
  const warnCount = issues.filter((i) => i.level === "warning").length;
  const errorsBar = (errorCount + warnCount > 0 || runError) && (
    <div className="bs-errors" data-testid="bs-errors">
      <div className="bs-errors-head">
        <button className={`bs-error-toggle${errorCount ? " has-errors" : ""}`} onClick={() => setShowErrors((s) => !s)} data-testid="bs-error-toggle">
          {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : `${warnCount} notice${warnCount === 1 ? "" : "s"}`}
        </button>
        <span className="bs-errors-hint">{showErrors ? "Click a message to jump to the block" : "Click to show details"}</span>
      </div>
      {showErrors && (
        <div className="bs-errors-list">
          {issues.map((issue, i) => (
            <button key={i} className={`bs-error-row ${issue.level}`} onClick={() => issue.nodeId && focusNode(issue.nodeId)}>
              <span>{issue.level === "error" ? "Error" : "Note"}</span>
              {issue.message}
            </button>
          ))}
          {runError && <div className="bs-error-row error"><span><X size={12} /></span>Run failed: {runError}</div>}
        </div>
      )}
    </div>
  );

  return (
    <LangContext.Provider value={lang}>
    <div className={`bs-studio${showHandles ? " bs-show-handles" : ""}${connecting ? " bs-connecting" : ""}`} data-testid="block-studio">
      <header className="bs-header">
        <input className="bs-title" aria-label="Name" value={tool.name} onChange={(e) => onChange({ ...tool, name: e.target.value })} disabled={readOnly} data-testid="bs-name" />
        <div className="bs-tabs" role="tablist" aria-label="Editing mode">
          {allowBlocks && <button role="tab" aria-selected={tab === "blocks"} className={tab === "blocks" ? "active" : ""} onClick={switchToBlocks} data-testid="bs-tab-blocks"><Puzzle size={14} aria-hidden="true" /> Blocks</button>}
          <button role="tab" aria-selected={tab === "code"} className={tab === "code" ? "active" : ""} onClick={switchToCode} data-testid="bs-tab-code"><Code2 size={14} aria-hidden="true" /> Code</button>
        </div>
        <span className="bs-spacer" />
        {tab === "blocks" && (
          <button className="bs-btn" onClick={() => setImportOpen((o) => !o)} disabled={readOnly} data-testid="bs-import" title="Bring clips from your project onto the canvas"><Film size={14} aria-hidden="true" /> <span className="bs-lbl">Import clips</span></button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" disabled={readOnly} onClick={() => addNode({ id: uid(), type: "frame", frame: Math.round(ctx.playhead * ctx.fps), position: freeSpot() })} data-testid="bs-add-frame" title="Add a frame (time) block"><Timer size={14} aria-hidden="true" /> <span className="bs-lbl">Add frame</span></button>
        )}
        {tab === "blocks" && (
          <button className={`bs-btn${showHandles ? " bs-btn-on" : ""}`} onClick={() => setShowHandles((s) => !s)} disabled={readOnly}
            aria-pressed={showHandles} data-testid="bs-handles" title="Show every field dot (they also appear on hover)"><Cable size={14} aria-hidden="true" /> <span className="bs-lbl">Connectors</span></button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" onClick={tidy} disabled={readOnly} data-testid="bs-tidy" title="Line the blocks up neatly, undoable"><AlignVerticalDistributeCenter size={14} aria-hidden="true" /> <span className="bs-lbl">Tidy</span></button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" onClick={() => setTutorialStep(0)} disabled={readOnly} data-testid="bs-tutorial-open" title="Show the studio tutorial"><GraduationCap size={14} aria-hidden="true" /> <span className="bs-lbl">Tutorial</span></button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" onClick={() => { const next: BlockLang = lang === "es" ? "en" : "es"; setLang(next); saveLang(next, window.localStorage); }} data-testid="bs-lang" title="Switch language / Cambiar idioma"><Languages size={14} aria-hidden="true" /> {lang === "es" ? "ES" : "EN"}</button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn bs-btn-presets" onClick={() => setPresetsOpen((o) => !o)} disabled={readOnly} data-testid="bs-presets" title="Ready-made recipes of connected blocks"><Sparkles size={14} aria-hidden="true" /> Presets</button>
        )}
        <button className="bs-btn" onClick={async () => {
          try { await navigator.clipboard.writeText(encodeTool({ ...tool, graph })); setShared("Block code copied, paste it into anyone's studio with Import"); }
          catch { setShared("Couldn't reach the clipboard, try again"); }
          setTimeout(() => setShared(""), 3500);
        }} disabled={readOnly} data-testid="bs-share" title="Copy these blocks as a code you can share"><Link2 size={14} aria-hidden="true" /> <span className="bs-lbl">Share</span></button>
        {tab === "blocks" && <>
          <button className="bs-btn" onClick={undo} disabled={readOnly || !canUndo} data-testid="bs-undo" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={15} /></button>
          <button className="bs-btn" onClick={redo} disabled={readOnly || !canRedo} data-testid="bs-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={15} /></button>
        </>}
        {onOpenAnimator && <button className="bs-btn" onClick={onOpenAnimator} data-testid="bs-open-animator" title="Open the Animator, pose and animate clips, text and shapes like rigs"><Clapperboard size={14} aria-hidden="true" /> Animator</button>}
        <button className="bs-btn" onClick={showPreview} disabled={readOnly} data-testid="bs-preview" title="See what Apply would change, without changing anything"><Eye size={14} aria-hidden="true" /> Preview</button>
        <button className="bs-btn bs-btn-run" onClick={run} disabled={readOnly} data-testid="bs-run" title="Apply these blocks to your edit, one undoable step"><Play size={13} aria-hidden="true" /> Apply to edit</button>
        <button className="bs-btn bs-btn-close" onClick={onClose} aria-label="Close studio" data-testid="bs-close"><X size={12} /></button>
      </header>
      {preview && (
        <div className="bs-preview" role="dialog" aria-label="Preview of changes" data-testid="bs-preview-panel">
          <div className="bs-preview-head">
            <b>{preview.length === 0 ? "Nothing would change" : `${preview.length} change${preview.length === 1 ? "" : "s"} to your edit`}</b>
            <button className="bs-notice-close" aria-label="Close preview" onClick={() => setPreview(null)}><X size={12} /></button>
          </div>
          {preview.length === 0
            ? <p className="bs-hint">Your blocks produced no changes. Check that the clips they work on exist. The green block’s “Work on” setting picks which clips are used.</p>
            : <ol className="bs-preview-list">{preview.slice(0, 40).map((o, i) => {
                const label = BLOCK_LIBRARY.find((b) => b.op === o.op)?.label ?? o.op.replace(/_/g, " ");
                const detail = Object.entries(o.args ?? {}).filter(([, v]) => typeof v !== "object").slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 24)}`).join(" · ");
                return <li key={i}><b>{label}</b>{detail && <span>{detail}</span>}</li>;
              })}</ol>}
          {preview.length > 40 && <p className="bs-hint">…and {preview.length - 40} more.</p>}
          <div className="bs-preview-actions">
            <button className="bs-btn bs-btn-run" onClick={run} disabled={readOnly || preview.length === 0} data-testid="bs-preview-apply"><Play size={13} aria-hidden="true" /> Apply to edit</button>
            <button className="bs-btn" onClick={() => setPreview(null)}>Not now</button>
          </div>
        </div>
      )}
      {shared && <div className="bs-notice" data-testid="bs-share-notice"><span><Link2 size={14} aria-hidden="true" /> {shared}</span><button className="bs-notice-close" aria-label="Dismiss" onClick={() => setShared("")}><X size={12} /></button></div>}
      {presetsOpen && tab === "blocks" && (
        <div className="bs-presets" data-testid="bs-presets-panel" role="dialog" aria-label="Presets">
          <div className="bs-presets-head">
            <h3>Presets</h3>
            <p>Example recipes, ready to take apart. Click one and its blocks appear on the canvas, connected to the right blocks. You set them up with your own words, colours and clips. Nothing changes until you press Apply to edit.</p>
            <button className="bs-notice-close" aria-label="Close presets" onClick={() => setPresetsOpen(false)}><X size={12} /></button>
          </div>
          <div className="bs-presets-list">
            {TOOL_PRESETS.map((p) => (
              <button key={p.id} className="bs-preset-card" data-testid={`bs-preset-${p.id}`} onClick={() => applyPreset(p)} disabled={readOnly}>
                <span className="bs-preset-emoji"><Sparkles size={16} /></span>
                <b>{p.name}</b>
                <span className="bs-preset-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {importOpen && (
        <div className="bs-import" data-testid="bs-import-panel">
          <p>Clips in this project. Add one, then connect it to a block.</p>
          <div className="bs-import-list">
            {ctx.clips.length === 0 && <p className="bs-hint">No clips yet. Add something to the timeline first.</p>}
            {ctx.clips.map((c) => (
              <button key={c.id} className="bs-import-row" disabled={readOnly}
                onClick={() => { addNode({ id: uid(), type: "clipRef", clipId: c.id, text: c.label ?? "", select: c.kind, position: freeSpot() }); setImportOpen(false); }}>
                <span>{c.kind === "media" ? <Film size={13} /> : c.kind === "shape" ? <Square size={13} /> : c.kind === "audio" ? <Music2 size={13} /> : <TypeIcon size={13} />}</span>
                <span className="bs-import-label">{c.label || c.id}</span>
                <span className="bs-import-time">{c.start.toFixed(1)}s · {c.duration.toFixed(1)}s</span>
              </button>
            ))}
          </div>
          <button className="bs-mini" onClick={() => setImportOpen(false)}>Done</button>
        </div>
      )}
      {tab === "blocks" ? (
        <div className="bs-body">
          <nav className="bs-cat-rail" aria-label="Block categories" data-testid="bs-cat-rail">
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" className={`bs-cat${category === c.id ? " active" : ""}`}
                aria-pressed={category === c.id} data-testid={`bs-cat-${c.id}`} onClick={() => { setCategory(c.id); setSearch(""); }}
                title={c.help}>
                <i className={`bs-cat-dot bs-dot-cat-${c.id.toLowerCase().replace(/\s+/g, "-")}`} />
                <span className="bs-cat-label">{trGroup(lang, c.label)}</span>
              </button>
            ))}
          </nav>
          <aside className="bs-palette" data-testid="bs-palette">
            <input className="bs-search" type="search" placeholder="Search blocks…" aria-label="Search blocks"
              data-testid="bs-search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <p className="bs-palette-title" data-testid="bs-palette-heading">{search ? `Matches for “${search}”` : trHeading(lang, category)}</p>
            {search ? (
              <div className="bs-palette-group">
                {BLOCK_LIBRARY.filter((b) => !(HIDDEN_BLOCKS as readonly string[]).includes(b.id) && matchesSearch(lang, b, search)).map((b) => (
                  <div key={b.id} className={`bs-chip bs-group-${(b.group ?? "create").toLowerCase().replace(/\s+/g, "-")}`} draggable={!readOnly}
                    data-testid={`bs-chip-${b.id}`}
                    onDragStart={(e) => { e.dataTransfer.setData("application/videoforge-block", b.id); e.dataTransfer.effectAllowed = "move"; }}
                    title={`${trGroup(lang, b.group ?? "")}, ${trDescription(lang, b)}`}><span className="bs-chip-group">{trGroup(lang, b.group ?? "")}</span>{trLabel(lang, b)}</div>
                ))}
                {!BLOCK_LIBRARY.some((b) => !(HIDDEN_BLOCKS as readonly string[]).includes(b.id) && matchesSearch(lang, b, search)) && <p className="bs-hint">No blocks match that. Try “title”, “zoom” or “speed”.</p>}
              </div>
            ) : category === "Stickers" ? (
              <div className="bs-palette-group">
                {listStickers(window.localStorage).length === 0 && <p className="bs-hint">No stickers yet. Add a “Save as sticker” block to turn any clip into one.</p>}
                {listStickers(window.localStorage).map((s) => (
                  <div key={s.id} className="bs-chip bs-chip-sticker" draggable={!readOnly}
                    data-testid={`bs-sticker-${s.id}`}
                    onDragStart={(e) => { e.dataTransfer.setData("application/videoforge-sticker", s.id); e.dataTransfer.effectAllowed = "move"; }}
                    title={`Reuse “${s.name}”`}>{s.name}</div>
                ))}
              </div>
            ) : category === "Flow" ? (
              <div className="bs-palette-group">
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "repeat"); }} title={trUI(lang, "flow-repeat", "Run blocks a number of times")}>{trUI(lang, "flow-repeat", "Repeat")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "eachClip"); }} title={trUI(lang, "flow-each-clip", "Run blocks for every clip")}>{trUI(lang, "flow-each-clip", "For each clip")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "function"); }} title={trUI(lang, "flow-function", "A named group of blocks")}>{trUI(lang, "flow-function", "Function")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "call"); }} title={trUI(lang, "flow-call", "Run a function")}>{trUI(lang, "flow-call", "Call")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "comment"); }} title={trUI(lang, "flow-note", "A note that does nothing")}>{trUI(lang, "flow-note", "Note")}</div>
              </div>
            ) : category === "Values" ? (
              <div className="bs-palette-group">
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-text"); }} title={trUI(lang, "value-text", "A piece of text to plug into a field")}>{trUI(lang, "value-text", "Text")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-number"); }} title={trUI(lang, "value-number", "A number to plug into a field")}>{trUI(lang, "value-number", "Number")}</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-yesno"); }} title={trUI(lang, "value-yesno", "A yes or no to plug into a field")}>{trUI(lang, "value-yesno", "Yes / No")}</div>
                <p className="bs-hint">Drag one next to a block, type your value, then drag from its dot into the block's field.</p>
              </div>
            ) : (
              <div className="bs-palette-group">
                {BLOCK_LIBRARY.filter((b) => b.group === category && !(HIDDEN_BLOCKS as readonly string[]).includes(b.id)).map((b) => (
                  <div key={b.id} className={`bs-chip bs-group-${category.toLowerCase().replace(/\s+/g, "-")}`} draggable={!readOnly}
                    data-testid={`bs-chip-${b.id}`}
                    onDragStart={(e) => { e.dataTransfer.setData("application/videoforge-block", b.id); e.dataTransfer.effectAllowed = "move"; }}
                    title={trDescription(lang, b)}>{trLabel(lang, b)}</div>
                ))}
              </div>
            )}
            <div className="bs-palette-group">
              <h4 title={CATEGORY_HELP[category] ?? ""}>{CATEGORY_HELP[category] ?? `${category} blocks`}</h4>
              <p className="bs-hint">Connect blocks top to bottom to run them in order, shown as green wires. A block's coloured field dots appear when you hover it: drag from a clip, frame or value block into one to fill that field. Bring clips and frames in with the buttons above.</p>
            </div>
          </aside>
          <div className="bs-canvas-col">
          <div className="bs-canvas" ref={wrapper} data-testid="bs-canvas" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={() => setConnecting(true)}
              onConnectEnd={() => setConnecting(false)}
              onNodeDragStart={onNodeDragStart}
              isValidConnection={isValidConnection}
              edgesReconnectable={false}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="bs-minimap" nodeColor={(n) => (n.type === "start" ? "#3d9a63" : n.type === "clipRef" ? "#4a8fd6" : n.type === "frame" ? "#d08a2e" : n.type === "repeat" || n.type === "eachClip" ? "#c9a227" : n.type === "function" || n.type === "call" ? "#7d5bb5" : "#4a5058")} />
              <Panel position="top-right">
                <div className="bs-legend">
                  <span><i className="bs-dot bs-dot-run" /> run order</span>
                  <span><i className="bs-dot bs-dot-body" /> repeat body</span>
                  <span><i className="bs-dot bs-dot-link" /> clip / frame link</span>
                  <span><i className="bs-dot bs-dot-param" /> field dot, hover a block</span>
                </div>
              </Panel>
            </ReactFlow>
          </div>
          {errorsBar}
          </div>
        </div>
      ) : (
        <CodeTab tool={tool} ctx={ctx} readOnly={readOnly} onChange={onChange} runError={runError}
          notice={converted} onDismissNotice={() => setConverted(false)} />
      )}
      {tab === "code" && errorsBar}
      {tab === "blocks" && tutorialStep != null && TUTORIAL_STEPS[tutorialStep] && (
        <div className="bs-tut-card" data-testid="bs-tutorial-card" role="dialog" aria-label="Studio tutorial">
          <p className="bs-tut-count">{TUTORIAL_SECTIONS[TUTORIAL_STEPS[tutorialStep].section]} · Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}</p>
          <div className="bs-tut-sections" role="tablist" aria-label="Tutorial parts">
            {TUTORIAL_SECTIONS.map((s, i) => (
              <button key={s} type="button" className={`bs-tut-section${TUTORIAL_STEPS[tutorialStep].section === i ? " active" : ""}`}
                onClick={() => setTutorialStep(TUTORIAL_STEPS.findIndex((st) => st.section === i))}>{s}</button>
            ))}
          </div>
          <h3 className="bs-tut-title">{TUTORIAL_STEPS[tutorialStep].title}</h3>
          <p className="bs-tut-body">{TUTORIAL_STEPS[tutorialStep].body}</p>
          <div className="bs-tut-nav">
            <button type="button" className="bs-tut-btn" data-testid="bs-tutorial-skip" onClick={() => endTutorial(false)}>Skip</button>
            <span className="bs-spacer" />
            <button type="button" className="bs-tut-btn" data-testid="bs-tutorial-back" disabled={tutorialStep === 0}
              onClick={() => setTutorialStep((s) => (s == null ? s : Math.max(0, s - 1)))}>Back</button>
            {tutorialStep === TUTORIAL_STEPS.length - 1 ? (
              <button type="button" className="bs-tut-btn bs-tut-primary" data-testid="bs-tutorial-finish" onClick={() => endTutorial(true)}>Finish</button>
            ) : (
              <button type="button" className="bs-tut-btn bs-tut-primary" data-testid="bs-tutorial-next"
                onClick={() => setTutorialStep((s) => (s == null ? s : Math.min(TUTORIAL_STEPS.length - 1, s + 1)))}>Next</button>
            )}
          </div>
        </div>
      )}
    </div>
    </LangContext.Provider>
  );
}

/** Full-screen block studio overlay. */
export default function BlockStudio(props: StudioProps) {
  return (
    <ReactFlowProvider>
      <Studio {...props} />
    </ReactFlowProvider>
  );
}
