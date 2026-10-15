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
- **Motion graphics**: asset-free rectangles, ellipses and lines with fill, stroke and corners; thirteen templates (lower-third, title-card, callout, kinetic-type, countdown, quote-card, split-reveal, progress-bar, stat-highlight, bullet-list, social-handle, chapter-number, starburst). Generated layers remain editable clips
- **Motion engine v2**: thirty-three timed, strength-scaled motion presets in three groups (entrances, emphasis, exits: spring, bounce-in, rubber, tada, glitch, heartbeat, shrink-out, spin-out and more), sequencing across layers, reverse and retime, beat markers and beat snapping, `snappy`/`anticipate`/`step-start` easings and a `reveal` wipe property. See [Gallery](#gallery)
- **Animate with code**: give any property an expression of time (`x: "0.5 + 0.2 * cos(t * 2)"`). Thirteen looping recipes (float, orbit, wiggle, heartbeat, glitch...), bake to keyframes, live validation in Studio. See [Animate with code](#animate-with-code)
- **Perfect fit**: text wraps and shrinks to fit by default, footage can contain, cover or stretch, `fit_clip` / `fit_all` pull layers inside the frame and `GET /api/projects/:id/fit-report` lists anything that does not fit. See [Fit and layout](#fit-and-layout)
- **Transitions**: dissolve, five wipes (left, right, up, down, diagonal), iris, barn doors (horizontal and vertical) and diamond, in preview and FFmpeg
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

## Documentation

Every page on the site (`#/docs/<slug>`) is a markdown file in [docs/](docs/) —
edit the file and open a PR; `npm run docs` compiles `docs/*.md` into the site
(see [docs/README.md](docs/README.md)). `#/docs` and `#/docs/` redirect to the
introduction. [docs/API.md](docs/API.md) remains the expanded HTTP reference.

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

Shape dimensions are composition fractions; stroke and radius use output pixels. Layer families are media, shapes, then text. There is no arbitrary SVG, Lottie, 3D or nested scene graph. Expressions are a safe formula language, not scripts: no loops, strings or property access. `reveal` works on media and shapes, not text. Browser and FFmpeg output can differ slightly in font metrics and cubic easing approximation.

## Gallery

Rendered with the real FFmpeg pipeline by `npm run examples` (sources in [`shared/examples.ts`](shared/examples.ts)). The same compositions play live, with their JSON, at `#/docs/examples` in the app. None of them uses uploaded media.

| | |
| --- | --- |
| ![Entrance presets](docs/examples/preset-sampler.gif)<br>**Entrance presets** | ![Beat-synced circles](docs/examples/beat-drop.gif)<br>**Beat drop**: `add_beat_markers` + `apply_motion_sequence` |
| ![Lower third with wipe reveal](docs/examples/lower-third-reveal.gif)<br>**Lower third** with wipe reveal | ![Kinetic type with whip-ins](docs/examples/kinetic-whip.gif)<br>**Kinetic type** with sequenced whip-ins |
| ![Quote card](docs/examples/quote-card.gif)<br>**Quote card** | ![Split reveal](docs/examples/split-reveal.gif)<br>**Split reveal** chapter title |
| ![Progress bar](docs/examples/progress-bar.gif)<br>**Progress bar** | ![Stat highlight](docs/examples/stat-highlight.gif)<br>**Stat highlight** |
| ![Transitions reel](docs/examples/transitions.gif)<br>**Transitions**: wipe-up, iris, wipe-down | ![Transitions reel 2](docs/examples/transitions-2.gif)<br>**More transitions**: barn doors, diamond, diagonal wipe |
| ![Emphasis presets](docs/examples/emphasis-sampler.gif)<br>**Emphasis presets** | ![Exit presets](docs/examples/exit-sampler.gif)<br>**Exit presets** |
| ![Orbit with code](docs/examples/code-orbit.gif)<br>**Orbit with code**: expressions only | ![Looping code recipes](docs/examples/loop-recipes.gif)<br>**Looping recipes**: `apply_code_motion` |
| ![Text that always fits](docs/examples/fit-demo.gif)<br>**Text that fits**: wrap, shrink, `fit_all` | ![Bullet list](docs/examples/bullet-points.gif)<br>**Bullet list** template |
| ![Starburst badge](docs/examples/starburst-badge.gif)<br>**Starburst badge** | ![Chapter number](docs/examples/chapter-opener.gif)<br>**Chapter number** |
| ![Social handle](docs/examples/social-handle.gif)<br>**Social handle** | |

A snippet from the beat-synced example, ready to POST to `/api/projects/:id/timeline/ops`:

```json
{
  "ops": [
    { "op": "add_beat_markers", "args": { "bpm": 120, "count": 8 } },
    { "op": "add_shape_clip", "args": { "id": "b0", "x": 0.2, "y": 0.46, "duration": 4, "shape": { "type": "ellipse", "width": 0.11, "height": 0.196, "fill": "#f6a447" } } },
    { "op": "add_shape_clip", "args": { "id": "b1", "x": 0.4, "y": 0.46, "duration": 3.5, "shape": { "type": "ellipse", "width": 0.11, "height": 0.196, "fill": "#7cc4ff" } } },
    { "op": "apply_motion_sequence", "args": { "clipIds": ["b0", "b1"], "preset": "spring", "stagger": 0.5, "duration": 0.9 } }
  ]
}
```

## Motion presets, sequencing and beats

```json
{ "op": "apply_motion", "args": { "clipId": "badge", "preset": "spring", "delay": 0.4, "duration": 1.2, "strength": 1.5 } }
{ "op": "apply_motion_sequence", "args": { "clipIds": ["k-0","k-1","k-2"], "preset": "whip", "stagger": 0.2 } }
{ "op": "reverse_animation", "args": { "clipId": "badge" } }
{ "op": "retime_animation", "args": { "clipId": "badge", "duration": 0.8, "delay": 3 } }
{ "op": "add_beat_markers", "args": { "bpm": 120, "count": 8 } }
```

In Studio, the Motion tab has Duration, Delay and Strength controls for the preset grid, plus a Reverse animation button. `add_motion_template` accepts `idPrefix` so a batch can name the layers it creates. Full reference: [docs/API.md](docs/API.md#motion-engine-v2-timeline-v4-capabilities-v5).

## Animate with code

Any animatable property accepts an expression instead of keyframes. Studio and FFmpeg compile the same parsed tree, so the preview matches the render. Variables: `t` (seconds), `d` (clip length), `p` (0 to 1), `base` (static value), `pi`. Functions include `sin cos abs min max clamp mix smoothstep easeOut noise tri fract mod if` and `wiggle(freq, amount)`.

```json
{ "op": "animate_code", "args": { "clipId": "badge", "expressions": { "x": "0.5 + 0.2 * cos(t * 2)", "y": "0.5 + 0.2 * sin(t * 2)", "rotation": "wiggle(2, 4)" } } }
{ "op": "apply_code_motion", "args": { "clipIds": ["badge", "logo"], "recipe": "float", "speed": 1.2, "strength": 1 } }
{ "op": "bake_expression", "args": { "clipId": "badge", "property": "x", "samples": 32 } }
```

Recipes: float, sway, breathe, heartbeat, wiggle, orbit, spin, pendulum, bounce, flicker, pulse-glow, drift-loop, glitch. Expressions are limited to 300 characters, cannot reach anything except numbers, and fall back to the static value on invalid maths. Reveal expressions are not allowed on text. In Studio open Motion, then Animate with code.

## Fit and layout

```json
{ "op": "add_text_clip", "args": { "id": "h", "text": "A very long headline", "textMaxWidth": 0.8 } }
{ "op": "fit_clip", "args": { "clipId": "badge", "margin": 0.05 } }
{ "op": "fit_all", "args": { "media": "contain" } }
{ "op": "set_project", "args": { "resolution": { "width": 1080, "height": 1920 }, "refit": true } }
```

Text wraps and shrinks inside `textMaxWidth` (default 0.9) and `textMaxHeight` (default 0.5); set `textFit: "none"` to opt out. Footage supports `fit: contain | cover | fill`. `GET /api/projects/:id/fit-report?margin=0.04` lists clips that leave the frame. Text width is a Noto Sans based estimate with about 12% spare room, and fit does not consider x/y travel of entrance animations.

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
npm run examples   # re-render docs/examples/*.gif with FFmpeg
```

`test/graphics.spec.ts` covers normalization, templates, every motion preset, sequencing, reverse/retime, beat tools and actual FFmpeg output (pixel checks, rounded/outlined shapes, animated positions, wipe reveal, every template and every example). `test/api.spec.ts` covers authentication, restrictions, safe batches, discovery and validation. FFmpeg and ffprobe are required for rendering tests.

## Save data and durability

VideoForge now has three layers of save, so nothing is ever silently lost:

1. **Server DB (source of truth).** `VIDEOFORGE_DB` points at SQLite on the
   persistent disk (Render: `/var/lib/videoforge/data/data.db`). Every project,
   asset and render job lives here.
2. **Save manifest on the persistent disk (backup only).** Set
   `VIDEOFORGE_SYNC_DIR` to a writable path on the same disk. The server writes
   a JSON manifest of every DB row (never a plaintext key, only hashes). This
   is a point-in-time backup, not a mirror: it is **not** merged back on boot,
   because a stale manifest would resurrect a project you deleted or reactivate
   a key you revoked. If a rebuild loses the DB, restore by hand with the
   explicit `npm run durable:restore` (it merges only rows that are missing
   from the live DB and never overwrites an existing row).
3. **Browser-local drafts.** The editor keeps a debounced (300 ms) snapshot of
   the working copy in `localStorage` under `vf.local.v1.*`. It includes the
   unsaved timeline, selection, playhead, zoom and last panel, so a tab close,
   a refresh or a network blip never takes your project with you. On mount the
   editor restores the draft automatically and marks it genuinely dirty so the
   next autosave persists it. A "Local drafts" entry in the Tools menu lists
   every draft on the device, with a delete and a clear-all.

The durable paths are opt-in via env vars, so a default local dev run is
unchanged. On Render (needs a persistent disk mounted at
`/var/lib/videoforge/data` — without it, media and the DB reset on every
restart on the free tier):

```
VIDEOFORGE_DB=/var/lib/videoforge/data/data.db
VIDEOFORGE_SYNC_DIR=/var/lib/videoforge/data/restore
VIDEOFORGE_MEDIA_DIR=/var/lib/videoforge/data/media
VIDEOFORGE_RENDER_DIR=/var/lib/videoforge/data/renders
```

Nothing here ever stores a plaintext API key — only the SHA-256 hash, same as
the DB.

### Crash-safe durable paths

The durable directories are created on boot with graceful degradation: if a
configured path cannot be created or written (e.g. on Render, when the
persistent disk is missing or mounted elsewhere than the env vars expect), the
server never crashes with `EACCES` at startup. Instead it boots and degrades
explicitly:

- **Save-manifest backup** — disables itself with a warning; the SQLite DB is
  untouched and everything else works normally.
- **Database** — the server boots on an in-memory database, `GET /api/health`
  returns `ok: false` with a `warnings` array, and every mutating `/api`
  request is rejected with a `503` that names the fix. Writes are refused
  rather than silently accepted into a database that would lose them on
  redeploy. Fix `VIDEOFORGE_DB` and redeploy to return to normal.
- **Media / renders / tmp** — uploads and renders that need an unwritable
  directory fail with a clear per-request error; reads and everything else
  keep working.
- The manifest never mirrors a degraded database, and the bootstrap owner key
  is discarded (with guidance to set `VIDEOFORGE_BOOTSTRAP_KEY`) rather than
  printed into deployment logs.

Point every `VIDEOFORGE_*` path inside the actual disk mount and the warnings
disappear.

## MongoDB (optional)

VideoForge's datastore is SQLite. MongoDB is available as an **optional,
configuration-driven integration store** — it is not a replacement for the DB,
and enabling it does not move projects, media or API keys out of SQLite.

```bash
# .env
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/?retryWrites=true
MONGODB_DB=videoforge   # optional, default "videoforge"
```

Behaviour:

- **No `MONGODB_URI`** — nothing connects, no network access, app unchanged.
- **`MONGODB_URI` set** — the connection is created lazily on first use with
  bounded timeouts (5s server selection, 10s socket), so a dead cluster never
  hangs the server.
- **`GET /api/health` reports only whether MongoDB is configured** (`mongo:
  "configured"`) — it never pings the cluster, so an unreachable integration
  can never delay or fail app liveness. Verify connectivity on demand with
  `npm run mongo:check` (exit 0 on ok / not-configured, 1 on error — usable
  in deploy hooks and health scripts).
- Server code can `import { getMongoDb } from "./mongo"` and use the handle;
  the pool is closed on SIGTERM/SIGINT.
- A failed connection never falls back to another store and never crashes the
  process — callers get an error, and errors never expose credentials or
  driver messages (only the error name and code).

All env vars are documented in [`.env.example`](.env.example).
