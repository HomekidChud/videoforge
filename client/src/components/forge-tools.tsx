import { useEffect, useState } from "react";
import { BUILT_IN_TOOLS, OP_IDS, OP_PARAMS, loadUserTools, saveUserTools, type CustomTool, type ToolBlock, type ToolParam } from "@shared/custom-tools";

/** Path of a block inside the tree: [repeatIndex, opIndex, ...]. */
type Path = number[];

function updateBlock(blocks: ToolBlock[], path: Path, update: (b: ToolBlock) => ToolBlock): ToolBlock[] {
  if (!path.length) return blocks;
  const [head, ...rest] = path;
  return blocks.map((b, i) => {
    if (i !== head) return b;
    if (!rest.length) return update(b);
    if (b.kind === "repeat" || b.kind === "eachClip") return { ...b, blocks: updateBlock(b.blocks, rest, update) };
    return b;
  });
}
function removeBlock(blocks: ToolBlock[], path: Path): ToolBlock[] {
  if (!path.length) return blocks;
  const [head, ...rest] = path;
  if (!rest.length) return blocks.filter((_, i) => i !== head);
  return blocks.map((b, i) => i !== head ? b : b.kind === "repeat" || b.kind === "eachClip" ? { ...b, blocks: removeBlock(b.blocks, rest) } : b);
}
/** parent null appends to the top list; a parent path appends inside that group. */
function insertBlock(blocks: ToolBlock[], parent: Path | null, block: ToolBlock): ToolBlock[] {
  if (!parent || !parent.length) return [...blocks, block];
  const [head, ...rest] = parent;
  return blocks.map((b, i) => {
    if (i !== head) return b;
    if (b.kind === "repeat" || b.kind === "eachClip") {
      if (!rest.length) return { ...b, blocks: [...b.blocks, block] };
      return { ...b, blocks: insertBlock(b.blocks, rest, block) };
    }
    return b;
  });
}
const move = (blocks: ToolBlock[], path: Path, delta: number): ToolBlock[] => {
  if (path.length > 1) {
    const [head, ...rest] = path;
    return blocks.map((b, i) => i !== head ? b : b.kind === "repeat" || b.kind === "eachClip" ? { ...b, blocks: move(b.blocks, rest, delta) } : b);
  }
  const i = path[0], j = i + delta;
  if (j < 0 || j >= blocks.length) return blocks;
  const out = [...blocks]; [out[i], out[j]] = [out[j], out[i]]; return out;
};

function defaultArgs(op: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const p of OP_PARAMS[op] ?? []) args[p.key] = p.def;
  return args;
}

function ParamField({ param, value, onChange, disabled }: { param: ToolParam; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const common = { disabled, value: String(value ?? ""), onChange: (e: any) => onChange(e.target.value), "aria-label": param.label, "data-testid": `tool-param-${param.key}` } as const;
  return <label className="field">{param.label}
    {param.type === "number" ? <input type="text" inputMode="decimal" placeholder={`e.g. ${param.def}`} {...common} onChange={(e) => onChange(e.target.value)} />
      : param.type === "color" ? <input type="color" {...common} />
      : param.type === "select" ? <select {...common}>{(param.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
      : param.type === "json" ? <textarea rows={3} className="code-input" spellCheck={false} {...common} />
      : <input type="text" {...common} placeholder={param.placeholder} />}
  </label>;
}

function BlockEditor({ block, path, onChange, onRemove, onMove, onInsert, disabled }: {
  block: ToolBlock; path: Path; disabled: boolean;
  onChange: (path: Path, b: ToolBlock) => void; onRemove: (path: Path) => void; onMove: (path: Path, delta: number) => void; onInsert: (parent: Path | null, block: ToolBlock) => void;
}) {
  const controls = <span className="tool-block-controls">
    <button className="icon-btn" disabled={disabled} aria-label="Move up" onClick={() => onMove(path, -1)}>↑</button>
    <button className="icon-btn" disabled={disabled} aria-label="Move down" onClick={() => onMove(path, 1)}>↓</button>
    <button className="icon-btn" disabled={disabled} aria-label="Duplicate block" onClick={() => onInsert(null, structuredClone(block))}>⧉</button>
    <button className="icon-btn" disabled={disabled} aria-label="Remove block" onClick={() => onRemove(path)}>✕</button>
  </span>;
  if (block.kind === "comment") return <div className="tool-block">
    <input className="tool-comment" disabled={disabled} value={block.text} aria-label="Comment" placeholder="A note for future you" onChange={(e) => onChange(path, { kind: "comment", text: e.target.value })} />
    {controls}
  </div>;
  if (block.kind === "op") {
    const params = OP_PARAMS[block.op] ?? [];
    return <div className="tool-block" data-testid={`tool-block-op`}>
      <div className="tool-block-head">
        <select disabled={disabled} aria-label="Operation" value={block.op} onChange={(e) => onChange(path, { kind: "op", op: e.target.value, args: defaultArgs(e.target.value) })}>
          {OP_IDS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {controls}
      </div>
      {params.map((p) => <ParamField key={p.key} param={p} disabled={disabled} value={block.args?.[p.key] ?? p.def} onChange={(v) => onChange(path, { ...block, args: { ...(block.args ?? defaultArgs(block.op)), [p.key]: v } })} />)}
    </div>;
  }
  // repeat / eachClip containers
  const isRepeat = block.kind === "repeat";
  return <div className="tool-block tool-block-group" data-testid={`tool-block-${block.kind}`}>
    <div className="tool-block-head">
      {isRepeat
        ? <>Repeat <input type="number" min={1} max={100} disabled={disabled} aria-label="Repeat count" value={block.count} onChange={(e) => onChange(path, { ...block, count: Number(e.target.value) || 1 })} /> times</>
        : <>For each clip <select disabled={disabled} aria-label="Which clips" value={block.select ?? "all"} onChange={(e) => onChange(path, { ...block, select: e.target.value as "all" | "text" | "shape" | "media" | "selected" })}>
            {["all", "text", "shape", "media", "selected"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select> (use $clipId)</>}
      {controls}
    </div>
    <div className="tool-block-children">
      {block.blocks.map((child, i) => <BlockEditor key={i} block={child} path={[...path, i]} disabled={disabled} onChange={onChange} onRemove={onRemove} onMove={onMove} onInsert={onInsert} />)}
      <button className="ghost-link" disabled={disabled} onClick={() => onInsert(path, { kind: "op", op: "add_text_clip", args: defaultArgs("add_text_clip") })}>+ add step inside</button>
    </div>
  </div>;
}

const newTool = (mode: "blocks" | "code"): CustomTool => ({
  id: `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name: "My tool", description: "What this tool does", mode,
  blocks: mode === "blocks" ? [{ kind: "op", op: "add_text_clip", args: defaultArgs("add_text_clip") }] : undefined,
  code: mode === "code" ? "// vf.playhead, vf.selection, vf.clips\n// vf.addText({ text, duration }) ... return the operations\nreturn [];" : undefined,
});

export function ForgeTools({ disabled, onRun }: { disabled: boolean; onRun: (tool: CustomTool) => void }) {
  const [userTools, setUserTools] = useState<CustomTool[]>(() => loadUserTools(window.localStorage));
  const [editing, setEditing] = useState<CustomTool | null>(null);
  useEffect(() => saveUserTools(userTools, window.localStorage), [userTools]);

  if (editing) {
    const save = () => { setUserTools((list) => list.some((t) => t.id === editing.id) ? list.map((t) => t.id === editing.id ? editing : t) : [...list, editing]); setEditing(null); };
    return <div className="effects-panel" data-testid="tool-editor">
      <div className="library-heading"><h3>{editing.name || "Untitled tool"}</h3><span className="eyebrow">{editing.mode === "blocks" ? "Building blocks" : "JavaScript"}</span></div>
      <label className="field">Name<input value={editing.name} disabled={disabled} aria-label="Tool name" onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="tool-name" /></label>
      <label className="field">Description<input value={editing.description} disabled={disabled} aria-label="Tool description" onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
      <div className="workspace-switch" aria-label="Tool mode">
        <button className={editing.mode === "blocks" ? "active" : ""} aria-pressed={editing.mode === "blocks"} onClick={() => setEditing({ ...editing, mode: "blocks" })}>Blocks</button>
        <button className={editing.mode === "code" ? "active" : ""} aria-pressed={editing.mode === "code"} onClick={() => setEditing({ ...editing, mode: "code" })}>Code</button>
      </div>
      {editing.mode === "blocks" ? <>
        <div className="tool-block-list">
          {(editing.blocks ?? []).map((block, i) => <BlockEditor key={i} block={block} path={[i]} disabled={disabled}
            onChange={(path, b) => setEditing({ ...editing, blocks: updateBlock(editing.blocks ?? [], path, () => b) })}
            onRemove={(path) => setEditing({ ...editing, blocks: removeBlock(editing.blocks ?? [], path) })}
            onMove={(path, delta) => setEditing({ ...editing, blocks: move(editing.blocks ?? [], path, delta) })}
            onInsert={(parent, block) => setEditing({ ...editing, blocks: parent ? insertBlock(editing.blocks ?? [], parent, block) : [...(editing.blocks ?? []), block] })} />)}
        </div>
        <div className="tool-add-row">
          <button className="chip" disabled={disabled} onClick={() => setEditing({ ...editing, blocks: [...(editing.blocks ?? []), { kind: "op", op: "add_text_clip", args: defaultArgs("add_text_clip") }] })}>+ Operation</button>
          <button className="chip" disabled={disabled} onClick={() => setEditing({ ...editing, blocks: [...(editing.blocks ?? []), { kind: "repeat", count: 3, blocks: [{ kind: "op", op: "add_text_clip", args: defaultArgs("add_text_clip") }] }] })}>+ Repeat</button>
          <button className="chip" disabled={disabled} onClick={() => setEditing({ ...editing, blocks: [...(editing.blocks ?? []), { kind: "eachClip", select: "text", blocks: [{ kind: "op", op: "update_clip", args: defaultArgs("update_clip") }] }] })}>+ For each clip</button>
          <button className="chip" disabled={disabled} onClick={() => setEditing({ ...editing, blocks: [...(editing.blocks ?? []), { kind: "comment", text: "" }] })}>+ Note</button>
        </div>
        <p className="help-text">Templates: $playhead, $duration, $index, $count, $clipId, $selection. A value like "$playhead + $index * 0.4" is computed. JSON fields become objects.</p>
      </> : <>
        <textarea className="code-input tool-code" rows={14} spellCheck={false} disabled={disabled} aria-label="Tool code" value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} data-testid="tool-code" />
        <p className="help-text">vf.playhead, vf.duration, vf.selection, vf.clips · vf.addText(opts), vf.addShape(), vf.update(id, patch), vf.motion(id, preset, opts), vf.stagger(ids, opts), vf.keyframes(id, prop, keys), vf.animate(id, exprs), vf.remove(id), vf.duplicate(id), vf.markers(bpm, count). Return an array of operations.</p>
      </>}
      <div className="two-col">
        <button className="primary-btn" disabled={disabled || !editing.name.trim()} onClick={save} data-testid="tool-save">Save tool</button>
        <button className="secondary-btn" disabled={disabled} onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </div>;
  }

  const card = (tool: CustomTool, builtIn: boolean) => <div key={tool.id} className="tool-card" data-testid={`tool-card-${tool.id}`}>
    <div className="tool-card-head"><b>{tool.name}</b><span className="eyebrow">{tool.mode === "blocks" ? "Blocks" : "Code"}</span></div>
    <p className="help-text">{tool.description}</p>
    <div className="tool-card-actions">
      <button className="primary-btn" disabled={disabled} onClick={() => onRun(tool)} data-testid={`tool-run-${tool.id}`}>Run</button>
      <button className="chip" disabled={disabled} onClick={() => setEditing(structuredClone(tool))}>Edit</button>
      <button className="chip" disabled={disabled} onClick={() => setUserTools((list) => [...list, { ...structuredClone(tool), id: `${tool.id}-copy-${Math.random().toString(36).slice(2, 6)}`, name: `${tool.name} copy`, builtIn: false }])}>Duplicate</button>
      {!builtIn && <button className="chip" disabled={disabled} onClick={() => setUserTools((list) => list.filter((t) => t.id !== tool.id))}>Delete</button>}
    </div>
  </div>;

  return <div className="effects-panel" data-testid="tools-library">
    <div className="library-heading"><h3>Custom tools</h3><span className="eyebrow">{BUILT_IN_TOOLS.length + userTools.length} tools</span></div>
    <p className="help-text">Automate your edit: write a tool in JavaScript or snap together building blocks of timeline operations. Run it and every operation applies as one undoable, atomic step.</p>
    <section className="effect-group"><h4>Examples</h4>{BUILT_IN_TOOLS.map((t) => card(t, true))}</section>
    {userTools.length > 0 && <section className="effect-group"><h4>Your tools</h4>{userTools.map((t) => card(t, false))}</section>}
    <div className="tool-add-row">
      <button className="primary-btn" disabled={disabled} onClick={() => setEditing(newTool("blocks"))} data-testid="tool-new-blocks">New tool with blocks</button>
      <button className="primary-btn" disabled={disabled} onClick={() => setEditing(newTool("code"))} data-testid="tool-new-code">New tool with code</button>
    </div>
    <p className="help-text">Tools are stored in this browser. Duplicate an example to make it yours.</p>
    <a href="#/docs/custom-tools" className="ghost-link">Custom tools guide</a>
  </div>;
}
