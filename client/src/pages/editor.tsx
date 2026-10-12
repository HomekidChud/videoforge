import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Timeline, Clip } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types returned by /api/media and /api/projects
// ---------------------------------------------------------------------------

type AssetDTO = {
  id: string;
  filename: string;
  kind: "video" | "audio" | "image";
  mime: string;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
  uploadUrl: string;
  thumbnailUrl: string;
  createdAt: number;
};

type ProjectDTO = {
  id: string;
  name: string;
  timeline: Timeline;
  createdAt: number;
  updatedAt: number;
};

type RenderJobDTO = {
  id: string;
  projectId: string;
  status: "queued" | "rendering" | "done" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// API_BASE resolution (dev vs deployed)
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

import { loadStoredKey } from "@/lib/apiKey";
import { useMediaUrl } from "@/lib/mediaUrl";

async function api<T>(method: string, url: string, body?: any): Promise<T> {
  const key = loadStoredKey();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export default function EditorPage() {
  const qc = useQueryClient();
  const mediaUrl = useMediaUrl();
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled project");
  const [timeline, setTimeline] = useState<Timeline>({
    version: 1,
    fps: 30,
    resolution: { width: 1280, height: 720 },
    clips: [],
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderResultUrl, setRenderResultUrl] = useState<string | null>(null);

  // ---------------------------------------------------------------- queries

  const { data: assetsData } = useQuery<{ assets: AssetDTO[] }>({
    queryKey: ["/api/media"],
  });

  const { data: projectsData } = useQuery<{ projects: ProjectDTO[] }>({
    queryKey: ["/api/projects"],
  });

  const renderJobQ = useQuery<RenderJobDTO>({
    queryKey: ["/api/renders", renderJobId],
    enabled: !!renderJobId,
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === "done" || q.state.data.status === "error") ? false : 2000,
  });

  const assets = assetsData?.assets ?? [];

  // -------------------------------------------------------------- mutations

  const uploadFiles = useMutation({
    mutationFn: async (files: FileList) => {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const key = loadStoredKey();
      const res = await fetch(`${API_BASE}/api/media/upload`, {
        method: "POST",
        body: fd,
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ assets: AssetDTO[] }>;
    },
    onMutate: () => setIsUploading(true),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/media"] });
      setToast(`Uploaded ${d.assets.length} file(s)`);
      setIsUploading(false);
    },
    onError: (e) => {
      setToast(`Upload failed: ${e.message}`);
      setIsUploading(false);
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const p = await api<{ id: string }>("POST", "/api/projects", {
        name: projectName,
        timeline,
      });
      return p;
    },
    onSuccess: (p) => {
      setProjectId(p.id);
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      setToast("Project created");
    },
  });

  const saveProject = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("no project");
      return api<ProjectDTO>("PUT", `/api/projects/${projectId}`, {
        name: projectName,
        timeline,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      setToast("Saved");
    },
  });

  const submitRender = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Create or load a project first");
      return api<{ jobId: string }>("POST", "/api/renders", { projectId });
    },
    onSuccess: (r) => {
      setRenderJobId(r.jobId);
      setRenderResultUrl(null);
      setToast("Render queued");
    },
  });

  // ------------------------------------------------------- render polling

  useEffect(() => {
    if (renderJobQ.data && renderJobQ.data.status === "done") {
      setRenderResultUrl(mediaUrl(`/api/renders/${renderJobId}/download`));
    }
  }, [renderJobQ.data, renderJobId]);

  // --------------------------------------------------------------- editing

  function addClip(asset: AssetDTO) {
    const clip: Clip = {
      id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
      assetId: asset.id,
      track: asset.kind === "audio" ? "audio" : "video",
      start: totalDuration(),
      inPoint: 0,
      outPoint: asset.duration || 5,
      volume: 1,
      muted: false,
    };
    setTimeline((t) => ({ ...t, clips: [...t.clips, clip] }));
    setSelectedClipId(clip.id);
  }

  function totalDuration(): number {
    return timeline.clips
      .filter((c) => c.track === "video")
      .reduce((s, c) => s + (c.outPoint - c.inPoint), 0);
  }

  function updateClip(id: string, patch: Partial<Clip>) {
    setTimeline((t) => ({
      ...t,
      clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removeClip(id: string) {
    setTimeline((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) }));
    if (selectedClipId === id) setSelectedClipId(null);
  }

  function moveClip(id: string, dir: -1 | 1) {
    setTimeline((t) => {
      const i = t.clips.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= t.clips.length) return t;
      const clips = [...t.clips];
      [clips[i], clips[j]] = [clips[j], clips[i]];
      return { ...t, clips };
    });
  }

  const selectedClip = timeline.clips.find((c) => c.id === selectedClipId) ?? null;
  const selectedAsset = selectedClip
    ? assets.find((a) => a.id === selectedClip.assetId)
    : undefined;

  // -------------------------------------------------------------- render

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* ------------------------------ top bar */}
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center gap-3 sticky top-0 z-20 bg-zinc-950">
        <Logo />
        <input
          className="bg-transparent text-sm font-semibold border border-transparent hover:border-zinc-700 rounded px-2 py-1 w-56 focus:outline-none focus:border-zinc-600"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          data-testid="input-project-name"
        />
        <div className="flex-1" />
        <a href="#/api-docs" className="text-xs text-zinc-400 hover:text-zinc-200 mr-2">
          API docs
        </a>
        <button
          className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700"
          onClick={() => createProject.mutate()}
          data-testid="button-create-project"
        >
          New project
        </button>
        <button
          className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"
          disabled={!projectId || saveProject.isPending}
          onClick={() => saveProject.mutate()}
          data-testid="button-save-project"
        >
          Save
        </button>
        <button
          className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
          disabled={!projectId || submitRender.isPending}
          onClick={() => submitRender.mutate()}
          data-testid="button-render"
        >
          Render
        </button>
      </header>

      {/* ------------------------------ main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* media library */}
        <aside className="w-56 border-r border-zinc-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800">
            Media library
          </div>
          <label
            className="m-3 border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition text-xs text-zinc-400"
            data-testid="button-upload"
          >
            {isUploading ? "Uploading…" : "Click to upload video / audio / image"}
            <input
              type="file"
              multiple
              accept="video/*,audio/*,image/*"
              className="hidden"
              onChange={(e) => e.target.files?.length && uploadFiles.mutate(e.target.files)}
            />
          </label>
          <div className="flex-1 overflow-y-auto px-2 space-y-2 pb-4">
            {assets.length === 0 && (
              <div className="text-xs text-zinc-600 px-2 py-4">No media yet. Upload files above.</div>
            )}
            {assets.map((a) => (
              <div
                key={a.id}
                className="border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-600 cursor-pointer group"
                onClick={() => addClip(a)}
                data-testid={`card-asset-${a.id}`}
                title="Click to add to timeline"
              >
                <div className="relative aspect-video bg-zinc-900 flex items-center justify-center overflow-hidden">
                  <img
                    src={mediaUrl(a.thumbnailUrl)}
                    alt=""
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                    crossOrigin="anonymous"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                  <span className="absolute bottom-1 right-1 bg-black/70 text-[10px] px-1 rounded">
                    {a.kind === "audio" ? "🔊" : a.kind === "image" ? "🖼" : "🎬"}
                  </span>
                </div>
                <div className="px-2 py-1 text-[11px] truncate" title={a.filename}>
                  {a.filename}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* timeline + preview */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* preview */}
          <div className="flex-1 flex items-center justify-center bg-black relative overflow-hidden">
            {previewAssetId ? (
              <video
                className="max-h-full max-w-full"
                src={mediaUrl(`/api/media/${previewAssetId}/raw`)}
                controls
                data-testid="video-preview"
              />
            ) : renderResultUrl ? (
              <video className="max-h-full max-w-full" src={renderResultUrl} controls data-testid="video-render-result" />
            ) : (
              <div className="text-zinc-600 text-sm">Select a clip to preview, or render to see output</div>
            )}
            {/* timeline preview scrubber */}
            {timeline.clips.length > 0 && !previewAssetId && (
              <TimelinePreview
                clips={timeline.clips}
                assets={assets}
                mediaUrl={mediaUrl}
                onClipClick={(id) => setSelectedClipId(id)}
              />
            )}
          </div>

          {/* timeline tracks */}
          <div className="border-t border-zinc-800 flex flex-col h-64 overflow-hidden">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800 flex items-center">
              Timeline
              <span className="ml-2 text-[10px] normal-case text-zinc-500 font-normal">
                {totalDuration().toFixed(1)}s total
              </span>
              <div className="flex-1" />
              <span className="text-[10px] normal-case text-zinc-500 font-normal mr-2">
                Click a media asset to append · drag a clip to reposition · use the inspector to trim
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {timeline.clips.length === 0 && (
                <div className="text-xs text-zinc-600 py-6 text-center">
                  Timeline is empty. Click a media asset in the library to add a clip.
                </div>
              )}
              {(["video", "audio", "overlay"] as const).map((track) => {
                const trackClips = timeline.clips.filter((c) => c.track === track);
                if (trackClips.length === 0 && track !== "video") return null;
                return (
                  <div key={track} className="flex items-center gap-2">
                    <div className="w-16 text-[10px] uppercase text-zinc-500 shrink-0">
                      {track}
                    </div>
                    <div
                      className="flex-1 relative bg-zinc-900/50 rounded h-10 overflow-hidden"
                      onDragOver={(e) => e.preventDefault()}
                    >
                      {trackClips.map((c) => (
                        <TimelineClipView
                          key={c.id}
                          clip={c}
                          asset={assets.find((a) => a.id === c.assetId)}
                          selected={selectedClipId === c.id}
                          onSelect={() => setSelectedClipId(c.id)}
                          onRemove={() => removeClip(c.id)}
                          onMove={(dir) => moveClip(c.id, dir)}
                          onPreview={() => setPreviewAssetId(c.assetId)}
                        />
                      ))}
                      {trackClips.length === 0 && track === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-700">
                          drop clips here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* inspector */}
        <aside className="w-64 border-l border-zinc-800 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800">
            Inspector
          </div>
          {!selectedClip && (
            <div className="px-3 py-6 text-xs text-zinc-600">
              Select a clip on the timeline to edit it.
            </div>
          )}
          {selectedClip && (
            <ClipInspector
              clip={selectedClip}
              asset={selectedAsset}
              onChange={(p) => updateClip(selectedClip.id, p)}
              onRemove={() => removeClip(selectedClip.id)}
            />
          )}

          {/* render status */}
          {renderJobId && (
            <div className="px-3 py-3 border-t border-zinc-800 text-xs space-y-1">
              <div className="font-semibold">Render</div>
              <div data-testid="text-render-status">
                status: {renderJobQ.data?.status ?? "…"}
                {renderJobQ.data?.progress ? ` (${Math.round(renderJobQ.data.progress * 100)}%)` : ""}
              </div>
              {renderJobQ.data?.error && (
                <div className="text-red-400">error: {renderJobQ.data.error}</div>
              )}
              {renderResultUrl && (
                <a
                  href={renderResultUrl}
                  download
                  className="inline-block mt-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
                >
                  Download MP4
                </a>
              )}
            </div>
          )}

          {/* projects list */}
          <div className="px-3 py-3 border-t border-zinc-800">
            <div className="text-xs font-semibold mb-2">Projects</div>
            {(projectsData?.projects ?? []).map((p) => (
              <button
                key={p.id}
                className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-800 mb-1 truncate"
                onClick={() => {
                  setProjectId(p.id);
                  setProjectName(p.name);
                  setTimeline(p.timeline);
                  setSelectedClipId(null);
                  setRenderJobId(null);
                  setRenderResultUrl(null);
                }}
                data-testid={`button-load-project-${p.id}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 text-xs px-4 py-2 rounded shadow-lg z-50"
          data-testid="toast"
        >
          {toast}
          <button className="ml-3 text-zinc-500 hover:text-white" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l6-3v10l-6-3" />
        <path d="M5 3h7" />
      </svg>
      <span className="font-bold text-sm">VideoForge</span>
    </div>
  );
}

function TimelinePreview({
  clips,
  assets,
  mediaUrl,
  onClipClick,
}: {
  clips: Clip[];
  assets: AssetDTO[];
  mediaUrl: (url: string) => string;
  onClipClick: (id: string) => void;
}) {
  const videoClips = clips.filter((c) => c.track === "video");
  const total = videoClips.reduce((s, c) => s + (c.outPoint - c.inPoint), 0);
  if (total <= 0) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, rgba(59,130,246,0.06), transparent 60%)",
      }}
    >
      <div className="absolute bottom-4 left-4 right-4 flex gap-1 pointer-events-auto">
        {videoClips.map((c) => {
          const w = ((c.outPoint - c.inPoint) / total) * 100;
          const a = assets.find((x) => x.id === c.assetId);
          return (
            <button
              key={c.id}
              className="relative h-12 rounded overflow-hidden border border-zinc-700 group"
              style={{ width: `${Math.max(4, w)}%` }}
              onClick={() => onClipClick(c.id)}
              title={a?.filename}
            >
              {a && (
                <img
                  src={mediaUrl(a.thumbnailUrl)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100"
                  crossOrigin="anonymous"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] px-1 truncate">
                {(c.outPoint - c.inPoint).toFixed(1)}s
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineClipView({
  clip,
  asset,
  selected,
  onSelect,
  onRemove,
  onMove,
  onPreview,
}: {
  clip: Clip;
  asset: AssetDTO | undefined;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onPreview: () => void;
}) {
  const dragRef = useRef<HTMLDivElement | null>(null);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", clip.id);
    dragRef.current = e.currentTarget as HTMLDivElement;
  }

  return (
    <div
      className={`absolute top-1 bottom-1 rounded border-2 flex items-center px-2 cursor-pointer group overflow-hidden ${
        selected ? "border-blue-500 bg-blue-950/40" : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
      }`}
      style={{
        left: `${clip.start * 30}px`,
        width: `${Math.max(30, (clip.outPoint - clip.inPoint) * 30)}px`,
      }}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      data-testid={`clip-${clip.id}`}
    >
      <span className="text-[10px] truncate flex-1" title={asset?.filename}>
        {clip.text ? `📝 ${clip.text.slice(0, 20)}` : asset?.filename ?? clip.assetId}
      </span>
      <div className="hidden group-hover:flex items-center gap-1">
        <button
          className="text-[10px] hover:text-white"
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          title="Preview"
        >
          ▶
        </button>
        <button
          className="text-[10px] hover:text-white"
          onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          title="Move left"
        >
          ←
        </button>
        <button
          className="text-[10px] hover:text-white"
          onClick={(e) => { e.stopPropagation(); onMove(1); }}
          title="Move right"
        >
          →
        </button>
        <button
          className="text-[10px] text-red-400 hover:text-red-300"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ClipInspector({
  clip,
  asset,
  onChange,
  onRemove,
}: {
  clip: Clip;
  asset: AssetDTO | undefined;
  onChange: (patch: Partial<Clip>) => void;
  onRemove: () => void;
}) {
  const [textDraft, setTextDraft] = useState(clip.text ?? "");
  useEffect(() => setTextDraft(clip.text ?? ""), [clip.id]);

  const dur = clip.outPoint - clip.inPoint;

  return (
    <div className="px-3 py-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-semibold truncate" title={asset?.filename}>
          {asset?.filename ?? clip.assetId}
        </div>
        <button className="text-red-400 hover:text-red-300" onClick={onRemove} data-testid="button-remove-clip">
          Remove
        </button>
      </div>

      {asset && (
        <div className="text-[11px] text-zinc-500 space-y-0.5">
          <div>kind: {asset.kind}</div>
          <div>source duration: {asset.duration.toFixed(2)}s</div>
          {asset.width > 0 && <div>resolution: {asset.width}×{asset.height}</div>}
        </div>
      )}

      {/* trim */}
      <div className="space-y-1">
        <label className="block text-zinc-400">
          in point: <span className="text-white">{clip.inPoint.toFixed(2)}s</span>
        </label>
        <input
          type="range" min={0} max={Math.max(0.1, clip.outPoint - 0.1)} step={0.05}
          value={clip.inPoint}
          onChange={(e) => onChange({ inPoint: parseFloat(e.target.value) })}
          className="w-full"
          data-testid="input-trim-in"
        />
        <label className="block text-zinc-400">
          out point: <span className="text-white">{clip.outPoint.toFixed(2)}s</span>
        </label>
        <input
          type="range" min={clip.inPoint + 0.1} max={Math.max(clip.inPoint + 0.2, asset?.duration ?? 999)}
          step={0.05} value={clip.outPoint}
          onChange={(e) => onChange({ outPoint: parseFloat(e.target.value) })}
          className="w-full"
          data-testid="input-trim-out"
        />
        <div className="text-[11px] text-zinc-500">clip duration: {dur.toFixed(2)}s</div>
      </div>

      {/* timeline position */}
      <div className="space-y-1">
        <label className="block text-zinc-400">
          timeline start: <span className="text-white">{clip.start.toFixed(2)}s</span>
        </label>
        <input
          type="range" min={0} max={600} step={0.1}
          value={clip.start}
          onChange={(e) => onChange({ start: parseFloat(e.target.value) })}
          className="w-full"
          data-testid="input-start"
        />
      </div>

      {/* audio */}
      {clip.track !== "overlay" && (
        <div className="space-y-1">
          <label className="block text-zinc-400">
            volume: <span className="text-white">{Math.round(clip.volume * 100)}%</span>
          </label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={clip.volume}
            onChange={(e) => onChange({ volume: parseFloat(e.target.value) })}
            className="w-full"
            data-testid="input-volume"
          />
          <label className="flex items-center gap-2 text-zinc-400">
            <input
              type="checkbox" checked={clip.muted}
              onChange={(e) => onChange({ muted: e.target.checked })}
              data-testid="input-muted"
            />
            muted
          </label>
        </div>
      )}

      {/* text overlay */}
      <div className="space-y-1">
        <label className="block text-zinc-400">text overlay</label>
        <textarea
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          rows={2}
          value={textDraft}
          placeholder="Optional caption shown on this clip"
          onChange={(e) => setTextDraft(e.target.value)}
          onBlur={() => onChange({ text: textDraft || undefined })}
          data-testid="input-text-overlay"
        />
      </div>
    </div>
  );
}
