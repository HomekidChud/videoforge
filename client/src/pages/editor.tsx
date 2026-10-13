import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, SkipBack, SkipForward, Scissors, Undo2, Redo2, Magnet, Plus, Upload, Type, Film, Music2, Image as ImageIcon, Download, Check, AlertCircle, Loader2, FolderOpen, FilePlus2, Trash2, Share2, X, Lock, Globe, ChevronDown, Eye, Sparkles } from "lucide-react";
import { clipDuration, clipEnd, normalizeClip, normalizeTimeline, timelineDuration, type Clip, type Timeline } from "@shared/timeline";
import { ANIMATABLE, clamp, valueAt, type AnimationProperty, type Keyframe } from "@shared/animation";
import { TITLE_PRESETS, motionPreset } from "@shared/presets";
import { api, API_BASE } from "@/lib/api";
import { loadStoredKey } from "@/lib/apiKey";
import { useAuthedMediaUrl, useMediaTokenLifecycle } from "@/lib/mediaUrl";
import { EMPTY_TIMELINE, clampClipPatch, duplicateClip, newClip, rippleDelete, round, sameTimeline, snapshot, splitClip, timecode, uid, type AssetDTO, type ProjectDTO, type RenderDTO } from "@/lib/editor-model";
import { ForgeNav } from "@/components/forge-shell";
import ForgePreview from "@/components/forge-preview";
import ForgeTimeline, { type TimelineGesture } from "@/components/forge-timeline";
import { ClipInspector, MultiInspector, ProjectInspector } from "@/components/forge-inspector";
import { setTransition, incomingTransition, TRANSITIONS } from "@shared/transitions";
import { type Peer } from "@/components/forge-presence";
import ForgeEffects, { type Effect } from "@/components/forge-effects";

type SaveState = "empty" | "saved" | "dirty" | "saving" | "error" | "readonly";
type Me = { id: string; scope: "read" | "write" | "admin" };

function uploadWithProgress(files: File[], onProgress: (pct: number) => void): Promise<{ assets: AssetDTO[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), form = new FormData(), key = loadStoredKey();
    files.forEach((f) => form.append("files", f));
    xhr.open("POST", `${API_BASE}/api/media/upload`);
    if (key) xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = {}; try { body = JSON.parse(xhr.responseText); } catch { /* non-json */ }
      xhr.status >= 200 && xhr.status < 300 ? resolve(body) : reject(new Error(body.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export default function EditorPage() {
  const qc = useQueryClient();
  const mediaUrl = useAuthedMediaUrl();
  const me = useQuery<Me>({ queryKey: ["/api/auth/me"] });
  const readOnly = me.data?.scope === "read";
  const canPublish = me.data?.scope === "admin";

  // ---------------------------------------------------------------- timeline state with history
  const [timeline, setTimelineState] = useState<Timeline>(EMPTY_TIMELINE());
  const tlRef = useRef(timeline);
  const past = useRef<Timeline[]>([]), future = useRef<Timeline[]>([]);
  const gestureBase = useRef<Timeline | null>(null);
  const [revision, setRevision] = useState(0), [, bumpHistory] = useState(0);
  const apply = useCallback((next: Timeline) => { tlRef.current = next; setTimelineState(next); setRevision((r) => r + 1); }, []);
  const mutate = useCallback((fn: (t: Timeline) => Timeline) => {
    const base = tlRef.current, next = fn(base);
    if (sameTimeline(base, next)) return;
    past.current = [...past.current.slice(-99), snapshot(base)]; future.current = []; bumpHistory((n) => n + 1); apply(next);
  }, [apply]);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(snapshot(tlRef.current)); bumpHistory((n) => n + 1); apply(p); }, [apply]);
  const redo = useCallback(() => { const n = future.current.pop(); if (!n) return; past.current.push(snapshot(tlRef.current)); bumpHistory((x) => x + 1); apply(n); }, [apply]);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled project");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [sel, setSel] = useState<string[]>([]);
  const [followId, setFollowId] = useState<string | null>(null), followRef = useRef<string | null>(null); followRef.current = followId;
  const selectedId = sel[sel.length - 1] ?? null;
  const setSelectedId = useCallback((id: string | null) => { setSel(id ? [id] : []); }, []);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(64), [snapping, setSnapping] = useState(true);
  const [panel, setPanel] = useState<"media" | "effects" | "projects">("media");
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [upload, setUpload] = useState<{ pct: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("empty"), [saveError, setSaveError] = useState("");
  const [exportOpen, setExportOpen] = useState(false), [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const toast = useCallback((text: string, tone: "info" | "error" = "info") => { setNotice({ text, tone }); }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), notice.tone === "error" ? 7000 : 3000); return () => clearTimeout(t); }, [notice]);

  const assetsQ = useQuery<{ assets: AssetDTO[] }>({ queryKey: ["/api/media"] });
  const projectsQ = useQuery<{ projects: ProjectDTO[] }>({ queryKey: ["/api/projects"] });
  const assets = assetsQ.data?.assets ?? [];
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const duration = timelineDuration(timeline);
  const renderQ = useQuery<RenderDTO>({ queryKey: ["/api/renders", renderJobId], enabled: !!renderJobId, refetchInterval: (q) => (q.state.data && ["done", "error"].includes(q.state.data.status) ? false : 1200) });
  useMediaTokenLifecycle([...assets.map((a) => a.id), renderJobId]);

  // ---------------------------------------------------------------- gestures
  const gesture: TimelineGesture = useMemo(() => ({
    begin: () => { if (!gestureBase.current) gestureBase.current = snapshot(tlRef.current); },
    update: (id, patch) => {
      const t = tlRef.current, c = t.clips.find((x) => x.id === id); if (!c) return;
      try { apply({ ...t, clips: t.clips.map((x) => (x.id === id ? clampClipPatch(x, patch, byId.get(x.assetId)) : x)) }); } catch { /* invalid intermediate value */ }
    },
    end: () => { const base = gestureBase.current; gestureBase.current = null; if (base && !sameTimeline(base, tlRef.current)) { past.current = [...past.current.slice(-99), base]; future.current = []; bumpHistory((n) => n + 1); } },
  }), [apply, byId]);
  const patchClip = useCallback((id: string, p: Partial<Clip>, live = false) => { if (live && gestureBase.current) gesture.update(id, p); else { gesture.begin(); gesture.update(id, p); gesture.end(); } }, [gesture]);

  // ---------------------------------------------------------------- playback clock
  const timeRef = useRef(0); timeRef.current = time;
  const stopFollowRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const t = timeRef.current + (now - last) / 1000; last = now;
      if (t >= duration) { setTime(duration); setPlaying(false); return; }
      setTime(t); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, duration]);
  const togglePlay = useCallback(() => { stopFollowRef.current(); if (!duration) return; if (!playing && timeRef.current >= duration - 0.05) setTime(0); setPlaying((p) => !p); }, [duration, playing]);
  const seek = useCallback((t: number) => { stopFollowRef.current(); setTime(Math.min(Math.max(0, t), Math.max(duration, 0))); }, [duration]);

  // ---------------------------------------------------------------- persistence
  const saving = useRef<Promise<void> | null>(null), savedRevision = useRef(0), idRef = useRef<string | null>(null), nameRef = useRef(projectName);
  idRef.current = projectId; nameRef.current = projectName;
  const saveNow = useCallback(async (): Promise<void> => {
    if (readOnly) return;
    while (saving.current) await saving.current;
    const rev = revisionRef.current;
    if (rev === savedRevision.current || (!idRef.current && !tlRef.current.clips.length)) { setSaveState(idRef.current ? "saved" : "empty"); return; }
    const job = (async () => {
      setSaveState("saving"); setSaveError("");
      try {
        const body = { name: nameRef.current, timeline: tlRef.current };
        if (!idRef.current) { const p = await api<ProjectDTO>("POST", "/api/projects", body); idRef.current = p.id; setProjectId(p.id); setVisibility(p.visibility ?? "private"); }
        else await api<ProjectDTO>("PUT", `/api/projects/${idRef.current}`, body);
        savedRevision.current = rev; setSaveState(revisionRef.current === rev ? "saved" : "dirty");
        qc.invalidateQueries({ queryKey: ["/api/projects"] });
      } catch (e: any) { setSaveState("error"); setSaveError(e.message); }
    })();
    saving.current = job; try { await job; } finally { saving.current = null; }
  }, [qc, readOnly]);
  const revisionRef = useRef(0); revisionRef.current = revision;
  useEffect(() => { if (readOnly) { setSaveState("readonly"); return; } if (!revision || revision === savedRevision.current) return; setSaveState((s) => (s === "saving" ? s : "dirty")); const t = setTimeout(() => { saveNow(); }, 1400); return () => clearTimeout(t); }, [revision, readOnly, saveNow, projectName]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving" || saveState === "error") { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [saveState]);

  // Replace the whole document (open / new project) and mark it as already saved.
  function loadDocument(t: Timeline, id: string | null, name: string, vis: "private" | "public") {
    past.current = []; future.current = []; gestureBase.current = null;
    const nextRev = revisionRef.current + 1; savedRevision.current = nextRev;
    tlRef.current = t; setTimelineState(t); setRevision(nextRev);
    idRef.current = id; setProjectId(id); setProjectName(name); setVisibility(vis); setSelectedId(null); setTime(0); setPlaying(false); setRenderJobId(null); setExportOpen(false);
    setSaveState(id ? "saved" : "empty"); setSaveError(""); bumpHistory((n) => n + 1);
  }
  async function openProject(p: ProjectDTO) { await saveNow(); loadDocument(normalizeTimeline(p.timeline), p.id, p.name, p.visibility ?? "private"); setPanel("media"); }
  async function newProject() { await saveNow(); loadDocument(EMPTY_TIMELINE(), null, "Untitled project", "private"); }
  const deleteProject = useMutation({ mutationFn: (id: string) => api("DELETE", `/api/projects/${id}`), onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["/api/projects"] }); if (id === projectId) newProject(); toast("Project deleted"); }, onError: (e) => toast(e.message, "error") });

  // ---------------------------------------------------------------- editing commands
  const endOfVideo = () => tlRef.current.clips.filter((c) => c.track === "video").reduce((m, c) => Math.max(m, clipEnd(c)), 0);
  const addAsset = useCallback((asset: AssetDTO, track?: Clip["track"], start?: number) => {
    if (readOnly) return toast("This key is read-only.", "error");
    const clip = newClip(asset, start ?? (asset.kind === "audio" ? 0 : endOfVideo()), track); mutate((t) => ({ ...t, clips: [...t.clips, clip] })); setSelectedId(clip.id);
  }, [mutate, readOnly, toast]);
  const [titleMenu, setTitleMenu] = useState(false);
  const addTitle = (preset: (typeof TITLE_PRESETS)[number] | null = null) => {
    if (readOnly) return; setTitleMenu(false);
    const clip: Clip = { id: uid(), assetId: "", track: "overlay", start: round(time), inPoint: 0, outPoint: 3, volume: 1, muted: false, text: preset?.text ?? "Your title", textSize: preset?.textSize ?? 8, ...(preset ? { y: preset.y, textBg: preset.textBg } : {}) };
    mutate((t) => ({ ...t, clips: [...t.clips, normalizeClip(clip)] })); setSelectedId(clip.id);
  };
  const selectedIds = useMemo(() => sel.filter((id) => timeline.clips.some((c) => c.id === id)), [sel, timeline.clips]);
  const selIdsRef = useRef<string[]>([]); selIdsRef.current = selectedIds;
  const selected = timeline.clips.find((c) => c.id === selectedIds[selectedIds.length - 1]) ?? null;
  const stopFollow = useCallback(() => { if (followRef.current) { followRef.current = null; setFollowId(null); } }, []);
  const onSelect = useCallback((id: string | null, mode: "replace" | "toggle" | "keep" = "replace") => {
    stopFollow();
    setSel((cur) => !id ? [] : mode === "toggle" ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : mode === "keep" && cur.includes(id) ? [...cur.filter((x) => x !== id), id] : [id]);
  }, [stopFollow]);
  const onSelectMany = useCallback((ids: string[]) => { stopFollow(); setSel(ids); }, [stopFollow]);
  const split = useCallback(() => {
    const target = selected ?? [...tlRef.current.clips].filter((c) => timeRef.current > c.start + 0.1 && timeRef.current < clipEnd(c) - 0.1).sort((a, b) => (a.track === "video" ? -1 : 0) - (b.track === "video" ? -1 : 0))[0];
    if (!target) return toast("Move the playhead over a clip to split it.");
    const next = splitClip(tlRef.current, target.id, timeRef.current);
    if (!next) return toast("Place the playhead inside the clip, at least 0.1s from its edges.");
    mutate(() => next); setSelectedId(target.id);
  }, [selected, mutate, toast]);
  const remove = useCallback((ripple = false) => {
    const ids = selIdsRef.current; if (!ids.length || readOnly) return;
    mutate((t) => ripple ? ids.reduce((acc, id) => rippleDelete(acc, id), t) : { ...t, clips: t.clips.filter((c) => !ids.includes(c.id)) }); setSelectedId(null);
  }, [mutate, readOnly, setSelectedId]);
  const duplicate = useCallback(() => {
    const ids = selIdsRef.current; if (!ids.length || readOnly) return;
    let t = tlRef.current; const made: string[] = [];
    for (const id of ids) { const r = duplicateClip(t, id); if (r) { t = r.timeline; made.push(r.id); } }
    if (made.length) { mutate(() => t); setSel(made); }
  }, [mutate, readOnly]);
  const patchClips = useCallback((ids: string[], p: Partial<Clip>) => { if (readOnly) return; gesture.begin(); ids.forEach((id) => gesture.update(id, p)); gesture.end(); }, [gesture, readOnly]);
  const alignClips = useCallback((mode: "start" | "end" | "chain" | "distribute") => {
    const picked = tlRef.current.clips.filter((c) => selIdsRef.current.includes(c.id)).sort((a, b) => a.start - b.start); if (picked.length < 2 || readOnly) return;
    const starts = new Map<string, number>(), first = picked[0].start, last = Math.max(...picked.map(clipEnd));
    if (mode === "start") picked.forEach((c) => starts.set(c.id, first));
    else if (mode === "end") picked.forEach((c) => starts.set(c.id, round(Math.max(0, last - clipDuration(c)))));
    else { const total = picked.reduce((n, c) => n + clipDuration(c), 0), gap = mode === "chain" ? 0 : Math.max(0, (last - first - total) / (picked.length - 1)); let at = first; picked.forEach((c) => { starts.set(c.id, round(at)); at += clipDuration(c) + gap; }); }
    mutate((t) => ({ ...t, clips: t.clips.map((c) => (starts.has(c.id) ? { ...c, start: starts.get(c.id)! } : c)) }));
  }, [mutate, readOnly]);
  const applyTransition = useCallback((clipId: string, type: string, duration?: number) => {
    if (readOnly) return;
    try { const next = setTransition(tlRef.current, clipId, type, duration, true); mutate(() => next); } catch (e: any) { toast(e.message, "error"); }
  }, [mutate, readOnly, toast]);
  const transitionSelected = useCallback((type: string) => {
    const vids = tlRef.current.clips.filter((c) => selIdsRef.current.includes(c.id) && c.track === "video" && c.assetId).sort((a, b) => a.start - b.start);
    try { let t = tlRef.current, n = 0; for (const c of vids.slice(1)) { t = setTransition(t, c.id, type, 0.6, true); n++; } if (n) { const next = t; mutate(() => next); toast(type === "none" ? "Transitions removed" : `${n} transition${n > 1 ? "s" : ""} added`); } } catch (e: any) { toast(e.message, "error"); }
  }, [mutate, toast]);
  // Edits to animatable values write a keyframe at the playhead when the property is animated.
  const setValues = useCallback((id: string, values: Partial<Record<AnimationProperty, number>>, live = false) => {
    const clip = tlRef.current.clips.find((c) => c.id === id); if (!clip) return;
    const fps = tlRef.current.fps, local = round(clamp(Math.round((timeRef.current - clip.start) * fps) / fps, 0, clipDuration(clip)));
    const patch: Partial<Clip> = {}; let keyframes = clip.keyframes;
    (Object.keys(values) as AnimationProperty[]).forEach((prop) => {
      const value = clamp(values[prop]!, ANIMATABLE[prop].min, ANIMATABLE[prop].max), frames = clip.keyframes?.[prop];
      if (frames?.length) {
        const list: Keyframe[] = frames.filter((k) => Math.abs(k.time - local) > 0.5 / fps), near = frames.find((k) => Math.abs(k.time - local) <= 0.5 / fps);
        list.push({ time: near?.time ?? local, value: round(value), easing: near?.easing ?? "ease-in-out" }); list.sort((a, b) => a.time - b.time);
        keyframes = { ...keyframes, [prop]: list };
      } else (patch as any)[prop] = round(value);
    });
    if (keyframes !== clip.keyframes) patch.keyframes = keyframes;
    patchClip(id, patch, live);
  }, [patchClip]);
  const toggleKey = useCallback((id: string, prop: AnimationProperty) => {
    const clip = tlRef.current.clips.find((c) => c.id === id); if (!clip) return;
    const fps = tlRef.current.fps, local = round(clamp(Math.round((timeRef.current - clip.start) * fps) / fps, 0, clipDuration(clip))), frames = clip.keyframes?.[prop] ?? [];
    const exists = frames.some((k) => Math.abs(k.time - local) <= 0.5 / fps);
    const list = exists ? frames.filter((k) => Math.abs(k.time - local) > 0.5 / fps) : [...frames, { time: local, value: round(valueAt(clip, prop, local)), easing: "ease-in-out" as const }].sort((a, b) => a.time - b.time);
    patchClip(id, { keyframes: { ...clip.keyframes, [prop]: list } });
  }, [patchClip]);
  const addMarker = useCallback(() => { if (readOnly) return; mutate((t) => ({ ...t, markers: [...(t.markers ?? []), { id: uid(), time: round(timeRef.current), label: `Marker ${(t.markers?.length ?? 0) + 1}`, color: "#f6a447" }].sort((a, b) => a.time - b.time) })); }, [mutate, readOnly]);
  const removeMarker = useCallback((id: string) => mutate((t) => ({ ...t, markers: (t.markers ?? []).filter((m) => m.id !== id) })), [mutate]);
  const setTrack = useCallback((track: Clip["track"], p: { muted?: boolean; hidden?: boolean }) => mutate((t) => ({ ...t, tracks: { ...t.tracks, [track]: { ...t.tracks?.[track], ...p } } })), [mutate]);
  const clipboard = useRef<Clip[]>([]);
  const copyClip = useCallback(() => { const picked = tlRef.current.clips.filter((c) => selIdsRef.current.includes(c.id)); if (picked.length) { clipboard.current = JSON.parse(JSON.stringify(picked)); toast(picked.length > 1 ? `${picked.length} clips copied` : "Clip copied"); } }, [toast]);
  const pasteClip = useCallback(() => {
    const src = clipboard.current; if (!src.length || readOnly) return;
    const base = Math.min(...src.map((c) => c.start)), made = src.map((c) => ({ ...JSON.parse(JSON.stringify(c)), id: uid(), start: round(timeRef.current + c.start - base), transitionIn: undefined }) as Clip);
    mutate((t) => ({ ...t, clips: [...t.clips, ...made] })); setSel(made.map((c) => c.id));
  }, [mutate, readOnly]);
  const fitTimeline = () => { const el = document.querySelector(".timeline-scroll") as HTMLElement | null; if (el && duration > 0) setPps(Math.min(260, Math.max(8, Math.floor((el.clientWidth - 160) / duration)))); };

  const moveMarker = useCallback((id: string, at: number) => { const t = tlRef.current; apply({ ...t, markers: (t.markers ?? []).map((m) => (m.id === id ? { ...m, time: at } : m)) }); }, [apply]);
  // Effects: applied by click to the selection, or dropped on a clip, a lane or the preview.
  const applyEffect = useCallback((effect: Effect, target: { clipId?: string; track?: Clip["track"]; start?: number } = {}) => {
    if (readOnly) return toast("This key is read-only.", "error");
    if (effect.kind === "title") {
      const preset = TITLE_PRESETS.find((p) => p.id === effect.id) ?? null; const at = target.start ?? timeRef.current;
      const clip: Clip = { id: uid(), assetId: "", track: "overlay", start: round(at), inPoint: 0, outPoint: 3, volume: 1, muted: false, text: preset?.text ?? "Your title", textSize: preset?.textSize ?? 8, ...(preset ? { y: preset.y, textBg: preset.textBg } : {}) };
      mutate((t) => ({ ...t, clips: [...t.clips, normalizeClip(clip)] })); setSelectedId(clip.id); toast(`${effect.label} title added`); return;
    }
    const clips = tlRef.current.clips, t = timeRef.current;
    if (effect.kind === "transition") {
      const id = target.clipId ?? selectedId ?? clips.filter((c) => c.track === "video" && c.assetId && t >= c.start && t < clipEnd(c)).sort((a, b) => b.start - a.start)[0]?.id;
      if (!id) return toast("Select a video clip, or drop the transition onto one.");
      const c = clips.find((x) => x.id === id);
      if (!c || c.track !== "video") return toast("Transitions go on a video clip that follows another.");
      applyTransition(id, effect.id); setSelectedId(id); return toast(`${effect.label} applied`);
    }
    const many = target.clipId ? (selIdsRef.current.includes(target.clipId) ? selIdsRef.current : [target.clipId]) : selIdsRef.current;
    if (many.length > 1 && effect.kind !== "motion") { const hit = clips.filter((c) => many.includes(c.id) && c.track !== "audio"); if (!hit.length) return toast("That effect needs a picture. Pick a video, image or title."); patchClips(hit.map((c) => c.id), effect.kind === "filter" ? { filter: effect.id } as Partial<Clip> : effect.patch); return toast(`${effect.label} applied to ${hit.length} clips`); }
    if (many.length > 1) { const hit = clips.filter((c) => many.includes(c.id) && c.track !== "audio"); gesture.begin(); hit.forEach((c) => gesture.update(c.id, motionPreset(c, effect.id))); gesture.end(); return toast(`${effect.label} applied to ${hit.length} clips`); }
    const clip = clips.find((c) => c.id === (target.clipId ?? selectedId))
      ?? clips.filter((c) => c.track !== "audio" && t >= c.start && t < clipEnd(c)).sort((a, b) => (a.track === "overlay" ? -1 : 0) - (b.track === "overlay" ? -1 : 0))[0];
    if (!clip) return toast("Select a clip, or drop the effect onto one.");
    const audioOnly = clip.track === "audio" || byId.get(clip.assetId)?.kind === "audio";
    if (audioOnly && effect.kind !== "patch") return toast("That effect needs a picture. Drop it on a video, image or title.");
    const patch = effect.kind === "motion" ? motionPreset(clip, effect.id) : effect.kind === "filter" ? ({ filter: effect.id } as Partial<Clip>) : effect.patch;
    patchClip(clip.id, patch); setSelectedId(clip.id); toast(`${effect.label} applied`);
  }, [readOnly, toast, mutate, selectedId, patchClip, patchClips, applyTransition, setSelectedId, gesture, byId]);

  // Live: publish the working copy about ten times a second so master admins can watch.
  const [watchers, setWatchers] = useState(0);
  const pub = useRef({ timer: 0 as any, last: 0 }), selectedRef = useRef<string | null>(null), playingRef = useRef(false);
  selectedRef.current = selectedId; playingRef.current = playing;
  const publish = useCallback(() => {
    const id = idRef.current; if (!id || readOnly) return; pub.current.last = Date.now();
    api<{ watchers: number }>("POST", `/api/live/${id}/publish`, { timeline: tlRef.current, time: timeRef.current, selectedId: selectedRef.current, playing: playingRef.current, name: nameRef.current }).then((r) => setWatchers(r.watchers)).catch(() => {});
  }, [readOnly]);
  useEffect(() => {
    if (!projectId || readOnly || pub.current.timer) return;
    pub.current.timer = setTimeout(() => { pub.current.timer = 0; publish(); }, Math.max(0, 100 - (Date.now() - pub.current.last)));
  }, [timeline, time, selectedId, playing, projectId, projectName, readOnly, publish]);
  useEffect(() => { if (!projectId || readOnly) { setWatchers(0); return; } const i = setInterval(publish, 4000); return () => clearInterval(i); }, [projectId, readOnly, publish]);

  // Presence: live cursors, playheads and selections of everyone in this project, plus Follow mode.
  const cid = useRef(`c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`).current;
  const [peers, setPeers] = useState<(Peer & { scope?: string })[]>([]);
  const cursorRef = useRef<any>(null), peersRef = useRef<Peer[]>([]); peersRef.current = peers;
  const onCursor = useCallback((c: any) => { cursorRef.current = c; }, []);
  stopFollowRef.current = stopFollow;
  useEffect(() => {
    if (!projectId) { setPeers([]); return; }
    let stop = false, busy = false;
    const post = (extra: object = {}) => api<{ peers: Peer[] }>("POST", `/api/projects/${projectId}/presence`, { cid, time: timeRef.current, playing: playingRef.current, selectedIds: selIdsRef.current, cursor: cursorRef.current, ...extra });
    const tick = async () => {
      if (busy || document.hidden) return; busy = true;
      try { const r = await post(); if (!stop) setPeers((prev) => (JSON.stringify(prev) === JSON.stringify(r.peers) ? prev : r.peers)); } catch { /* offline: try again next tick */ } finally { busy = false; }
    };
    tick(); const i = setInterval(tick, 150);
    return () => { stop = true; clearInterval(i); post({ leave: true }).catch(() => {}); };
  }, [projectId, cid]);
  useEffect(() => {
    if (!followId) return;
    const p = peers.find((x) => x.cid === followId);
    if (!p) { toast("The person you were following left"); stopFollow(); return; }
    if (p.playing) { if (!playingRef.current) setPlaying(true); if (Math.abs(p.time - timeRef.current) > 0.3) setTime(p.time); }
    else { if (playingRef.current) setPlaying(false); if (Math.abs(p.time - timeRef.current) > 0.02) setTime(p.time); }
    const ids = p.selectedIds.filter((id) => tlRef.current.clips.some((c) => c.id === id));
    if (ids.join() !== selIdsRef.current.join()) setSel(ids);
  }, [peers, followId, toast, stopFollow]);
  const followed = peers.find((p) => p.cid === followId);

  const trimToPlayhead = (edge: "in" | "out") => {
    if (!selected || readOnly) return; const rel = time - selected.start, speed = selected.assetId ? selected.speed ?? 1 : 1;
    if (rel <= 0.1 || rel >= clipDuration(selected) - 0.1) return toast("Place the playhead inside the selected clip.");
    patchClip(selected.id, edge === "in" ? { start: round(time), inPoint: round(selected.inPoint + rel * speed) } : { outPoint: round(selected.inPoint + rel * speed) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement, typing = ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && (el as HTMLInputElement).type !== "range" && (el as HTMLInputElement).type !== "checkbox";
      if (typing || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (key === " " && el.tagName !== "BUTTON") { e.preventDefault(); togglePlay(); }
      else if (mod && key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && key === "y") { e.preventDefault(); redo(); }
      else if (mod && key === "d") { e.preventDefault(); duplicate(); }
      else if (mod && key === "c") { copyClip(); } else if (mod && key === "v") { e.preventDefault(); pasteClip(); }
      else if (!mod && key === "m") addMarker();
      else if (mod && key === "a") { e.preventDefault(); onSelectMany(tlRef.current.clips.map((c) => c.id)); }
      else if (e.key === "Escape") { stopFollow(); setSel([]); }
      else if (mod && key === "s") { e.preventDefault(); saveNow(); }
      else if (!mod && key === "s") split();
      else if (e.key === "Delete" || e.key === "Backspace") { if (selectedIds.length) { e.preventDefault(); remove(e.shiftKey); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seek(time - (e.shiftKey ? 1 : 1 / timeline.fps)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seek(time + (e.shiftKey ? 1 : 1 / timeline.fps)); }
      else if (e.key === "Home") { e.preventDefault(); seek(0); } else if (e.key === "End") { e.preventDefault(); seek(duration); }
      else if (e.key === "[") trimToPlayhead("in"); else if (e.key === "]") trimToPlayhead("out");
      else if (e.key === "+" || e.key === "=") setPps((p) => Math.min(260, Math.round(p * 1.25))); else if (e.key === "-") setPps((p) => Math.max(8, Math.round(p * 0.8)));
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- upload / export
  async function importFiles(list: FileList | File[], place?: { track: Clip["track"]; start: number }) {
    const files = Array.from(list).filter((f) => /^(video|audio|image)\//.test(f.type) || /\.(mp4|mov|mkv|webm|mp3|wav|m4a|png|jpe?g|webp|gif)$/i.test(f.name));
    if (!files.length) return toast("Choose video, audio or image files.", "error");
    if (readOnly) return toast("This key is read-only.", "error");
    setUpload({ pct: 0 });
    try { const r = await uploadWithProgress(files, (pct) => setUpload({ pct })); await qc.invalidateQueries({ queryKey: ["/api/media"] }); toast(`Imported ${r.assets.length} file${r.assets.length > 1 ? "s" : ""}`);
      if (place) { let at = place.start; const added: Clip[] = []; for (const a of r.assets) { const track = a.kind === "audio" ? "audio" : place.track === "audio" ? "video" : place.track; const c = newClip(a, at, track); added.push(c); if (a.kind !== "audio") at = clipEnd(c); } if (added.length) { mutate((t) => ({ ...t, clips: [...t.clips, ...added] })); setSelectedId(added[0].id); } } }
    catch (e: any) { toast(e.message, "error"); } finally { setUpload(null); }
  }
  const startRender = useMutation({
    mutationFn: async () => { await saveNow(); if (!idRef.current) throw new Error("Add at least one clip before exporting."); return api<{ jobId: string }>("POST", "/api/renders", { projectId: idRef.current }); },
    onSuccess: (r) => { setRenderJobId(r.jobId); setExportOpen(true); }, onError: (e) => { toast(e.message, "error"); },
  });
  const toggleVisibility = async () => {
    if (!projectId) return; const next = visibility === "private" ? "public" : "private";
    try { await api("PUT", `/api/projects/${projectId}`, { visibility: next }); setVisibility(next); qc.invalidateQueries({ queryKey: ["/api/projects"] }); toast(next === "public" ? "Project is now public. Render a video to share it." : "Project is private again."); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const copyPublicLink = async () => { try { await navigator.clipboard.writeText(`${location.href.split("#")[0]}#/share/${projectId}`); toast("Public link copied"); } catch { toast("Couldn’t access the clipboard.", "error"); } };
  const setProjectSettings = (p: { fps?: number; resolution?: { width: number; height: number }; background?: string }) => mutate((t) => ({ ...t, ...p }));

  const render = renderQ.data, renderUrl = render?.status === "done" && renderJobId ? mediaUrl(renderJobId, `/api/renders/${renderJobId}/download`) : "";
  const saveLabel = { empty: "Not saved yet", saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving…", error: "Save failed", readonly: "Read-only key" }[saveState];

  return <div className="forge-app studio" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); importFiles(e.dataTransfer.files); } }}>
    <ForgeNav active="editor" />
    <div className="studio-bar">
      <div className="project-title"><input aria-label="Project name" className="title-input" value={projectName} disabled={readOnly} maxLength={200} onChange={(e) => setProjectName(e.target.value)} data-testid="input-project-title" />
        <span className={`save-state ${saveState}`} role="status" data-testid="text-save-state" title={saveError}>{saveState === "saving" ? <Loader2 size={13} className="spin" /> : saveState === "error" ? <AlertCircle size={13} /> : saveState === "saved" ? <Check size={13} /> : null}{saveLabel}</span>
        {saveState === "error" && <button className="ghost-link" onClick={() => saveNow()}>Retry</button>}
        {peers.length > 0 && <div className="presence-bar" data-testid="presence-bar" aria-label="People in this project">{peers.map((p) => <button key={p.cid} className={`peer-avatar ${followId === p.cid ? "following" : ""}`} style={{ background: p.color }} title={followId === p.cid ? `Stop following ${p.name}` : `Follow ${p.name}`} aria-pressed={followId === p.cid} onClick={() => (followId === p.cid ? stopFollow() : setFollowId(p.cid))} data-testid={`follow-${p.cid}`}>{p.name.slice(0, 1).toUpperCase()}</button>)}
          {followed && <span className="follow-chip" style={{ borderColor: followed.color }} data-testid="follow-chip">Following {followed.name}<button className="ghost-link" onClick={stopFollow}>Stop</button></span>}</div>}
        {watchers > 0 && <span className="watch-badge" title="A master admin is watching this project live. They cannot edit it."><Eye size={13} />{watchers} watching</span>}</div>
      <div className="studio-actions">
        <button className="icon-btn" onClick={undo} disabled={!past.current.length || readOnly} aria-label="Undo" title="Undo (Ctrl+Z)" data-testid="button-undo"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!future.current.length || readOnly} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={17} /></button>
        <span className="divider" />
        <button className={`icon-btn ${snapping ? "active accent" : ""}`} aria-pressed={snapping} onClick={() => setSnapping(!snapping)} aria-label="Toggle snapping" title="Snapping"><Magnet size={17} /></button>
        <div className="menu-wrap hide-sm"><button className="secondary-btn" onClick={() => addTitle()} disabled={readOnly} data-testid="button-add-title"><Type size={15} />Add title</button><button className="icon-btn menu-caret" aria-label="Title styles" aria-expanded={titleMenu} disabled={readOnly} onClick={() => setTitleMenu(!titleMenu)} data-testid="button-title-menu"><ChevronDown size={14} /></button>{titleMenu && <div className="menu-pop" role="menu">{TITLE_PRESETS.map((p) => <button key={p.id} role="menuitem" onClick={() => addTitle(p)} data-testid={`title-${p.id}`}>{p.label}</button>)}</div>}</div>
        <button className="secondary-btn hide-sm" onClick={() => setSelectedId(null)} title="Project settings and sharing"><Share2 size={15} />{visibility === "public" ? "Public" : "Share"}</button>
        <button className="primary-btn" onClick={() => startRender.mutate()} disabled={!timeline.clips.length || startRender.isPending || (readOnly && false)} data-testid="button-export">{startRender.isPending ? <Loader2 size={15} className="spin" /> : <Download size={15} />}Export</button>
      </div></div>

    <div className="studio-grid">
      <aside className="library" aria-label="Library">
        <div className="panel-tabs"><button className={panel === "media" ? "active" : ""} onClick={() => setPanel("media")}>Media</button><button className={panel === "effects" ? "active" : ""} onClick={() => setPanel("effects")} data-testid="tab-effects">Effects</button><button className={panel === "projects" ? "active" : ""} onClick={() => setPanel("projects")}>Projects</button></div>
        {panel === "effects" ? <ForgeEffects disabled={readOnly} onApply={(e) => applyEffect(e)} /> : panel === "media" ? <>
          <label className={`dropzone ${readOnly ? "disabled" : ""}`} data-testid="button-upload">{upload ? <><Loader2 className="spin" size={18} /><span>Uploading {Math.round(upload.pct * 100)}%</span><i style={{ width: `${upload.pct * 100}%` }} /></> : <><Upload size={19} /><b>Import media</b><span>Video, audio or images — or drop files anywhere</span></>}
            <input type="file" multiple accept="video/*,audio/*,image/*" disabled={readOnly || !!upload} onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ""; }} /></label>
          <div className="asset-list">
            {assetsQ.isLoading && Array.from({ length: 3 }, (_, i) => <div key={i} className="asset-card skeleton" />)}
            {assetsQ.error && <p className="error-box">{assetsQ.error.message}</p>}
            {!assetsQ.isLoading && !assets.length && <div className="library-empty"><Film size={24} /><b>No media yet</b><p>Import footage to start building your timeline.</p></div>}
            {assets.map((a) => <div key={a.id} className="asset-card" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/x-vf-asset", a.id); e.dataTransfer.effectAllowed = "copy"; }} data-testid={`card-asset-${a.id}`}>
              <div className="asset-thumb">{a.kind === "audio" ? <Music2 size={22} /> : <img src={mediaUrl(a.id, `/api/media/${a.id}/thumb`) || undefined} crossOrigin="anonymous" alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />}<span className="kind-pill">{a.kind === "audio" ? <Music2 size={11} /> : a.kind === "image" ? <ImageIcon size={11} /> : <Film size={11} />}{a.kind === "image" ? "IMG" : timecode(a.duration, 30).slice(0, 5)}</span></div>
              <div className="asset-meta"><span title={a.filename}>{a.filename}</span><button className="icon-btn" disabled={readOnly} aria-label={`Add ${a.filename} to timeline`} title="Add to timeline" onClick={() => addAsset(a)}><Plus size={16} /></button></div></div>)}
          </div></> : <div className="asset-list">
          <button className="secondary-btn full" onClick={newProject} disabled={readOnly}><FilePlus2 size={15} />New project</button>
          {(projectsQ.data?.projects ?? []).map((p) => <div className={`project-card ${p.id === projectId ? "current" : ""}`} key={p.id}><button onClick={() => openProject(p)} data-testid={`button-load-project-${p.id}`}><FolderOpen size={16} /><span><b>{p.name}</b><small className="muted">{p.timeline.clips.length} clips · {p.visibility === "public" ? "Public" : "Private"}</small></span>{p.visibility === "public" ? <Globe size={14} /> : <Lock size={14} />}</button><button className="icon-btn danger" disabled={readOnly} aria-label={`Delete ${p.name}`} onClick={() => { if (confirm(`Delete “${p.name}”? This cannot be undone.`)) deleteProject.mutate(p.id); }}><Trash2 size={14} /></button></div>)}
          {!projectsQ.isLoading && !projectsQ.data?.projects.length && <div className="library-empty"><FolderOpen size={24} /><b>No saved projects</b><p>Projects save automatically as you edit.</p></div>}</div>}
      </aside>

      <main className="monitor"><ForgePreview timeline={timeline} assets={assets} time={time} playing={playing} selectedId={selectedId} readOnly={readOnly} gesture={gesture} mediaUrl={mediaUrl} peers={peers} onCursor={onCursor} onError={(m) => toast(m, "error")} onValues={(id, v, live) => setValues(id, v, live)} onDropEffect={(effect) => applyEffect(effect)} />
        <div className="transport"><button className="icon-btn" aria-label="Jump to start" onClick={() => seek(0)}><SkipBack size={17} /></button><button className="play-btn" onClick={togglePlay} disabled={!duration} aria-label={playing ? "Pause" : "Play"} data-testid="button-play">{playing ? <Pause size={20} /> : <Play size={20} />}</button><button className="icon-btn" aria-label="Jump to end" onClick={() => seek(duration)}><SkipForward size={17} /></button>
          <span className="mono time-big">{timecode(time, timeline.fps)}</span><div className="flex-spacer" /><button className="secondary-btn" onClick={split} disabled={readOnly || !timeline.clips.length} title="Split at playhead (S)"><Scissors size={15} />Split</button></div></main>

      <aside className="inspector" aria-label="Inspector">{selectedIds.length > 1 ? <MultiInspector clips={timeline.clips.filter((c) => selectedIds.includes(c.id))} readOnly={readOnly} onPatch={(p) => patchClips(selectedIds, p)} onDuplicate={duplicate} onDelete={() => remove(false)} onRippleDelete={() => remove(true)} onAlign={alignClips} onTransitions={transitionSelected} onClear={() => setSel([])} />
        : selected ? <ClipInspector transition={incomingTransition(timeline, selected)} onTransition={(type, d) => applyTransition(selected.id, type, d)} key={selected.id} clip={selected} asset={byId.get(selected.assetId)} readOnly={readOnly} gesture={gesture} time={time} fps={timeline.fps} patch={(p, live) => patchClip(selected.id, p, live)} setValues={(v, live) => setValues(selected.id, v, live)} toggleKey={(p) => toggleKey(selected.id, p)} seek={seek} onSplit={split} onDuplicate={duplicate} onDelete={() => remove(false)} />
        : <ProjectInspector name={projectName} onName={setProjectName} timeline={timeline} setProject={setProjectSettings} readOnly={readOnly} canPublish={canPublish} projectId={projectId} visibility={visibility} onVisibility={toggleVisibility} onCopyLink={copyPublicLink} seek={seek} addMarker={addMarker} removeMarker={removeMarker} />}</aside>

      <section className="timeline-panel" aria-label="Timeline">
        <ForgeTimeline timeline={timeline} assets={assets} selectedId={selectedId} selectedIds={selectedIds} peers={peers} follow={!!followId} onSelectMany={onSelectMany} onCursor={onCursor} time={time} playing={playing} pps={pps} snapping={snapping} readOnly={readOnly} mediaUrl={mediaUrl} onTrack={setTrack} onFit={fitTimeline} onAddMarker={addMarker} onSelect={onSelect} onSeek={seek} onZoom={setPps} gesture={gesture} onDropAsset={(id, track, start) => { const a = byId.get(id); if (a) addAsset(a, track, start); }} onDropEffect={(effect, target) => applyEffect(effect, target)} onDropFiles={(files, track, start) => importFiles(files, { track, start })} onMoveMarker={moveMarker} />
      </section></div>

    {exportOpen && <div className="export-panel" role="dialog" aria-label="Export">
      <div className="modal-head"><h3>Export video</h3><button className="icon-btn" aria-label="Close export panel" onClick={() => setExportOpen(false)}><X size={16} /></button></div>
      {render?.status === "error" ? <div className="error-box">Export failed: {render.error}</div> : render?.status === "done" ? <>{renderUrl ? <video src={renderUrl} controls crossOrigin="anonymous" className="export-video" data-testid="video-render-result" /> : <div className="muted">Preparing preview…</div>}<div className="modal-actions"><a className="primary-btn" href={renderUrl || undefined} download aria-disabled={!renderUrl}><Download size={15} />Download MP4</a></div></> : <div><div className="progress" role="progressbar" aria-valuenow={Math.round((render?.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(4, (render?.progress ?? 0) * 100)}%` }} /></div><p className="muted" data-testid="text-render-status">{render?.status === "rendering" ? `Rendering ${Math.round(render.progress * 100)}%` : "Queued…"}</p></div>}
    </div>}
    {dragOver && <div className="drop-overlay"><Upload size={36} /><h2>Drop to import</h2><p>Video, audio and images are added to your media library.</p></div>}
    {notice && <div className={`forge-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} data-testid="toast">{notice.tone === "error" ? <AlertCircle size={15} /> : <Check size={15} />}{notice.text}<button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={14} /></button></div>}
  </div>;
}
