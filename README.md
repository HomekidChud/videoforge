# VideoForge — browser video editor with an agent API

A full-stack web app: a timeline-based video editor in the browser, backed by
an Express + SQLite + FFmpeg server. The same HTTP API that powers the editor
is exposed for **AI agents** to upload video, edit timelines, and trigger renders,
gated behind **API keys with permission scopes** (`read`, `write`, `admin`).

## Stack

- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui + wouter + TanStack Query
- **Backend:** Express 5, better-sqlite3 (Drizzle ORM), FFmpeg + ffprobe (render, thumbnails, probing)
- **Storage:** `data/media/` (uploads), `data/renders/` (outputs), `data.db` (SQLite)

## Features

- Upload video / audio / image via drag-and-drop or file picker
- Multi-track timeline (video, audio, overlay) with click-to-add
- Trim (in/out point), reorder, per-clip volume/mute, text captions burned into output
- Render via FFmpeg → downloadable MP4, with job polling and progress
- Full HTTP API (`/api/...`) for programmatic use by other AI agents or scripts
- **API keys with scopes** (`read` / `write` / `admin`) so you can grant an AI agent
  exactly the permissions it needs and revoke them later

## Run

```bash
npm ci
npm run dev      # starts Express + Vite on :5000
```

Production:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## API keys

On first boot the server prints your **admin (owner) key** to the console and
writes it to `data/OWNER_KEY.txt` (gitignored). Save it somewhere safe, then
delete that file. With it you can mint scoped keys for other agents:

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer vf_admin_..." \
  -H "Content-Type: application/json" \
  -d '{"label":"Claude agent","scope":"write"}'
```

- `read` — list/read/download only
- `write` — read + upload media, edit projects, trigger renders
- `admin` — everything, including creating & revoking other keys

For the full reference (permissions table, every endpoint, scope matrix,
deployment, security notes) see **[docs/API.md](docs/API.md)**.

## Agent API

The editor UI is a thin client over the same JSON API. Any agent can:

1. `POST /api/media/upload` (multipart, `files[]`) → returns asset with `id`, `duration`, `thumbnailUrl`
2. `POST /api/projects` `{name, timeline}` → creates a project
3. `POST /api/projects/:id/timeline/ops` — atomic edits:
   - `add_clip` `{assetId, track, start, inPoint, outPoint, volume, muted, text}`
   - `remove_clip` `{clipId}`
   - `trim_clip` `{clipId, inPoint, outPoint}`
   - `move_clip` `{clipId, start}`
   - `set_audio` `{clipId, volume, muted}`
   - `add_text` `{clipId, text}`
   - `reorder` `{order: [clipIds]}`
4. `POST /api/renders` `{projectId}` → returns `jobId`
5. Poll `GET /api/renders/:jobId` until `status: "done"`
6. `GET /api/renders/:jobId/download` → MP4

See the in-app `#/api-docs` page for the complete reference.

## Timeline schema

```jsonc
{
  "fps": 30,
  "resolution": { "width": 1280, "height": 720 },
  "clips": [
    {
      "id": "unique-per-project",
      "assetId": "<from /api/media>",
      "track": "video",       // "video" | "audio" | "overlay"
      "start": 0,             // timeline start (seconds)
      "inPoint": 0,           // trim start within source (seconds)
      "outPoint": 5.2,         // trim end within source (seconds)
      "volume": 1,            // 0..1
      "muted": false,
      "text": "optional caption"
    }
  ]
}
```

## Requirements

- Node 20+
- `ffmpeg` and `ffprobe` on PATH
