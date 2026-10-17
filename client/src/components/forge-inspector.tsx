import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Scissors, Copy, Trash2, Globe, Lock, Link2, Film, Diamond, FlipHorizontal2, FlipVertical2, Flag, RotateCcw, Search, X } from "lucide-react";
import { ANIMATABLE, valueAt, clamp, type AnimationProperty } from "@shared/animation";
import { FILTERS, RESOLUTIONS, clipDuration, type Clip, type Timeline } from "@shared/timeline";
import { round, timecode, type AssetDTO } from "@/lib/editor-model";
import type { TimelineGesture } from "@/components/forge-timeline";
import { TRANSITIONS, TRANSITION_LABELS, type Transition } from "@shared/transitions";
import ForgeMotion from "@/components/forge-motion";
import { fitClip } from "@shared/layout";
import { FONT_CATALOG, getFont } from "@shared/fonts";

type Gesture = TimelineGesture;
function Slider({ label, value, min, max, step, format, onGesture, onChange, disabled, keyframe }: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onGesture: Gesture; onChange: (v: number) => void; disabled?: boolean; keyframe?: ReactNode }) {
  const [active, setActive] = useState(false);
  return <div className="slider-field"><span><em>{label}</em>{keyframe}<b className="mono">{format ? format(value) : value}</b></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
      onPointerDown={() => { setActive(true); onGesture.begin(); }} onPointerUp={() => { setActive(false); onGesture.end(); }}
      onChange={(e) => { const v = Number(e.target.value); if (active) onChange(v); else { onGesture.begin(); onChange(v); onGesture.end(); } }} /></div>;
}
function NumberField({ label, value, min, max, step = 0.1, suffix = "s", disabled, onCommit }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => { const n = Number(draft); if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n))); else setDraft(String(round(value))); };
  return <label className="number-field"><span>{label}</span><div><input type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /><small>{suffix}</small></div></label>;
}
const InspectorMode = createContext<{ advanced: boolean }>({ advanced: true });

/** Wraps an inspector: adds a search box that narrows the sections to those mentioning the query, and the Simple or Advanced switch for rarely used sections. */
export function InspectorShell({ advanced, children }: { advanced: boolean; children: ReactNode }) {
  const [q, setQ] = useState("");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = body.current; if (!root) return;
    const needle = q.trim().toLowerCase();
    root.querySelectorAll<HTMLDetailsElement>("details.insp-section").forEach((d) => {
      const hit = !needle || (d.textContent ?? "").toLowerCase().includes(needle) || Array.from(d.querySelectorAll("input,textarea,select")).some((i) => (i as HTMLInputElement).getAttribute("aria-label")?.toLowerCase().includes(needle));
      d.hidden = !hit;
      if (needle && hit) d.open = true;
    });
    const any = !needle || Array.from(root.querySelectorAll("details.insp-section")).some((d) => !(d as HTMLElement).hidden);
    root.dataset.empty = any ? "false" : "true";
  });
  return (
    <InspectorMode.Provider value={{ advanced }}>
      <div className="insp-search"><Search size={14} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search inspector settings" data-testid="inspector-search" />{q && <button className="icon-btn" aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}</div>
      <div className="insp-body" ref={body}>{children}<p className="insp-nomatch">No setting matches that search.</p></div>
    </InspectorMode.Provider>
  );
}

function Section({ title, children, open = true, advanced = false }: { title: string; children: ReactNode; open?: boolean; advanced?: boolean }) {
  const mode = useContext(InspectorMode);
  if (advanced && !mode.advanced) return null;
  return <details className="insp-section" open={open}><summary>{title}</summary><div className="insp-content">{children}</div></details>;
}

export type ClipInspectorProps = { canvas: { width: number; height: number }; transition?: Transition; onTransition?: (type: string, duration?: number) => void; clip: Clip; asset?: AssetDTO; readOnly: boolean; gesture: Gesture; time: number; fps: number; patch: (p: Partial<Clip>, live?: boolean) => void; setValues: (v: Partial<Record<AnimationProperty, number>>, live?: boolean) => void; toggleKey: (p: AnimationProperty) => void; seek: (t: number) => void; onSplit: () => void; onDuplicate: () => void; onDelete: () => void };
export function ClipInspector({ canvas, clip, asset, readOnly, gesture, time, fps, patch, setValues, toggleKey, seek, onSplit, onDuplicate, onDelete, transition, onTransition }: ClipInspectorProps) {
  const [tab, setTab] = useState<"edit" | "motion">("edit");
  const [textDraft, setTextDraft] = useState(clip.text ?? "");
  useEffect(() => setTextDraft(clip.text ?? ""), [clip.id]);
  const isText = !clip.assetId && !clip.shape, audioOnly = clip.track === "audio";
  const hasAudio = !!clip.assetId && asset?.kind !== "image" && (asset?.kind === "audio" || (asset as any)?.hasAudio !== false);
  const visual = !audioOnly, media = !!clip.assetId && asset?.kind !== "image", ps = (p: Partial<Clip>) => patch(p, true);
  const dur = clipDuration(clip), local = clamp(time - clip.start, 0, dur);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const anim = (prop: AnimationProperty, label: string, format: (v: number) => string, min = ANIMATABLE[prop].min, max = ANIMATABLE[prop].max, disabled = false) => {
    const frames = clip.keyframes?.[prop] ?? [], atKey = frames.some((k) => Math.abs(k.time - local) < 0.5 / fps);
    return <Slider key={prop} label={label} value={valueAt(clip, prop, local)} min={min} max={max} step={ANIMATABLE[prop].step} format={format} onGesture={gesture} onChange={(v) => setValues({ [prop]: v }, true)} disabled={readOnly || disabled}
      keyframe={<button type="button" className={`key-btn ${frames.length ? "animated" : ""} ${atKey ? "at-key" : ""}`} disabled={readOnly} aria-label={`${atKey ? "Remove" : "Add"} ${label} keyframe at playhead`} aria-pressed={atKey} title={atKey ? "Remove keyframe" : "Keyframe at playhead"} onClick={() => toggleKey(prop)} data-testid={`key-${prop}`}><Diamond size={11} /></button>} />;
  };
  return <div className="inspector-body" data-testid="clip-inspector">
    <div className="inspector-title"><div className="thumb-chip">{isText ? "T" : <Film size={15} />}</div><div><b title={clip.label ?? asset?.filename}>{clip.shape ? clip.label ?? `${clip.shape.type} shape` : isText ? "Title" : asset?.filename ?? "Missing media"}</b><span className="muted mono">{timecode(dur)} · {clip.track}</span></div></div>
    <div className="action-row"><button className="secondary-btn" disabled={readOnly} onClick={onSplit} data-testid="button-split"><Scissors size={15} />Split</button><button className="secondary-btn" disabled={readOnly} onClick={onDuplicate}><Copy size={15} />Duplicate</button><button className="icon-btn danger" disabled={readOnly} aria-label="Delete clip" title="Delete (Del)" onClick={onDelete} data-testid="button-delete-clip"><Trash2 size={16} /></button></div>
    <div className="inspector-tabs" role="tablist"><button role="tab" aria-selected={tab === "edit"} className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")} data-testid="tab-edit">Edit</button><button role="tab" aria-selected={tab === "motion"} className={tab === "motion" ? "active" : ""} onClick={() => setTab("motion")} data-testid="tab-motion">Motion{Object.keys(clip.keyframes ?? {}).length ? <i className="tab-dot" /> : null}</button></div>
    {tab === "motion" ? <ForgeMotion clip={clip} time={time} fps={fps} audioOnly={audioOnly} readOnly={readOnly} patch={patch} seek={seek} gesture={gesture} /> : <>
      {clip.shape && <Section title="Shape">
        <label className="field">Primitive<select aria-label="Shape type" disabled={readOnly} value={clip.shape.type} onChange={e=>patch({shape:{...clip.shape!,type:e.target.value as "rectangle"|"ellipse"|"line"}})}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option></select></label>
        <Slider label="Shape width" value={clip.shape.width} min={.01} max={1} step={.01} format={pct} onGesture={gesture} onChange={v=>ps({shape:{...clip.shape!,width:v}})} disabled={readOnly}/>
        <Slider label="Shape height" value={clip.shape.height} min={.002} max={1} step={.002} format={pct} onGesture={gesture} onChange={v=>ps({shape:{...clip.shape!,height:v}})} disabled={readOnly}/>
        <div className="inline-fields">{(["fill","stroke"] as const).map(k=><label className="color-field" key={k}>{k}<input type="color" aria-label={`Shape ${k}`} disabled={readOnly} value={clip.shape![k]==="transparent"?"#ffffff":clip.shape![k]} onChange={e=>patch({shape:{...clip.shape!,[k]:e.target.value}})}/></label>)}</div>
        <label className="check-field"><input type="checkbox" disabled={readOnly} checked={clip.shape.fill==="transparent"} onChange={e=>patch({shape:{...clip.shape!,fill:e.target.checked?"transparent":"#f6a447"}})}/>Transparent fill</label>
        <Slider label="Stroke width" value={clip.shape.strokeWidth} min={0} max={40} step={1} onGesture={gesture} onChange={v=>ps({shape:{...clip.shape!,strokeWidth:v}})} disabled={readOnly}/>
        <Slider label="Corner radius" value={clip.shape.radius} min={0} max={200} step={1} onGesture={gesture} onChange={v=>ps({shape:{...clip.shape!,radius:v}})} disabled={readOnly}/>
      </Section>}
      {isText && <Section title="Text"><textarea rows={3} value={textDraft} disabled={readOnly} aria-label="Title text" maxLength={500} placeholder="Type your title" onChange={(e) => { setTextDraft(e.target.value); if (e.target.value.trim()) patch({ text: e.target.value }, true); }} onFocus={gesture.begin} onBlur={gesture.end} data-testid="input-title-text" />
        <Slider label="Size" value={clip.textSize ?? 6} min={2} max={20} step={0.5} format={(v) => `${v}%`} onGesture={gesture} onChange={(v) => ps({ textSize: v })} disabled={readOnly} />
        <div className="inline-fields"><label className="color-field">Color<input type="color" aria-label="Text color" disabled={readOnly} value={clip.textColor ?? "#ffffff"} onChange={(e) => patch({ textColor: e.target.value })} /></label><label className="check-field"><input type="checkbox" disabled={readOnly} checked={!!clip.textBg} onChange={(e) => patch({ textBg: e.target.checked })} />Background box</label></div></Section>}
      {isText && <Section title="Typography"><div className="field"><label className="field-label">Font</label>
        <select aria-label="Font" disabled={readOnly} value={clip.font ?? "noto-sans"} onChange={(e) => { const id = e.target.value; const f = getFont(id); patch({ font: id, fontWeight: f.weights.includes(clip.fontWeight ?? 700) ? clip.fontWeight : undefined }); }}>
          {["Sans", "Serif", "Display", "Handwriting", "Mono"].map((cat) => <optgroup key={cat} label={cat}>{FONT_CATALOG.filter((f) => f.category === cat).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}
        </select></div>
        {getFont(clip.font).weights.length > 1 && <div className="chip-grid" role="radiogroup" aria-label="Font weight">
          {getFont(clip.font).weights.map((w) => <button key={w} role="radio" aria-checked={(clip.fontWeight ?? 400) === w} className={(clip.fontWeight ?? 400) === w ? "selected chip" : "chip"} disabled={readOnly} onClick={() => ps({ fontWeight: w === 400 ? undefined : (w as 400 | 700) })} style={{ fontWeight: w }}>{w === 400 ? "Regular" : "Bold"}</button>)}
        </div>}
        <div className="chip-grid" role="radiogroup" aria-label="Text alignment">
          {[["left", "Align left"], ["center", "Align centre"], ["right", "Align right"]].map(([a, label]) => <button key={a} role="radio" aria-checked={(clip.textAlign ?? "center") === a} className={(clip.textAlign ?? "center") === a ? "selected chip" : "chip"} disabled={readOnly} onClick={() => ps({ textAlign: a === "center" ? undefined : (a as "left" | "right") })}>{label}</button>)}
        </div>
        <Slider label="Line height" value={clip.lineHeight ?? 1.4} min={1} max={2} step={0.05} format={(v) => v.toFixed(2)} onGesture={gesture} onChange={(v) => ps({ lineHeight: v })} disabled={readOnly} />
        <Slider label="Letter spacing" value={clip.letterSpacing ?? 0} min={-0.05} max={0.25} step={0.01} format={(v) => `${v.toFixed(2)}em`} onGesture={gesture} onChange={(v) => ps({ letterSpacing: v === 0 ? undefined : v })} disabled={readOnly} />
        <label className="check-field"><input type="checkbox" disabled={readOnly} checked={clip.textTransform === "uppercase"} onChange={(e) => patch({ textTransform: e.target.checked ? "uppercase" : undefined })} />UPPERCASE</label>
        <p className="help-text">The font catalog is shared by the preview and the FFmpeg renderer; the server downloads each font on first render.</p></Section>}
      <Section title="Timing"><div className="two-col"><NumberField label="Start" value={clip.start} min={0} max={86400} disabled={readOnly} onCommit={(v) => patch({ start: v })} />
        {media ? <NumberField label="Speed" value={clip.speed ?? 1} min={0.25} max={4} step={0.25} suffix="×" disabled={readOnly} onCommit={(v) => patch({ speed: v })} /> : <NumberField label="Duration" value={dur} min={0.1} max={3600} disabled={readOnly} onCommit={(v) => patch({ outPoint: clip.inPoint + v })} />}</div>
        {media && <div className="two-col"><NumberField label="In" value={clip.inPoint} min={0} max={Math.max(0, (asset?.duration ?? 86400) - 0.1)} disabled={readOnly} onCommit={(v) => patch({ inPoint: v })} /><NumberField label="Out" value={clip.outPoint} min={0.1} max={asset?.duration || 86400} disabled={readOnly} onCommit={(v) => patch({ outPoint: v })} /></div>}</Section>
      {clip.track === "video" && !isText && onTransition && <Section title="Transition in" advanced>
        <div className="chip-grid" role="radiogroup" aria-label="Transition">{["none", ...TRANSITIONS].map((t) => <button key={t} role="radio" aria-checked={(transition?.type ?? "none") === t} className={(transition?.type ?? "none") === t ? "selected chip" : "chip"} disabled={readOnly} onClick={() => onTransition(t, transition?.duration)} data-testid={`transition-${t}`}>{TRANSITION_LABELS[t]}</button>)}</div>
        {transition && <NumberField label="Length" value={transition.duration} min={0.1} max={3} disabled={readOnly} onCommit={(v) => onTransition(transition.type, v)} />}
        <p className="help-text">Overlaps this clip with the one before it. Later clips move up to close the gap.</p></Section>}
      {visual && <Section title="Transform">
        {anim("x", "Horizontal", pct)}{anim("y", "Vertical", pct)}{anim("scale", "Scale", pct)}{anim("rotation", "Rotation", (v) => `${Math.round(v)}°`)}{anim("opacity", "Opacity", pct)}
        <Slider label="Blur" value={clip.blur ?? 0} min={0} max={20} step={0.5} format={(v) => `${v}px`} onGesture={gesture} onChange={(v) => ps({ blur: v })} disabled={readOnly} />
        <div className="toggle-row"><button className={`chip ${clip.flipX ? "selected" : ""}`} aria-pressed={!!clip.flipX} disabled={readOnly} onClick={() => patch({ flipX: !clip.flipX })}><FlipHorizontal2 size={14} />Flip</button><button className={`chip ${clip.flipY ? "selected" : ""}`} aria-pressed={!!clip.flipY} disabled={readOnly} onClick={() => patch({ flipY: !clip.flipY })}><FlipVertical2 size={14} />Flip</button>
          <button className="chip" disabled={readOnly} onClick={() => patch({ x: undefined, y: undefined, scale: undefined, rotation: undefined, flipX: false, flipY: false, blur: 0, fit: "contain", textFit: undefined, textMaxWidth: undefined, textMaxHeight: undefined })} title="Reset transform"><RotateCcw size={13} />Reset</button></div></Section>}
      {visual && <Section title="Fit to frame" advanced>
        <div className="chip-grid" data-testid="fit-controls">
          <button className="chip" disabled={readOnly} onClick={() => patch(fitClip(clip, canvas, { width: asset?.width, height: asset?.height }, "safe"))} title="Scale and nudge this layer until it sits inside the frame" data-testid="fit-safe">Fit inside frame</button>
          {media && clip.track === "video" && (["contain", "cover", "fill"] as const).map((m) => <button key={m} className={`chip ${(clip.fit ?? "contain") === m ? "selected" : ""}`} aria-pressed={(clip.fit ?? "contain") === m} disabled={readOnly} onClick={() => patch({ fit: m })} title={m === "contain" ? "Show everything, letterbox the rest" : m === "cover" ? "Fill the frame and crop the edges" : "Stretch to the frame, ignoring the aspect ratio"} data-testid={`fit-${m}`}>{m === "contain" ? "Contain" : m === "cover" ? "Cover" : "Stretch"}</button>)}
        </div>
        {isText && <><label className="check-field"><input type="checkbox" disabled={readOnly} checked={clip.textFit !== "none"} onChange={(e) => patch({ textFit: e.target.checked ? undefined : "none" })} data-testid="text-autofit" />Auto-fit text (wrap and shrink)</label>
          {clip.textFit !== "none" && <><Slider label="Max width" value={clip.textMaxWidth ?? 0.9} min={0.1} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onGesture={gesture} onChange={(v) => ps({ textMaxWidth: v })} disabled={readOnly} /><Slider label="Max height" value={clip.textMaxHeight ?? 0.5} min={0.05} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onGesture={gesture} onChange={(v) => ps({ textMaxHeight: v })} disabled={readOnly} /></>}</>}
        <p className="help-text">{isText ? "Long text wraps onto new lines and shrinks until it fits the box, so nothing runs off the frame." : "Fit inside frame scales this layer down and moves it in from the edges."}</p></Section>}
      {visual && !isText && <Section title="Color"><div className="chip-grid" role="radiogroup" aria-label="Filter">{FILTERS.map((f) => <button key={f} role="radio" aria-checked={(clip.filter ?? "none") === f} className={(clip.filter ?? "none") === f ? "selected" : ""} disabled={readOnly} onClick={() => patch({ filter: f })} data-testid={`filter-${f}`}>{f === "none" ? "Original" : f}</button>)}</div>
        {anim("brightness", "Brightness", (v) => (v > 0 ? "+" : "") + Math.round(v * 100))}{anim("contrast", "Contrast", pct)}{anim("saturation", "Saturation", pct)}</Section>}
      {hasAudio && <Section title="Audio">{anim("volume", "Volume", pct, 0, 1, clip.muted)}<label className="check-field"><input type="checkbox" checked={clip.muted} disabled={readOnly} onChange={(e) => patch({ muted: e.target.checked })} data-testid="input-muted" />Mute clip</label></Section>}
      <Section title="Fades" open={false} advanced><Slider label="Fade in" value={clip.fadeIn ?? 0} min={0} max={Math.min(10, dur)} step={0.1} format={(v) => `${v.toFixed(1)}s`} onGesture={gesture} onChange={(v) => ps({ fadeIn: v })} disabled={readOnly} /><Slider label="Fade out" value={clip.fadeOut ?? 0} min={0} max={Math.min(10, dur)} step={0.1} format={(v) => `${v.toFixed(1)}s`} onGesture={gesture} onChange={(v) => ps({ fadeOut: v })} disabled={readOnly} /></Section></>}
  </div>;
}

export function ProjectInspector({ name, onName, timeline, setProject, readOnly, canPublish, projectId, visibility, onVisibility, onCopyLink, seek, removeMarker, addMarker, fitIssues, onFitAll }: { fitIssues?: number; onFitAll?: () => void; name: string; onName: (n: string) => void; timeline: Timeline; setProject: (p: { fps?: number; resolution?: { width: number; height: number }; background?: string }) => void; readOnly: boolean; canPublish: boolean; projectId: string | null; visibility: "private" | "public"; onVisibility: () => void; onCopyLink: () => void; seek: (t: number) => void; removeMarker: (id: string) => void; addMarker: () => void }) {
  const current = `${timeline.resolution.width}x${timeline.resolution.height}`;
  const custom = !RESOLUTIONS.some((r) => `${r.width}x${r.height}` === current);
  return <div className="inspector-body" data-testid="project-inspector">
    <div className="inspector-title"><div className="thumb-chip"><Film size={15} /></div><div><b>Project settings</b><span className="muted">Select a clip to edit it</span></div></div>
    <Section title="Project"><label className="field compact">Name<input value={name} maxLength={200} disabled={readOnly} onChange={(e) => onName(e.target.value)} data-testid="input-project-name" /></label>
      <label className="field compact">Canvas<select value={current} disabled={readOnly} onChange={(e) => { const [width, height] = e.target.value.split("x").map(Number); setProject({ resolution: { width, height } }); }} data-testid="select-resolution">{custom && <option value={current}>{timeline.resolution.width}×{timeline.resolution.height} (custom)</option>}{RESOLUTIONS.map((r) => <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>)}</select></label>
      <div className="two-col"><label className="field compact">Frame rate<select value={timeline.fps} disabled={readOnly} onChange={(e) => setProject({ fps: Number(e.target.value) })}>{[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></label>
        <label className="field compact">Background<input type="color" className="color-input" aria-label="Background color" disabled={readOnly} value={timeline.background ?? "#000000"} onChange={(e) => setProject({ background: e.target.value })} data-testid="input-background" /></label></div></Section>
    {onFitAll && <Section title="Fit everything"><p className="help-text" data-testid="fit-status">{fitIssues ? `${fitIssues} layer${fitIssues === 1 ? "" : "s"} cross the frame or its safe margin.` : "Every layer sits inside the frame."}</p>
      <button className="secondary-btn full" disabled={readOnly || !fitIssues} onClick={onFitAll} data-testid="fit-all">Fit all layers</button></Section>}
    <Section title="Markers" open={!!timeline.markers?.length}>{timeline.markers?.length ? <ul className="marker-list">{timeline.markers.map((m) => <li key={m.id}><button onClick={() => seek(m.time)}><Flag size={12} style={{ color: m.color }} /><span>{m.label}</span><b className="mono">{timecode(m.time, timeline.fps)}</b></button><button className="icon-btn" aria-label={`Remove ${m.label}`} disabled={readOnly} onClick={() => removeMarker(m.id)}><Trash2 size={13} /></button></li>)}</ul> : <p className="help-text">Markers flag moments on the ruler and act as snap points.</p>}
      <button className="secondary-btn full" onClick={addMarker} disabled={readOnly}><Flag size={14} />Add at playhead</button></Section>
    <Section title="Sharing" open={visibility === "public"}><div className="share-card">{visibility === "public" ? <Globe size={18} /> : <Lock size={18} />}<div><b>{visibility === "public" ? "Public" : "Private"}</b><p className="muted">{visibility === "public" ? "Anyone with the link can watch your latest render." : "Only API keys with access can see this project."}</p></div></div>
      {!projectId && <p className="help-text">Save the project to manage sharing.</p>}
      {canPublish ? <button className="secondary-btn full" disabled={!projectId} onClick={onVisibility}>{visibility === "private" ? <><Globe size={15} />Make public</> : <><Lock size={15} />Make private</>}</button> : <p className="help-text">Only admin keys can change visibility.</p>}
      {visibility === "public" && <button className="secondary-btn full" onClick={onCopyLink}><Link2 size={15} />Copy public link</button>}</Section>
    <p className="help-text">Press <kbd>?</kbd> for every keyboard shortcut and <kbd>Ctrl</kbd> <kbd>K</kbd> to search commands.</p>
  </div>;
}

export function MultiInspector({ clips, readOnly, onPatch, onDuplicate, onDelete, onRippleDelete, onAlign, onTransitions, onClear }: { clips: Clip[]; readOnly: boolean; onPatch: (p: Partial<Clip>) => void; onDuplicate: () => void; onDelete: () => void; onRippleDelete: () => void; onAlign: (mode: "start" | "end" | "chain" | "distribute") => void; onTransitions: (type: string) => void; onClear: () => void }) {
  const visual = clips.filter((c) => c.track !== "audio"), videos = clips.filter((c) => c.track === "video");
  const [opacity, setOpacity] = useState(1), [volume, setVolume] = useState(1);
  return <div className="inspector-body" data-testid="multi-inspector">
    <div className="inspector-title"><div className="thumb-chip">{clips.length}</div><div><b>{clips.length} clips selected</b><span className="muted mono">Shift-click to add or remove</span></div></div>
    <div className="action-row"><button className="secondary-btn" disabled={readOnly} onClick={onDuplicate} data-testid="multi-duplicate"><Copy size={15} />Duplicate</button><button className="secondary-btn danger" disabled={readOnly} onClick={onDelete} data-testid="multi-delete"><Trash2 size={15} />Delete</button><button className="secondary-btn" onClick={onClear}>Clear</button></div>
    <Section title="Arrange">
      <div className="chip-grid"><button className="chip" disabled={readOnly} onClick={() => onAlign("start")}>Align starts</button><button className="chip" disabled={readOnly} onClick={() => onAlign("end")}>Align ends</button><button className="chip" disabled={readOnly} onClick={() => onAlign("chain")} data-testid="multi-chain">Join end to end</button><button className="chip" disabled={readOnly} onClick={() => onAlign("distribute")}>Space evenly</button><button className="chip" disabled={readOnly} onClick={onRippleDelete}>Delete and close gaps</button></div></Section>
    {videos.length > 1 && <Section title="Transitions"><div className="chip-grid">{TRANSITIONS.map((t) => <button key={t} className="chip" disabled={readOnly} onClick={() => onTransitions(t)} data-testid={`multi-transition-${t}`}>{TRANSITION_LABELS[t]} between</button>)}<button className="chip" disabled={readOnly} onClick={() => onTransitions("none")}>Remove</button></div></Section>}
    {visual.length > 0 && <Section title="Look">
      <div className="chip-grid" role="radiogroup" aria-label="Filter for all">{FILTERS.map((f) => <button key={f} className="chip" disabled={readOnly} onClick={() => onPatch({ filter: f })}>{f === "none" ? "No filter" : f}</button>)}</div>
      <div className="slider-field"><span><em>Opacity</em><b className="mono">{Math.round(opacity * 100)}%</b></span><input type="range" min={0} max={1} step={0.05} value={opacity} disabled={readOnly} aria-label="Opacity for all" onChange={(e) => { setOpacity(Number(e.target.value)); onPatch({ opacity: Number(e.target.value) }); }} /></div>
      <div className="toggle-row"><button className="chip" disabled={readOnly} onClick={() => onPatch({ fadeIn: 0.6, fadeOut: 0.6 })}>Fade both</button><button className="chip" disabled={readOnly} onClick={() => onPatch({ flipX: true })}>Mirror</button></div></Section>}
    <Section title="Sound"><div className="slider-field"><span><em>Volume</em><b className="mono">{Math.round(volume * 100)}%</b></span><input type="range" min={0} max={2} step={0.05} value={volume} disabled={readOnly} aria-label="Volume for all" onChange={(e) => { setVolume(Number(e.target.value)); onPatch({ volume: Number(e.target.value) }); }} /></div>
      <div className="toggle-row"><button className="chip" disabled={readOnly} onClick={() => onPatch({ muted: true })}>Mute all</button><button className="chip" disabled={readOnly} onClick={() => onPatch({ muted: false })}>Unmute all</button></div></Section>
  </div>;
}
