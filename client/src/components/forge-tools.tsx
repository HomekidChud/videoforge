import { useEffect, useState } from "react";
import { BUILT_IN_TOOLS, loadUserTools, saveUserTools, runTool, type CustomTool } from "@shared/custom-tools";
import type { ToolContext } from "@shared/custom-tools";
import type { TimelineOp } from "@shared/editing";
import BlockStudio, { defaultGraph } from "./forge-block-studio";

export function ForgeTools({ disabled, onRun, onError, getCtx }: { disabled: boolean; onRun: (ops: TimelineOp[]) => void; onError: (message: string) => void; getCtx: () => ToolContext }) {
  const [userTools, setUserTools] = useState<CustomTool[]>(() => loadUserTools(window.localStorage));
  const [editing, setEditing] = useState<CustomTool | null>(null);
  useEffect(() => saveUserTools(userTools, window.localStorage), [userTools]);

  const runToolNow = (tool: CustomTool) => {
    if (disabled) return;
    try {
      const ops = runTool(tool, getCtx());
      if (!ops.length) return;
      onRun(ops);
    } catch (e: any) { onError(e.message || "The tool failed"); }
  };

  // Full-screen studio while a tool is open.
  if (editing) {
    return <BlockStudio
      tool={editing}
      ctx={getCtx()}
      readOnly={disabled}
      onChange={(next) => setEditing(next)}
      onClose={() => {
        setUserTools((list) => list.some((t) => t.id === editing.id) ? list.map((t) => (t.id === editing.id ? editing : t)) : [...list, editing]);
        setEditing(null);
      }}
      onRun={onRun}
    />;
  }

  const card = (tool: CustomTool, builtIn: boolean) => <div key={tool.id} className="tool-card" data-testid={`tool-card-${tool.id}`}>
    <div className="tool-card-head"><b>{tool.name}</b><span className="eyebrow">{tool.mode === "blocks" ? "Blocks" : "Code"}</span></div>
    <p className="help-text">{tool.description}</p>
    <div className="tool-card-actions">
      <button className="primary-btn" disabled={disabled} onClick={() => runToolNow(tool)} data-testid={`tool-run-${tool.id}`}>Run</button>
      <button className="chip" disabled={disabled} onClick={() => setEditing(structuredClone(tool))} data-testid={`tool-edit-${tool.id}`}>Open in studio</button>
      <button className="chip" disabled={disabled} onClick={() => setUserTools((list) => [...list, { ...structuredClone(tool), id: `tool-${Date.now().toString(36)}`, name: `${tool.name} copy`, builtIn: false }])}>Duplicate</button>
      {!builtIn && <button className="chip" disabled={disabled} onClick={() => setUserTools((list) => list.filter((t) => t.id !== tool.id))}>Delete</button>}
    </div>
  </div>;

  return <div className="effects-panel" data-testid="tools-library">
    <div className="library-heading"><h3>Custom tools</h3><span className="eyebrow">{BUILT_IN_TOOLS.length + userTools.length} tools</span></div>
    <p className="help-text">Automate your edit in the block studio: drag blocks, connect them with lines, bring in clips and frames, and run everything as one undoable step. Prefer typing? Every tool also has a code mode.</p>
    <section className="effect-group"><h4>Examples</h4>{BUILT_IN_TOOLS.map((t) => card(t, true))}</section>
    {userTools.length > 0 && <section className="effect-group"><h4>Your tools</h4>{userTools.map((t) => card(t, false))}</section>}
    <div className="tool-add-row">
      <button className="primary-btn" disabled={disabled} data-testid="tool-new-blocks" onClick={() => setEditing({ id: `tool-${Date.now().toString(36)}`, name: "My tool", description: "What this tool does", mode: "blocks", graph: defaultGraph() })}>New tool with blocks</button>
      <button className="primary-btn" disabled={disabled} data-testid="tool-new-code" onClick={() => setEditing({ id: `tool-${Date.now().toString(36)}`, name: "My tool", description: "What this tool does", mode: "code", code: "// vf.playhead, vf.selection, vf.clips\nreturn [];" })}>New tool with code</button>
    </div>
    <p className="help-text">Tools are stored in this browser. Open an example in the studio to see how it works.</p>
    <a href="#/docs/custom-tools" className="ghost-link">Custom tools guide</a>
  </div>;
}
