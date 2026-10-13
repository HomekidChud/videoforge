# VideoForge — browser video editor with an agent API

A full-stack web app: a timeline-based video editor in the browser, backed by
an Express + SQLite + FFmpeg server. The same HTTP API that powers the editor
is exposed for **AI agents** to upload video, edit timelines, and trigger renders,
gated behind **API keys with permission scopes** (`read`, `write`, `admin`).

## Stack

- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui + wouter + TanStack Query
- **Backend:** Express 5, better-sqlite3 (Drizzle ORM), FFmpeg + ffprobe (render, thumbnails, probing)
- **Storage:** `data/media/` (uploads), `data/renders/` (outputs), `data.db` (SQLite, override with `VIDEOFORGE_DB`)

## Features

- **Studio editor:** live compositing preview, three-lane timeline (titles and overlays, video, audio) with drag-to-move across lanes, trim handles, snapping, zoom, audio waveforms, split, duplicate, ripple delete, undo/redo, autosave and keyboard shortcuts
- Per-clip speed, fades, colour filters, brightness/contrast/saturation, opacity, position and scale, picture-in-picture, standalone titles with size, colour and background box
- Upload video / audio / image via drag-and-drop or file picker (streamed, up to 2 GB by default)
- Render via FFmpeg to a downloadable MP4, with progress and an in-app preview
- **Developer platform** (`#/platform`): generate and revoke API keys, restrict them by expiry, rate limit, browser origin, project, and upload/render/delete rights, and set each project public or private
- Public share page (`#/share/:id`) that shows only the latest finished render of a public project
- Full HTTP API (`/api/...`) for programmatic use by other AI agents or scripts
- **API keys with scopes** (`read` / `write` / `admin`) so you can grant an AI agent
  exactly the permissions it needs and revoke them later

## Editing and animation

The studio supports keyframes on position, scale, rotation, opacity, volume and colour, with a value graph and draggable bezier tween slopes, motion presets, on-canvas move and scale handles, markers, track mute and hide, title presets, copy and paste, and a background colour. Everything is exposed through the timeline ops API (batches, keyframes, frame previews, state evaluation and a capabilities endpoint). See [docs/API.md](docs/API.md).

## Live watching

Master admins get a Live page that lists every project and opens any of them in a view-only mode. It follows the editor's unsaved timeline, playhead, selection and animated values, refreshed ten times a second, with an activity feed that also shows API and agent edits. See the live section of [docs/API.md](docs/API.md).

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

Keys can also carry restrictions (expiry, allowed origins, project list, requests per minute, upload/render/delete switches). Generate them from the Developer platform page or via `POST /api/keys`. Projects are private unless an admin key makes them public.

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
