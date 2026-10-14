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

- **Public homepage** (`#/`) with a working composition playground and links to Studio and docs
- **Searchable documentation** (`#/docs/introduction`) with guides, endpoint reference, keyboard search, section navigation, previous/next links, light/dark themes and mobile navigation. `#/api-docs` remains the legacy HTTP reference route
- **Motion graphics**: asset-free rectangles, ellipses and lines with fill, stroke and corners; lower-third, title-card, callout, kinetic-type and countdown templates. Generated layers remain editable clips
- **Safer agent editing**: `dryRun`, `expectedUpdatedAt` revision guards, `createdClipIds`, timeline validation, shape JSON Schema, template discovery and stagger operations
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

## Motion graphics

The Studio now lives at `#/editor`. Its Graphics library adds templates or shapes at the playhead with headline, subtitle, accent and duration controls. Select a shape to edit dimensions, fill, stroke and corners; use the Motion inspector to animate transforms. Browser API keys are held in memory only, so reloading requires signing in again.

```json
{
  "op": "add_motion_template",
  "args": {
    "template": "lower-third",
    "title": "Ada Lovelace",
    "subtitle": "Pioneer of computing",
    "color": "#f6a447",
    "start": 0,
    "duration": 4
  }
}
```

Send this to `POST /api/projects/:id/timeline/ops` with a write-capable Bearer key. The response includes editable layer IDs in `createdClipIds`. Discover options via `GET /api/capabilities`, `GET /api/motion/templates` and `GET /api/graphics/schema`.

Shape dimensions are composition fractions; stroke and radius use output pixels. Layer families are media, shapes, then text. There is no arbitrary SVG, Lottie, expressions, 3D or nested scene graph. Browser and FFmpeg output can differ slightly in font metrics and cubic easing approximation.

## Cursors, Follow, multi-select and transitions

Everyone with a key that can read a project sees colored live cursors on the timeline and preview, plus each other's playheads and selections. Click a person's avatar to Follow them. Shift-click or drag a box to select several clips, move or edit them together, and add dissolves and wipes between video clips from the Effects tab or the inspector. Details are in [docs/API.md](docs/API.md).

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

## Tests

```bash
npm run check
npm test
npm run build
```

`test/graphics.spec.ts` covers normalization, templates, staggered sequencing and actual FFmpeg output (pixel checks, rounded/outlined shapes, animated positions, every template and MP4 export). `test/api.spec.ts` covers authentication, restrictions, safe batches, discovery and validation. FFmpeg and ffprobe are required for rendering tests.

## Save data and durability

VideoForge now has three layers of save, so nothing is ever silently lost:

1. **Server DB (source of truth).** `VIDEOFORGE_DB` points at SQLite on the
   persistent disk (Render: `/var/lib/videoforge/data/data.db`). Every project,
   asset and render job lives here.
2. **Save manifest on the persistent disk.** Set `VIDEOFORGE_SYNC_DIR` to a
   writable path on the same disk. The server writes a JSON manifest of every
   DB row (never a plaintext key, only hashes) and, on boot, restores anything
   missing from the manifest so a rebuild or redeploy does not leave you with
   an empty project list. It is only written if a row is missing on restore,
   so it never overwrites newer DB rows.
3. **Browser-local drafts.** The editor keeps a debounced (300 ms) snapshot of
   the working copy in `localStorage` under `vf.local.v1.*`. It includes the
   unsaved timeline, selection, playhead, zoom and last panel, so a tab close,
   a refresh or a network blip never takes your project with you. On mount the
   editor restores the draft automatically. A "Local drafts" entry in the
   Tools menu lists every draft on the device, with a delete and a clear-all.

The durable paths are opt-in via env vars, so a default local dev run is
unchanged. On Render:

```
VIDEOFORGE_DB=/var/lib/videoforge/data/data.db
VIDEOFORGE_SYNC_DIR=/var/lib/videoforge/data/restore
VIDEOFORGE_MEDIA_DIR=/var/lib/videoforge/data/media
VIDEOFORGE_RENDER_DIR=/var/lib/videoforge/data/renders
```

Nothing here ever stores a plaintext API key — only the SHA-256 hash, same as
the DB.
