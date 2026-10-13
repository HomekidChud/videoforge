import { useEffect, useState } from "react";
import { Scissors, Copy, Trash2, Globe, Lock, Link2, Film } from "lucide-react";
import { FILTERS, RESOLUTIONS, clipDuration, clipScale, clipX, clipY, type Clip, type Timeline } from "@shared/timeline";
import { round, timecode, type AssetDTO } from "@/lib/editor-model";
import type { TimelineGesture } from "@/components/forge-timeline";

function Slider({ label, value, min, max, step, format, onGesture, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onGesture: TimelineGesture; onChange: (v: number) => void; disabled?: boolean }) {
  const [active, setActive] = useState(false);
  return <label className="slider-field"><span><em>{label}</em><b className="mono">{format ? format(value) : value}</b></span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
      onPointerDown={() => { setActive(true); onGesture.begin(); }} onPointerUp={() => { setActive(false); onGesture.end(); }}
      onChange={(e) => { const v = Number(e.target.value); if (active) onChange(v); else { onGesture.begin(); onChange(v); onGesture.end(); } }} /></label>;
}
function NumberField({ label, value, min, max, step = 0.1, suffix = "s", disabled, onCommit }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => { const n = Number(draft); if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n))); else setDraft(String(round(value))); };
  return <label className="number-field"><span>{label}</span><div><input type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /><small>{suffix}</small></div></label>;
}

export function ClipInspector({ clip, asset, readOnly, gesture, patch, onSplit, onDuplicate, onDelete }: { clip: Clip; asset?: AssetDTO; readOnly: boolean; gesture: TimelineGesture; patch: (p: Partial<Clip>, live?: boolean) => void; onSplit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [textDraft, setTextDraft] = useState(clip.text ?? "");
  useEffect(() => setTextDraft(clip.text ?? ""), [clip.id]);
  const isText = !clip.assetId, hasAudio = !isText && asset?.kind !== "image" && (asset?.kind === "audio" || (asset as any)?.hasAudio !== false);
  const visual = isText || asset?.kind !== "audio", media = !isText && asset?.kind !== "image", ps = (p: Partial<Clip>) => patch(p, true);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return <div className="inspector-body" data-testid="clip-inspector">
    <div className="inspector-title"><div className="thumb-chip">{isText ? "T" : <Film size={15} />}</div><div><b title={isText ? clip.text : asset?.filename}>{isText ? "Title" : asset?.filename ?? "Missing media"}</b><span className="muted mono">{timecode(clipDuration(clip))} · {clip.track}</span></div></div>
    <div className="action-row"><button className="secondary-btn" disabled={readOnly} onClick={onSplit} data-testid="button-split"><Scissors size={15} />Split</button><button className="secondary-btn" disabled={readOnly} onClick={onDuplicate}><Copy size={15} />Duplicate</button><button className="icon-btn danger" disabled={readOnly} aria-label="Delete clip" title="Delete (Del)" onClick={onDelete} data-testid="button-delete-clip"><Trash2 size={16} /></button></div>

    {isText && <section><h4>Text</h4><textarea rows={3} value={textDraft} disabled={readOnly} aria-label="Title text" maxLength={500} placeholder="Type your title" onChange={(e) => { setTextDraft(e.target.value); if (e.target.value.trim()) patch({ text: e.target.value }, true); }} onFocus={gesture.begin} onBlur={gesture.end} data-testid="input-title-text" />
      <Slider label="Size" value={clip.textSize ?? 6} min={2} max={20} step={0.5} format={(v) => `${v}%`} onGesture={gesture} onChange={(v) => ps({ textSize: v })} disabled={readOnly} />
      <div className="inline-fields"><label className="color-field">Color<input type="color" aria-label="Text color" disabled={readOnly} value={clip.textColor ?? "#ffffff"} onChange={(e) => patch({ textColor: e.target.value })} /></label><label className="check-field"><input type="checkbox" disabled={readOnly} checked={!!clip.textBg} onChange={(e) => patch({ textBg: e.target.checked })} />Background box</label></div></section>}

    <section><h4>Timing</h4><div className="two-col"><NumberField label="Start" value={clip.start} min={0} max={86400} disabled={readOnly} onCommit={(v) => patch({ start: v })} />
      {media ? <NumberField label="Speed" value={clip.speed ?? 1} min={0.25} max={4} step={0.25} suffix="×" disabled={readOnly} onCommit={(v) => patch({ speed: v })} /> : <NumberField label="Duration" value={clipDuration(clip)} min={0.1} max={3600} disabled={readOnly} onCommit={(v) => patch({ outPoint: clip.inPoint + v })} />}</div>
      {media && <div className="two-col"><NumberField label="In" value={clip.inPoint} min={0} max={Math.max(0, (asset?.duration ?? 86400) - 0.1)} disabled={readOnly} onCommit={(v) => patch({ inPoint: v })} /><NumberField label="Out" value={clip.outPoint} min={0.1} max={asset?.duration || 86400} disabled={readOnly} onCommit={(v) => patch({ outPoint: v })} /></div>}</section>

    {(clip.track === "overlay") && <section><h4>Position</h4>{!isText && <Slider label="Scale" value={clipScale(clip)} min={0.1} max={1} step={0.01} format={pct} onGesture={gesture} onChange={(v) => ps({ scale: v })} disabled={readOnly} />}
      <Slider label="Horizontal" value={clipX(clip)} min={0} max={1} step={0.01} format={pct} onGesture={gesture} onChange={(v) => ps({ x: v })} disabled={readOnly} /><Slider label="Vertical" value={clipY(clip)} min={0} max={1} step={0.01} format={pct} onGesture={gesture} onChange={(v) => ps({ y: v })} disabled={readOnly} /></section>}

    {visual && <section><h4>Look</h4>{!isText && <div className="chip-grid" role="radiogroup" aria-label="Filter">{FILTERS.map((f) => <button key={f} role="radio" aria-checked={(clip.filter ?? "none") === f} className={(clip.filter ?? "none") === f ? "selected" : ""} disabled={readOnly} onClick={() => patch({ filter: f })} data-testid={`filter-${f}`}>{f === "none" ? "Original" : f}</button>)}</div>}
      <Slider label="Opacity" value={clip.opacity ?? 1} min={0} max={1} step={0.01} format={pct} onGesture={gesture} onChange={(v) => ps({ opacity: v })} disabled={readOnly} />
      {!isText && <><Slider label="Brightness" value={clip.brightness ?? 0} min={-0.5} max={0.5} step={0.01} format={(v) => (v > 0 ? "+" : "") + Math.round(v * 100)} onGesture={gesture} onChange={(v) => ps({ brightness: v })} disabled={readOnly} />
        <Slider label="Contrast" value={clip.contrast ?? 1} min={0.5} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onGesture={gesture} onChange={(v) => ps({ contrast: v })} disabled={readOnly} />
        <Slider label="Saturation" value={clip.saturation ?? 1} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onGesture={gesture} onChange={(v) => ps({ saturation: v })} disabled={readOnly} /></>}</section>}

    {hasAudio && <section><h4>Audio</h4><Slider label="Volume" value={clip.volume} min={0} max={1} step={0.01} format={pct} onGesture={gesture} onChange={(v) => ps({ volume: v })} disabled={readOnly || clip.muted} /><label className="check-field"><input type="checkbox" checked={clip.muted} disabled={readOnly} onChange={(e) => patch({ muted: e.target.checked })} data-testid="input-muted" />Mute clip</label></section>}

    <section><h4>Fades</h4><Slider label="Fade in" value={clip.fadeIn ?? 0} min={0} max={Math.min(10, clipDuration(clip))} step={0.1} format={(v) => `${v.toFixed(1)}s`} onGesture={gesture} onChange={(v) => ps({ fadeIn: v })} disabled={readOnly} /><Slider label="Fade out" value={clip.fadeOut ?? 0} min={0} max={Math.min(10, clipDuration(clip))} step={0.1} format={(v) => `${v.toFixed(1)}s`} onGesture={gesture} onChange={(v) => ps({ fadeOut: v })} disabled={readOnly} /></section>
  </div>;
}

export function ProjectInspector({ name, onName, timeline, setProject, readOnly, canPublish, projectId, visibility, onVisibility, onCopyLink }: { name: string; onName: (n: string) => void; timeline: Timeline; setProject: (p: { fps?: number; resolution?: { width: number; height: number } }) => void; readOnly: boolean; canPublish: boolean; projectId: string | null; visibility: "private" | "public"; onVisibility: () => void; onCopyLink: () => void }) {
  const current = `${timeline.resolution.width}x${timeline.resolution.height}`;
  const custom = !RESOLUTIONS.some((r) => `${r.width}x${r.height}` === current);
  return <div className="inspector-body" data-testid="project-inspector">
    <div className="inspector-title"><div className="thumb-chip"><Film size={15} /></div><div><b>Project settings</b><span className="muted">Select a clip to edit it</span></div></div>
    <section><h4>Project</h4><label className="field compact">Name<input value={name} maxLength={200} disabled={readOnly} onChange={(e) => onName(e.target.value)} data-testid="input-project-name" /></label>
      <label className="field compact">Canvas<select value={current} disabled={readOnly} onChange={(e) => { const [width, height] = e.target.value.split("x").map(Number); setProject({ resolution: { width, height } }); }} data-testid="select-resolution">{custom && <option value={current}>{timeline.resolution.width}×{timeline.resolution.height} (custom)</option>}{RESOLUTIONS.map((r) => <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>)}</select></label>
      <label className="field compact">Frame rate<select value={timeline.fps} disabled={readOnly} onChange={(e) => setProject({ fps: Number(e.target.value) })}>{[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></label></section>
    <section><h4>Sharing</h4><div className="share-card">{visibility === "public" ? <Globe size={18} /> : <Lock size={18} />}<div><b>{visibility === "public" ? "Public" : "Private"}</b><p className="muted">{visibility === "public" ? "Anyone with the link can watch your latest render." : "Only API keys with access can see this project."}</p></div></div>
      {!projectId && <p className="help-text">Save the project to manage sharing.</p>}
      {canPublish ? <button className="secondary-btn full" disabled={!projectId} onClick={onVisibility}>{visibility === "private" ? <><Globe size={15} />Make public</> : <><Lock size={15} />Make private</>}</button> : <p className="help-text">Only admin keys can change visibility.</p>}
      {visibility === "public" && <button className="secondary-btn full" onClick={onCopyLink}><Link2 size={15} />Copy public link</button>}</section>
    <section><h4>Shortcuts</h4><dl className="shortcut-list">{[["Space", "Play / pause"], ["S", "Split at playhead"], ["Del", "Delete clip"], ["⇧ Del", "Ripple delete"], ["⌘/Ctrl Z", "Undo (⇧ for redo)"], ["⌘/Ctrl D", "Duplicate"], ["← →", "Step a frame (⇧ = 1s)"], ["[  ]", "Trim edge to playhead"], ["+ −", "Zoom timeline"]].map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>)}</dl></section>
  </div>;
}
