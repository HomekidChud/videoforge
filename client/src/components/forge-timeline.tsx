import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Type, Music2, Film, Image as ImageIcon, Eye, EyeOff, Volume2, VolumeX, Flag, Maximize2 } from "lucide-react";
import { clipDuration, clipEnd, timelineDuration, type Clip, type Timeline } from "@shared/timeline";
import { api } from "@/lib/api";
import { clampClipPatch, round, timecode, type AssetDTO } from "@/lib/editor-model";

export type TimelineGesture = { begin: () => void; update: (id: string, patch: Partial<Clip>) => void; end: () => void };
type Props = {
  timeline: Timeline; assets: AssetDTO[]; selectedId: string | null; time: number; playing: boolean; pps: number; snapping: boolean; readOnly: boolean;
  mediaUrl: (id: string, url: string) => string;
  onTrack: (track: Clip["track"], patch: { muted?: boolean; hidden?: boolean }) => void; onFit: () => void; onAddMarker: () => void;
  onSelect: (id: string | null) => void; onSeek: (t: number) => void; onDropAsset: (assetId: string, track: Clip["track"], start: number) => void;
  onDropEffect: (effect: any, target: { clipId?: string; track?: Clip["track"]; start?: number }) => void; onDropFiles: (files: File[], track: Clip["track"], start: number) => void; onMoveMarker: (id: string, time: number) => void; gesture: TimelineGesture; onZoom: (pps: number) => void;
};
const LANES: { id: Clip["track"]; label: string; hint: string }[] = [
  { id: "overlay", label: "Titles & overlays", hint: "Add titles or drop picture-in-picture clips" },
  { id: "video", label: "Video", hint: "Drop video or images here" },
  { id: "audio", label: "Audio", hint: "Drop music or voice-over here" },
];
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
type Drag = { id: string; mode: "move" | "trimL" | "trimR"; x: number; orig: Clip; asset?: AssetDTO; moved: boolean };

function Waveform({ asset, clip, width }: { asset: AssetDTO; clip: Clip; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const q = useQuery<{ perSecond: number; peaks: number[] }>({ queryKey: ["wave", asset.id], queryFn: () => api("GET", `/api/media/${asset.id}/waveform`), staleTime: Infinity, retry: false });
  useEffect(() => {
    const canvas = ref.current, data = q.data;
    if (!canvas || !data?.peaks?.length) return;
    const w = Math.min(4000, Math.max(1, Math.round(width))), h = canvas.height;
    canvas.width = w;
    const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, w, h); ctx.fillStyle = "rgba(220,255,226,.78)";
    const from = Math.floor(clip.inPoint * data.perSecond), to = Math.ceil(clip.outPoint * data.perSecond);
    for (let x = 0; x < w; x += 2) {
      const i = from + Math.floor((x / w) * (to - from)), p = data.peaks[Math.min(data.peaks.length - 1, i)] ?? 0;
      const bar = Math.max(1, p * h * 0.9); ctx.fillRect(x, (h - bar) / 2, 1.4, bar);
    }
  }, [q.data, clip.inPoint, clip.outPoint, width]);
  return <canvas ref={ref} className="wave-canvas" height={34} aria-hidden="true" />;
}

function packRows(clips: Clip[]) {
  const ends: number[] = [], rows = new Map<string, number>();
  [...clips].sort((a, b) => a.start - b.start).forEach((c) => { let r = ends.findIndex((e) => e <= c.start + 0.001); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = clipEnd(c); rows.set(c.id, r); });
  return { rows, count: Math.max(1, ends.length) };
}

export default function ForgeTimeline({ timeline, assets, selectedId, time, playing, pps, snapping, readOnly, mediaUrl, onTrack, onFit, onAddMarker, onSelect, onSeek, onDropAsset, onDropEffect, onDropFiles, onMoveMarker, gesture, onZoom }: Props) {
  const scroller = useRef<HTMLDivElement>(null), lanes = useRef(new Map<string, HTMLDivElement>()), drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(900), [hoverClip, setHoverClip] = useState<string | null>(null), [hoverLane, setHoverLane] = useState<string | null>(null);
  const markerDrag = useRef<string | null>(null);
  const duration = timelineDuration(timeline);
  const total = Math.max(duration + Math.max(8, 400 / pps), width / pps);
  const gridStep = STEPS.find((s) => s * pps >= 76) ?? 600;
  const ticks = useMemo(() => Array.from({ length: Math.ceil(total / gridStep) + 1 }, (_, i) => round(i * gridStep)), [total, gridStep]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  useEffect(() => { const el = scroller.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth); return () => ro.disconnect(); }, []);
  // keep the playhead in view while playing
  useEffect(() => {
    const el = scroller.current; if (!el || !playing) return;
    const x = time * pps, left = el.scrollLeft + 150, right = el.scrollLeft + el.clientWidth - 90;
    if (x > right || x < left) el.scrollLeft = Math.max(0, x - 180);
  }, [time, playing, pps]);

  const pointTime = (clientX: number) => {
    const el = scroller.current!, r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft - 132) / pps);
  };
  const seekFrom = (e: React.PointerEvent) => { onSeek(round(Math.max(0, Math.round(pointTime(e.clientX) * timeline.fps) / timeline.fps))); };
  const targets = (exclude: string) => [0, time, ...(timeline.markers ?? []).map((m) => m.time), ...timeline.clips.filter((c) => c.id !== exclude).flatMap((c) => [c.start, clipEnd(c)])];
  const laneAt = (y: number): Clip["track"] | null => { let found: Clip["track"] | null = null; lanes.current.forEach((el, id) => { const r = el.getBoundingClientRect(); if (y >= r.top && y <= r.bottom) found = id as Clip["track"]; }); return found; };
  const allowed = (clip: Clip, asset: AssetDTO | undefined, lane: Clip["track"]) => !asset ? lane === "overlay" : asset.kind === "audio" ? lane === "audio" : lane !== "audio";

  function down(e: React.PointerEvent, c: Clip, mode: Drag["mode"]) {
    e.stopPropagation(); onSelect(c.id);
    if (readOnly || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: c.id, mode, x: e.clientX, orig: c, asset: byId.get(c.assetId), moved: false };
    gesture.begin();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.x) / pps; if (Math.abs(e.clientX - d.x) > 2) d.moved = true; if (!d.moved) return;
    const o = d.orig, speed = o.speed ?? 1, threshold = snapping ? 9 / pps : 0, tg = targets(o.id), media = !!o.assetId && d.asset?.kind !== "image";
    const snap = (t: number) => { if (!threshold) return round(Math.max(0, t)); let best = Math.round(t * timeline.fps) / timeline.fps, near = threshold; for (const x of tg) if (Math.abs(x - t) < near) { best = x; near = Math.abs(x - t); } return round(Math.max(0, best)); };
    if (d.mode === "move") {
      const dur = clipDuration(o), s1 = snap(o.start + dx), e1 = snap(o.start + dx + dur) - dur;
      const startErr = Math.abs(s1 - (o.start + dx)), endErr = Math.abs(e1 - (o.start + dx));
      let start = Math.max(0, threshold && endErr < startErr && e1 >= 0 ? e1 : s1);
      const lane = laneAt(e.clientY); const patch: Partial<Clip> = { start: round(start) };
      if (lane && lane !== o.track && allowed(o, d.asset, lane)) patch.track = lane;
      gesture.update(o.id, patch);
    } else if (d.mode === "trimL") {
      const end = o.start + clipDuration(o), start = Math.min(end - 0.1, snap(o.start + dx));
      const delta = start - o.start;
      if (media) { const inPoint = o.inPoint + delta * speed; gesture.update(o.id, inPoint < 0 ? { inPoint: 0, start: round(o.start - o.inPoint / speed) } : { inPoint: round(inPoint), start: round(start) }); }
      else gesture.update(o.id, { start: round(Math.max(0, start)), outPoint: round(Math.max(o.inPoint + 0.1, o.outPoint - delta)) });
    } else {
      const end = Math.max(o.start + 0.1, snap(o.start + clipDuration(o) + dx)), out = o.inPoint + (end - o.start) * (media ? speed : 1);
      gesture.update(o.id, { outPoint: round(out) });
    }
  }
  function up() { if (drag.current) { drag.current = null; gesture.end(); } }
  const readEffect = (e: React.DragEvent) => { try { return JSON.parse(e.dataTransfer.getData("application/x-vf-effect")); } catch { return null; } };
  const hasDrag = (e: React.DragEvent, type: string) => Array.from(e.dataTransfer.types).includes(type);
  function dropOn(e: React.DragEvent, lane: Clip["track"]) {
    e.preventDefault(); e.stopPropagation(); setHoverLane(null); setHoverClip(null); if (readOnly) return;
    const at = round(Math.max(0, pointTime(e.clientX)));
    if (e.dataTransfer.files.length) return onDropFiles(Array.from(e.dataTransfer.files), lane, at);
    const effect = readEffect(e); if (effect) return onDropEffect(effect, { track: lane, start: at });
    const id = e.dataTransfer.getData("application/x-vf-asset"); if (!id) return;
    const a = byId.get(id); if (!a || !allowed({} as Clip, a, lane)) return;
    onDropAsset(id, lane, at);
  }
  function overLane(e: React.DragEvent, lane: Clip["track"]) {
    if (readOnly || !(hasDrag(e, "application/x-vf-asset") || hasDrag(e, "application/x-vf-effect") || hasDrag(e, "Files"))) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setHoverLane(lane);
  }
  function overClip(e: React.DragEvent, id: string) { if (readOnly || !hasDrag(e, "application/x-vf-effect")) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setHoverClip(id); setHoverLane(null); }
  function dropClip(e: React.DragEvent, id: string) { const effect = readEffect(e); if (!effect || readOnly) return; e.preventDefault(); e.stopPropagation(); setHoverClip(null); setHoverLane(null); onDropEffect(effect, { clipId: id }); }
  function markerDown(e: React.PointerEvent, id: string, at: number) { e.stopPropagation(); onSeek(at); if (readOnly) return; e.currentTarget.setPointerCapture(e.pointerId); markerDrag.current = id; gesture.begin(); }
  function markerMove(e: React.PointerEvent) { if (!markerDrag.current || !e.buttons) return; e.stopPropagation(); onMoveMarker(markerDrag.current, round(Math.max(0, Math.round(pointTime(e.clientX) * timeline.fps) / timeline.fps))); }
  function markerUp() { if (markerDrag.current) { markerDrag.current = null; gesture.end(); } }

  return <div className="timeline-shell">
    <div className="timeline-toolbar"><span className="mono time-readout" data-testid="text-timecode">{timecode(time, timeline.fps)}</span><span className="muted mono"> / {timecode(duration, timeline.fps)}</span><div className="flex-spacer"/>
      <button className="icon-btn" onClick={onAddMarker} disabled={readOnly} aria-label="Add marker at playhead" title="Add marker (M)"><Flag size={15} /></button><button className="icon-btn" onClick={onFit} aria-label="Fit timeline" title="Fit timeline to window"><Maximize2 size={15} /></button>
      <label className="zoom-control">Zoom<input type="range" aria-label="Timeline zoom" min={8} max={260} value={pps} onChange={(e) => onZoom(Number(e.target.value))} /></label></div>
    <div className="timeline-scroll" ref={scroller} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onZoom(Math.min(260, Math.max(8, Math.round(pps * (e.deltaY < 0 ? 1.15 : 0.87))))); } }} data-testid="timeline">
      <div className="timeline-inner" style={{ width: 132 + total * pps }}>
        <div className="ruler-row"><div className="lane-label sticky-corner"/>
          <div className="ruler" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }} onPointerMove={(e) => { if (e.buttons) seekFrom(e); }} data-testid="ruler">
            {ticks.map((t) => <div key={t} className="tick" style={{ left: t * pps }}><span className="mono">{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${t}s`}</span></div>)}
            {(timeline.markers ?? []).map((m) => <button key={m.id} className="marker" style={{ left: m.time * pps, color: m.color }} title={`${m.label} · ${timecode(m.time, timeline.fps)}`} onPointerDown={(e) => markerDown(e, m.id, m.time)} onPointerMove={markerMove} onPointerUp={markerUp} onPointerCancel={markerUp} data-testid={`marker-${m.id}`}><Flag size={11} fill="currentColor" /></button>)}
          </div></div>
        {LANES.map((lane) => {
          const clips = timeline.clips.filter((c) => c.track === lane.id), packed = packRows(clips);
          return <div className="lane-row" key={lane.id} style={{ minHeight: packed.count * 58 }}><div className="lane-label"><b>{lane.id === "overlay" ? "T" : lane.id === "video" ? "V" : "A"}</b><span>{lane.label}</span>{lane.id === "audio" ? <button className={`lane-toggle ${timeline.tracks?.audio?.muted ? "on" : ""}`} aria-label={timeline.tracks?.audio?.muted ? "Unmute audio track" : "Mute audio track"} aria-pressed={!!timeline.tracks?.audio?.muted} disabled={readOnly} onClick={() => onTrack("audio", { muted: !timeline.tracks?.audio?.muted })}>{timeline.tracks?.audio?.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button> : <button className={`lane-toggle ${timeline.tracks?.[lane.id]?.hidden ? "on" : ""}`} aria-label={timeline.tracks?.[lane.id]?.hidden ? `Show ${lane.label}` : `Hide ${lane.label}`} aria-pressed={!!timeline.tracks?.[lane.id]?.hidden} disabled={readOnly} onClick={() => onTrack(lane.id, { hidden: !timeline.tracks?.[lane.id]?.hidden })}>{timeline.tracks?.[lane.id]?.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>}</div>
            <div className={`lane lane-${lane.id} ${hoverLane === lane.id ? "drop-over" : ""}`} ref={(el) => { if (el) lanes.current.set(lane.id, el); }} onDragOver={(e) => overLane(e, lane.id)} onDragLeave={(e) => { if (e.currentTarget === e.target) setHoverLane(null); }} onDrop={(e) => dropOn(e, lane.id)} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); seekFrom(e); } }} data-testid={`lane-${lane.id}`}>
              {!clips.length && <div className="lane-hint">{lane.hint}</div>}
              {clips.map((c) => {
                const a = byId.get(c.assetId), w = Math.max(18, clipDuration(c) * pps), isText = !c.assetId;
                const thumb = a && a.kind !== "audio" ? mediaUrl(a.id, `/api/media/${a.id}/thumb`) : "";
                return <div key={c.id} role="button" tabIndex={0} aria-label={`${isText ? "Title" : a?.filename ?? "Clip"}, ${clipDuration(c).toFixed(1)} seconds`} aria-pressed={selectedId === c.id}
                  className={`clip clip-${isText ? "text" : lane.id} ${selectedId === c.id ? "selected" : ""} ${readOnly ? "locked" : ""} ${hoverClip === c.id ? "drop-target" : ""} ${timeline.tracks?.[lane.id]?.hidden || timeline.tracks?.[lane.id]?.muted ? "track-off" : ""}`} style={{ left: c.start * pps, width: w, top: (packed.rows.get(c.id) ?? 0) * 58 + 6, bottom: "auto", height: 46, backgroundImage: thumb ? `linear-gradient(90deg,rgba(17,17,18,.2),rgba(17,17,18,.65)),url(${thumb})` : undefined }}
                  onPointerDown={(e) => down(e, c, "move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDragOver={(e) => overClip(e, c.id)} onDragLeave={() => setHoverClip(null)} onDrop={(e) => dropClip(e, c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }} data-testid={`clip-${c.id}`}>
                  {a?.kind === "audio" && <Waveform asset={a} clip={c} width={w} />}
                  <span className="trim-handle left" onPointerDown={(e) => down(e, c, "trimL")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
                  <span className="clip-label">{isText ? <Type size={13} /> : a?.kind === "audio" ? <Music2 size={13} /> : a?.kind === "image" ? <ImageIcon size={13} /> : <Film size={13} />}<span>{isText ? c.text : a?.filename ?? "Missing media"}</span></span>
                  {Array.from(new Set(Object.values(c.keyframes ?? {}).flatMap((k) => k.map((p) => p.time)))).map((kt) => <i key={kt} className="kf-dot" style={{ left: Math.min(w - 8, Math.max(8, kt * pps)) }} aria-hidden="true" />)}
                  {((c.speed ?? 1) !== 1 || c.filter) && <span className="clip-badges">{(c.speed ?? 1) !== 1 && <i>{c.speed}×</i>}{c.filter && <i>{c.filter}</i>}</span>}
                  <span className="trim-handle right" onPointerDown={(e) => down(e, c, "trimR")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
                </div>;
            })}</div></div>;
        })}
        <div className="playhead" style={{ left: 132 + time * pps }} aria-hidden="true"><span className="playhead-cap" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (e.buttons) seekFrom(e); }}/></div>
      </div></div></div>;
}
