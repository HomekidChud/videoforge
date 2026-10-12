import { useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
  body?: string;
  example?: string;
};

const endpoints: Endpoint[] = [
  { method: "GET", path: "/api/health", desc: "Health check. Returns service name and version." },
  { method: "POST", path: "/api/media/upload", desc: "Upload one or more media files (video, audio, image). Accepts multipart/form-data with a `files` field. Returns the created asset(s) with duration, resolution, uploadUrl, thumbnailUrl.", body: "multipart/form-data: files[]=a.mp4, files[]=b.mp3" },
  { method: "GET", path: "/api/media", desc: "List all uploaded media assets." },
  { method: "GET", path: "/api/media/:id", desc: "Get one asset's metadata." },
  { method: "DELETE", path: "/api/media/:id", desc: "Delete an asset and its file." },
  { method: "GET", path: "/api/media/:id/raw", desc: "Stream the raw media file (use for downloads or playing back)." },
  { method: "GET", path: "/api/media/:id/thumb", desc: "Get a JPEG thumbnail for the asset (first video frame, or scaled image)." },
  { method: "POST", path: "/api/projects", desc: "Create a project with an initial timeline.", body: `{\n  "name": "My edit",\n  "timeline": {\n    "fps": 30,\n    "resolution": {"width": 1280, "height": 720},\n    "clips": []\n  }\n}` },
  { method: "GET", path: "/api/projects", desc: "List all projects with their timelines." },
  { method: "GET", path: "/api/projects/:id", desc: "Get one project with its timeline." },
  { method: "PUT", path: "/api/projects/:id", desc: "Replace a project's timeline (full overwrite) or rename it.", body: `{\n  "name": "Renamed",\n  "timeline": { "fps": 30, "resolution": {"width":1280,"height":720}, "clips": [...] }\n}` },
  { method: "DELETE", path: "/api/projects/:id", desc: "Delete a project." },
  { method: "POST", path: "/api/projects/:id/timeline/ops", desc: "Apply a single timeline edit atomically. Supported ops: add_clip, remove_clip, trim_clip, move_clip, set_audio, add_text, reorder.", body: `{\n  "op": "add_clip",\n  "args": {\n    "assetId": "abc123",\n    "track": "video",\n    "start": 0,\n    "inPoint": 0,\n    "outPoint": 5.2,\n    "volume": 1,\n    "muted": false,\n    "text": "Hello world"\n  }\n}` },
  { method: "POST", path: "/api/renders", desc: "Queue a render for a project. Returns a jobId you poll.", body: `{ "projectId": "xyz" }` },
  { method: "GET", path: "/api/renders", desc: "List render jobs, optionally filtered by ?projectId=" },
  { method: "GET", path: "/api/renders/:id", desc: "Get one render job's status (queued, rendering, done, error) and progress." },
  { method: "GET", path: "/api/renders/:id/download", desc: "Download the finished MP4 when the job is done." },
];

function MethodBadge({ m }: { m: Endpoint["method"] }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-600",
    POST: "bg-blue-600",
    PUT: "bg-amber-600",
    DELETE: "bg-red-600",
  };
  return (
    <span className={`${colors[m]} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}>
      {m}
    </span>
  );
}

export default function ApiDocsPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">VideoForge Agent API</h1>
      <p className="text-sm text-zinc-400 mb-6">
        This is the same HTTP API that powers the editor UI. Any AI agent (or any
        script) can upload video, build a timeline, edit clips, and request a render.
        Base URL: <code className="bg-zinc-800 px-1 rounded">{API_BASE || "(same origin)"}</code>
      </p>

      <h2 className="text-lg font-semibold mb-3">Timeline model</h2>
      <pre className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs overflow-x-auto mb-6">{`{
  "fps": 30,
  "resolution": { "width": 1280, "height": 720 },
  "clips": [
    {
      "id": "unique-per-project",
      "assetId": "<from /api/media>",
      "track": "video" | "audio" | "overlay",
      "start": 0,       // timeline start (seconds)
      "inPoint": 0,     // trim start within source (seconds)
      "outPoint": 5.2,  // trim end within source (seconds)
      "volume": 1,      // 0..1
      "muted": false,
      "text": "optional caption"  // burned into output
    }
  ]
}`}</pre>

      <h2 className="text-lg font-semibold mb-3">Endpoints</h2>
      <div className="space-y-2">
        {endpoints.map((e, i) => (
          <div key={e.path + e.method} className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-900"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <MethodBadge m={e.method} />
              <code className="text-xs">{e.path}</code>
              <span className="text-xs text-zinc-500 flex-1 truncate">{e.desc}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-xs text-zinc-400">{e.desc}</p>
                {e.body && (
                  <div>
                    <div className="text-[11px] uppercase text-zinc-500 mb-1">Request body</div>
                    <pre className="bg-zinc-900 rounded p-3 text-[11px] overflow-x-auto">{e.body}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Agent workflow example</h2>
      <pre className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs overflow-x-auto">{`# 1. Upload a video
curl -F "files=@clip.mp4" $BASE/api/media/upload
# → { "assets": [{ "id": "abc", ... }] }

# 2. Create a project
curl -X POST $BASE/api/projects \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Agent edit","timeline":{"clips":[]}}'
# → { "id": "prj", ... }

# 3. Add a clip from that asset
curl -X POST $BASE/api/projects/prj/timeline/ops \\
  -H 'Content-Type: application/json' \\
  -d '{"op":"add_clip","args":{"assetId":"abc","outPoint":5}}'

# 4. Trim / caption / reorder via ops
curl -X POST $BASE/api/projects/prj/timeline/ops \\
  -H 'Content-Type: application/json' \\
  -d '{"op":"trim_clip","args":{"clipId":"<clip>","inPoint":1,"outPoint":4}}'
curl -X POST $BASE/api/projects/prj/timeline/ops \\
  -H 'Content-Type: application/json' \\
  -d '{"op":"add_text","args":{"clipId":"<clip>","text":"Hi"}}'

# 5. Render
curl -X POST $BASE/api/renders -H 'Content-Type: application/json' -d '{"projectId":"prj"}'
# → { "jobId": "j1" }

# 6. Poll and download
curl $BASE/api/renders/j1
curl -o out.mp4 $BASE/api/renders/j1/download`}</pre>

      <div className="mt-8">
        <a href="#/" className="text-blue-400 hover:underline text-sm">← Back to editor</a>
      </div>
    </div>
  );
}
