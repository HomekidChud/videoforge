import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Play, Pause, SkipBack, SkipForward, Scissors, Undo2, Redo2, Magnet, Plus, Upload, Type, Film, Music2, Image as ImageIcon, Download, Check, AlertCircle, Loader2, FolderOpen, FilePlus2, Trash2, Share2, X, Lock, Globe, ChevronDown, Eye, Sparkles, Search, MoreHorizontal, Keyboard, GraduationCap, Layers, Music, Wand2, Blocks, Shapes, Code2, Settings2, SlidersHorizontal, Mic, Languages, Clock } from "lucide-react";
import { prefs, PRESETS, type Preset, type Mode } from "@/lib/studio-prefs";
import { SHORTCUTS, shortcutFor } from "@shared/shortcuts";
import ForgeCommandPalette, { type PaletteCommand } from "@/components/forge-command-palette";
import ForgeShortcuts from "@/components/forge-shortcuts";
import ForgeTour from "@/components/forge-tour";
import { clipDuration, clipEnd, normalizeClip, normalizeTimeline, timelineDuration, type Clip, type Timeline } from "@shared/timeline";
import { ANIMATABLE, clamp, valueAt, type AnimationProperty, type Keyframe } from "@shared/animation";
import { TITLE_PRESETS, motionPreset } from "@shared/presets";
import { api, API_BASE } from "@/lib/api";
import { loadStoredKey } from "@/lib/apiKey";
import { useAuthedMediaUrl, useMediaTokenLifecycle } from "@/lib/mediaUrl";
import { EMPTY_TIMELINE, clampClipPatch, duplicateClip, newClip, rippleDelete, round, sameTimeline, snapshot, splitClip, timecode, uid, writeLocalSave, readLocalSave, clearLocalSave, listLocalSaves, debounceLocalWrite, type LocalSave, type AssetDTO, type ProjectDTO, type RenderDTO } from "@/lib/editor-model";
import { useUILang, safeLocalStorage } from "@/lib/ui-lang";
import { presetWidth, RESOLUTION_PRESETS, type RenderQuality } from "@shared/render-options";
import { UI_LANGS } from "@shared/ui-i18n";
import { ForgeNav } from "@/components/forge-shell";
import ForgePreview from "@/components/forge-preview";
import ForgeTimeline, { type TimelineGesture } from "@/components/forge-timeline";
import { InspectorShell, ClipInspector, MultiInspector, ProjectInspector } from "@/components/forge-inspector";
import { setTransition, incomingTransition, TRANSITIONS } from "@shared/transitions";
import { type Peer } from "@/components/forge-presence";
import ForgeEffects, { type Effect } from "@/components/forge-effects";
import ForgeGraphics, { applyGraphics } from "@/components/forge-graphics";
import ForgeComposition from "@/components/forge-composition";
import { applyTimelineOp, type TimelineOp } from "@shared/editing";
import { fitReport } from "@shared/layout";
import { WorkspaceDivider } from "@/components/forge-workspace";
import ForgeMotion from "@/components/forge-motion";
import { ForgeTools } from "@/components/forge-tools";
import { toolContext } from "@shared/custom-tools";
import ForgeAnimator from "@/components/forge-animator";
import { animationsByName, loadAnimations, type RigAnimation } from "@shared/rig";

type SaveState = "empty" | "saved" | "dirty" | "saving" | "error" | "readonly";
type Me = { id: string; scope: "read" | "write" | "admin" };

/** Send one file. Cookies go with it (withCredentials), so a signed-in session works even when the API is on another origin. */
function uploadOne(file: File, onBytes: (loaded: number) => void): Promise<AssetDTO[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), form = new FormData(), key = loadStoredKey();
    form.append("files", file);
    xhr.open("POST", `${API_BASE}/api/media/upload`);
    xhr.withCredentials = true;
    if (key) xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    xhr.upload.onprogress = (e) => onBytes(e.lengthComputable ? e.loaded : 0);
    xhr.onload = () => {
      let body: any = {}; try { body = JSON.parse(xhr.responseText); } catch { /* non-json */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body.assets ?? []);
      const err: Error & { status?: number } = new Error(xhr.status === 401 && !key ? "Your session ended. Sign in again, then retry the upload." : body.message || `Upload failed (${xhr.status})`);
      err.status = xhr.status; reject(err);
    };
    xhr.onerror = () => reject(Object.assign(new Error("Network error during upload"), { status: 0 }));
    xhr.send(form);
  });
}

/**
 * Upload several files at once (four connections) and report one overall percentage by bytes.
 * Small files no longer queue behind a big one, and a dropped connection is retried once.
 */
async function uploadWithProgress(files: File[], onProgress: (pct: number) => void): Promise<{ assets: AssetDTO[] }> {
  const total = files.reduce((n, f) => n + f.size, 0) || 1;
  const sent = new Array<number>(files.length).fill(0);
  const report = () => onProgress(Math.min(1, sent.reduce((n, v) => n + v, 0) / total));
  const out: AssetDTO[][] = new Array(files.length);
  let next = 0, failure: Error | null = null;
  // Biggest first, so the longest transfer starts straight away.
  const order = files.map((_, i) => i).sort((a, b) => files[b].size - files[a].size);
  const worker = async () => {
    while (!failure) {
      const i = order[next++]; if (i === undefined) return;
      const run = () => uploadOne(files[i], (n) => { sent[i] = n; report(); });
      try {
        try { out[i] = await run(); }
        catch (e: any) { if (e?.status === 0 || e?.status >= 502) { sent[i] = 0; out[i] = await run(); } else throw e; }
        sent[i] = files[i].size; report();
      } catch (e: any) { failure = e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  if (failure) throw failure;
  return { assets: out.flat() };
}

/** Export settings: what the dialog edits, kept out of the request body until sent. */
type ExportConfig = { resolution: string; quality: RenderQuality; fps: number | "project"; audio: boolean };

function loadExportConfig(): ExportConfig {
  try { const raw = JSON.parse(localStorage.getItem("vf.export.v1") || ""); if (raw && typeof raw === "object") return { resolution: "project", quality: "standard", fps: "project", audio: true, ...raw }; } catch { /* fresh or private mode */ }
  return { resolution: "project", quality: "standard", fps: "project", audio: true };
}

/** Maps the dialog's settings onto the API's whitelisted options. */
function exportOptionsFor(cfg: ExportConfig, resolution: { width: number; height: number }): { quality: RenderQuality; width?: number; fps?: number; audio?: boolean } {
  const out: { quality: RenderQuality; width?: number; fps?: number; audio?: boolean } = { quality: cfg.quality };
  const preset = RESOLUTION_PRESETS.find((p) => p.id === cfg.resolution);
  if (preset?.shortSide) out.width = presetWidth(resolution.width, resolution.height, preset.shortSide);
  if (cfg.fps !== "project") out.fps = cfg.fps;
  if (!cfg.audio) out.audio = false;
  return out;
}

/** A small live clock for the studio bar. Isolated so ticking never re-renders the editor. */
function StudioClock({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span className="studio-clock mono" title={now.toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} data-testid="studio-clock">{now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
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
  const [panel, setPanel] = useState<"media" | "effects" | "graphics" | "projects" | "tools" | "blocks">("media");
  /** The panel to return to after the Blocks studio closes. */
  const lastPanelRef = useRef<"media" | "effects" | "graphics" | "projects" | "tools">("effects");
  useEffect(() => { if (panel !== "blocks") lastPanelRef.current = panel; }, [panel]);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [upload, setUpload] = useState<{ pct: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("empty"), [saveError, setSaveError] = useState("");
  const [exportOpen, setExportOpen] = useState(false), [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [langMenu, setLangMenu] = useState(false);
  const { lang, setLang, t } = useUILang();
  // Export settings persist between sessions so a repeat export does not need setting up again.
  const [exportCfg, setExportCfg] = useState<ExportConfig>(() => loadExportConfig());
  useEffect(() => { try { localStorage.setItem("vf.export.v1", JSON.stringify(exportCfg)); } catch { /* private mode */ } }, [exportCfg]);
  const [dragOver, setDragOver] = useState(false);
  const [compositionOpen,setCompositionOpen]=useState(false);
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
  const saving = useRef<Promise<boolean> | null>(null), savedRevision = useRef(0), idRef = useRef<string | null>(null), nameRef = useRef(projectName);
  idRef.current = projectId; nameRef.current = projectName;
  const localWrite = useRef(debounceLocalWrite(writeLocalSave, 300)).current;
  const saveErrorRef = useRef("");
  saveErrorRef.current = saveError;

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    while (saving.current) await saving.current;
    const rev = revisionRef.current;
    if (rev === savedRevision.current || (!idRef.current && !tlRef.current.clips.length)) { setSaveState(idRef.current ? "saved" : "empty"); return true; }
    const job = (async () => {
      setSaveState("saving"); setSaveError("");
      try {
        const body = { name: nameRef.current, timeline: tlRef.current };
        if (!idRef.current) { const p = await api<ProjectDTO>("POST", "/api/projects", body); idRef.current = p.id; setProjectId(p.id); setVisibility(p.visibility ?? "private"); }
        else await api<ProjectDTO>("PUT", `/api/projects/${idRef.current}`, body);
        savedRevision.current = rev; setSaveState(revisionRef.current === rev ? "saved" : "dirty");
        qc.invalidateQueries({ queryKey: ["/api/projects"] });
        return true;
      } catch (e: any) { setSaveState("error"); setSaveError(e.message); return false; }
    })();
    saving.current = job; try { return await job; } finally { saving.current = null; }
  }, [qc, readOnly]);
  const revisionRef = useRef(0); revisionRef.current = revision;
  useEffect(() => { if (readOnly) { setSaveState("readonly"); return; } if (!revision || revision === savedRevision.current) return; setSaveState((s) => (s === "saving" ? s : "dirty")); const t = setTimeout(() => { saveNow(); }, 1400); return () => clearTimeout(t); }, [revision, readOnly, saveNow, projectName]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (saveState === "dirty" || saveState === "saving" || saveState === "error") { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [saveState]);

  // Local browser save-data: a debounced snapshot of the working copy (including the
  // unsaved timeline, selection, playhead, zoom and panel) so a tab close or
  // an offline moment does not take your project with you. This is NOT cloud
  // storage. The server DB and the save manifest on the persistent disk are the
  // durable source of truth. This is just the scratchpad so nothing is lost on a
  // refresh. Debounced at 300ms so keystrokes do not thrash localStorage.
  useEffect(() => {
    // While playing, the only change per frame is the playhead; writing the draft
    // at 60fps would stringify the whole timeline every frame. The pause re-runs
    // this effect and persists the position once.
    if (playing) return;
    const draft: LocalSave = {
      savedAt: Date.now(),
      projectId: idRef.current,
      name: projectName,
      timeline: tlRef.current,
      selection: selIdsRef.current,
      time,
      pps,
      panel,
      saveState: saveState === "readonly" ? "saved" : saveState,
      saveError: saveErrorRef.current,
      durability: "draft",
    };
    localWrite(draft);
  }, [timeline, time, saveState, projectName, projectId, pps, panel, playing]);

  // Restore the last working copy on mount. If the tab was closed mid-edit,
  // the unsaved timeline is still here, along with the playhead position and
  // selection. This is the browser-local scratchpad, not a cloud save.
  // The restored document is genuinely dirty: savedRevision stays behind so the
  // next autosave tick or Ctrl+S persists it to the server, and a failed save is
  // not silently dropped.
  const didRestoreDraft = useRef(false);
  useEffect(() => {
    if (didRestoreDraft.current) return;
    didRestoreDraft.current = true;
    const draft = readLocalSave(null);
    if (draft && draft.timeline.clips.length > 0) {
      loadDocument(draft.timeline, draft.projectId ?? null, draft.name || "Untitled project", "private");
      setPps(draft.pps || 64);
      setPanel((draft.panel as "media" | "effects" | "graphics" | "projects" | "tools" | "blocks") || "media");
      setSel(draft.selection ?? []);
      setTime(Math.max(0, draft.time ?? 0));
      setSaveState(draft.saveState === "error" ? "error" : "dirty");
      setSaveError(draft.saveError || "");
      // Genuinely dirty: push the restored copy to the back of the history so
      // Ctrl+Z steps back to the empty document, and force autosave to run.
      savedRevision.current = revisionRef.current - 1;
      setRevision((r) => r + 1);
      toast("Restored an unsaved local draft. Nothing was lost.");
    } else {
      loadDocument(EMPTY_TIMELINE(), null, "Untitled project", "private");
    }
  }, []);

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
    const clip: Clip = { id: uid(), assetId: "", track: "overlay", start: round(time), inPoint: 0, outPoint: 3, volume: 1, muted: false, text: preset?.text ?? "Your title", textSize: preset?.textSize ?? 8, ...(preset ? { y: preset.y, textBg: preset.textBg, font: preset.font, fontWeight: preset.fontWeight, lineHeight: preset.lineHeight, textTransform: preset.textTransform } : {}) };
    mutate((t) => ({ ...t, clips: [...t.clips, normalizeClip(clip)] })); setSelectedId(clip.id);
  };
  const runOps = (ops: TimelineOp[], label = "tool") => {
    if (readOnly) return;
    try {
      if (!ops.length) return toast("The blocks produced no changes.");
      mutate(() => ops.reduce((t, op) => applyTimelineOp(t, op, (id) => byId.get(id)), tlRef.current));
      toast(`Applied to your edit: ${ops.length} change${ops.length === 1 ? "" : "s"}. Undo (Ctrl+Z) reverts it.`);
    } catch (e: any) { toast(e.message || "The blocks could not be applied", "error"); }
  };
  const getToolCtx = () => toolContext(tlRef.current, timeRef.current, selectedIds, timelineDuration(tlRef.current), animationsByName(loadAnimations(safeLocalStorage, projectId ?? "draft")));
  const [animatorOpen, setAnimatorOpen] = useState(false);
  const applyRig = (anim: RigAnimation) => {
    if (readOnly) return;
    try {
      let changed = 0;
      mutate(() => { const before = tlRef.current; const next = applyTimelineOp(before, { op: "rig_bake", args: { animation: anim } }, (id) => byId.get(id)); changed = next.clips.filter((c, i) => c !== before.clips[i]).length; return next; });
      toast(`Applied “${anim.name}” to ${anim.parts.length} clip${anim.parts.length === 1 ? "" : "s"}. Undo (Ctrl+Z) reverts it.`);
    } catch (e: any) { toast(e.message || "Could not apply the animation", "error"); }
  };
  const addRigClips = (raw: Record<string, unknown>[]) => {
    if (readOnly) return;
    mutate((t) => ({ ...t, clips: [...t.clips, ...raw.map((c) => normalizeClip(c as unknown as Clip))] }));
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
      if(e.defaultPrevented)return;
      const el = e.target as HTMLElement, typing = ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && (el as HTMLInputElement).type !== "range" && (el as HTMLInputElement).type !== "checkbox";
      if (typing || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (key === " " && !["BUTTON","SUMMARY","A"].includes(el.tagName) && el.getAttribute("role")!=="separator") { e.preventDefault(); togglePlay(); }
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
    try { const r = await uploadWithProgress(files, (pct) => setUpload({ pct }));
      // Show the new files straight away from the upload response, then let the list refresh quietly.
      qc.setQueryData<{ assets: AssetDTO[] }>(["/api/media"], (old) => ({ ...(old ?? {}), assets: [...(old?.assets ?? []).filter((x) => !r.assets.some((n) => n.id === x.id)), ...r.assets] }));
      void qc.invalidateQueries({ queryKey: ["/api/media"] }); toast(`Imported ${r.assets.length} file${r.assets.length > 1 ? "s" : ""}`);
      if (place) { let at = place.start; const added: Clip[] = []; for (const a of r.assets) { const track = a.kind === "audio" ? "audio" : place.track === "audio" ? "video" : place.track; const c = newClip(a, at, track); added.push(c); if (a.kind !== "audio") at = clipEnd(c); } if (added.length) { mutate((t) => ({ ...t, clips: [...t.clips, ...added] })); setSelectedId(added[0].id); } } }
    catch (e: any) { toast(e.message, "error"); } finally { setUpload(null); }
  }
  const startRender = useMutation({
    mutationFn: async () => {
      // A failed save must not export a stale server copy, so refuse to start.
      const ok = await saveNow();
      if (!ok) throw new Error("Save failed. Fix the save error, then export again.");
      if (!idRef.current) throw new Error("Add at least one clip before exporting.");
      const options = exportOptionsFor(exportCfg, timeline.resolution);
      return api<{ jobId: string }>("POST", "/api/renders", { projectId: idRef.current, options });
    },
    onSuccess: (r) => { setRenderJobId(r.jobId); },
    onError: (e) => { toast(e.message, "error"); },
  });
  const toggleVisibility = async () => {
    if (!projectId) return; const next = visibility === "private" ? "public" : "private";
    try { await api("PUT", `/api/projects/${projectId}`, { visibility: next }); setVisibility(next); qc.invalidateQueries({ queryKey: ["/api/projects"] }); toast(next === "public" ? "Project is now public. Render a video to share it." : "Project is private again."); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const copyPublicLink = async () => { try { await navigator.clipboard.writeText(`${location.href.split("#")[0]}#/share/${projectId}`); toast("Public link copied"); } catch { toast("Couldn’t access the clipboard.", "error"); } };
  const fitIssues = useMemo(() => fitReport(timeline, (id) => { const a = byId.get(id); return a ? { width: a.width, height: a.height } : undefined; }, 0.04).length, [timeline, byId]);
  const fitAll = () => { try { const next = applyTimelineOp(tlRef.current, { op: "fit_all", args: {} }, (id) => byId.get(id)); mutate(() => next); toast("Layers fitted inside the frame"); } catch (e: any) { toast(e.message, "error"); } };
  const setProjectSettings = (p: { fps?: number; resolution?: { width: number; height: number }; background?: string }) => mutate((t) => { try { return p.resolution ? applyTimelineOp({ ...t, ...p }, { op: "set_project", args: { refit: true } }, (id) => byId.get(id)) : { ...t, ...p }; } catch { return { ...t, ...p }; } });
  const [workspace, setWorkspace] = useState<"edit" | "animate">("edit");
  const [focusedKey,setFocusedKey]=useState<{clipId:string;property:AnimationProperty;time:number}|undefined>();
  const [libraryOpen, setLibraryOpen] = useState(true), [inspectorOpen, setInspectorOpen] = useState(true);
  const [libraryWidth, setLibraryWidth] = useState(312), [inspectorWidth, setInspectorWidth] = useState(316), [timelineHeight, setTimelineHeight] = useState(300);
  const [viewportWidth,setViewportWidth]=useState(window.innerWidth);
  useEffect(()=>{
    const fitPanels=()=>{const w=window.innerWidth;setViewportWidth(w);if(w<=860)return;setLibraryWidth(v=>Math.min(v,Math.max(268,Math.floor(w*.3))));setInspectorWidth(v=>Math.min(v,Math.max(260,Math.floor(w*.34))));};
    window.addEventListener("resize",fitPanels);return()=>window.removeEventListener("resize",fitPanels);
  },[]);
  const [mobilePanel, setMobilePanel] = useState<"timeline" | "library" | "inspector">("timeline");

  // ---------------------------------------------------------------- workspaces, modes, palette
  const [preset, setPresetState] = useState<Preset>(prefs.preset);
  const [mode, setModeState] = useState<Mode>(prefs.mode);
  const advanced = mode === "advanced";
  const [paletteOpen, setPaletteOpen] = useState(false), [sheetOpen, setSheetOpen] = useState(false), [tourOpen, setTourOpen] = useState(false);
  const [collapsedLanes, setCollapsedLanes] = useState<string[]>([]);
  const toggleLane = useCallback((id: string) => setCollapsedLanes((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])), []);
  const applyPreset = useCallback((p: Preset) => {
    setPresetState(p); prefs.setPreset(p); setCollapsedLanes([]);
    setWorkspace(p === "animate" ? "animate" : "edit");
    setLibraryOpen(p !== "animate"); setInspectorOpen(true);
    if (p === "edit") { setPanel("media"); setTimelineHeight(300); }
    else if (p === "animate") setTimelineHeight((h) => Math.max(h, 400));
    else if (p === "graphics") { setPanel("graphics"); setTimelineHeight(300); }
    else if (p === "audio") { setPanel("media"); setTimelineHeight(360); setCollapsedLanes(["overlay"]); }
    else if (p === "blocks") setPanel("blocks");
  }, []);
  const setMode = useCallback((m: Mode) => {
    setModeState(m); prefs.setMode(m);
    if (m === "simple") { setPanel((cur) => (cur === "blocks" || cur === "tools" ? "media" : cur)); if (preset === "blocks") applyPreset("edit"); }
  }, [preset, applyPreset]);
  useEffect(() => { if (!prefs.toured() && !new URLSearchParams(location.search).has("notour")) { const t = setTimeout(() => setTourOpen(true), 900); return () => clearTimeout(t); } }, []);
  const closeTour = () => { setTourOpen(false); prefs.setToured(true); };
  const importInput = useRef<HTMLInputElement>(null);
  const openImport = () => { setPanel("media"); setLibraryOpen(true); setTimeout(() => importInput.current?.click(), 0); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); return; }
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
      if (!typing && e.key === "?" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setSheetOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) setLangMenu(false); };
    document.addEventListener("pointerdown", h); return () => document.removeEventListener("pointerdown", h);
  }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { const d = moreRef.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    document.addEventListener("pointerdown", h); return () => document.removeEventListener("pointerdown", h);
  }, []);
  const commands: PaletteCommand[] = (() => {
    const sc = (id: string) => shortcutFor(id);
    const show = (p: typeof panel) => () => { setPanel(p); setLibraryOpen(true); };
    const list: PaletteCommand[] = [
      { id: "add-title", group: "Create", label: "Add a title", run: () => addTitle(), disabled: readOnly },
      { id: "import", group: "Create", label: "Import media", keywords: "upload video audio image", run: openImport, disabled: readOnly },
      { id: "add-marker", group: "Create", label: "Add a marker at the playhead", shortcut: sc("marker"), run: addMarker, disabled: readOnly },
      { id: "split", group: "Edit", label: "Split at the playhead", shortcut: sc("split"), run: split, disabled: readOnly || !timeline.clips.length },
      { id: "duplicate", group: "Edit", label: "Duplicate the selection", shortcut: sc("duplicate"), run: duplicate, disabled: readOnly || !selectedIds.length },
      { id: "delete", group: "Edit", label: "Delete the selection", shortcut: sc("delete"), run: () => remove(false), disabled: readOnly || !selectedIds.length },
      { id: "ripple", group: "Edit", label: "Ripple delete the selection", shortcut: sc("ripple"), run: () => remove(true), disabled: readOnly || !selectedIds.length },
      { id: "undo", group: "Edit", label: "Undo", shortcut: sc("undo"), run: undo, disabled: readOnly || !past.current.length },
      { id: "redo", group: "Edit", label: "Redo", shortcut: sc("redo"), run: redo, disabled: readOnly || !future.current.length },
      { id: "select-all", group: "Edit", label: "Select every clip", shortcut: sc("select-all"), run: () => onSelectMany(tlRef.current.clips.map((c) => c.id)), disabled: !timeline.clips.length },
      { id: "fit-all", group: "Edit", label: "Fit every layer inside the frame", run: fitAll, disabled: readOnly || !timeline.clips.length },
      { id: "play", group: "Playback", label: playing ? "Pause" : "Play", shortcut: sc("play"), run: togglePlay, disabled: !duration },
      { id: "to-start", group: "Playback", label: "Jump to the start", shortcut: sc("start"), run: () => seek(0) },
      { id: "to-end", group: "Playback", label: "Jump to the end", shortcut: sc("end"), run: () => seek(duration) },
      { id: "export", group: "Project", label: "Export video…", run: () => { setRenderJobId(null); setExportOpen(true); }, disabled: !timeline.clips.length || readOnly },
      { id: "save", group: "Project", label: "Save now", shortcut: sc("save"), run: () => { void saveNow(); } },
      { id: "new-project", group: "Project", label: "New project", run: newProject, disabled: readOnly },
      { id: "project-settings", group: "Project", label: "Project settings and sharing", run: () => { setSelectedId(null); setInspectorOpen(true); setMobilePanel("inspector"); } },
      { id: "drafts", group: "Project", label: "Local drafts", run: () => setUiPanel("drafts") },
      { id: "panel-media", group: "Panels", label: "Open Media", run: show("media") },
      { id: "panel-effects", group: "Panels", label: "Open Effects", run: show("effects") },
      { id: "panel-graphics", group: "Panels", label: "Open Graphics", run: show("graphics") },
      { id: "panel-projects", group: "Panels", label: "Open Projects", run: show("projects") },
      { id: "toggle-library", group: "Panels", label: libraryOpen ? "Hide the library" : "Show the library", run: () => setLibraryOpen((v) => !v) },
      { id: "toggle-inspector", group: "Panels", label: inspectorOpen ? "Hide the inspector" : "Show the inspector", run: () => setInspectorOpen((v) => !v) },
      { id: "reset-layout", group: "Panels", label: "Reset the layout", run: () => { setLibraryOpen(true); setInspectorOpen(true); setLibraryWidth(312); setInspectorWidth(316); setTimelineHeight(300); setCollapsedLanes([]); } },
      ...PRESETS.filter((p) => advanced || p.id !== "blocks").map((p): PaletteCommand => ({ id: `workspace-${p.id}`, group: "Workspaces", label: `${p.label} workspace`, keywords: p.hint, run: () => applyPreset(p.id) })),
      { id: "snapping", group: "Timeline", label: snapping ? "Turn snapping off" : "Turn snapping on", run: () => setSnapping((v) => !v) },
      { id: "zoom-in", group: "Timeline", label: "Zoom the timeline in", shortcut: sc("zoom-in"), run: () => setPps((p) => Math.min(260, Math.round(p * 1.25))) },
      { id: "zoom-out", group: "Timeline", label: "Zoom the timeline out", shortcut: sc("zoom-out"), run: () => setPps((p) => Math.max(8, Math.round(p * 0.8))) },
      { id: "fit-timeline", group: "Timeline", label: "Fit the timeline to the window", run: fitTimeline },
      { id: "mode", group: "Studio", label: advanced ? "Switch to Simple mode" : "Switch to Advanced mode", keywords: "simple advanced tools", run: () => setMode(advanced ? "simple" : "advanced") },
      { id: "shortcuts", group: "Studio", label: "Keyboard shortcuts", shortcut: sc("shortcuts"), run: () => setSheetOpen(true) },
      { id: "tour", group: "Studio", label: "Take the Studio tour", run: () => setTourOpen(true) },
      { id: "docs", group: "Studio", label: "Open the documentation", run: () => { location.hash = "#/docs/introduction"; } },
    ];
    if (advanced) list.push(
      { id: "animator", group: "Advanced tools", label: "Open the Animator", keywords: "rig pose", run: () => setAnimatorOpen(true) },
      { id: "panel-blocks", group: "Advanced tools", label: "Open the block studio", keywords: "blocks scripts", run: show("blocks") },
      { id: "panel-tools", group: "Advanced tools", label: "Open Tools (scripts)", run: show("tools") },
      { id: "composition", group: "Advanced tools", label: "Composition JSON", run: () => setCompositionOpen(true) },
    );
    return list;
  })();

  const render = renderQ.data, renderUrl = render?.status === "done" && renderJobId ? mediaUrl(renderJobId, `/api/renders/${renderJobId}/download`) : "";
  const saveLabel = { empty: t("save.empty"), saved: t("save.saved"), dirty: t("save.dirty"), saving: t("save.saving"), error: t("save.error"), readonly: t("save.readonly") }[saveState];

  // ---------------------------------------------------------------- editor UI
  const [uiPanel, setUiPanel] = useState<"drafts" | null>(null);
  // Reading drafts parses localStorage; the drafts panel is the only consumer, so
  // parse when it opens rather than on every editor render (playback included).
  const localDrafts = useMemo(() => (uiPanel === "drafts" ? listLocalSaves() : []), [uiPanel]);
  const draftsPanelOpen = uiPanel === "drafts";
  const draftsWithoutCurrent = localDrafts.filter((d) => !(d.projectId === projectId && d.saveState === "saved"));

  return <div className="forge-app studio" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); importFiles(e.dataTransfer.files); } }}>
    <ForgeNav active="editor" />
    <ForgeCommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    <ForgeShortcuts open={sheetOpen} onClose={() => setSheetOpen(false)} />
    <ForgeTour open={tourOpen} onClose={closeTour} />
    <div className="studio-bar">
      <div className="project-title"><input aria-label="Project name" className="title-input" value={projectName} disabled={readOnly} maxLength={200} onChange={(e) => setProjectName(e.target.value)} data-testid="input-project-title" />
        <span className={`save-state ${saveState}`} role="status" data-testid="text-save-state" title={saveError}>{saveState === "saving" ? <Loader2 size={13} className="spin" /> : saveState === "error" ? <AlertCircle size={13} /> : saveState === "saved" ? <Check size={13} /> : null}{saveLabel}</span>
        {saveState === "error" && <button className="ghost-link" onClick={() => saveNow()}>Retry</button>}
        {peers.length > 0 && <div className="presence-bar" data-testid="presence-bar" aria-label="People in this project">{peers.map((p) => <button key={p.cid} className={`peer-avatar ${followId === p.cid ? "following" : ""}`} style={{ background: p.color }} title={followId === p.cid ? `Stop following ${p.name}` : `Follow ${p.name}`} aria-pressed={followId === p.cid} onClick={() => (followId === p.cid ? stopFollow() : setFollowId(p.cid))} data-testid={`follow-${p.cid}`}>{p.name.slice(0, 1).toUpperCase()}</button>)}
          {followed && <span className="follow-chip" style={{ borderColor: followed.color }} data-testid="follow-chip">Following {followed.name}<button className="ghost-link" onClick={stopFollow}>Stop</button></span>}</div>}
        {watchers > 0 && <span className="watch-badge" title="A master admin is watching this project live. They cannot edit it."><Eye size={13} />{watchers} watching</span>}</div>
      <div className="preset-switch" role="tablist" aria-label="Workspace">
        {PRESETS.filter((x) => advanced || x.id !== "blocks").map((x) => <button key={x.id} role="tab" aria-selected={preset === x.id} className={preset === x.id ? "active" : ""} title={x.hint} onClick={() => applyPreset(x.id)} data-testid={`workspace-${x.id}`}>{x.label}</button>)}
      </div>
      <div className="studio-actions">
        <button className="palette-trigger hide-sm" onClick={() => setPaletteOpen(true)} data-testid="button-palette" aria-label={t("btn.search")}><Search size={14} /><span>{t("btn.search")}</span><kbd>Ctrl</kbd><kbd>K</kbd></button>
        <button className="icon-btn" onClick={undo} disabled={!past.current.length || readOnly} aria-label="Undo" title="Undo (Ctrl+Z)" data-testid="button-undo"><Undo2 size={17} /></button>
        <button className="icon-btn mobile-hide-action" onClick={redo} disabled={!future.current.length || readOnly} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" data-testid="button-redo"><Redo2 size={17} /></button>
        <span className="divider" />
        <div className="menu-wrap hide-sm"><button className="secondary-btn" onClick={() => addTitle()} disabled={readOnly} data-testid="button-add-title"><Type size={15} />{t("btn.addTitle")}</button><button className="icon-btn menu-caret" aria-label="Title styles" aria-expanded={titleMenu} disabled={readOnly} onClick={() => setTitleMenu(!titleMenu)} data-testid="button-title-menu"><ChevronDown size={14} /></button>{titleMenu && <div className="menu-pop" role="menu">{TITLE_PRESETS.map((p) => <button key={p.id} role="menuitem" onClick={() => addTitle(p)} data-testid={`title-${p.id}`}>{p.label}</button>)}</div>}</div>
        <button className="secondary-btn hide-sm" onClick={() => {setSelectedId(null);setInspectorOpen(true);setMobilePanel("inspector");}} title="Project settings and sharing" data-testid="button-project-settings"><Share2 size={15} />{t("btn.project")}</button>
        <div className="menu-wrap hide-sm" ref={langMenuRef}>
          <button className="icon-btn menu-caret" aria-label={t("language")} aria-expanded={langMenu} onClick={() => setLangMenu(!langMenu)} data-testid="button-language" title={t("language")}><Languages size={16} />{UI_LANGS.find((l) => l.id === lang)?.native}</button>
          {langMenu && <div className="menu-pop menu-pop-end" role="menu" aria-label={t("language")}>{UI_LANGS.map((l) => <button key={l.id} role="menuitem" aria-pressed={lang === l.id} onClick={() => { setLang(l.id); setLangMenu(false); }} data-testid={`lang-${l.id}`}>{l.native}{lang === l.id && <Check size={13} />}</button>)}</div>}
        </div>
        <StudioClock locale={lang === "es" ? "es-ES" : "en-GB"} />
        <button className="primary-btn" onClick={() => { setRenderJobId(null); setExportOpen(true); }} disabled={!timeline.clips.length || readOnly} data-testid="button-export"><Download size={15} />{t("btn.export")}</button>
        <details className="studio-tools" ref={moreRef}><summary data-testid="button-studio-tools" aria-label="More options" title="More options"><MoreHorizontal size={18} /></summary><div className="studio-tools-menu" onClick={(e) => { if ((e.target as HTMLElement).closest("button,a") && moreRef.current) moreRef.current.open = false; }}>
          <h5>Tools</h5>
          {advanced && <button onClick={() => setAnimatorOpen(true)} data-testid="button-animator" title="Pose clips, text and shapes like rigs and key them on a timeline"><Clapperboard size={15} />Animator</button>}
          {advanced && <button onClick={() => setCompositionOpen(true)} data-testid="button-composition"><Code2 size={15} />Composition JSON</button>}
          <button aria-pressed={snapping} onClick={() => setSnapping((v) => !v)} data-testid="toggle-snapping"><Magnet size={15} />Snapping: {snapping ? "on" : "off"}</button>
          {selectedIds.length > 1 && <button disabled={readOnly} onClick={() => { try { const next = applyTimelineOp(tlRef.current, { op: "stagger_clips", args: { clipIds: selectedIds, delay: .15, start: timeRef.current } }, id => byId.get(id)); mutate(() => next); toast("Selection staggered by 0.15s"); } catch (e: any) { toast(e.message, "error"); } }} data-testid="button-stagger"><Layers size={15} />Stagger selection</button>}
          <h5>Layout</h5>
          <button aria-pressed={libraryOpen} onClick={() => setLibraryOpen(v => !v)} data-testid="toggle-library">{libraryOpen ? "Hide" : "Show"} library</button>
          <button aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(v => !v)} data-testid="toggle-inspector">{inspectorOpen ? "Hide" : "Show"} inspector</button>
          <button onClick={() => { setLibraryOpen(true); setInspectorOpen(true); setLibraryWidth(312); setInspectorWidth(316); setTimelineHeight(300); setCollapsedLanes([]); }} data-testid="reset-workspace">Reset layout</button>
          <button onClick={() => setMode(advanced ? "simple" : "advanced")} data-testid="toggle-mode"><SlidersHorizontal size={15} />{advanced ? "Switch to Simple mode" : "Switch to Advanced mode"}</button>
          <button className="mobile-tool" disabled={!future.current.length || readOnly} onClick={redo} data-testid="mobile-redo">Redo</button>
          <button className="mobile-tool" aria-pressed={snapping} onClick={() => setSnapping(v => !v)} data-testid="mobile-snapping">Snapping: {snapping ? "on" : "off"}</button>
          <button className="mobile-tool" disabled={readOnly} onClick={() => addTitle()} data-testid="mobile-add-title">Add title</button>
          <h5>Help</h5>
          <button onClick={() => setSheetOpen(true)} data-testid="button-shortcuts"><Keyboard size={15} />Keyboard shortcuts<kbd>?</kbd></button>
          <button onClick={() => setTourOpen(true)} data-testid="button-tour"><GraduationCap size={15} />Studio tour</button>
          <a href="#/docs/introduction">Documentation</a><a href="#/platform">Developer platform</a>
          {canPublish && <a href="#/live">Live monitor</a>}
          <button onClick={() => setUiPanel(v => v === null ? "drafts" : null)} data-testid="drafts-toggle">Local drafts</button>
        </div></details>
      </div></div>

    <div className="mobile-workspace-tabs" aria-label="Editor panels">
      {(["timeline","library","inspector"] as const).map(p=><button key={p} className={mobilePanel===p?"active":""} aria-pressed={mobilePanel===p} onClick={()=>{setMobilePanel(p);if(p==="library")setLibraryOpen(true);if(p==="inspector")setInspectorOpen(true);}} data-testid={`mobile-panel-${p}`}>{p}</button>)}
    </div>
    <div className={`studio-grid workspace-${workspace} ${libraryOpen?"":"library-collapsed"} ${inspectorOpen?"":"inspector-collapsed"} mobile-show-${mobilePanel}`}
      style={{"--library-width":`${libraryOpen?libraryWidth:0}px`,"--inspector-width":`${inspectorOpen?inspectorWidth:0}px`,"--timeline-height":`${timelineHeight}px`} as React.CSSProperties}>
      <aside className="library" aria-label="Library">
        <nav className="dock" aria-label="Tools">
          {([["media", t("panel.media"), Film], ["effects", t("panel.effects"), Wand2], ["graphics", t("panel.graphics"), Shapes], ["blocks", t("panel.blocks"), Blocks], ["tools", t("panel.tools"), Code2], ["projects", t("panel.projects"), FolderOpen]] as const).filter(([id]) => advanced || (id !== "blocks" && id !== "tools")).map(([id, label, Icon]) => (
            <button key={id} className={`dock-btn ${panel === id ? "active" : ""}`} aria-label={label} aria-pressed={panel === id} onClick={() => setPanel(id)} data-testid={`tab-${id}`}><Icon size={19} /><span className="dock-tip" role="tooltip">{label}</span></button>
          ))}
        </nav>
        <div className="library-main">
        <header className="library-head"><h3>{({ media: t("panel.media"), effects: t("panel.effects"), graphics: t("panel.graphics"), blocks: t("panel.blocks"), tools: t("panel.tools"), projects: t("panel.projects") } as const)[panel]}</h3></header>
        {/* Distinct keys: switching Tools → Blocks must remount ForgeTools so its
            open-the-studio effect runs. Without a key, React reuses the Tools
            instance and the Blocks tab just shows the tool library list. */}
        {panel === "blocks" ? <ForgeTools key="blocks" disabled={readOnly} onRun={(ops) => runOps(ops)} onError={(m) => toast(m, "error")} onNote={(m) => toast(m)} getCtx={getToolCtx} studio autoOpen onExitStudio={() => setPanel(lastPanelRef.current)} onOpenAnimator={() => setAnimatorOpen(true)} /> : panel === "tools" ? <ForgeTools key="tools" disabled={readOnly} onRun={(ops) => runOps(ops)} onError={(m) => toast(m, "error")} onNote={(m) => toast(m)} getCtx={getToolCtx} studio={false}  onOpenAnimator={() => setAnimatorOpen(true)} /> : panel === "graphics" ? <ForgeGraphics disabled={readOnly} onApply={op=>{if(readOnly)return;try{const t=tlRef.current,next=applyGraphics(t,op,timeRef.current),ids=next.clips.filter(c=>!t.clips.some(o=>o.id===c.id)).map(c=>c.id);mutate(()=>next);setSel(ids);toast(`Added ${ids.length} editable graphics clip${ids.length===1?"":"s"}`);}catch(e:any){toast(e.message,"error");}}}/> : panel === "effects" ? <ForgeEffects disabled={readOnly} onApply={(e) => applyEffect(e)} /> : panel === "media" ? <>
          <label className={`dropzone ${readOnly ? "disabled" : ""}`} data-testid="button-upload">{upload ? <><Loader2 className="spin" size={18} /><span>Uploading {Math.round(upload.pct * 100)}%</span><i style={{ width: `${upload.pct * 100}%` }} /></> : <><Upload size={19} /><b>{t("library.import")}</b><span>{t("library.importHint")}</span></>}
            <input ref={importInput} type="file" multiple accept="video/*,audio/*,image/*" disabled={readOnly || !!upload} onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ""; }} /></label>
          <div className="asset-list">
            {assetsQ.isLoading && Array.from({ length: 3 }, (_, i) => <div key={i} className="asset-card skeleton" />)}
            {assetsQ.error && <p className="error-box">{assetsQ.error.message}</p>}
            {!assetsQ.isLoading && !assets.length && <div className="library-empty"><Film size={24} /><b>{t("library.noMedia")}</b><p>{t("library.noMediaHint")}</p></div>}
            {assets.map((a) => <div key={a.id} className="asset-card" draggable={!readOnly} onDragStart={(e) => { e.dataTransfer.setData("application/x-vf-asset", a.id); e.dataTransfer.effectAllowed = "copy"; }} data-testid={`card-asset-${a.id}`}>
              <div className="asset-thumb">{a.kind === "audio" ? <Music2 size={22} /> : <img src={mediaUrl(a.id, `/api/media/${a.id}/thumb`) || undefined} crossOrigin="anonymous" alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />}<span className="kind-pill">{a.kind === "audio" ? <Music2 size={11} /> : a.kind === "image" ? <ImageIcon size={11} /> : <Film size={11} />}{a.kind === "image" ? "IMG" : timecode(a.duration, 30).slice(0, 5)}</span></div>
              <div className="asset-meta"><span title={a.filename}>{a.filename}</span><button className="icon-btn" disabled={readOnly} aria-label={`Add ${a.filename} to timeline`} title="Add to timeline" onClick={() => addAsset(a)}><Plus size={16} /></button></div></div>)}
          </div></> : <div className="asset-list">
          <button className="secondary-btn full" onClick={newProject} disabled={readOnly}><FilePlus2 size={15} />{t("library.new")}</button>
          {(projectsQ.data?.projects ?? []).map((p) => <div className={`project-card ${p.id === projectId ? "current" : ""}`} key={p.id}><button onClick={() => openProject(p)} data-testid={`button-load-project-${p.id}`}><FolderOpen size={16} /><span><b>{p.name}</b><small className="muted">{p.timeline.clips.length} clips · {p.visibility === "public" ? "Public" : "Private"}</small></span>{p.visibility === "public" ? <Globe size={14} /> : <Lock size={14} />}</button><button className="icon-btn danger" disabled={readOnly} aria-label={`Delete ${p.name}`} onClick={() => { if (confirm(`Delete “${p.name}”? This cannot be undone.`)) deleteProject.mutate(p.id); }}><Trash2 size={14} /></button></div>)}
          {!projectsQ.isLoading && !projectsQ.data?.projects.length && <div className="library-empty"><FolderOpen size={24} /><b>{t("library.noProjects")}</b><p>{t("library.noProjectsHint")}</p></div>}</div>}
        </div>
      </aside>
      {libraryOpen&&<div className="library-divider"><WorkspaceDivider axis="horizontal" label="Library width" value={libraryWidth} min={268} max={Math.min(460,Math.max(268,viewportWidth-(inspectorOpen?inspectorWidth:0)-272))} onChange={setLibraryWidth}/></div>}

      <main className="monitor"><div className="monitor-heading"><span>{t("monitor.program")} <span className="muted">{projectName}</span></span><span className="monitor-hint">{workspace==="animate"?t("monitor.animateHint"):t("monitor.hint")}</span></div><ForgePreview emptyActions={readOnly ? undefined : <><button className="primary-btn" onClick={openImport} data-testid="empty-import"><Upload size={15} />{t("library.import")}</button><button className="secondary-btn" onClick={() => addTitle()} data-testid="empty-title"><Type size={15} />{t("btn.addTitle")}</button></>} timeline={timeline} assets={assets} time={time} playing={playing} selectedId={selectedId} readOnly={readOnly} gesture={gesture} mediaUrl={mediaUrl} peers={peers} onCursor={onCursor} onSelect={onSelect} onError={(m) => toast(m, "error")} onValues={(id, v, live) => setValues(id, v, live)} onDropEffect={(effect) => applyEffect(effect)} />
        <div className="transport"><button className="icon-btn" aria-label="Jump to start" onClick={() => seek(0)}><SkipBack size={17} /></button><button className="play-btn" onClick={togglePlay} disabled={!duration} aria-label={playing ? "Pause" : "Play"} data-testid="button-play">{playing ? <Pause size={20} /> : <Play size={20} />}</button><button className="icon-btn" aria-label="Jump to end" onClick={() => seek(duration)}><SkipForward size={17} /></button>
          <span className="mono time-big">{timecode(time, timeline.fps)}</span><div className="flex-spacer" /><button className="secondary-btn" onClick={split} disabled={readOnly || !timeline.clips.length} title="Split at playhead (S)"><Scissors size={15} />{t("btn.split")}</button></div></main>

      <aside className="inspector" aria-label="Inspector"><InspectorShell advanced={advanced}>{selectedIds.length > 1 ? <MultiInspector clips={timeline.clips.filter((c) => selectedIds.includes(c.id))} readOnly={readOnly} onPatch={(p) => patchClips(selectedIds, p)} onDuplicate={duplicate} onDelete={() => remove(false)} onRippleDelete={() => remove(true)} onAlign={alignClips} onTransitions={transitionSelected} onClear={() => setSel([])} />
        : selected ? <ClipInspector canvas={timeline.resolution} transition={incomingTransition(timeline, selected)} onTransition={(type, d) => applyTransition(selected.id, type, d)} key={selected.id} clip={selected} asset={byId.get(selected.assetId)} readOnly={readOnly} gesture={gesture} time={time} fps={timeline.fps} patch={(p, live) => patchClip(selected.id, p, live)} setValues={(v, live) => setValues(selected.id, v, live)} toggleKey={(p) => toggleKey(selected.id, p)} seek={seek} onSplit={split} onDuplicate={duplicate} onDelete={() => remove(false)} />
        : <ProjectInspector fitIssues={fitIssues} onFitAll={fitAll} name={projectName} onName={setProjectName} timeline={timeline} setProject={setProjectSettings} readOnly={readOnly} canPublish={canPublish} projectId={projectId} visibility={visibility} onVisibility={toggleVisibility} onCopyLink={copyPublicLink} seek={seek} addMarker={addMarker} removeMarker={removeMarker} />}</InspectorShell></aside>
      {inspectorOpen&&<div className="inspector-divider"><WorkspaceDivider axis="horizontal" label="Inspector width" value={inspectorWidth} min={260} max={Math.min(440,Math.max(260,viewportWidth-(libraryOpen?libraryWidth:0)-272))} onChange={setInspectorWidth}/></div>}
      <div className="timeline-divider"><WorkspaceDivider axis="vertical" label="Timeline height" value={timelineHeight} min={180} max={480} onChange={setTimelineHeight}/></div>

      <section className="timeline-panel" aria-label="Timeline">
        <div className="sequence-heading"><b>{t("sequence")}</b><span className="muted">{timeline.clips.length} {t("library.clips")} · {timeline.fps} fps</span><div className="flex-spacer"/><span className="muted">{selectedIds.length?`${selectedIds.length} ${t("sequence.selected")}`:t("sequence.shortcuts")}</span></div>
        <div className="sequence-workspace"><div className="sequence-timeline">
        <ForgeTimeline collapsed={collapsedLanes} onToggleLane={toggleLane} animationMode={workspace==="animate"} onKeyframeFocus={(clipId,property,time)=>setFocusedKey({clipId,property,time})} timeline={timeline} assets={assets} selectedId={selectedId} selectedIds={selectedIds} peers={peers} follow={!!followId} onSelectMany={onSelectMany} onCursor={onCursor} time={time} playing={playing} pps={pps} snapping={snapping} readOnly={readOnly} mediaUrl={mediaUrl} onTrack={setTrack} onFit={fitTimeline} onAddMarker={addMarker} onSelect={onSelect} onSeek={seek} onZoom={setPps} gesture={gesture} onDropAsset={(id, track, start) => { const a = byId.get(id); if (a) addAsset(a, track, start); }} onDropEffect={(effect, target) => applyEffect(effect, target)} onDropFiles={(files, track, start) => importFiles(files, { track, start })} onMoveMarker={moveMarker} />
        </div>{workspace==="animate"&&<aside className="animation-workspace" aria-label="Animation workspace" data-testid="animation-workspace"><div className="animation-heading"><b>Animation</b><span className="muted">{selected?.label??selected?.text??"Select a clip"}</span></div>
          {selected?<ForgeMotion key={selected.id} clip={selected} focusKey={focusedKey?.clipId===selected.id?focusedKey:undefined} time={time} fps={timeline.fps} audioOnly={selected.track==="audio"} readOnly={readOnly} patch={(p,live)=>patchClip(selected.id,p,live)} seek={seek} gesture={gesture}/>:<div className="animation-empty"><Sparkles size={22}/><p>Select a clip in the canvas or timeline to edit property keyframes, easing and motion presets.</p></div>}
        </aside>}</div>
      </section></div>

    {animatorOpen&&<ForgeAnimator timeline={timeline} assets={assets} mediaUrl={mediaUrl} projectKey={projectId ?? "draft"} readOnly={readOnly} initialSelection={selectedIds} playhead={time} onApply={applyRig} onCreateClips={addRigClips} onClose={()=>setAnimatorOpen(false)} onError={(m)=>toast(m,"error")} onNote={(m)=>toast(m)} />}
    {compositionOpen&&<ForgeComposition timeline={timeline} disabled={readOnly} assetIds={new Set(assets.map(a=>a.id))} onClose={()=>setCompositionOpen(false)} onApply={t=>{mutate(()=>t);setSel([]);seek(0);toast("Composition imported");}}/>}
    {exportOpen && <div className="export-panel" role="dialog" aria-label={t("export.title")}>
      <div className="modal-head"><h3>{t("export.title")}</h3><button className="icon-btn" aria-label="Close export panel" onClick={() => setExportOpen(false)}><X size={16} /></button></div>
      {render?.status === "error" ? <div className="error-box">{t("export.failed")}: {render.error}</div> : renderJobId ? (render?.status === "done" ? <>{renderUrl ? <video src={renderUrl} controls preload="metadata" crossOrigin="anonymous" className="export-video" data-testid="video-render-result" /> : <div className="muted">{t("export.preparing")}</div>}<div className="modal-actions"><a className="primary-btn" href={renderUrl || undefined} download aria-disabled={!renderUrl}><Download size={15} />{t("export.download")}</a><button className="secondary-btn" onClick={() => { setRenderJobId(null); }} data-testid="export-again">{t("export.start")}</button></div></> : <div><div className="progress" role="progressbar" aria-valuenow={Math.round((render?.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(4, (render?.progress ?? 0) * 100)}%` }} /></div><p className="muted" data-testid="text-render-status">{render?.status === "rendering" ? `${t("export.rendering")} ${Math.round(render.progress * 100)}%` : t("export.queued")}</p></div>) : (
        <div className="export-config">
          <div className="export-field">
            <label>{t("export.resolution")}</label>
            <div className="export-options">{RESOLUTION_PRESETS.map((p) => <button key={p.id} className={exportCfg.resolution === p.id ? "active" : ""} aria-pressed={exportCfg.resolution === p.id} onClick={() => setExportCfg((c) => ({ ...c, resolution: p.id }))} data-testid={`export-resolution-${p.id}`}>{p.label}</button>)}</div>
          </div>
          <div className="export-field">
            <label>{t("export.quality")}</label>
            <div className="export-options">{(["high", "standard", "draft"] as RenderQuality[]).map((q) => <button key={q} className={exportCfg.quality === q ? "active" : ""} aria-pressed={exportCfg.quality === q} onClick={() => setExportCfg((c) => ({ ...c, quality: q }))} data-testid={`export-quality-${q}`}>{q === "high" ? t("export.qualityHigh") : q === "standard" ? t("export.qualityStandard") : t("export.qualityDraft")}</button>)}</div>
          </div>
          <div className="export-field">
            <label>{t("export.fps")}</label>
            <div className="export-options">{(["project", 30, 60] as const).map((v) => <button key={String(v)} className={exportCfg.fps === v ? "active" : ""} aria-pressed={exportCfg.fps === v} onClick={() => setExportCfg((c) => ({ ...c, fps: v }))} data-testid={`export-fps-${v}`}>{v === "project" ? `${t("export.fpsProject")} (${timeline.fps})` : v}</button>)}</div>
          </div>
          <div className="export-field">
            <label>{t("export.audio")}</label>
            <button className="export-toggle" role="switch" aria-checked={exportCfg.audio} aria-label={t("export.audio")} onClick={() => setExportCfg((c) => ({ ...c, audio: !c.audio }))} data-testid="export-audio"><i className="export-toggle-knob" />{exportCfg.audio ? "On" : "Off"}</button>
          </div>
          <p className="export-summary muted mono" data-testid="export-summary">{t("export.output")}: {(() => { const o = exportOptionsFor(exportCfg, timeline.resolution); const w = o.width ?? timeline.resolution.width; return `${w} × ${Math.round(timeline.resolution.height * w / timeline.resolution.width / 2) * 2} · ${o.fps ?? timeline.fps} fps${o.audio === false ? " · no audio" : ""}`; })()}</p>
          <div className="modal-actions"><button className="secondary-btn" onClick={() => setExportOpen(false)}>Cancel</button><button className="primary-btn" onClick={() => startRender.mutate()} disabled={!timeline.clips.length || readOnly || startRender.isPending} data-testid="button-start-export">{startRender.isPending ? <Loader2 size={15} className="spin" /> : <Download size={15} />}{startRender.isPending ? t("export.starting") : t("export.start")}</button></div>
        </div>
      )}
    </div>}
    {dragOver && <div className="drop-overlay"><Upload size={36} /><h2>Drop to import</h2><p>Video, audio and images are added to your media library.</p></div>}
    {draftsPanelOpen && <div className="export-panel" role="dialog" aria-label="Local drafts">
      <div className="modal-head"><h3>Local drafts</h3><button className="icon-btn" aria-label="Close drafts panel" onClick={()=>setUiPanel(null)}><X size={16} /></button></div>
      <p className="muted" style={{margin:"0 16px"}}>Drafts saved on this device for tab crashes and refreshes. They are not cloud saves. The server DB is the durable copy.</p>
      <div style={{padding:"8px 16px"}}>
        {draftsWithoutCurrent.length === 0 && <div className="library-empty"><FolderOpen size={22} /><b>No local drafts</b><p>Unsaved edits are kept on this device if the tab is closed or refreshed.</p></div>}
        {draftsWithoutCurrent.map((d) => <div key={d.key} className="project-card" data-testid={`draft-${d.key}`}>
          <button onClick={() => { const s = readLocalSave(d.projectId); if (s) loadDocument(normalizeTimeline(s.timeline), s.projectId, s.name, "private"); setUiPanel(null); }}>
            <FolderOpen size={16} /><span><b>{d.name}</b><small className="muted">{d.saveState === "saved" ? "saved" : d.saveState === "dirty" ? "unsaved changes" : d.saveState}{d.savedAt ? ` · ${new Date(d.savedAt).toLocaleTimeString()}` : ""}</small></span>
          </button>
          <button className="icon-btn danger" aria-label={`Delete ${d.name} draft`} onClick={() => { clearLocalSave(d.projectId); setUiPanel(v=>v==="drafts"?null:null); toast("Draft deleted"); }}><Trash2 size={14} /></button>
        </div>)}
      </div>
      <div className="modal-actions"><button className="secondary-btn" onClick={() => { draftsWithoutCurrent.forEach((d) => clearLocalSave(d.projectId)); setUiPanel(null); toast("All local drafts cleared"); }}>Clear all drafts</button></div>
    </div>}
    {notice && <div className={`forge-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} data-testid="toast">{notice.tone === "error" ? <AlertCircle size={15} /> : <Check size={15} />}{notice.text}<button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={14} /></button></div>}
  </div>;
}
