import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Type, Music2, Film, Image as ImageIcon, Eye, EyeOff, Volume2, VolumeX, Flag, Maximize2 } from "lucide-react";
import { clipDuration, clipEnd, timelineDuration, type Clip, type Timeline } from "@shared/timeline";
import { incomingTransition } from "@shared/transitions";
import { ANIMATABLE, type AnimationProperty } from "@shared/animation";
import { api } from "@/lib/api";
import type { Peer } from "@/components/forge-presence";
import { clampClipPatch, round, timecode, type AssetDTO } from "@/lib/editor-model";

export type TimelineGesture = { begin: () => void; update: (id: string, patch: Partial<Clip>) => void; end: () => void };
type Props = {
  animationMode?: boolean;
  onKeyframeFocus?: (clipId:string,property:AnimationProperty,time:number)=>void;
  timeline: Timeline; assets: AssetDTO[]; selectedId: string | null; selectedIds: string[]; peers: Peer[]; follow?: boolean; onSelectMany: (ids: string[]) => void; onCursor: (c: { area: "timeline"; t: number; lane?: string } | null) => void; time: number; playing: boolean; pps: number; snapping: boolean; readOnly: boolean;
  mediaUrl: (id: string, url: string) => string;
  onTrack: (track: Clip["track"], patch: { muted?: boolean; hidden?: boolean }) => void; onFit: () => void; onAddMarker: () => void;
  onSelect: (id: string | null, mode?: "replace" | "toggle" | "keep") => void; onSeek: (t: number) => void; onDropAsset: (assetId: string, track: Clip["track"], start: number) => void;
  onDropEffect: (effect: any, target: { clipId?: string; track?: Clip["track"]; start?: number }) => void; onDropFiles: (files: File[], track: Clip["track"], start: number) => void; onMoveMarker: (id: string, time: number) => void; gesture: TimelineGesture; onZoom: (pps: number) => void;
};
const LANES: { id: Clip["track"]; label: string; hint: string }[] = [
  { id: "overlay", label: "Titles & overlays", hint: "Add titles or drop picture-in-picture clips" },
  { id: "video", label: "Video", hint: "Drop video or images here" },
  { id: "audio", label: "Audio", hint: "Drop music or voice-over here" },
];
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
type Drag = { id: string; mode: "move" | "trimL" | "trimR"; x: number; orig: Clip; asset?: AssetDTO; moved: boolean; group: Clip[] };
type Marquee = { x0: number; y0: number; x1: number; y1: number; moved: boolean; base: string[] };

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

function packRows(clips: Clip[], timeline: Timeline) {
  const ends: number[] = [], rows = new Map<string, number>();
  [...clips].sort((a, b) => a.start - b.start).forEach((c) => { const overlap = incomingTransition(timeline, c)?.duration ?? 0; let r = ends.findIndex((e) => e <= c.start + 0.001 + overlap); if (r < 0) { r = ends.length; ends.push(0); } ends[r] = clipEnd(c); rows.set(c.id, r); });
  return { rows, count: Math.max(1, ends.length) };
}

export default function ForgeTimeline({ animationMode=false, onKeyframeFocus, timeline, assets, selectedId, selectedIds, peers, follow, onSelectMany, onCursor, time, playing, pps, snapping, readOnly, mediaUrl, onTrack, onFit, onAddMarker, onSelect, onSeek, onDropAsset, onDropEffect, onDropFiles, onMoveMarker, gesture, onZoom }: Props) {
  const scroller = useRef<HTMLDivElement>(null), lanes = useRef(new Map<string, HTMLDivElement>()), drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(900), [hoverClip, setHoverClip] = useState<string | null>(null), [hoverLane, setHoverLane] = useState<string | null>(null);
  const markerDrag = useRef<string | null>(null), marqueeRef = useRef<Marquee | null>(null), [marquee, setMarquee] = useState<Marquee | null>(null);
  const duration = timelineDuration(timeline);
  const total = Math.max(duration + Math.max(8, 400 / pps), width / pps);
  const gridStep = STEPS.find((s) => s * pps >= 76) ?? 600;
  const ticks = useMemo(() => Array.from({ length: Math.ceil(total / gridStep) + 1 }, (_, i) => round(i * gridStep)), [total, gridStep]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  useEffect(() => { const el = scroller.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth); return () => ro.disconnect(); }, []);
  // keep the playhead in view while playing
  useEffect(() => {
    const el = scroller.current; if (!el || !(playing || follow)) return;
    const x = time * pps, left = el.scrollLeft + 150, right = el.scrollLeft + el.clientWidth - 90;
    if (x > right || x < left) el.scrollLeft = Math.max(0, x - 180);
  }, [time, playing, pps, follow]);

  const pointTime = (clientX: number) => {
    const el = scroller.current!, r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft - 132) / pps);
  };
  const seekFrom = (e: React.PointerEvent) => { onSeek(round(Math.max(0, Math.round(pointTime(e.clientX) * timeline.fps) / timeline.fps))); };
  const targets = (exclude: string) => [0, time, ...(timeline.markers ?? []).map((m) => m.time), ...timeline.clips.filter((c) => c.id !== exclude).flatMap((c) => [c.start, clipEnd(c)])];
  const laneAt = (y: number): Clip["track"] | null => { let found: Clip["track"] | null = null; lanes.current.forEach((el, id) => { const r = el.getBoundingClientRect(); if (y >= r.top && y <= r.bottom) found = id as Clip["track"]; }); return found; };
  const allowed = (clip: Clip, asset: AssetDTO | undefined, lane: Clip["track"]) => !asset ? lane === "overlay" : asset.kind === "audio" ? lane === "audio" : lane !== "audio";

  function down(e: React.PointerEvent, c: Clip, mode: Drag["mode"]) {
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) { onSelect(c.id, "toggle"); return; }
    const inGroup = selectedIds.length > 1 && selectedIds.includes(c.id);
    if (!inGroup) onSelect(c.id); else onSelect(c.id, "keep");
    if (readOnly || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: c.id, mode, x: e.clientX, orig: c, asset: byId.get(c.assetId), moved: false, group: mode === "move" && inGroup ? timeline.clips.filter((x) => selectedIds.includes(x.id)) : [c] };
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
      const lane = laneAt(e.clientY), group = d.group;
      if (group.length > 1) {
        const delta = Math.max(start - o.start, -Math.min(...group.map((g) => g.start)));
        group.forEach((g) => gesture.update(g.id, { start: round(g.start + delta) }));
      } else {
        const patch: Partial<Clip> = { start: round(start) };
        if (lane && lane !== o.track && allowed(o, d.asset, lane)) patch.track = lane;
        gesture.update(o.id, patch);
      }
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
  function marqueeMove(e: React.PointerEvent) {
    const m = marqueeRef.current; if (!m) return;
    m.x1 = e.clientX; m.y1 = e.clientY; if (Math.abs(m.x1 - m.x0) + Math.abs(m.y1 - m.y0) > 5) m.moved = true;
    if (!m.moved) return;
    const l = Math.min(m.x0, m.x1), r = Math.max(m.x0, m.x1), t = Math.min(m.y0, m.y1), b = Math.max(m.y0, m.y1), ids = new Set(m.base);
    scroller.current?.querySelectorAll<HTMLElement>("[data-clip-id]").forEach((el) => { const q = el.getBoundingClientRect(); if (q.left < r && q.right > l && q.top < b && q.bottom > t) ids.add(el.dataset.clipId!); });
    setMarquee({ ...m }); onSelectMany(Array.from(ids));
  }
  function marqueeUp(e: React.PointerEvent) { const m = marqueeRef.current; marqueeRef.current = null; setMarquee(null); if (m && !m.moved) { onSelect(null); seekFrom(e); } }
  const trackCursor = (e: React.PointerEvent) => { if (e.buttons) return; const lane = laneAt(e.clientY); onCursor(lane ? { area: "timeline", t: round(pointTime(e.clientX)), lane } : null); };
  const peerOn = (id: string) => peers.find((p) => p.selectedIds.includes(id));
  function markerDown(e: React.PointerEvent, id: string, at: number) { e.stopPropagation(); onSeek(at); if (readOnly) return; e.currentTarget.setPointerCapture(e.pointerId); markerDrag.current = id; gesture.begin(); }
  function markerMove(e: React.PointerEvent) { if (!markerDrag.current || !e.buttons) return; e.stopPropagation(); onMoveMarker(markerDrag.current, round(Math.max(0, Math.round(pointTime(e.clientX) * timeline.fps) / timeline.fps))); }
  function markerUp() { if (markerDrag.current) { markerDrag.current = null; gesture.end(); } }

  return <div className="timeline-shell">
    <div className="timeline-toolbar"><span className="mono time-readout" data-testid="text-timecode">{timecode(time, timeline.fps)}</span><span className="muted mono"> / {timecode(duration, timeline.fps)}</span><div className="flex-spacer"/>
      <button className="icon-btn" onClick={onAddMarker} disabled={readOnly} aria-label="Add marker at playhead" title="Add marker (M)"><Flag size={15} /></button><button className="icon-btn" onClick={onFit} aria-label="Fit timeline" title="Fit timeline to window"><Maximize2 size={15} /></button>
      <label className="zoom-control">Zoom<input type="range" aria-label="Timeline zoom" min={8} max={260} value={pps} onChange={(e) => onZoom(Number(e.target.value))} /></label></div>
    <div className="timeline-scroll" ref={scroller} onPointerMove={trackCursor} onPointerLeave={() => onCursor(null)} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onZoom(Math.min(260, Math.max(8, Math.round(pps * (e.deltaY < 0 ? 1.15 : 0.87))))); } }} data-testid="timeline">
      <div className="timeline-inner" style={{ width: 132 + total * pps }}>
        <div className="ruler-row"><div className="lane-label sticky-corner"/>
          <div className="ruler" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }} onPointerMove={(e) => { if (e.buttons) seekFrom(e); }} data-testid="ruler">
            {ticks.map((t) => <div key={t} className="tick" style={{ left: t * pps }}><span className="mono">{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${t}s`}</span></div>)}
            {(timeline.markers ?? []).map((m) => <button key={m.id} className="marker" style={{ left: m.time * pps, color: m.color }} title={`${m.label} · ${timecode(m.time, timeline.fps)}`} onPointerDown={(e) => markerDown(e, m.id, m.time)} onPointerMove={markerMove} onPointerUp={markerUp} onPointerCancel={markerUp} data-testid={`marker-${m.id}`}><Flag size={11} fill="currentColor" /></button>)}
          </div></div>
        {LANES.map((lane) => {
          const clips = timeline.clips.filter((c) => c.track === lane.id);
          // Graphics retain their document-order lane when moved in time. These
          // are clip lanes, not a new compositing stack or user-defined tracks.
          const properties = (c: Clip) => animationMode && c.id===selectedId ? (Object.keys(c.keyframes??{}) as AnimationProperty[]).filter(p=>c.keyframes?.[p]?.length) : [];
          const graphicRows = new Map<string,number>();
          let graphicHeight = 0;
          for(const c of clips){graphicRows.set(c.id,graphicHeight/58);graphicHeight+=58+properties(c).length*30;}
          const packed = lane.id === "overlay" ? { rows: graphicRows, count: Math.max(58,graphicHeight)/58 } : packRows(clips, timeline);
          return <div className="lane-row" key={lane.id} style={{ minHeight: packed.count * 58 + (lane.id==="overlay"?30:0) }}><div className={`lane-label ${lane.id==="overlay"?"overlay-lane-names":""}`}>
            <div className={lane.id==="overlay"?"overlay-lane-heading":"track-lane-heading"}><b>{lane.id === "overlay" ? "G" : lane.id === "video" ? "V" : "A"}</b><span>{lane.id==="overlay"?"Graphics":lane.label}</span>{lane.id === "audio" ? <button className={`lane-toggle ${timeline.tracks?.audio?.muted ? "on" : ""}`} aria-label={timeline.tracks?.audio?.muted ? "Unmute audio track" : "Mute audio track"} aria-pressed={!!timeline.tracks?.audio?.muted} disabled={readOnly} onClick={() => onTrack("audio", { muted: !timeline.tracks?.audio?.muted })}>{timeline.tracks?.audio?.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button> : <button className={`lane-toggle ${timeline.tracks?.[lane.id]?.hidden ? "on" : ""}`} aria-label={timeline.tracks?.[lane.id]?.hidden ? `Show ${lane.label}` : `Hide ${lane.label}`} aria-pressed={!!timeline.tracks?.[lane.id]?.hidden} disabled={readOnly} onClick={() => onTrack(lane.id, { hidden: !timeline.tracks?.[lane.id]?.hidden })}>{timeline.tracks?.[lane.id]?.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>}</div>
            {lane.id==="overlay"&&clips.map((c,i)=><div key={c.id}><button className={`clip-lane-name ${selectedIds.includes(c.id)?"active":""}`} title={c.label??c.text??byId.get(c.assetId)?.filename??"Overlay"} onClick={e=>onSelect(c.id,e.shiftKey?"toggle":"replace")} data-testid={`layer-select-${c.id}`}><small>{String(i+1).padStart(2,"0")}</small><span>{c.label??c.text??byId.get(c.assetId)?.filename??"Overlay"}</span></button>
              {properties(c).map(p=><div key={p} className="property-lane-label">{ANIMATABLE[p].label}</div>)}
            </div>)}
          </div>
            <div className={`lane lane-${lane.id} ${hoverLane === lane.id ? "drop-over" : ""}`} ref={(el) => { if (el) lanes.current.set(lane.id, el); }} onDragOver={(e) => overLane(e, lane.id)} onDragLeave={(e) => { if (e.currentTarget === e.target) setHoverLane(null); }} onDrop={(e) => dropOn(e, lane.id)} onPointerDown={(e) => { if (e.target === e.currentTarget && e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); const m = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false, base: e.shiftKey ? selectedIds : [] }; marqueeRef.current = m; } }} onPointerMove={marqueeMove} onPointerUp={marqueeUp} onPointerCancel={marqueeUp} data-testid={`lane-${lane.id}`}>
              {!clips.length && <div className="lane-hint">{lane.hint}</div>}
              {lane.id==="overlay"&&clips.flatMap(c=>properties(c).map((p,i)=><div key={`${c.id}-${p}`} className="property-key-lane" style={{top:(packed.rows.get(c.id)??0)*58+58+i*30}} data-testid={`property-lane-${c.id}-${p}`}>
                {c.keyframes?.[p]?.map((k,ki)=><button key={ki} className={`property-key ${Math.abs(time-c.start-k.time)<1/timeline.fps?"at-playhead":""}`} style={{left:Math.max(8,(c.start+k.time)*pps)}} aria-label={`${ANIMATABLE[p].label} key at ${k.time.toFixed(2)} seconds, value ${k.value}`} title={`${ANIMATABLE[p].label}: ${k.value} · ${k.time.toFixed(2)}s`} onPointerDown={e=>e.stopPropagation()} onClick={()=>{onSelect(c.id);onSeek(c.start+k.time);onKeyframeFocus?.(c.id,p,k.time);}} data-testid={`property-key-${c.id}-${p}-${ki}`}/>)}
              </div>))}
              {peers.map((p) => p.cursor?.area === "timeline" && p.cursor.lane === lane.id && <div key={p.cid} className="peer-cursor" style={{ left: p.cursor.t * pps, top: 14, "--pc": p.color } as any} data-testid="live-cursor"><span className="cursor-arrow" /><b>{p.name}</b></div>)}
              {clips.map((c) => {
                const a = byId.get(c.assetId), w = Math.max(18, clipDuration(c) * pps), isText = !c.assetId && !c.shape;
                const thumb = a && a.kind !== "audio" ? mediaUrl(a.id, `/api/media/${a.id}/thumb`) : "";
                return <div key={c.id} role="button" tabIndex={0} aria-label={`${c.shape ? c.label ?? `${c.shape.type} shape` : isText ? "Title" : a?.filename ?? "Clip"}, ${clipDuration(c).toFixed(1)} seconds`} aria-pressed={selectedIds.includes(c.id)}
                  className={`clip clip-${isText ? "text" : lane.id} ${selectedIds.includes(c.id) ? "selected" : ""} ${selectedIds.length > 1 && selectedIds.includes(c.id) ? "multi" : ""} ${peerOn(c.id) ? "peer-selected" : ""} ${readOnly ? "locked" : ""} ${hoverClip === c.id ? "drop-target" : ""} ${timeline.tracks?.[lane.id]?.hidden || timeline.tracks?.[lane.id]?.muted ? "track-off" : ""}`} style={{ ...(peerOn(c.id) ? { "--peer": peerOn(c.id)!.color } as any : {}), zIndex: incomingTransition(timeline, c) ? 4 : undefined, left: c.start * pps, width: w, top: (packed.rows.get(c.id) ?? 0) * 58 + 6, bottom: "auto", height: 46, backgroundImage: thumb ? `linear-gradient(90deg,rgba(17,17,18,.2),rgba(17,17,18,.65)),url(${thumb})` : undefined }}
                  onPointerDown={(e) => down(e, c, "move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDragOver={(e) => overClip(e, c.id)} onDragLeave={() => setHoverClip(null)} onDrop={(e) => dropClip(e, c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c.id); } }} data-clip-id={c.id} data-testid={`clip-${c.id}`}>
                  {incomingTransition(timeline, c) && <span className={`transition-zone ${incomingTransition(timeline, c)!.type}`} style={{ width: incomingTransition(timeline, c)!.duration * pps }} title={`${incomingTransition(timeline, c)!.type} · ${incomingTransition(timeline, c)!.duration}s`} data-testid={`transition-${c.id}`} />}
                  {peerOn(c.id) && <span className="peer-tag" style={{ background: peerOn(c.id)!.color }}>{peerOn(c.id)!.name}</span>}
                  {a?.kind === "audio" && <Waveform asset={a} clip={c} width={w} />}
                  <span className="trim-handle left" onPointerDown={(e) => down(e, c, "trimL")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
                  <span className="clip-label">{isText ? <Type size={13} /> : a?.kind === "audio" ? <Music2 size={13} /> : a?.kind === "image" ? <ImageIcon size={13} /> : <Film size={13} />}<span>{c.shape ? c.label ?? `${c.shape.type} shape` : isText ? c.text : a?.filename ?? "Missing media"}</span></span>
                  {Array.from(new Set(Object.values(c.keyframes ?? {}).flatMap((k) => k.map((p) => p.time)))).map((kt) => <i key={kt} className="kf-dot" style={{ left: Math.min(w - 8, Math.max(8, kt * pps)) }} aria-hidden="true" />)}
                  {((c.speed ?? 1) !== 1 || c.filter) && <span className="clip-badges">{(c.speed ?? 1) !== 1 && <i>{c.speed}×</i>}{c.filter && <i>{c.filter}</i>}</span>}
                  <span className="trim-handle right" onPointerDown={(e) => down(e, c, "trimR")} onPointerMove={move} onPointerUp={up} aria-hidden="true" />
                </div>;
            })}</div></div>;
        })}
        {peers.map((p) => <div key={p.cid} className="peer-playhead" style={{ left: 132 + p.time * pps, "--pc": p.color } as any} data-testid="peer-playhead" aria-hidden="true"><b>{p.name}</b></div>)}
        <div className="playhead" style={{ left: 132 + time * pps }} aria-hidden="true"><span className="playhead-cap" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (e.buttons) seekFrom(e); }}/></div>
      </div></div>
    {marquee?.moved && <div className="marquee-box" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}</div>;
}
