import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel,
  Handle, Position, MarkerType, ReactFlowProvider, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BLOCK_GROUPS, BLOCK_LIBRARY, BLOCK_MAP, OP_IDS, OP_PARAMS, blocksToGraph, connectableParamKeys, nodeParamKeys,
  codeErrorLine, compileGraph, graphToCode, validateGraph, runTool, TEMPLATE_DOCS, VF_HELPERS,
  type CustomTool, type ToolContext, type ToolGraph, type ToolGraphNode, type ToolParam,
} from "@shared/custom-tools";
import type { TimelineOp } from "@shared/editing";

type NodeData = { node: ToolGraphNode; hasError: boolean; hasWarning: boolean; fps: number; functionNames: string[] };
type StudioProps = {
  tool: CustomTool;
  ctx: ToolContext;
  readOnly: boolean;
  onChange: (tool: CustomTool) => void;
  onClose: () => void;
  onRun: (ops: TimelineOp[]) => void;
  /** True when the tool was just created with "New tool with blocks" — opens the tutorial. */
  fresh?: boolean;
};

const uid = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Palette categories: the shared block groups plus the flow blocks. */
const CATEGORIES: Array<{ id: string; label: string }> = [
  ...BLOCK_GROUPS.map((g) => ({ id: g as string, label: g as string })),
  { id: "Values", label: "Values" },
  { id: "Flow", label: "Flow" },
];

/** The first-tool tutorial: a small guided tour of the studio. */
const TUTORIAL_KEY = "vf.tutorial.v1";
const TUTORIAL_STEPS = [
  {
    title: "Make your first tool",
    body: "This short tour shows you how to make a tool that adds a title to your video. Press Next to follow along — or Skip if you already know the studio.",
    target: '[data-testid="bs-name"]',
  },
  {
    title: "1. Name your tool",
    body: "Every tool needs a name. Click the name box at the top and type one — try “My first title”.",
    target: '[data-testid="bs-name"]',
  },
  {
    title: "2. The block menu",
    body: "The left side is the block menu. The dots pick a category — Create, Animate, Flow and more — and the list next to it shows that category's blocks. Drag any block onto the canvas to use it.",
    target: '[data-testid="bs-cat-rail"]',
  },
  {
    title: "3. Start runs first",
    body: "Your tool already has two blocks: the green Start block and an “Add title” block, connected top-to-bottom. Start runs first, then the title. Click the “Add title” block on the canvas and change its text — that is your tool.",
    target: '[data-testid="bs-canvas"]',
  },
  {
    title: "4. Run it",
    body: "Press the ▶ Run button to try your tool. It adds the title to the timeline at the playhead — one step you can undo.",
    target: '[data-testid="bs-run"]',
  },
  {
    title: "5. Find it later",
    body: "Press ✕ to close the studio — that saves your tool in this browser. You will find it in the Tools list, where you can Run it any time. Curious about code? The Code tab shows the JavaScript your blocks make.",
    target: '[data-testid="bs-close"]',
  },
];

function tutorialSeen(): boolean {
  try { return window.localStorage.getItem(TUTORIAL_KEY) != null; } catch { return false; }
}

/** The default graph for a new tool: Start → Add title. */
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

/** A JSON field that keeps the raw text while you type and flags mistakes inline. */
function JsonField({ label, value, onCommit, testId }: { label: string; value: object; onCommit: (v: Record<string, unknown>) => void; testId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? JSON.stringify(value ?? {}, null, 1);
  const parsed = useMemo(() => { try { return { v: JSON.parse(text) as Record<string, unknown>, ok: true }; } catch { return { v: null as unknown as Record<string, unknown>, ok: false }; } }, [text]);
  return (
    <label className="bs-field">
      <span className="bs-field-label">{label}</span>
      <textarea rows={3} className="bs-code" spellCheck={false} aria-label={label} data-testid={testId}
        value={text} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (parsed.ok) { setDraft(null); onCommit(parsed.v); } }} />
      {!parsed.ok && <span className="bs-json-error">This is not valid JSON yet — fix the red text before saving.</span>}
    </label>
  );
}

function ParamField({ param, value, onChange, disabled, connect }: { param: ToolParam; value: unknown; onChange: (v: unknown) => void; disabled: boolean; connect?: "clip" | "frame" | "value" }) {
  const str = String(value ?? "");
  const common = { value: str, disabled, "aria-label": param.label, "data-testid": `bs-param-${param.key}` } as Record<string, unknown>;
  return (
    <label className="bs-field">
      <span className="bs-field-row">
        {connect ? (
          <Handle type="target" position={Position.Left} id={`param:${param.key}`}
            className={`bs-handle bs-handle-param bs-param-${param.key} bs-param-${connect}`}
            title={connect === "clip" ? "Drag from a clip block to fill this field" : connect === "frame" ? "Drag from a frame block to fill this field" : "Drag from a value block to fill this field"} />
        ) : null}
        <span className="bs-field-label">{param.label}</span>
      </span>
      {param.type === "color" ? <input type="color" {...common} onChange={(e: any) => onChange(e.target.value)} />
        : param.type === "select" ? <select {...common} onChange={(e: any) => onChange(e.target.value)}>{(param.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input type="text" inputMode={param.type === "number" ? "decimal" : undefined} placeholder={String(param.def)} {...common} onChange={(e: any) => onChange(e.target.value)} />}
    </label>
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
        {onDelete ? <button className="bs-node-delete" aria-label="Delete block" onClick={onDelete}>✕</button> : null}
      </div>
      {children}
      <NextHandle />
    </div>
  );
}

function StartNode({ data }: NodeProps) {
  return (
    <div className="bs-node bs-node-start">
      <div className="bs-node-head"><span className="bs-node-icon">⚡</span><b>Start</b></div>
      <p className="bs-hint">When the tool runs…</p>
      <NextHandle />
    </div>
  );
}

function ActionNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  const block = node.block ? BLOCK_MAP.get(node.block) : undefined;
  const advanced = node.block === "advanced" || (!block && !!node.op);
  const params = block && !advanced ? block.params : OP_PARAMS[node.op ?? ""] ?? [];
  const connectable = connectableParamKeys(node.op ?? block?.op ?? "");
  const update = (key: string, value: unknown) => { (data as any).__update(node.id, { args: { ...(node.args ?? {}), [key]: value } }); };
  return (
    <NodeShell tone="action" hasError={d.hasError} hasWarning={d.hasWarning}
      title={block?.label ?? node.op ?? "Advanced op"} icon={block ? ({ Create: "＋", Edit: "✂", Entrances: "↗", Exits: "↘", Attention: "❗", Springy: "🌀", Camera: "🎥", Animate: "✦", Text: "T", Style: "✎", Clips: "🎞", Timing: "⏱" } as Record<string, string>)[block.group] ?? "★" : "★"}
      onDelete={(data as any).__delete ? () => (data as any).__delete(node.id) : undefined}>
      {block?.description ? <p className="bs-hint">{block.description}</p> : null}
      {advanced ? (
        <>
          <ParamField param={{ key: "__op", label: "Operation", type: "select", def: node.op ?? "", options: OP_IDS }} value={node.op} onChange={(v) => (data as any).__update(node.id, { op: v, args: {} })} disabled={(data as any).__readOnly} />
          <JsonField label="Arguments (JSON)" value={node.args ?? {}} testId="bs-param-args" onCommit={(v) => (data as any).__update(node.id, { args: v })} />
        </>
      ) : params.map((p) => (
        <ParamField key={p.key} param={p} value={node.args?.[p.key] ?? p.def} onChange={(v) => update(p.key, v)}
          disabled={(data as any).__readOnly}
          connect={connectable.clip.includes(p.key) ? "clip" : connectable.frame.includes(p.key) ? "frame" : "value"} />
      ))}
    </NodeShell>
  );
}

function RepeatNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const node = d.node;
  return (
    <div className={`bs-node bs-node-control${d.hasError ? " bs-node-error" : ""}`}>
      <InHandle />
      <div className="bs-node-head">
        <span className="bs-node-icon">↻</span><b>Repeat</b>
        <input className="bs-count" data-testid="bs-repeat-count" type="text" inputMode="numeric" aria-label="Repeat count" value={node.count ?? 3}
          onChange={(e) => (data as any).__update(node.id, { count: Number(e.target.value) || 0 })} disabled={(data as any).__readOnly} />
        <span>times</span>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">🎞</span><b>For each clip</b>
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
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">ƒ</span><b>Function</b>
        <input className="bs-name" type="text" aria-label="Function name" placeholder="name" value={node.name ?? ""}
          onChange={(e) => (data as any).__update(node.id, { name: e.target.value })} disabled={(data as any).__readOnly} />
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">ƒ→</span><b>Call</b>
        <select aria-label="Function name" value={node.name ?? ""} disabled={(data as any).__readOnly}
          onChange={(e) => (data as any).__update(node.id, { name: e.target.value })}>
          <option value="">choose…</option>
          {d.functionNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
      <span className="bs-node-icon">💬</span>
      <input className="bs-comment" type="text" aria-label="Note" placeholder="A note for future you" value={node.text ?? ""}
        onChange={(e) => (data as any).__update(node.id, { text: e.target.value })} disabled={(data as any).__readOnly} />
      <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">{node.select === "media" ? "🎬" : node.select === "shape" ? "◼" : node.select === "audio" ? "🎵" : "T"}</span>
        <b>{node.text || node.clipId}</b>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">🖼</span><b>Frame</b>
        <input className="bs-count" data-testid="bs-frame-input" type="text" inputMode="numeric" aria-label="Frame number" value={node.frame ?? 0}
          onChange={(e) => (data as any).__update(node.id, { frame: Number(e.target.value) || 0 })} disabled={(data as any).__readOnly} />
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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
        <span className="bs-node-icon">{node.valueType === "number" ? "🔢" : node.valueType === "yesno" ? "🔘" : "📝"}</span>
        <b>{node.valueType === "number" ? "Number" : node.valueType === "yesno" ? "Yes / No" : "Text"}</b>
        <button className="bs-node-delete" aria-label="Delete block" onClick={() => (data as any).__delete(node.id)}>✕</button>
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

/** An edge with a little ✕ at its middle — click to remove the connection. */
function SnapEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button className="bs-edge-delete" data-testid={`bs-edge-delete-${id}`} aria-label="Remove this connection"
          style={{ position: "absolute", transform: `translate(${labelX - 10}px, ${labelY - 10}px)` }}
          onClick={() => (data as any)?.onDelete?.(id)}>✕</button>
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

  return (
    <div className="bs-code-wrap" data-testid="bs-code-panel">
      {notice && (
        <div className="bs-notice" data-testid="bs-converted-notice">
          <span>💡 Blocks were converted to code — this tool now runs the code. Switch back to Blocks any time; your blocks are kept.</span>
          <button className="bs-notice-close" aria-label="Dismiss" onClick={onDismissNotice} data-testid="bs-notice-close">✕</button>
        </div>
      )}
      <div className="bs-code-main-row">
        <div className="bs-editor-col">
          {runError && (
            <div className="bs-inline-error" data-testid="bs-inline-error">
              <span>✕</span>
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
          <p className="bs-ref-title">vf helpers — click to insert</p>
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
          <p className="bs-hint">Return an array of operations. Code runs in your browser, unsandboxed — only run code you trust.</p>
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

function Studio({ tool, ctx, readOnly, onChange, onClose, onRun, fresh }: StudioProps) {
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
  const updateNode = useCallback((id: string, patch: Partial<ToolGraphNode>) =>
    setGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }), [graph, setGraph]);
  const deleteNode = useCallback((id: string) => setGraph({
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  }), [graph, setGraph]);

  const issues = useMemo(() => (tab === "blocks" ? validateGraph(graph, ctx) : []), [graph, ctx, tab]);
  const errorIds = useMemo(() => new Set(issues.filter((i) => i.level === "error" && i.nodeId).map((i) => i.nodeId)), [issues]);
  const warnIds = useMemo(() => new Set(issues.filter((i) => i.level === "warning" && i.nodeId).map((i) => i.nodeId)), [issues]);
  const functionNames = useMemo(() => graph.nodes.filter((n) => n.type === "function" && n.name).map((n) => n.name!), [graph]);

  const rfNodes: Node[] = useMemo(() => graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    selected: selectedIds.has(n.id),
    deletable: n.type !== "start",
    position: n.position ?? { x: 60, y: 60 },
    data: {
      node: n, hasError: errorIds.has(n.id), hasWarning: warnIds.has(n.id), fps: ctx.fps,
      functionNames, __update: updateNode, __delete: deleteNode, __readOnly: readOnly, __ctx: ctx,
    },
  })), [graph, errorIds, warnIds, ctx, functionNames, updateNode, deleteNode, readOnly, selectedIds]);
  const deleteEdge = useCallback((id: string) => setGraph({ ...graph, edges: graph.edges.filter((e) => e.id !== id) }), [graph, setGraph]);
  const rfEdges: Edge[] = useMemo(() => graph.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
    type: "snap",
    animated: e.sourceHandle === "clip" || e.sourceHandle === "time",
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: edgeStyle(e as Edge),
    data: { onDelete: deleteEdge },
  })), [graph, deleteEdge]);

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
      // A clip only fits clip fields, a frame only fits time fields — of that block's operation.
      const key = c.targetHandle.slice(6);
      const target = graph.nodes.find((n) => n.id === c.target);
      const op = (target?.block ? (BLOCK_MAP.get(target.block!)?.op ?? target.op) : target?.op) ?? "";
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
    if (removed.size) setGraph({ ...graph, edges: graph.edges.filter((e) => !removed.has(e.id)) });
  }, [graph, setGraph]);

  const onConnect = useCallback((c: Connection) => {
    const edge = { id: uid(), source: c.source, sourceHandle: c.sourceHandle ?? "", target: c.target, targetHandle: c.targetHandle ?? "" };
    let edges = graph.edges;
    if (c.targetHandle?.startsWith("param:")) {
      // one connection per field: the new one replaces the old
      edges = edges.filter((e) => !(e.target === c.target && e.targetHandle === c.targetHandle));
    }
    setGraph({ ...graph, edges: [...edges, edge] });
  }, [graph, setGraph]);

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
    if (moved.size || removed.size) {
      setGraph({
        nodes: graph.nodes
          .filter((n) => !removed.has(n.id))
          .map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)),
        edges: graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
      });
    }
  }, [graph, setGraph]);

  const addNode = useCallback((node: ToolGraphNode) => setGraph({ ...graph, nodes: [...graph.nodes, node] }), [graph, setGraph]);
  /** A free spot to the right of the flow: below the lowest node there. */
  const freeSpot = useCallback(() => {
    const rights = graph.nodes.filter((n) => (n.position?.x ?? 0) >= 360).map((n) => n.position?.y ?? 0);
    return { x: 440, y: rights.length ? Math.max(...rights) + 150 : 80 };
  }, [graph]);

  const run = useCallback(() => {
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
    if (!type && !blockId) return;
    const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const base = { id: uid(), position: { x: position.x - 90, y: position.y - 20 } };
    if (blockId) {
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

  /** Switching Blocks → Code converts the graph into readable code the tool now runs. */
  const switchToCode = useCallback(() => {
    if (tab === "code" || readOnly) return;
    if (tool.mode === "code") { setTab("code"); return; } // already a code tool — nothing to convert
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
    setTab("blocks");
    setConverted(false);
    onChange({ ...tool, mode: "blocks" });
  }, [tool, onChange]);

  const errorCount = issues.filter((i) => i.level === "error").length + (runError ? 1 : 0);
  const warnCount = issues.filter((i) => i.level === "warning").length;
  const errorsBar = (errorCount + warnCount > 0 || runError) && (
    <div className="bs-errors" data-testid="bs-errors">
      <div className="bs-errors-head">
        <button className={`bs-error-toggle${errorCount ? " has-errors" : ""}`} onClick={() => setShowErrors((s) => !s)} data-testid="bs-error-toggle">
          {errorCount > 0 ? `✕ ${errorCount} error${errorCount === 1 ? "" : "s"}` : `⚠ ${warnCount} notice${warnCount === 1 ? "" : "s"}`}
        </button>
        <span className="bs-errors-hint">{showErrors ? "Click a message to jump to the block" : "Click to show details"}</span>
      </div>
      {showErrors && (
        <div className="bs-errors-list">
          {issues.map((issue, i) => (
            <button key={i} className={`bs-error-row ${issue.level}`} onClick={() => issue.nodeId && focusNode(issue.nodeId)}>
              <span>{issue.level === "error" ? "✕" : "⚠"}</span>
              {issue.message}
            </button>
          ))}
          {runError && <div className="bs-error-row error"><span>✕</span>Run failed: {runError}</div>}
        </div>
      )}
    </div>
  );

  return (
    <div className="bs-studio" data-testid="block-studio">
      <header className="bs-header">
        <input className="bs-title" aria-label="Tool name" value={tool.name} onChange={(e) => onChange({ ...tool, name: e.target.value })} disabled={readOnly} data-testid="bs-name" />
        <div className="bs-tabs" role="tablist" aria-label="Tool mode">
          <button role="tab" aria-selected={tab === "blocks"} className={tab === "blocks" ? "active" : ""} onClick={switchToBlocks} data-testid="bs-tab-blocks">🧩 Blocks</button>
          <button role="tab" aria-selected={tab === "code"} className={tab === "code" ? "active" : ""} onClick={switchToCode} data-testid="bs-tab-code">{"</>"} Code</button>
        </div>
        <span className="bs-spacer" />
        {tab === "blocks" && (
          <button className="bs-btn" onClick={() => setImportOpen((o) => !o)} disabled={readOnly} data-testid="bs-import">🎬 Import clips</button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" disabled={readOnly} onClick={() => addNode({ id: uid(), type: "frame", frame: Math.round(ctx.playhead * ctx.fps), position: freeSpot() })} data-testid="bs-add-frame">🖼 Add frame</button>
        )}
        {tab === "blocks" && (
          <button className="bs-btn" onClick={() => setTutorialStep(0)} disabled={readOnly} data-testid="bs-tutorial-open" title="Show the first-tool tutorial">🎓 Tutorial</button>
        )}
        <button className="bs-btn bs-btn-run" onClick={run} disabled={readOnly} data-testid="bs-run">▶ Run</button>
        <button className="bs-btn bs-btn-close" onClick={onClose} aria-label="Close studio" data-testid="bs-close">✕</button>
      </header>
      {importOpen && (
        <div className="bs-import" data-testid="bs-import-panel">
          <p>Clips in this project — add one, then connect it to a block.</p>
          <div className="bs-import-list">
            {ctx.clips.length === 0 && <p className="bs-hint">No clips yet. Add something to the timeline first.</p>}
            {ctx.clips.map((c) => (
              <button key={c.id} className="bs-import-row" disabled={readOnly}
                onClick={() => { addNode({ id: uid(), type: "clipRef", clipId: c.id, text: c.label ?? "", select: c.kind, position: freeSpot() }); setImportOpen(false); }}>
                <span>{c.kind === "media" ? "🎬" : c.kind === "shape" ? "◼" : c.kind === "audio" ? "🎵" : "T"}</span>
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
                aria-pressed={category === c.id} data-testid={`bs-cat-${c.id}`} onClick={() => setCategory(c.id)}
                title={`${c.label} blocks`}>
                <i className={`bs-cat-dot bs-dot-cat-${c.id.toLowerCase()}`} />
                <span className="bs-cat-label">{c.label}</span>
              </button>
            ))}
          </nav>
          <aside className="bs-palette" data-testid="bs-palette">
            <p className="bs-palette-title" data-testid="bs-palette-heading">{category} blocks</p>
            {category === "Flow" ? (
              <div className="bs-palette-group">
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "repeat"); }} title="Run blocks a number of times">↻ Repeat</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "eachClip"); }} title="Run blocks for every clip">🎞 For each clip</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "function"); }} title="A named group of blocks">ƒ Function</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "call"); }} title="Run a function">ƒ→ Call</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "comment"); }} title="A note that does nothing">💬 Note</div>
              </div>
            ) : category === "Values" ? (
              <div className="bs-palette-group">
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-text"); }} title="A piece of text to plug into a field">📝 Text</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-number"); }} title="A number to plug into a field">🔢 Number</div>
                <div className="bs-chip" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/videoforge", "value-yesno"); }} title="A yes or no to plug into a field">🔘 Yes / No</div>
                <p className="bs-hint">Drag one next to a block, type your value, then drag from its dot into the block's field.</p>
              </div>
            ) : (
              <div className="bs-palette-group">
                {BLOCK_LIBRARY.filter((b) => b.group === category).map((b) => (
                  <div key={b.id} className={`bs-chip bs-group-${category.toLowerCase()}`} draggable={!readOnly}
                    data-testid={`bs-chip-${b.id}`}
                    onDragStart={(e) => { e.dataTransfer.setData("application/videoforge-block", b.id); e.dataTransfer.effectAllowed = "move"; }}
                    title={b.description}>{b.label}</div>
                ))}
              </div>
            )}
            <div className="bs-palette-group">
              <h4>Connectors</h4>
              <p className="bs-hint">Connect blocks top-to-bottom to run them in order. Bring in clips and frames with the buttons above, then drag from their right side into a block's <b>clip</b> or <b>time</b> dot.</p>
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
        <div className="bs-tut-card" data-testid="bs-tutorial-card" role="dialog" aria-label="First tool tutorial">
          <p className="bs-tut-count">Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}</p>
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
