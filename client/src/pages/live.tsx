import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Radio, ArrowLeft, Play, Pause, MousePointer2, Activity as ActivityIcon, Lock } from "lucide-react";
import { animatedValues } from "@shared/animation";
import { clipDuration, normalizeTimeline, timelineDuration, type Timeline } from "@shared/timeline";
import { api } from "@/lib/api";
import { useAuthedMediaUrl, useMediaTokenLifecycle } from "@/lib/mediaUrl";
import { EMPTY_TIMELINE, round, timecode, type AssetDTO } from "@/lib/editor-model";
import { ForgeNav } from "@/components/forge-shell";
import ForgePreview from "@/components/forge-preview";
import ForgeTimeline, { type TimelineGesture } from "@/components/forge-timeline";

type Session = { projectId: string; name: string; live: boolean; source: string; actor: string | null; updatedAt: number; playing: boolean; time: number; clips: number; watchers: number; rev: number };
type Activity = { seq: number; ts: number; actor: string; kind: string; summary: string; count: number };
type Snapshot = { name: string; time: number; selectedId: string | null; playing: boolean; actor: string | null; source: string; updatedAt: number; watchers: number; activity: Activity[] };
const REFRESH_MS = 100;
const ago = (ts: number, now: number) => { const s = Math.max(0, Math.round((now - ts) / 1000)); return s < 2 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };

function AdminGate({ children }: { children: React.ReactNode }) {
  const me = useQuery<{ scope: string }>({ queryKey: ["/api/auth/me"] });
  if (me.isLoading) return <div className="forge-app"><ForgeNav active="live" /><div className="live-empty">Checking access…</div></div>;
  if (me.data?.scope !== "admin") return <div className="forge-app"><ForgeNav active="live" /><div className="live-empty"><Lock size={26} /><h2>Master admin only</h2><p>Live watching is limited to admin keys. It is view-only: nothing you see here can be changed from this screen.</p></div></div>;
  return <>{children}</>;
}

export function LiveListPage() {
  return <AdminGate><LiveList /></AdminGate>;
}
function LiveList() {
  const [sessions, setSessions] = useState<Session[]>([]), [now, setNow] = useState(Date.now()), [error, setError] = useState("");
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      while (!stop) {
        const t0 = performance.now();
        try { const r = await api<{ now: number; sessions: Session[] }>("GET", "/api/live"); if (!stop) { setSessions(r.sessions); setNow(r.now); setError(""); } } catch (e: any) { if (!stop) setError(e.message); }
        await new Promise((r) => setTimeout(r, Math.max(0, 500 - (performance.now() - t0))));
      }
    };
    loop(); return () => { stop = true; };
  }, []);
  const liveCount = sessions.filter((s) => s.live).length;
  return <div className="forge-app live-page"><ForgeNav active="live" />
    <div className="live-head"><div><h1>Live</h1><p className="muted">Watch any project as it is edited. View only, refreshed every {REFRESH_MS} ms.</p></div><span className={`live-pill ${liveCount ? "on" : ""}`}><Radio size={14} />{liveCount} live now</span></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="live-grid">
      {sessions.map((s) => <a key={s.projectId} className={`live-card ${s.live ? "live" : ""}`} href={`#/live/${s.projectId}`} data-testid={`live-card-${s.projectId}`}>
        <div className="live-card-top"><b>{s.name}</b>{s.live ? <span className="live-dot"><i />Live</span> : <span className="muted">Idle</span>}</div>
        <div className="live-card-meta mono"><span>{s.clips} clip{s.clips === 1 ? "" : "s"}</span><span>{s.live && s.playing ? `Playing ${timecode(s.time, 30)}` : s.live ? `At ${timecode(s.time, 30)}` : ago(s.updatedAt, now)}</span></div>
        <div className="live-card-foot"><span className="muted">{s.actor ? `${s.actor}${s.source === "api" ? " via API" : ""}` : "No activity this session"}</span><span className="watch-chip"><Eye size={13} />Watch</span></div></a>)}
      {!sessions.length && !error && <div className="live-empty"><ActivityIcon size={26} /><h2>No projects yet</h2><p>Projects appear here as soon as they exist.</p></div>}
    </div></div>;
}

export function LiveWatchPage({ params }: { params: { id: string } }) {
  return <AdminGate><Watch id={params.id} /></AdminGate>;
}
const NOOP_GESTURE: TimelineGesture = { begin: () => {}, update: () => {}, end: () => {} };
function Watch({ id }: { id: string }) {
  const mediaUrl = useAuthedMediaUrl();
  const assetsQ = useQuery<{ assets: AssetDTO[] }>({ queryKey: ["/api/media"] });
  const assets = assetsQ.data?.assets ?? [];
  useMediaTokenLifecycle(assets.map((a) => a.id));
  const [timeline, setTimeline] = useState<Timeline>(EMPTY_TIMELINE());
  const [snap, setSnap] = useState<Snapshot | null>(null), [live, setLive] = useState(false), [error, setError] = useState("");
  const [rtt, setRtt] = useState(0), [hz, setHz] = useState(0), [pps, setPps] = useState(48), [clock, setClock] = useState({ time: 0, at: performance.now(), playing: false });
  const [time, setTime] = useState(0), [serverNow, setServerNow] = useState(Date.now());
  // Poll at 10 Hz. Unchanged polls return a few bytes; the timeline is only sent when it changed.
  useEffect(() => {
    let stop = false, rev = -1, trev = -1, ticks: number[] = [];
    const loop = async () => {
      while (!stop) {
        const t0 = performance.now();
        try {
          const r = await api<any>("GET", `/api/live/${id}?since=${rev}&tsince=${trev}`);
          if (stop) return;
          rev = r.rev; setLive(r.live); setServerNow(r.now); setError("");
          if (r.changed) {
            if (r.timeline) { trev = r.timelineRev; setTimeline(normalizeTimeline(r.timeline)); }
            setSnap({ name: r.name, time: r.time, selectedId: r.selectedId, playing: r.playing, actor: r.actor, source: r.source, updatedAt: r.updatedAt, watchers: r.watchers, activity: r.activity });
            setClock({ time: r.time, at: performance.now(), playing: r.playing });
          }
          const done = performance.now(); setRtt(Math.round(done - t0)); ticks = [...ticks.filter((t) => done - t < 1000), done]; setHz(ticks.length);
        } catch (e: any) { if (!stop) setError(e.message); }
        await new Promise((r) => setTimeout(r, Math.max(0, REFRESH_MS - (performance.now() - t0))));
      }
    };
    loop(); return () => { stop = true; };
  }, [id]);
  const duration = timelineDuration(timeline);
  // Between updates, keep the playhead moving smoothly while the editor is playing.
  useEffect(() => {
    if (!clock.playing) { setTime(clock.time); return; }
    let raf = 0;
    const tick = () => { setTime(Math.min(duration || Infinity, clock.time + (performance.now() - clock.at) / 1000)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [clock, duration]);
  const selected = timeline.clips.find((c) => c.id === snap?.selectedId) ?? null, selAsset = assets.find((a) => a.id === selected?.assetId);
  const values = useMemo(() => (selected ? animatedValues(selected, time) : null), [selected, time]);
  const feed = useMemo(() => [...(snap?.activity ?? [])].reverse(), [snap]);
  return <div className="forge-app studio live-watch">
    <ForgeNav active="live" />
    <div className="studio-bar">
      <div className="project-title"><a className="icon-btn" href="#/live" aria-label="Back to live list"><ArrowLeft size={17} /></a><b className="watch-title" data-testid="live-title">{snap?.name ?? "Loading…"}</b>
        {live ? <span className="live-dot big"><i />Live</span> : <span className="muted">Idle</span>}
        <span className="watch-only" title="You can see everything but change nothing"><Eye size={13} />Watch only</span></div>
      <div className="studio-actions"><span className="mono rate-chip" title="Poll rate and round-trip time" data-testid="live-rate">{hz} Hz · {rtt} ms</span></div></div>
    {error && <div className="error-box" role="alert" style={{ margin: 12 }}>{error}</div>}
    <div className="studio-grid">
      <aside className="library" aria-label="Activity"><div className="panel-tabs"><button className="active"><ActivityIcon size={14} /> Activity</button></div>
        <div className="activity-list" data-testid="live-activity">
          {feed.map((a) => <div key={`${a.seq}-${a.count}`} className={`activity-item ${a.kind}`}><span className="activity-who">{a.actor}</span><p>{a.summary}{a.count > 1 ? ` ×${a.count}` : ""}</p><time className="mono">{ago(a.ts, serverNow)}</time></div>)}
          {!feed.length && <div className="library-empty"><ActivityIcon size={24} /><b>Nothing yet</b><p>Edits appear here the moment they happen.</p></div>}</div></aside>
      <main className="monitor"><ForgePreview timeline={timeline} assets={assets} time={time} playing={!!snap?.playing && live} selectedId={snap?.selectedId ?? null} readOnly gesture={NOOP_GESTURE} mediaUrl={mediaUrl} onError={() => {}} onValues={() => {}} muted />
        <div className="transport"><span className="play-btn static" aria-hidden="true">{snap?.playing && live ? <Pause size={20} /> : <Play size={20} />}</span><span className="mono time-big" data-testid="live-time">{timecode(time, timeline.fps)}</span><div className="flex-spacer" /><span className="muted watch-note">{snap?.actor ? `${snap.actor} is ${live ? "editing" : "last to edit"}` : "No one has edited yet"}</span></div></main>
      <aside className="inspector" aria-label="Selection"><div className="inspector-body">
        <div className="inspector-title"><div className="thumb-chip"><MousePointer2 size={15} /></div><div><b>{selected ? (selected.assetId ? selAsset?.filename ?? "Clip" : `“${selected.text}”`) : "Nothing selected"}</b><span className="muted mono">{selected ? `${selected.track} · ${clipDuration(selected).toFixed(2)}s` : "Selection follows the editor"}</span></div></div>
        {values && <dl className="live-values">{Object.entries(values).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{round(v as number)}</dd></div>)}{selected?.keyframes && <div><dt>keyframes</dt><dd className="mono">{Object.values(selected.keyframes).reduce((n, k) => n + k.length, 0)}</dd></div>}</dl>}
        <p className="help-text">Values update as the editor drags, scrubs or plays. This screen cannot edit, upload or save.</p>
        <div className="live-facts"><div><span>Source</span><b>{snap?.source === "api" ? "API client" : snap?.source === "editor" ? "Studio" : snap?.source === "save" ? "Saved copy" : "Saved project"}</b></div><div><span>Last change</span><b>{snap ? ago(snap.updatedAt, serverNow) : "-"}</b></div><div><span>Watchers</span><b>{snap?.watchers ?? 0}</b></div></div></div></aside>
      <section className="timeline-panel" aria-label="Timeline"><ForgeTimeline timeline={timeline} assets={assets} selectedId={snap?.selectedId ?? null} time={time} playing={!!snap?.playing && live} pps={pps} snapping={false} readOnly mediaUrl={mediaUrl} onTrack={() => {}} onFit={() => { const el = document.querySelector(".timeline-scroll") as HTMLElement | null; if (el && duration > 0) setPps(Math.min(260, Math.max(8, Math.floor((el.clientWidth - 160) / duration)))); }} onAddMarker={() => {}} onSelect={() => {}} onSeek={() => {}} onZoom={setPps} gesture={NOOP_GESTURE} onDropAsset={() => {}} onDropEffect={() => {}} onDropFiles={() => {}} onMoveMarker={() => {}} /></section></div></div>;
}
