import { useEffect, useRef, useState } from "react";
import { BUILT_IN_TOOLS, loadUserTools, saveUserTools, runTool, saveSticker, decodeTool, type CustomTool } from "@shared/custom-tools";
import type { ToolContext } from "@shared/custom-tools";
import type { TimelineOp } from "@shared/editing";
import { api } from "@/lib/api";
import BlockStudio, { defaultGraph } from "./forge-block-studio";

export function ForgeTools({ disabled, onRun, onError, onNote, getCtx, studio = true, autoOpen = false, onExitStudio, onOpenAnimator }: { disabled: boolean; onRun: (ops: TimelineOp[]) => void; onError: (message: string) => void; onNote?: (message: string) => void; getCtx: () => ToolContext; studio?: boolean; autoOpen?: boolean; onExitStudio?: () => void; onOpenAnimator?: () => void }) {
  const [userTools, setUserTools] = useState<CustomTool[]>(() => loadUserTools(window.localStorage));
  const [editing, setEditing] = useState<CustomTool | null>(null);
  const [freshTool, setFreshTool] = useState(false);
  const [importCode, setImportCode] = useState("");
  /** The untouched state of a brand-new draft, so closing it without changes doesn't save a junk tool. */
  const draftRef = useRef<string | null>(null);
  useEffect(() => saveUserTools(userTools, window.localStorage), [userTools]);

  // The tool library on the server: tools sync per account (or per API key), so
  // they follow you between browsers. The browser keeps an offline copy, but the
  // server is the source of truth: on load, its version of each tool wins and
  // only tools the server has never seen are pushed up (so deletes elsewhere
  // stick). The cached copy is scoped to the signed-in identity, so switching
  // accounts does not leak one library into another.
  const pushTool = (tool: CustomTool) => api("PUT", `/api/tools/${tool.id}`, { name: tool.name, description: tool.description, mode: tool.mode, code: tool.code, graph: tool.graph }).catch(() => {});
  const dropTool = (id: string) => api("DELETE", `/api/tools/${id}`).catch(() => {});
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<{ id?: string; kind?: string }>("GET", "/api/auth/me");
        const identity = me?.id ?? "anonymous";
        if (!alive) return;
        const prevOwner = window.localStorage.getItem("vf.custom-tools.owner");
        if (prevOwner !== identity) {
          // A different account (or key) is in: start fresh from the server.
          window.localStorage.setItem("vf.custom-tools.owner", identity);
          saveUserTools([], window.localStorage);
          setUserTools([]);
        }
        const data = await api<{ tools: CustomTool[] }>("GET", "/api/tools");
        if (!alive || !Array.isArray(data.tools)) return;
        const server = data.tools;
        setUserTools((local) => {
          const byId = new Map(local.map((t) => [t.id, t]));
          // Tools the server has never seen (e.g. made offline, or from before the
          // library synced) are pushed up; the server's version wins otherwise.
          for (const t of local) if (!server.some((s) => s.id === t.id)) void pushTool(t);
          return [...local.filter((t) => !server.some((s) => s.id === t.id)), ...server.map((s) => ({ ...byId.get(s.id), ...s }))];
        });
      } catch { /* offline or read-only: the local library still works */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const freshDraft = () => {
    const tool: CustomTool = { id: `tool-${Date.now().toString(36)}`, name: "My blocks", description: "What these blocks do to your edit", mode: "blocks", graph: defaultGraph() };
    draftRef.current = JSON.stringify(tool);
    return tool;
  };

  // The Blocks tab opens the canvas straight away: your latest tool, or a fresh draft.
  useEffect(() => {
    if (!autoOpen || disabled) return;
    const last = userTools.filter((t) => t.mode === "blocks").slice(-1)[0];
    if (last) { draftRef.current = null; setEditing(structuredClone(last)); }
    else { setFreshTool(true); setEditing(freshDraft()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runToolNow = (tool: CustomTool) => {
    if (disabled) return;
    try {
      const ops = runTool(tool, getCtx());
      // Save-as-sticker blocks act here: their timeline op is a no-op, the
      // sticker itself is saved to this browser when the tool runs.
      const stickers = ops.filter((o) => o.op === "save_sticker");
      const rest = ops.filter((o) => o.op !== "save_sticker");
      for (const op of stickers) {
        const id = String((op.args as any)?.clipId ?? "");
        const raw = getCtx().clips.find((c) => c.id === id)?.raw;
        if (!raw) return onError("Save as sticker needs a clip — connect a clip block to its Clip field");
        saveSticker(window.localStorage, String((op.args as any)?.name ?? "Sticker"), JSON.parse(JSON.stringify(raw)));
        onNote?.(`Saved sticker “${String((op.args as any)?.name ?? "Sticker")}”`);
      }
      if (!ops.length) return;
      if (rest.length) onRun(rest);
    } catch (e: any) { onError(e.message || "The blocks could not be applied"); }
  };

  // Full-screen studio while a tool is open.
  if (editing) {
    return <BlockStudio
      tool={editing}
      ctx={getCtx()}
      readOnly={disabled}
      allowBlocks={studio}
      onChange={(next) => { setEditing(next); draftRef.current = null; }}
      fresh={freshTool}
      onClose={() => {
        const untouched = draftRef.current !== null && JSON.stringify(editing) === draftRef.current;
        if (!untouched) {
          const next = userTools.some((t) => t.id === editing.id) ? userTools.map((t) => (t.id === editing.id ? editing : t)) : [...userTools, editing];
          setUserTools(next);
          saveUserTools(next, window.localStorage); // synchronous: the panel switch below can unmount us before an effect runs
          void pushTool(editing); // and the server library, so it follows you to other browsers
        }
        setEditing(null);
        setFreshTool(false);
        onExitStudio?.();
      }}
      onRun={onRun}
      onOpenAnimator={onOpenAnimator}
    />;
  }

  const card = (tool: CustomTool, builtIn: boolean) => <div key={tool.id} className="tool-card" data-testid={`tool-card-${tool.id}`}>
    <div className="tool-card-head"><b>{tool.name}</b><span className="eyebrow">{tool.mode === "blocks" ? "Blocks" : "Code"}</span></div>
    <p className="help-text">{tool.description}</p>
    <div className="tool-card-actions">
      <button className="primary-btn" disabled={disabled} onClick={() => runToolNow(tool)} data-testid={`tool-run-${tool.id}`}>Apply to edit</button>
      {studio && <button className="chip" disabled={disabled} onClick={() => setEditing(structuredClone(tool))} data-testid={`tool-edit-${tool.id}`}>Open in studio</button>}
      <button className="chip" disabled={disabled} onClick={() => setUserTools((list) => [...list, { ...structuredClone(tool), id: `tool-${Date.now().toString(36)}`, name: `${tool.name} copy`, builtIn: false }])}>Duplicate</button>
      {!builtIn && <button className="chip" disabled={disabled} onClick={() => { setUserTools((list) => list.filter((t) => t.id !== tool.id)); void dropTool(tool.id); }}>Delete</button>}
    </div>
  </div>;

  return <div className="effects-panel" data-testid="tools-library">
    <div className="library-heading"><h3>Blocks &amp; scripts</h3><span className="eyebrow">{BUILT_IN_TOOLS.length + userTools.length} saved</span></div>
    <p className="help-text">Build anything for your edit in the block studio — titles, timing, styling, rigs, whole sequences. Drag blocks, connect them, pick which clips they work on, then press the green Apply to edit button to change your timeline in one undoable step. Prefer typing? Every set of blocks also has a code mode.</p>
    <section className="effect-group"><h4>Examples</h4>{BUILT_IN_TOOLS.map((t) => card(t, true))}</section>
    {userTools.length > 0 && <section className="effect-group"><h4>Yours</h4>{userTools.map((t) => card(t, false))}</section>}
    <div className="tool-add-row">
      <button className="primary-btn" disabled={disabled} data-testid="tool-new-code" onClick={() => setEditing({ id: `tool-${Date.now().toString(36)}`, name: "My blocks", description: "What these blocks do to your edit", mode: "code", code: "// vf.playhead, vf.selection, vf.clips\nreturn [];" })}>New script with code</button>
      {studio && <button className="primary-btn" disabled={disabled} data-testid="tool-new-blocks" onClick={() => { setFreshTool(true); setEditing(freshDraft()); }}>New blocks</button>}
    </div>
    <div className="tool-import-row">
      <input className="tool-import-input" placeholder="Paste a block code (VFT1:…)" aria-label="Paste a block code"
        data-testid="tool-import-code" value={importCode} onChange={(e) => setImportCode(e.target.value)} disabled={disabled} />
      <button className="chip" disabled={disabled || !importCode.trim()} data-testid="tool-import-btn"
        onClick={() => {
          try {
            const tool = decodeTool(importCode);
            setUserTools((list) => [...list, tool]);
            void pushTool(tool);
            setImportCode("");
            onNote?.(`Added “${tool.name}”`);
          } catch (e: any) { onError(e.message || "That tool code didn't work"); }
        }}>Add</button>
    </div>
    <p className="help-text">Your blocks sync to your account and keep an offline copy in this browser. Share one with the 🔗 Share button in the studio, and add it here from its code.</p>
    <a href="#/docs/custom-tools" className="ghost-link">Blocks guide</a>
  </div>;
}
