import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronRight, CircleOff, Clapperboard, Copy, Diamond, Film, Pause, Play, Plus, Redo2, Scissors, SkipBack, Sparkles, Square, Trash2, Type, Undo2, UserRound, X,
} from "lucide-react";
import type { Clip, Timeline } from "@shared/timeline";
import { clipDuration } from "@shared/timeline";
import { ANIMATABLE, EASINGS, type Easing } from "@shared/animation";
import {
  RIG_PRESETS, RIG_PROPS, addParts, applyAnimationToClips, applyPreset, clipPoseAt, keyTimes, loadAnimations, localFromClip, localPose, moveKey, newAnimation,
  partTree, removeKey, removePart, saveAnimations, setKey, setKeyEasing, setParent, setPivot, setPose, stickFigure, trimToLength, wouldCycle,
  type RigAnimation, type RigPart, type RigPresetId, type RigProp,
} from "@shared/rig";
import type { AssetDTO } from "@/lib/editor-model";
import ForgePreview from "./forge-preview";
import { safeLocalStorage } from "@/lib/ui-lang";

type Props = {
  timeline: Timeline;
  assets: AssetDTO[];
  mediaUrl: (id: string, url: string) => string;
  projectKey: string;
  readOnly: boolean;
  /** Clips selected in the editor when the Animator opened. */
  initialSelection: string[];
  playhead: number;
  /** Bake the animation into the edit. One undoable step. */
  onApply: (anim: RigAnimation) => void;
  /** Put new clips (the stick figure) on the timeline. */
  onCreateClips: (clips: Record<string, unknown>[]) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onNote: (message: string) => void;
};

const PROP_LABEL: Record<RigProp, string> = { x: "Left / right", y: "Up / down", scale: "Size", rotation: "Turn", opacity: "See-through" };
const EASING_NAMES = Object.keys(EASINGS).filter((k) => !k.startsWith("ease-in-") && !k.startsWith("ease-out-")).concat(["hold"]);
const KIND_ICON = { media: Film, text: Type, shape: Square } as const;
const FRAME = 1 / 30;
const snapFrame = (t: number) => Math.round(t / FRAME) * FRAME;
const fmt = (t: number) => `${t.toFixed(2)}s`;
const uid = () => `a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const num = (v: number, d = 3) => String(Math.round(v * 10 ** d) / 10 ** d);

export default function ForgeAnimator(props: Props) {
  const { timeline, assets, mediaUrl, projectKey, readOnly, onApply, onCreateClips, onClose, onError, onNote } = props;
  const res = timeline.resolution;
  const [anims, setAnims] = useState<RigAnimation[]>(() => {
    const saved = loadAnimations(safeLocalStorage, projectKey);
    return saved.length ? saved : [newAnimation(uid(), "Animation 1", props.playhead, 2)];
  });
  const [activeId, setActiveId] = useState(() => anims[0].id);
  const anim = anims.find((a) => a.id === activeId) ?? anims[0];
  const [t, setT] = useState(0), [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<string | null>(anim.parts[0]?.clipId ?? null);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [selKey, setSelKey] = useState<{ id: string; prop: RigProp; time: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [past, setPast] = useState<RigAnimation[][]>([]), [future, setFuture] = useState<RigAnimation[][]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [tab, setTab] = useState<"pose" | "joint">("pose");
  const sheet = useRef<HTMLDivElement>(null), lane = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(640);

  // ---- state helpers -------------------------------------------------------------------------
  const commit = (fn: (a: RigAnimation) => RigAnimation, opts: { history?: boolean } = {}) => {
    let next: RigAnimation;
    try { next = fn(anim); } catch (e: any) { onError(e.message || "That change is not allowed"); return; }
    if (next === anim) return;
    if (opts.history !== false) { setPast((p) => [...p.slice(-60), anims]); setFuture([]); }
    setAnims((list) => list.map((x) => (x.id === anim.id ? next : x)));
    setApplied(false);
  };
  const pushHistory = useCallback(() => { setPast((p) => [...p.slice(-60), anims]); setFuture([]); }, [anims]);
  const undo = () => { if (!past.length) return; setFuture((f) => [anims, ...f]); setAnims(past[past.length - 1]); setPast(past.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, anims]); setAnims(future[0]); setFuture(future.slice(1)); };

  // Save to this browser as you go.
  useEffect(() => { const h = window.setTimeout(() => saveAnimations(safeLocalStorage, projectKey, anims), 250); return () => window.clearTimeout(h); }, [anims, projectKey]);
  useEffect(() => () => saveAnimations(safeLocalStorage, projectKey, anims), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the stage: the edit with this animation baked in, non-destructively ---------------------
  const previewTimeline = useMemo<Timeline>(() => {
    if (!anim.parts.length) return timeline;
    try { return { ...timeline, clips: applyAnimationToClips(anim, timeline.clips, res).clips }; } catch { return timeline; }
  }, [anim, timeline, res]);
  const stageTime = anim.start + t;

  // ---- playback -----------------------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT((cur) => {
        const n = cur + dt;
        if (n < anim.length) return n;
        if (anim.loop) return n % anim.length;
        setPlaying(false); return anim.length;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, anim.length, anim.loop]);
  useEffect(() => { setT((cur) => Math.min(cur, anim.length)); }, [anim.length]);

  // ---- layout -------------------------------------------------------------------------------
  useEffect(() => {
    const el = lane.current; if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth));
    ro.observe(el); setLaneWidth(el.clientWidth); return () => ro.disconnect();
  }, []);
  const PAD = 18;
  const pps = Math.max(30, ((laneWidth - PAD * 2) / anim.length) * zoom);
  const xOf = (time: number) => PAD + time * pps;
  const timeOf = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect();
    return Math.max(0, Math.min(anim.length, (clientX - r.left + (lane.current!.scrollLeft ?? 0) - PAD) / pps));
  };

  // ---- parts --------------------------------------------------------------------------------
  const tree = useMemo(() => partTree(anim), [anim]);
  const selPart = anim.parts.find((p) => p.clipId === sel);
  const clipOf = (id: string) => timeline.clips.find((c) => c.id === id);
  const missing = anim.parts.filter((p) => !clipOf(p.clipId));

  const addClips = (clips: Clip[]) => {
    const fresh = clips.filter((c) => c.track !== "audio" && !anim.parts.some((p) => p.clipId === c.id));
    if (!fresh.length) return onNote(clips.length ? "Those clips are already in this rig" : "Nothing to add");
    commit((a) => addParts(a, fresh));
    setSel(fresh[0].id);
  };
  const addSelected = () => addClips(props.initialSelection.map(clipOf).filter(Boolean) as Clip[]);
  const addOnScreen = () => addClips(timeline.clips.filter((c) => c.track !== "audio" && anim.start + 0.0001 < c.start + clipDuration(c) && c.start < anim.start + anim.length));

  const makeStickFigure = () => {
    let n = 0; const stamp = Date.now().toString(36);
    const fig = stickFigure(res, anim.start, Math.max(anim.length, 1), () => `fig-${stamp}-${n++}`);
    onCreateClips(fig.clips);
    // Clips arrive on the next render; build the rig from the same data so it is ready straight away.
    commit((a) => {
      let next = a;
      const fake = fig.clips.map((c) => ({ ...(c as object), label: c.label }) as unknown as Clip);
      next = addParts(next, fake);
      for (const p of fig.parts) { next = setPivot(next, p.clipId, 0, p.pivotY); if (p.parentId) next = setParent(next, p.clipId, p.parentId); }
      return next;
    });
    setSel(fig.parts[0].clipId);
    onNote("Stick figure added. Pick the Walk cycle preset to see it move.");
  };

  // ---- editing poses -------------------------------------------------------------------------
  const world = (id: string) => clipPoseAt(anim, id, t, res);
  const local = (id: string) => localPose(anim, id, t, res);
  const hasKeyAt = (id: string, prop: RigProp, time = t) => !!anim.tracks[id]?.[prop]?.some((k) => Math.abs(k.time - time) < 0.002);

  /** Write one property at the playhead. A first key past 0 also pins the start so nothing jumps. */
  const writeProp = (a: RigAnimation, id: string, prop: RigProp, value: number, time: number): RigAnimation => {
    let next = a;
    const frames = a.tracks[id]?.[prop];
    if (!frames?.length && time > 0.002) next = setKey(next, id, prop, 0, localPose(a, id, 0, res)[prop]);
    return setKey(next, id, prop, time, value);
  };
  const setProp = (id: string, prop: RigProp, value: number) => {
    if (readOnly || !Number.isFinite(value)) return;
    const { min, max } = ANIMATABLE[prop];
    commit((a) => writeProp(a, id, prop, Math.min(max, Math.max(min, value)), t));
  };
  const toggleKey = (id: string, prop: RigProp) => {
    if (readOnly) return;
    if (hasKeyAt(id, prop)) { commit((a) => removeKey(a, id, prop, anim.tracks[id]![prop]!.find((k) => Math.abs(k.time - t) < 0.002)!.time)); setSelKey(null); }
    else commit((a) => writeProp(a, id, prop, localPose(a, id, t, res)[prop], t));
  };
  const keyWholePose = () => {
    if (readOnly || !sel) return;
    commit((a) => { const p = localPose(a, sel, t, res); let next = a; for (const prop of RIG_PROPS) next = writeProp(next, sel, prop, p[prop], t); return next; });
  };

  // Dragging the selected object on the stage writes keys for what moved.
  const gesture = useMemo(() => ({ begin: pushHistory, update: () => {}, end: () => {} }), [pushHistory]);
  const onStageValues = (id: string, values: Record<string, number>) => {
    if (readOnly || !anim.parts.some((p) => p.clipId === id)) return;
    setAnims((list) => list.map((a) => {
      if (a.id !== activeId) return a;
      const w = { ...clipPoseAt(a, id, t, res), ...values };
      const l = localFromClip(a, id, t, w, res);
      let next = a;
      for (const prop of Object.keys(values) as RigProp[]) if ((RIG_PROPS as readonly string[]).includes(prop)) next = writeProp(next, id, prop, l[prop], t);
      return next;
    }));
    setApplied(false);
  };

  // ---- dope sheet: scrub and move keys -------------------------------------------------------
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault(); setPlaying(false);
    const move = (ev: PointerEvent) => setT(snapFrame(timeOf(ev.clientX)));
    move(e.nativeEvent);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const dragKey = (e: React.PointerEvent, id: string, prop: RigProp, time: number) => {
    e.stopPropagation(); e.preventDefault();
    setSel(id); setSelKey({ id, prop, time }); setT(time);
    if (readOnly) return;
    let at = time, moved = false;
    const move = (ev: PointerEvent) => {
      const to = Math.round(snapFrame(timeOf(ev.clientX)) * 1000) / 1000;
      if (Math.abs(to - at) < 0.0005) return;
      if (!moved) { pushHistory(); moved = true; }
      const from = at; at = to;
      setAnims((list) => list.map((a) => (a.id === activeId ? moveKey(a, id, prop, from, to) : a)));
      setSelKey({ id, prop, time: to }); setT(to); setApplied(false);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const deleteSelectedKey = () => { if (!selKey || readOnly) return; commit((a) => removeKey(a, selKey.id, selKey.prop, selKey.time)); setSelKey(null); };

  // ---- keyboard ------------------------------------------------------------------------------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (typing) return;
      if (e.key === "Escape") { onClose(); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setT((c) => Math.max(0, snapFrame(c - FRAME))); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); setT((c) => Math.min(anim.length, snapFrame(c + FRAME))); }
      else if (e.key.toLowerCase() === "k") { e.preventDefault(); keyWholePose(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (selKey) { e.preventDefault(); deleteSelectedKey(); } }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });
  useEffect(() => { root.current?.focus(); }, []);

  // ---- animation management ------------------------------------------------------------------
  const uniqueName = (base: string) => { let n = 1, name = base; while (anims.some((a) => a.name === name)) name = `${base} ${++n}`; return name; };
  const newAnim = () => { const a = newAnimation(uid(), uniqueName("Animation"), props.playhead, 2); setAnims((l) => [...l, a]); setActiveId(a.id); setSel(null); setT(0); setPast([]); setFuture([]); };
  const duplicate = () => { const a: RigAnimation = { ...structuredClone(anim), id: uid(), name: uniqueName(`${anim.name} copy`) }; setAnims((l) => [...l, a]); setActiveId(a.id); };
  const deleteAnim = () => {
    if (anims.length === 1) { setAnims([newAnimation(uid(), "Animation 1", props.playhead, 2)]); setActiveId(""); setSel(null); return; }
    const rest = anims.filter((a) => a.id !== anim.id); setAnims(rest); setActiveId(rest[0].id); setSel(null);
  };
  useEffect(() => { if (!anims.some((a) => a.id === activeId)) setActiveId(anims[0].id); }, [anims, activeId]);
  const rename = (name: string) => commit((a) => ({ ...a, name: name.slice(0, 60) }), { history: false });
  const nameClash = anims.some((a) => a.id !== anim.id && a.name.trim() === anim.name.trim());

  const apply = () => {
    if (!anim.parts.length) return onError("Add some clips to the rig first");
    if (missing.length) return onError(`${missing.length} part${missing.length === 1 ? " is" : "s are"} no longer on the timeline. Remove ${missing.length === 1 ? "it" : "them"} first.`);
    onApply(anim); setApplied(true);
  };
  const clearFromEdit = () => { onApply({ ...anim, tracks: {} }); onNote("Cleared the rig's keyframes from those clips"); };
  const preset = (id: RigPresetId, all: boolean) => {
    const ids = all ? anim.parts.map((p) => p.clipId) : sel ? [sel] : [];
    if (!ids.length) return onNote(all ? "Add clips first" : "Select a part first, or choose Apply to all parts");
    commit((a) => applyPreset(a, id, ids, res));
  };

  // ---- rendering ----------------------------------------------------------------------------
  const rulerMarks = useMemo(() => {
    const step = pps >= 160 ? 0.25 : pps >= 70 ? 0.5 : pps >= 40 ? 1 : 2;
    const out: number[] = []; for (let s = 0; s <= anim.length + 1e-6; s += step) out.push(Math.round(s * 1000) / 1000); return out;
  }, [pps, anim.length]);
  const keyOnSelected = selKey && anim.tracks[selKey.id]?.[selKey.prop]?.find((k) => Math.abs(k.time - selKey.time) < 0.002);
  const toggleRow = (id: string) => setOpenRows((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const trackWidth = PAD * 2 + anim.length * pps;

  const diamond = (id: string, prop: RigProp, time: number, easing?: Easing, small = false) => {
    const on = selKey?.id === id && selKey.prop === prop && Math.abs(selKey.time - time) < 0.002;
    return <button key={`${prop}-${time}`} className={`an-key${on ? " on" : ""}${small ? " small" : ""}${easing === "hold" ? " hold" : ""}`} style={{ left: xOf(time) }}
      onPointerDown={(e) => dragKey(e, id, prop, time)} aria-label={`${PROP_LABEL[prop]} key at ${fmt(time)}`} title={`${PROP_LABEL[prop]} · ${fmt(time)}${easing ? ` · ${typeof easing === "string" ? easing : "custom"}` : ""}`} />;
  };

  const emptyRig = anim.parts.length === 0;

  return (
    <div className="an-root" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Animator" data-testid="animator">
      <header className="an-top">
        <div className="an-brand"><Clapperboard size={17} /><b>Animator</b></div>
        <label className="an-field an-name"><span className="sr-only">Animation</span>
          <select aria-label="Choose animation" value={anim.id} onChange={(e) => { setActiveId(e.target.value); setSel(null); setT(0); setPast([]); setFuture([]); setPlaying(false); }} data-testid="an-select">
            {anims.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <input className="an-rename" aria-label="Animation name" value={anim.name} onChange={(e) => rename(e.target.value)} disabled={readOnly} data-testid="an-name" aria-invalid={nameClash} title={nameClash ? "Another animation already has this name" : "Blocks find animations by this name"} />
        <button className="an-btn" onClick={newAnim} disabled={readOnly} title="New animation"><Plus size={14} />New</button>
        <button className="an-btn" onClick={duplicate} disabled={readOnly} title="Duplicate this animation"><Copy size={14} /></button>
        <button className="an-btn" onClick={deleteAnim} disabled={readOnly} title="Delete this animation"><Trash2 size={14} /></button>
        <span className="an-sep" />
        <label className="an-num">Length <input type="number" min={0.2} max={60} step={0.1} value={num(anim.length, 2)} disabled={readOnly} data-testid="an-length"
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0.2) commit((a) => trimToLength(a, v)); }} /><em>s</em></label>
        <label className="an-num">Starts at <input type="number" min={0} step={0.1} value={num(anim.start, 2)} disabled={readOnly} data-testid="an-start"
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) commit((a) => ({ ...a, start: v })); }} /><em>s</em></label>
        <button className="an-btn" onClick={() => commit((a) => ({ ...a, start: Math.round(props.playhead * 100) / 100 }))} disabled={readOnly} title="Start the animation where the editor playhead is">At playhead</button>
        <label className="an-check"><input type="checkbox" checked={anim.loop} onChange={(e) => commit((a) => ({ ...a, loop: e.target.checked }), { history: false })} /> Loop preview</label>
        <span className="an-spacer" />
        <button className="an-icon" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
        <button className="an-icon" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /></button>
        <button className="an-btn an-apply" onClick={apply} disabled={readOnly || emptyRig} data-testid="an-apply" title="Bake this animation into your edit as keyframes, one undoable step">{applied ? <Check size={15} /> : <Play size={14} />}{applied ? "Applied" : "Apply to edit"}</button>
        <button className="an-icon" onClick={onClose} aria-label="Close Animator" title="Close (Esc)" data-testid="an-close"><X size={17} /></button>
      </header>

      <div className="an-main">
        <aside className="an-explorer" aria-label="Rig explorer">
          <div className="an-pane-head"><b>Rig</b><span>{anim.parts.length} part{anim.parts.length === 1 ? "" : "s"}</span></div>
          <div className="an-adds">
            <button className="an-btn" onClick={addSelected} disabled={readOnly || !props.initialSelection.length} title="Add the clips you had selected in the editor" data-testid="an-add-selected"><Plus size={14} />Selected clips</button>
            <button className="an-btn" onClick={addOnScreen} disabled={readOnly} title="Add every clip that is on screen during this animation" data-testid="an-add-all">On screen</button>
            <button className="an-btn" onClick={makeStickFigure} disabled={readOnly} title="Create a ready-made figure on the timeline and rig it" data-testid="an-stick"><UserRound size={14} />Stick figure</button>
          </div>
          <div className="an-tree" role="tree" onDragOver={(e) => { e.preventDefault(); setDragOver("__root"); }} onDragLeave={() => setDragOver(null)}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/an-part"); if (id) commit((a) => setParent(a, id, undefined)); }}>
            {emptyRig ? <div className="an-empty">
              <Sparkles size={22} />
              <b>Turn clips into a rig</b>
              <p>Every video clip, image, text and shape can be a part. Select clips in the editor and press <b>Selected clips</b>, or start from the <b>Stick figure</b>.</p>
              <p>Drag a part onto another to make it a child. When the parent moves, the child comes along.</p>
            </div> : tree.map(({ part, depth }) => {
              const Icon = KIND_ICON[part.kind], gone = !clipOf(part.clipId), has = keyTimes(anim, part.clipId).length > 0;
              return <div key={part.clipId} role="treeitem" aria-selected={sel === part.clipId} tabIndex={0} draggable={!readOnly} data-testid={`an-part-${part.clipId}`}
                className={`an-part${sel === part.clipId ? " on" : ""}${dragOver === part.clipId ? " drop" : ""}${gone ? " gone" : ""}`} style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => setSel(part.clipId)} onKeyDown={(e) => { if (e.key === "Enter") setSel(part.clipId); }}
                onDragStart={(e) => { e.dataTransfer.setData("text/an-part", part.clipId); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(part.clipId); }} onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(null); const id = e.dataTransfer.getData("text/an-part"); if (id && id !== part.clipId) commit((a) => setParent(a, id, part.clipId)); }}>
                {depth > 0 && <span className="an-elbow" aria-hidden="true" />}
                <Icon size={13} /><span className="an-part-name">{part.name}</span>
                {gone && <em title="This clip is no longer on the timeline">missing</em>}
                {has && <Diamond size={9} className="an-has-key" aria-label="has keyframes" />}
              </div>;
            })}
          </div>
          {!emptyRig && <p className="an-tip">Drag a part onto another to parent it, or into the empty space to unparent.</p>}
        </aside>

        <section className="an-stage" aria-label="Stage">
          <div className="an-stage-bar"><span>{anim.name}</span><span className="an-hint">{emptyRig ? "Add clips to begin" : sel ? "Drag the highlighted object to pose it. It keys at the playhead." : "Pick a part to pose it"}</span></div>
          <div className="an-stage-view">
            <ForgePreview timeline={previewTimeline} assets={assets} time={stageTime} playing={playing} selectedId={sel} readOnly={readOnly} gesture={gesture} mediaUrl={mediaUrl} muted
              onError={onError} onValues={(id, v) => onStageValues(id, v)} onSelect={(id) => { if (id && anim.parts.some((p) => p.clipId === id)) setSel(id); }} />
          </div>
          <div className="an-transport">
            <button className="an-icon" onClick={() => { setPlaying(false); setT(0); }} aria-label="Back to start"><SkipBack size={16} /></button>
            <button className="an-play" onClick={() => { if (!playing && t >= anim.length - 0.001) setT(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"} data-testid="an-play">{playing ? <Pause size={17} /> : <Play size={17} />}</button>
            <span className="an-time" data-testid="an-time">{fmt(t)} <i>/ {fmt(anim.length)}</i></span>
            <span className="an-spacer" />
            <label className="an-select-inline"><Sparkles size={14} /><select aria-label="Preset" value="" data-testid="an-preset" disabled={readOnly || emptyRig}
              onChange={(e) => { const v = e.target.value; if (!v) return; const [mode, id] = v.split(":"); preset(id as RigPresetId, mode === "all"); }}>
              <option value="">Presets…</option>
              <optgroup label="Selected part">{RIG_PRESETS.map((p) => <option key={p.id} value={`one:${p.id}`}>{p.label}</option>)}</optgroup>
              <optgroup label="All parts">{RIG_PRESETS.map((p) => <option key={p.id} value={`all:${p.id}`}>{p.label}</option>)}</optgroup>
            </select></label>
            <button className="an-btn" onClick={keyWholePose} disabled={readOnly || !sel} title="Key the selected part's whole pose at the playhead (K)" data-testid="an-key-pose"><Diamond size={13} />Key pose</button>
            <button className="an-btn" onClick={clearFromEdit} disabled={readOnly || emptyRig} title="Remove this rig's keyframes from the clips in your edit"><CircleOff size={13} />Clear from edit</button>
          </div>
        </section>

        <aside className="an-props" aria-label="Part properties">
          {!selPart ? <div className="an-empty small"><p>Select a part to see its pose, joint and parent.</p></div> : <>
            <div className="an-pane-head"><b>{selPart.name}</b><button className="an-icon sm" disabled={readOnly} aria-label="Remove from rig" title="Remove from rig" onClick={() => { commit((a) => removePart(a, selPart.clipId)); setSel(null); }}><Trash2 size={13} /></button></div>
            <div className="an-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "pose"} className={tab === "pose" ? "on" : ""} onClick={() => setTab("pose")}>Pose</button>
              <button role="tab" aria-selected={tab === "joint"} className={tab === "joint" ? "on" : ""} onClick={() => setTab("joint")}>Joint &amp; parent</button>
            </div>
            {tab === "pose" ? <div className="an-pose">
              <p className="an-note">Values at {fmt(t)}, relative to the joint{selPart.parentId ? " and parent" : ""}. Change one to key it.</p>
              {RIG_PROPS.map((prop) => {
                const v = local(selPart.clipId)[prop], keyed = hasKeyAt(selPart.clipId, prop), has = !!anim.tracks[selPart.clipId]?.[prop]?.length;
                const def = ANIMATABLE[prop];
                return <div className="an-prop" key={prop}>
                  <label htmlFor={`an-p-${prop}`}>{PROP_LABEL[prop]}</label>
                  <input id={`an-p-${prop}`} type="number" step={def.step} min={def.min} max={def.max} value={num(v, prop === "rotation" ? 1 : 3)} disabled={readOnly} data-testid={`an-pose-${prop}`}
                    onChange={(e) => setProp(selPart.clipId, prop, Number(e.target.value))} />
                  <button className={`an-keybtn${keyed ? " on" : ""}${has && !keyed ? " has" : ""}`} onClick={() => toggleKey(selPart.clipId, prop)} disabled={readOnly} aria-pressed={keyed} aria-label={`${keyed ? "Remove" : "Add"} ${PROP_LABEL[prop]} key at playhead`} title={keyed ? "Remove key" : "Key at playhead"}><Diamond size={12} /></button>
                </div>;
              })}
              {keyOnSelected && selKey && <div className="an-keybox">
                <div className="an-pane-head"><b>Key · {PROP_LABEL[selKey.prop]}</b><span>{fmt(selKey.time)} → {num(keyOnSelected.value)}</span></div>
                <label className="an-prop"><span>Easing</span>
                  <select value={typeof keyOnSelected.easing === "string" ? keyOnSelected.easing : "linear"} disabled={readOnly} data-testid="an-easing"
                    onChange={(e) => commit((a) => setKeyEasing(a, selKey.id, selKey.prop, selKey.time, e.target.value === "linear" ? undefined : (e.target.value as Easing)))}>
                    {EASING_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select></label>
                <button className="an-btn" onClick={deleteSelectedKey} disabled={readOnly} data-testid="an-key-delete"><Scissors size={13} />Delete key</button>
              </div>}
            </div> : <div className="an-joint">
              <label className="an-prop"><span>Parent</span>
                <select value={selPart.parentId ?? ""} disabled={readOnly} data-testid="an-parent"
                  onChange={(e) => commit((a) => setParent(a, selPart.clipId, e.target.value || undefined))}>
                  <option value="">None (root)</option>
                  {anim.parts.filter((p) => p.clipId !== selPart.clipId && !wouldCycle(anim, selPart.clipId, p.clipId)).map((p) => <option key={p.clipId} value={p.clipId}>{p.name}</option>)}
                </select></label>
              <p className="an-note">The joint is the point a part turns and scales about. Children swing around their parent’s joint.</p>
              {(["pivotX", "pivotY"] as const).map((k) => <label className="an-prop wide" key={k}><span>{k === "pivotX" ? "Joint left / right" : "Joint up / down"}</span>
                <input type="range" min={-0.5} max={0.5} step={0.005} value={selPart[k]} disabled={readOnly} data-testid={`an-${k}`}
                  onChange={(e) => commit((a) => { const p = a.parts.find((x) => x.clipId === selPart.clipId) as RigPart; return setPivot(a, p.clipId, k === "pivotX" ? Number(e.target.value) : p.pivotX, k === "pivotY" ? Number(e.target.value) : p.pivotY); })} />
                <output>{num(selPart[k] * 100, 1)}%</output></label>)}
              <button className="an-btn" disabled={readOnly || (!selPart.pivotX && !selPart.pivotY)} onClick={() => commit((a) => setPivot(a, selPart.clipId, 0, 0))}>Joint to centre</button>
            </div>}
          </>}
        </aside>
      </div>

      <section className="an-sheet" aria-label="Timeline">
        <div className="an-sheet-head">
          <b>Keyframes</b>
          <button className="an-btn sm" onClick={() => setOpenRows(openRows.size ? new Set() : new Set(anim.parts.map((p) => p.clipId)))}>{openRows.size ? "Collapse rows" : "Expand rows"}</button>
          <span className="an-spacer" />
          <label className="an-zoom">Zoom <input type="range" min={1} max={8} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom" /></label>
        </div>
        <div className="an-sheet-body" ref={sheet}>
          <div className="an-names">
            <div className="an-ruler-spacer" />
            {tree.map(({ part, depth }) => <div key={part.clipId} className="an-name-group">
              <div className={`an-name-row${sel === part.clipId ? " on" : ""}`} style={{ paddingLeft: 6 + depth * 12 }} onClick={() => setSel(part.clipId)}>
                <button className="an-caret" aria-expanded={openRows.has(part.clipId)} aria-label={`${openRows.has(part.clipId) ? "Collapse" : "Expand"} ${part.name}`} onClick={(e) => { e.stopPropagation(); toggleRow(part.clipId); }}><ChevronRight size={13} className={openRows.has(part.clipId) ? "down" : ""} /></button>
                <span>{part.name}</span>
              </div>
              {openRows.has(part.clipId) && RIG_PROPS.map((prop) => <div key={prop} className="an-name-row sub" style={{ paddingLeft: 26 + depth * 12 }}>{PROP_LABEL[prop]}</div>)}
            </div>)}
          </div>
          <div className="an-lane" ref={lane}>
            <div className="an-track" style={{ width: trackWidth }}>
              <div className="an-ruler" onPointerDown={scrub} data-testid="an-ruler">
                {rulerMarks.map((s) => <span key={s} style={{ left: xOf(s) }}><i />{s.toFixed(s % 1 ? 2 : 0)}s</span>)}
              </div>
              {tree.map(({ part }) => <div key={part.clipId} className="an-lane-group">
                <div className={`an-lane-row${sel === part.clipId ? " on" : ""}`} onPointerDown={(e) => { if ((e.target as HTMLElement).closest(".an-key")) return; setSel(part.clipId); scrub(e); }}>
                  {RIG_PROPS.flatMap((prop) => (anim.tracks[part.clipId]?.[prop] ?? []).map((k) => ({ ...k, prop }))).filter((k, i, all) => all.findIndex((o) => Math.abs(o.time - k.time) < 0.0005) === i)
                    .map((k) => <button key={k.time} className="an-key summary" style={{ left: xOf(k.time) }} aria-label={`Keys at ${fmt(k.time)}`}
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setSel(part.clipId); setT(k.time); setSelKey(null); }} title={`All keys at ${fmt(k.time)}`} />)}
                </div>
                {openRows.has(part.clipId) && RIG_PROPS.map((prop) => <div key={prop} className="an-lane-row sub" onPointerDown={(e) => { if ((e.target as HTMLElement).closest(".an-key")) return; setSel(part.clipId); scrub(e); }}
                  onDoubleClick={(e) => { if (readOnly) return; const at = Math.round(snapFrame(timeOf(e.clientX)) * 1000) / 1000; commit((a) => writeProp(a, part.clipId, prop, localPose(a, part.clipId, at, res)[prop], at)); }}>
                  {(anim.tracks[part.clipId]?.[prop] ?? []).map((k) => diamond(part.clipId, prop, k.time, k.easing, true))}
                </div>)}
              </div>)}
              {emptyRig && <div className="an-lane-empty">Keyframes appear here. Double-click a property row to add one.</div>}
              <div className="an-playhead" style={{ left: xOf(t) }}><span /></div>
            </div>
          </div>
        </div>
        <footer className="an-foot"><span><kbd>Space</kbd> play</span><span><kbd>K</kbd> key pose</span><span><kbd>←</kbd><kbd>→</kbd> step a frame</span><span><kbd>Del</kbd> delete key</span><span>Double-click a property row to add a key</span></footer>
      </section>
    </div>
  );
}
