# VideoForge Agent API — Complete Reference

VideoForge is a browser video editor with a first-class REST API for **AI agents**. Every endpoint the editor UI uses is the same JSON API exposed to external agents, so you can build, edit, and render video entirely programmatically.

This document explains **how to get an API key, what each permission (scope) does, and how to use every endpoint**.

## Motion graphics and safer agent batches (timeline v4)

The public homepage is `#/`, Studio is `#/editor`, and the new searchable guide site is `#/docs/introduction`. The existing `#/api-docs` link still opens the HTTP endpoint reference. Docs and the homepage do not require authentication. Browser sign-in now holds keys only in memory; refreshing requires signing in again.

### Discover the toolkit

All three endpoints require a read-capable Bearer key:

| Endpoint | Response |
| --- | --- |
| `GET /api/capabilities` | Version 5 catalog, shapes, templates, all ops, properties, limits and batch options |
| `GET /api/motion/templates` | `{templates:[{id,label,description}]}` |
| `GET /api/graphics/schema` | JSON Schema (2020-12) for the `shape` object |

### Create asset-free shapes

Send `add_shape_clip` to `POST /api/projects/:id/timeline/ops`:

```json
{
  "op": "add_shape_clip",
  "args": {
    "id": "badge",
    "start": 0,
    "duration": 4,
    "x": 0.5,
    "y": 0.5,
    "shape": {
      "type": "rectangle",
      "width": 0.35,
      "height": 0.2,
      "fill": "#f6a447",
      "stroke": "#ffffff",
      "strokeWidth": 2,
      "radius": 24
    },
    "keyframes": {
      "rotation": [
        {"time": 0, "value": -12, "easing": "ease-out"},
        {"time": 1, "value": 0}
      ]
    }
  }
}
```

No upload or assetId is needed. Shapes become overlay clips with an empty assetId and cannot also contain text or media. Each uses the existing transform/fade/keyframe engine in browser preview and FFmpeg exports. Shape clips default to center position `(0.5, 0.5)`.

| Field | Values / default |
| --- | --- |
| `type` | `rectangle`, `ellipse`, `line` (required) |
| `width` | 0.01..1 canvas fraction; default 0.35 |
| `height` | 0.002..1 canvas fraction; default 0.2 (line: 0.01) |
| `fill` | `#rrggbb` or `transparent`; default `#f6a447` |
| `stroke` | `#rrggbb` or `transparent`; default `transparent` |
| `strokeWidth` | 0..40 output pixels; default 0 |
| `radius` | 0..200 output pixels; default 0; rectangle corners |

Stroke/radius scale proportionally for smaller frame previews. A line is a thin rectangle; rotate it to change direction. `update_clip` replaces the entire shape object, so retain the fields you want. Shapes have static dimensions/colors in this version; animate x, y, scale, rotation and opacity.

### Compile editable motion templates

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

Templates: `lower-third`, `title-card`, `callout`, `kinetic-type`, `countdown`, `quote-card`, `split-reveal`, `progress-bar`, `stat-highlight`. Options are `title` (up to 120 characters), `subtitle`, `color`, `start` (0..86400), `duration` (0.5..60 seconds) and `idPrefix` (1..32 letters, digits, `_` or `-`; names the generated layers `prefix-0`, `prefix-1`, ... in creation order so later ops in the same batch can reference them). Kinetic type accepts at most eight words. Font sizes use an aspect-ratio-aware fit estimate; inspect long text, especially unusual fonts or wide glyphs. Templates compile to regular shape/text clips with entrance and exit motion. Returned `createdClipIds` identify every layer; edit each with existing operations. No arbitrary JavaScript, SVG paths, shaders or agent expressions are executed.

`stagger_clips` accepts `{clipIds:[...], delay, start?}`. IDs must be unique and exist; delay is 0..60 seconds. Clips start at `start + index * delay` in the provided order without changing their clip-local keyframes.

### Dry runs and guarded writes

```json
{
  "expectedUpdatedAt": 1790000000000,
  "dryRun": true,
  "ops": [
    {
      "op": "add_shape_clip",
      "args": {"id":"accent","duration":4,"shape":{"type":"ellipse"}}
    },
    {
      "op": "apply_motion",
      "args": {"clipId":"accent","preset":"fade"}
    }
  ]
}
```

- `dryRun:true` validates all ops and returns the proposed timeline without persisting it, advancing its revision or publishing live activity. Write scope is still required.
- Successful dry runs also return a `summary` alongside `createdClipIds`, describing the changes the batch would make: `{addedClipIds, changedClipIds, removedClipIds, timelineDiff}`. `timelineDiff` reports changed top-level fields (fps, resolution, background, tracks, markers) with `{from,to}` values. Use this to plan and verify without mutating. A dry run also reports `createdClipIds` in creation order, including template-generated layers.
- `expectedUpdatedAt` optionally compares the timestamp returned by GET project. A stale write returns HTTP 409 with `{message,code:"REVISION_CONFLICT",updatedAt}`. Fetch again and re-plan. This guard applies to the ops route, not full-timeline PUT.
- Successful ops responses add `createdClipIds` in creation order, including the generated layers of templates. Dry-run generated IDs are provisional; use the committed response for final IDs. Explicit shape IDs allow stable same-batch references and duplicates are rejected.
- A failed op returns HTTP 422 with zero-based `failedIndex`; no operations in the batch are saved. Maximum 100 ops and 200 clips still apply.

### Validate and inspect

`POST /api/projects/:id/timeline/validate` accepts `{timeline}` with read scope or higher. It checks structure, keyframes, shape bounds and missing asset references without writing. Success: `{valid:true,timeline,duration,clipCount}`. Failure: HTTP 422 with `{valid:false,message,missingAssetIds?}`. The timeline is normalized; legacy fields may be clamped, but shape fields are strictly validated.

### Swap media source without rebuilding the clip

`swap_asset` takes `{clipId, assetId, duration?, inPoint?, outPoint?, keepKeyframes?}`. It re-points an existing media clip at a new asset while keeping its id, track, start, transform, style, and text. The trim window can be reset with `inPoint`/`outPoint`/`duration` in source seconds. By default, clip-local keyframes are rescaled to the new duration; `keepKeyframes:true` preserves them verbatim. Not supported on text or shape clips (those have `assetId: ""`). The referenced asset must be readable by the key (project-restricted keys cannot swap to an asset outside their allowlist).

Inspect via `GET /api/projects/:id/state`, `GET /api/projects/:id/frame?t=1`, or a storyboard before queueing an MP4. Composition families draw media first, shapes next, text last; there is no general z-index or nested scene graph. Preview and export can differ slightly in font metrics, edge antialiasing and cubic easing approximation. SVG/Lottie import, arbitrary paths, 3D, motion blur, nested compositions and expressions are not implemented.

## Motion engine v2 (timeline v4, capabilities v5)

Everything below compiles to ordinary keyframes, so Studio, the preview and the FFmpeg renderer share one result and every layer stays editable. Runnable versions of these ideas live in [Examples](#examples) and in the in-app gallery (`#/docs/examples`).

### Presets with timing

`apply_motion` takes `{clipId, preset, duration?, delay?, strength?}`.

| Arg | Range | Meaning |
| --- | --- | --- |
| `duration` | 0.01 to the clip length minus `delay` | Seconds the move takes. Default 0.8 (or the clip length for `zoom`/`drift`). |
| `delay` | 0 to the clip length | Seconds into the clip before the move starts. Ignored by the exit presets, which end at the clip end. |
| `strength` | 0.1..2 | Multiplier for travel distance, overshoot and zoom amount. Default 1. |

Presets: `fade`, `slide-left`, `rise`, `zoom`, `pop`, `drift` (original six) plus `spring` (damped bounce), `whip` (fast right-to-left arrival with anticipation), `spin` (rotation and scale settle), `pulse` (single emphasis beat), `shake` (damped horizontal impact), `reveal` (wipe, media and shape clips only), `exit-left` and `fade-out`. `spring` and `shake` are sampled into 25 linear keyframes so browser and FFmpeg agree; other presets use two to three keys. Presets replace only the properties they animate. `reveal` on a text clip returns a 422.

```json
{ "op": "apply_motion", "args": { "clipId": "badge", "preset": "spring", "delay": 0.4, "duration": 1.2, "strength": 1.5 } }
```

### Sequence, reverse and retime

| Op | Arguments | What it does |
| --- | --- | --- |
| `apply_motion_sequence` | `clipIds[]` (unique), `preset`, `stagger`? (0..60, default 0.12), `start`?, `duration`?, `delay`?, `strength`? | Apply one preset to several clips and offset starts by `stagger` in the given order. Atomic. |
| `reverse_animation` | `clipId` | Reverse every curve of the clip and mirror each easing. Turns an entrance into an exit. |
| `retime_animation` | `clipId`, `duration`, `delay`? | Fit all keyframes of a clip into one window, keeping relative timing. Needs at least two distinct key times. |
| `add_beat_markers` | `bpm` (20..300), `count`? (1..100, default 8), `start`?, `every`?, `label`?, `color`? | Add timeline markers on every beat (or every Nth beat). The timeline allows 100 markers in total. |
| `snap_to_beats` | `clipIds[]`, `bpm`, `start`? | Move clip starts to the nearest beat. |

### Reveal (wipe mask)

`reveal` (0..1, default 1) is a left-to-right alpha mask on media and shape clips, applied before scale and rotation. It can be a static clip field or a keyframed property. Text clips reject it. In preview the mask is a CSS `clip-path`; in FFmpeg it is a `geq` alpha expression. While a transition is also running on the same clip the preview shows the transition, whereas the renderer applies both.

### New templates

| Template | Layers (in `createdClipIds` order) |
| --- | --- |
| `quote-card` | quotation mark, quote, accent rule, attribution (`subtitle`) |
| `split-reveal` | top rule, bottom rule, headline, supporting line |
| `progress-bar` | track, fill (animated `reveal`), headline, caption |
| `stat-highlight` | accent ring (ellipse, scaled to a circle for the project aspect), number, caption |

### Transitions

`dissolve`, `wipe-left`, `wipe-right`, `wipe-up`, `wipe-down`, `iris`, plus `barn-h`, `barn-v`, `diamond` and `wipe-diagonal` (capabilities v6). See `set_transition` below.

### Examples

The `shared/examples.ts` module holds eight asset-free compositions as op lists (`preset-sampler`, `lower-third-reveal`, `kinetic-whip`, `quote-card`, `split-reveal`, `progress-bar`, `stat-highlight`, `beat-drop`). `npm run examples` renders them with the real pipeline into `docs/examples/` (GIFs and posters) along with a transitions reel built from generated footage. The test suite builds every example. To use one over HTTP, create a project and POST `{"ops": [...]}` to `/api/projects/:id/timeline/ops`.


---

## Fit, animate with code and more motion (capabilities v6)

### Animate with code

Any animatable property can take an expression instead of keyframes. The clip field is `expressions` (`{property: code}`). An expression wins over keyframes on that property. It is evaluated in the browser preview and compiled to an FFmpeg expression from one parsed tree.

| Part | Details |
| --- | --- |
| Variables | `t` seconds since the clip started, `d` clip duration, `p` progress 0..1, `base` the property's static value, `pi` |
| Operators | `+ - * / % ^` and parentheses. `^` binds tighter than unary minus, so `-2^2` is `-4` |
| Functions | `sin cos tan atan atan2 abs sqrt pow exp log min max clamp floor ceil round fract mod sign mix step smoothstep easeIn easeOut easeInOut noise tri lt lte gt gte between if` and `wiggle(frequency, amount)` |
| Limits | 300 characters, 160 nodes, nesting depth 16, at most 10 expressions per clip, emitted FFmpeg expression at most 4000 characters |
| Failure | Non-finite results (division by zero, `log(-1)`) use `base`. Results are clamped to the property range. Invalid code returns 422 with the character position |
| Text | `reveal` expressions are rejected on text clips |

| Op | Arguments | What it does |
| --- | --- | --- |
| `animate_code` | `clipId`, `expressions: {property: code}`, `replace`? | Sets or merges expressions. `""` or `null` clears a property. |
| `apply_code_motion` | `clipId` or `clipIds[]`, `recipe`, `speed`? (0.1..5), `strength`? (0.1..3) | Applies a looping recipe: `float sway breathe heartbeat wiggle orbit spin pendulum bounce flicker pulse-glow drift-loop glitch`. |
| `bake_expression` | `clipId`, `property`?, `samples`? (2..64, default 48) | Samples expressions into linear keyframes and removes the code. |

```json
{ "op": "animate_code", "args": { "clipId": "badge", "expressions": { "x": "0.5 + 0.2 * cos(t * 2)", "y": "0.5 + 0.2 * sin(t * 2)", "scale": "base * (1 + 0.05 * sin(t * 3))" } } }
```

`apply_motion` on a property that has an expression removes that expression, so the preset takes effect.

### Fit and layout

| Field or op | Details |
| --- | --- |
| `textFit` | `"none"` opts a text clip out of auto-fit. By default text wraps and shrinks to fit. |
| `textMaxWidth`, `textMaxHeight` | Fractions of the frame (0.1..1, default 0.9; 0.05..1, default 0.5). Text is also limited by the nearer frame edge, scale and rotation. |
| `fit` | `contain`, `cover` or `fill` (stretch) for footage on the video track. |
| `fit_clip` | `{clipId, mode?: safe\|contain\|cover\|fill, margin?: 0..0.3 (default 0.04)}`. `safe` scales and nudges text, shapes and overlays inside the frame; the other modes set the fit of media. |
| `fit_all` | `{media?: keep\|contain\|cover\|fill, clipIds?, margin?}` fits every visual clip. |
| `set_project` | Accepts `refit: true` to refit text, shapes and overlays after a canvas change. |

`GET /api/projects/:id/fit-report?margin=0.04` returns `{ok, checked, duration, issues: [{clipId, label, problem, overflow: {left,right,top,bottom}, suggestion}]}`. Overflow values are frame fractions. Needs the `read` scope.

Text width is a Noto Sans based estimate with about 12% spare room. Fit considers the static position and the peak animated scale and rotation, not x/y travel in entrance animations.

### More presets, easings, templates and transitions

- Presets (33): the original 14 plus `slide-right`, `drop`, `bounce-in`, `zoom-out`, `swing`, `wobble`, `rubber`, `tada`, `heartbeat`, `blink`, `flash`, `glitch`, `exit-right`, `exit-up`, `exit-down`, `shrink-out`, `spin-out`, `pop-out`, `reveal-out`. `GET /api/capabilities` lists each with its group (entrance, emphasis, exit).
- Easings: `ease-in-cubic`, `ease-out-cubic`, `ease-in-out-cubic`, `ease-in-expo`, `ease-in-back`.
- Templates: `bullet-list` (`items[]`, 1..6), `social-handle`, `chapter-number` (`number`), `starburst` (rocked by an expression).
- Transitions: `barn-h`, `barn-v`, `diamond`, `wipe-diagonal`.
- Examples: 17 in `shared/examples.ts`, rendered to `docs/examples/*.gif` by `npm run examples`.

## Table of contents

1. [Quick start](#quick-start)
2. [Authentication (API keys)](#authentication-api-keys)
3. [Permissions (scopes)](#permissions-scopes)
4. [Managing keys](#managing-keys)
5. [Deployment](#deployment)
6. [REST endpoints](#rest-endpoints)
7. [Using this from another AI agent (connector pattern)](#using-this-from-another-ai-agent-connector-pattern)
8. [Errors](#errors)
9. [Limits and best practices](#limits-and-best-practices)

---

## Quick start

```bash
git clone git@github.com:HomekidChud/videoforge.git
cd videoforge
npm ci
npm run dev        # starts on http://localhost:5000
```

On first boot, the server prints a banner with your **admin (owner) key** and writes it to `data/OWNER_KEY.txt`. Copy that key somewhere safe, then delete the file.

```bash
curl http://localhost:5000/api/health
# → {"ok":true,"service":"videoforge-api","version":1}
```

With your admin key you can then mint **scoped keys** for other AI agents (e.g. a "read" key for an agent that only needs to inspect timelines, or a "write" key for an agent that uploads and edits video).

---

## Authentication (API keys)

### How keys look

| Prefix | Purpose |
|---|---|
| `vf_admin_...` | Owner/admin key. Can create & revoke other keys. |
| `vf_live_...` | Normal agent key. Scoped (read / write / admin). |

Keys are **only shown once** when they are created. The server stores only `sha256(key)`, never the plaintext.

### Sending the key

```
Authorization: Bearer vf_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Example:

```bash
curl -H "Authorization: Bearer vf_live_abc123" \
     http://localhost:5000/api/projects
```

### The UI cookie bypass

The browser editor sets a `vf_ui=1` cookie so it can call the API without a key. This is **not** a backdoor — it is only enabled when `VIDEOFORGE_REQUIRE_UI_AUTH` is not set to `1`. To force even the UI to use a key, set that env var.

> ⚠️ For any production deployment, set `VIDEOFORGE_REQUIRE_UI_AUTH=1` so the UI must also present a key.

---

## Permissions (scopes)

Three scopes exist. Each grants everything the previous one does.

| Scope | What it can do | Who should hold it |
|---|---|---|
| `read` | GET requests: list media, projects, renders, download finished renders | an agent that just inspects or summarizes timelines |
| `write` | `read` + upload media, create/edit/delete projects, queue renders, download | the standard "do work" agent |
| `admin` | `write` + create / list / revoke other API keys | **you only** — this is the owner key |

### Scope enforcement table

| Endpoint | `read` | `write` | `admin` |
|---|---|---|---|
| `GET /api/health` | ✅ (open, no key needed) | ✅ | ✅ |
| `GET /api/media`, `/api/media/:id` | ✅ | ✅ | ✅ |
| `GET /api/media/:id/raw`, `/api/media/:id/thumb` | ✅ | ✅ | ✅ |
| `GET /api/projects`, `/api/projects/:id` | ✅ | ✅ | ✅ |
| `GET /api/renders`, `/api/renders/:id` | ✅ | ✅ | ✅ |
| `GET /api/renders/:id/download` | ✅ | ✅ | ✅ |
| `POST /api/media/upload` | ❌ | ✅ | ✅ |
| `POST /api/projects` | ❌ | ✅ | ✅ |
| `PUT /api/projects/:id` | ❌ | ✅ | ✅ |
| `DELETE /api/media/:id` | ❌ | ✅ | ✅ |
| `DELETE /api/projects/:id` | ❌ | ✅ | ✅ |
| `POST /api/projects/:id/timeline/ops` | ❌ | ✅ | ✅ |
| `POST /api/renders` | ❌ | ✅ | ✅ |
| `GET /api/keys` | ❌ | ❌ | ✅ |
| `POST /api/keys` | ❌ | ❌ | ✅ |
| `DELETE /api/keys/:id` | ❌ | ❌ | ✅ |
| `GET /api/keys/owner` | ❌ | ❌ | ✅ |

---

## Managing keys

### Creating a key

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer vf_admin_YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Claude agent (edit only)","scope":"write"}'
```

Response (the plaintext key is shown **once**):

```json
{
  "message": "Save this key now — it is shown only once.",
  "key": "vf_live_9f8e7d6c5b4a3210fedcba9876543210fedcba9876543210",
  "record": {
    "id": "b2f2...",
    "label": "Claude agent (edit only)",
    "scope": "write",
    "revoked": false,
    "createdAt": 1760000000000
  }
}
```

Store that `key` value in your AI agent's credential manager / env var immediately.

### Restricted keys

`POST /api/keys` also accepts a `restrictions` object. Every field is optional and enforced by the server on every request:

```json
{
  "label": "Partner site",
  "scope": "write",
  "restrictions": {
    "expiresAt": 1790000000000,
    "allowedOrigins": ["https://partner.example.com"],
    "projectIds": ["4ce9003e140d"],
    "requestsPerMinute": 60,
    "allowUpload": true,
    "allowRender": true,
    "allowDelete": false
  }
}
```

| Field | Meaning |
|---|---|
| `expiresAt` | Unix ms. After this time the key returns 401. |
| `allowedOrigins` | Exact browser origins permitted. Requests carrying a different `Origin` header get 403. This is not an IP allowlist, and non-browser clients send no `Origin`. |
| `projectIds` | Limit the key to these projects (and their renders). `null` means all projects. |
| `requestsPerMinute` | Per-key rate limit; exceeding it returns 429. |
| `allowUpload`, `allowRender`, `allowDelete` | Switch individual capabilities off. |

Admin keys cannot be restricted. `GET /api/auth/me` returns the calling key's label, scope and restrictions, and an admin key cannot revoke itself.

### Project visibility (public or private)

Projects are `private` by default. An admin key can set `"visibility": "public"` with `PUT /api/projects/:id`. A public project exposes only its latest finished render, never the source media, timeline or any key:

- `GET /api/public/projects/:id` returns `{ id, name, updatedAt, renderUrl }` with no authentication.
- `GET /api/public/projects/:id/renders/:jobId` streams that MP4.

Both return 404 for private projects. The browser viewer lives at `#/share/:id`.

### Listing keys

```bash
curl -H "Authorization: Bearer vf_admin_..." \
     http://localhost:5000/api/keys
```

Returns metadata only — no key plaintext.

### Revoking a key

```bash
curl -X DELETE -H "Authorization: Bearer vf_admin_..." \
     http://localhost:5000/api/keys/<key-id>
# → {"revoked":true}
```

Any subsequent request with that key now returns `403 Forbidden: this key has been revoked.`

### Recovering the owner key

`GET /api/keys/owner` (admin only) returns the owner key plaintext **only while it is still held in memory from the boot process**. If the server has restarted and `data/OWNER_KEY.txt` has been deleted, this returns 404 — create a new admin key instead. Because only one admin key exists at a time, the recommended flow is:

1. On first boot, save the owner key from `data/OWNER_KEY.txt` somewhere safe.
2. `rm data/OWNER_KEY.txt`
3. To rotate: create a fresh admin key with the existing admin key, then revoke the old one.

---

## Deployment

### Running locally

```bash
npm ci
npm run dev      # dev server on :5000
```

### Running in production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Requirements:
- Node 20+
- `ffmpeg` and `ffprobe` on `PATH`
- A writable `data/` directory

### Environment variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port to bind. |
| `NODE_ENV` | `development` | Set to `production` for the built bundle. |
| `VIDEOFORGE_REQUIRE_UI_AUTH` | unset | Set to `1` to force even the UI to present an API key. |
| `VIDEOFORGE_BOOTSTRAP_KEY` | unset | Seeds the owner (admin) key on first boot instead of generating one. |
| `VIDEOFORGE_MAX_UPLOAD_MB` | `2048` | Maximum size of a single upload. |
| `VIDEOFORGE_FONT` | system default | Path to a `.ttf` used for burned-in text. |

### Security notes

- `data.db` (SQLite) and `data/media/` are where user uploads and metadata live. **Never** commit these to git — `.gitignore` already excludes them.
- Only key plaintexts are shown once, at creation time. They are never logged by the server, never returned by any other endpoint, and never stored in the database in plaintext.
- To rotate a key: mint a new one, update your agent's credentials, then revoke the old key.
- The `/api/keys/owner` endpoint is only useful immediately after the first boot; after a restart, use the existing admin key to mint new ones.

---

## REST endpoints

All endpoints expect and return JSON unless noted (multipart for upload). A successful response has HTTP status in the 2xx range. Errors are documented in the [Errors](#errors) section.

### `GET /api/health`

Health check. **No key required.**

```json
{"ok":true,"service":"videoforge-api","version":1}
```

---

### `POST /api/media/upload`

Upload one or more media files (video / audio / image). **Scope: `write`.**

Multipart/form-data, field name `files` (can be repeated).

```bash
curl -X POST http://localhost:5000/api/media/upload \
  -H "Authorization: Bearer vf_live_..." \
  -F "files=@clip.mp4"
```

Response (HTTP 201):

```json
{
  "assets": [
    {
      "id": "abc123",
      "filename": "clip.mp4",
      "kind": "video",
      "mime": "video/mp4",
      "duration": 12.34,
      "width": 1920,
      "height": 1080,
      "sizeBytes": 4096000,
      "uploadUrl": "/api/media/abc123/raw",
      "thumbnailUrl": "/api/media/abc123/thumb",
      "createdAt": 1760000000000
    }
  ]
}
```

Notes:
- Server probes duration, dimensions, and audio-stream presence with `ffprobe`.
- If `ffprobe` fails (corrupt file), the asset is still created with `duration: 0`. Delete it or ignore it.
- Accepted types: `video/*`, `audio/*`, `image/*` (mp4, webm, mov, mkv, avi, mp3, wav, ogg, m4a, aac, flac, png, jpg, jpeg, gif, webp).

### `GET /api/media`

List all uploaded assets. **Scope: `read`.**

### `GET /api/media/:id`

Get one asset's metadata. **Scope: `read`.**

### `DELETE /api/media/:id`

Delete an asset and its underlying file. **Scope: `write`.**

### `GET /api/media/:id/raw`

Stream the raw media file. **Scope: `read`.** Range requests are supported (`Accept-Ranges: bytes`).

### `GET /api/media/:id/waveform`

Peak envelope for audio and video assets, used by the timeline to draw waveforms. **Scope: `read`.**

### `GET /api/media/:id/thumb`

Get a JPEG thumbnail (first video frame, or scaled-down image). Generated on-demand and cached. **Scope: `read`.**

---

### `POST /api/projects`

Create a project with an initial timeline. **Scope: `write`.**

```json
{
  "name": "Agent edit",
  "timeline": {
    "fps": 30,
    "resolution": { "width": 1280, "height": 720 },
    "clips": []
  }
}
```

Response (HTTP 201) returns the full project with its `id`.

### `GET /api/projects`

List all projects, including their current timelines. **Scope: `read`.**

### `GET /api/projects/:id`

Get one project. **Scope: `read`.**

### `PUT /api/projects/:id`

Rename a project and/or replace its timeline (full overwrite). **Scope: `write`.**

```json
{
  "name": "Renamed edit",
  "timeline": {
    "fps": 30,
    "resolution": { "width": 1280, "height": 720 },
    "clips": [
      { "id": "c1", "assetId": "abc", "track": "video", "start": 0,
        "inPoint": 0, "outPoint": 5.2, "volume": 1, "muted": false }
    ]
  }
}
```

### `DELETE /api/projects/:id`

Delete a project (does **not** delete the underlying media). **Scope: `write`.**

---

### `POST /api/projects/:id/timeline/ops`

Apply a single atomic timeline edit. **Scope: `write`.** Returns the updated project.

Body shape: `{"op": "<op-name>", "args": { ... }}`.

Supported `op` values:

| Op | Args | Description |
|---|---|---|
| `add_clip` | `assetId` (required), `track` (`"video"\|"audio"\|"overlay"`), `start`, `inPoint`, `outPoint`, `volume`, `muted`, `text` | Append a clip from an existing asset. `outPoint` defaults to `inPoint + 5`. |
| `remove_clip` | `clipId` | Remove a clip from the timeline. |
| `trim_clip` | `clipId`, `inPoint`?, `outPoint`? | Change the in/out trim points. |
| `move_clip` | `clipId`, `start` | Reposition the clip on the timeline. |
| `set_audio` | `clipId`, `volume` (0..1), `muted` (bool) | Adjust per-clip audio. |
| `add_text` | `clipId`, `text` | Attach a burned-in text caption to a clip. |
| `add_text_clip` | `text`, `id`? (rejected if it already exists), `start`, `duration`, plus style fields (`x`, `y`, `textSize`, `textColor`, `textBg`, `fadeIn`, `fadeOut`, `opacity`) | Add a standalone title on the overlay track (no asset needed). |
| `update_clip` | `clipId` plus any clip field to change | Patch speed, fades, `filter` (`none\|mono\|sepia\|vivid\|cool\|warm\|faded`), `brightness`, `contrast`, `saturation`, `opacity`, `x`, `y`, `scale`, text style, timing. Values equal to defaults reset the field. |
| `split_clip` | `clipId`, `at` (timeline seconds) | Split a clip in two at least 0.1s from either edge. |
| `set_project` | `fps`?, `resolution`?, `background`? | Change frame rate, canvas size or background colour (`#rrggbb`). |
| `set_keyframes` | `clipId`, `property`, `keyframes: [{time, value, easing?}]` | Replace the animation curve of one property. `time` is seconds from the clip start. An empty list clears it. |
| `upsert_keyframe` | `clipId`, `property`, `time`, `value`, `easing`? | Add or replace one keyframe. |
| `remove_keyframe` | `clipId`, `property`, `time` | Delete the keyframe at that time. |
| `apply_motion` | `clipId`, `preset` (`fade`, `slide-left`, `rise`, `zoom`, `pop`, `drift`) | Apply a ready-made animation. Only the properties the preset animates are replaced. |
| `duplicate_clip` | `clipId`, `start`? | Copy a clip, including keyframes. |
| `ripple_delete` | `clipId` | Remove a clip and close the gap on its track. |
| `set_track` | `track`, `settings: {muted?, hidden?, locked?}` | Mute or hide a whole track. |
| `add_marker` / `set_marker` / `remove_marker` | `time`, `label`?, `color`? / `id`, `time`?, `label`?, `color`? / `id` | Timeline markers, useful as named cue points. |
| `reorder` | `order: [clipId, clipId, ...]` | Reorder clips on the timeline. Must include every clip id exactly once. Video clips get re-spaced sequentially. |

New clip fields: `rotation` (degrees), `blur` (px), `fit` (`contain\|cover`), `flipX`, `flipY`, `label`, and `keyframes`. Timeline fields: `background`, `markers`, `tracks`. Scale accepts 0.1 to 2.

Batches: send `{ "ops": [ {"op": ..., "args": ...}, ... ] }` (maximum 100) to apply many edits atomically. If any op fails the whole batch is rejected with status 422 and a `failedIndex`.

### Keyframes and easing

Animatable properties: `x`, `y`, `scale`, `rotation`, `opacity`, `reveal`, `volume`, `brightness`, `contrast`, `saturation`. Keyframe `time` is clip-relative seconds. The `easing` on a keyframe shapes the segment leaving it: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `back-out` (overshoot), `snappy` (fast start, long settle), `anticipate` (dips backwards, then launches), `hold` (keep the start value until the next key), `step-start` (jump to the next value as soon as the segment starts), or a custom cubic bezier `[x1, y1, x2, y2]` where x is 0..1 and y may overshoot. Keyframes created through the API default to `linear`.

```json
{ "op": "set_keyframes",
  "args": { "clipId": "c1", "property": "x",
    "keyframes": [ {"time": 0, "value": 0.2, "easing": [0.34, 1.56, 0.64, 1]},
                     {"time": 2, "value": 0.8} ] } }
```

### Bulk and layout operations

| Op | Arguments | What it does |
|----|-----------|--------------|
| `set_transition` | `clipId`, `type` (`none`, `dissolve`, `wipe-left`, `wipe-right`, `wipe-up`, `wipe-down`, `iris`), `duration`? (0.1 to 3, default 0.6), `join`? (default true) | Overlaps a video-track clip with the one before it. With `join` the clip first moves to touch the previous clip; later video clips move up by the overlap. `none` removes the transition and restores the gap-free layout. Rendered with an alpha ramp, plus an audio crossfade. Wipes reveal the incoming clip from the named edge (`wipe-up` rises from the bottom, `wipe-down` falls from the top); `iris` opens a circle from the centre. |
| `remove_clips` | `clipIds[]` | Delete several clips in one step. |
| `shift_clips` | `delta`, `from`?, `track`?, `clipIds`? | Slide clips later or earlier. `from` limits it to clips starting at or after that time. |
| `close_gaps` | `track`? (default `video`) | Pack a track's clips end to end in their current order. |
| `update_clips` | `patch`, `clipIds`? or `track`? | Apply one patch to many clips, for example a filter or fade on every clip of a track. |
| `copy_style` | `fromClipId`, `toClipIds` | Copy transform, colour, fades, text style and keyframes. Keyframe times are stretched to fit the target clip. |

### Inspecting results

- `GET /api/capabilities` lists every op, property range, easing preset and motion preset, so an agent can discover the editor surface without reading docs.
- `GET /api/projects/:id/state?t=1.5` returns each clip's evaluated values (position, scale, opacity and so on) at that time, with keyframes resolved.
- `GET /api/projects/:id/storyboard?count=6&width=320` returns one PNG contact sheet of evenly spaced frames. The `X-Storyboard` header lists `cols`, `rows` and the sampled `times`. One request shows an agent the whole edit.
- `GET /api/projects/:id/activity?since=SEQ` lists recent edits, who made them and when (in memory, cleared on restart).
- `POST /api/projects/:id/duplicate` copies a project.
- `GET /api/projects/:id/frame?t=1.5&width=640` returns a PNG still of the composed frame at that time. Use it to check an edit visually before exporting.

Example — append a clip:

```json
{ "op": "add_clip",
  "args": { "assetId": "abc123", "track": "video", "start": 0,
            "inPoint": 0, "outPoint": 5.2, "volume": 1, "muted": false } }
```

Example — trim:

```json
{ "op": "trim_clip", "args": { "clipId": "c1", "inPoint": 1.0, "outPoint": 4.5 } }
```

---

### `POST /api/renders`

Queue a render job for a project. **Scope: `write`.** Fire-and-forget; poll the job.

```json
{ "projectId": "prj_abc" }
```

Response (HTTP 201):

```json
{ "jobId": "j_abc", "status": "queued", "statusUrl": "/api/renders/j_abc" }
```

### `GET /api/renders`

List render jobs (optionally `?projectId=`). **Scope: `read`.**

### `GET /api/renders/:id`

Get one job's status. **Scope: `read`.**

```json
{
  "id": "j_abc",
  "projectId": "prj_abc",
  "status": "rendering",     // queued | rendering | done | error
  "progress": 0.42,          // 0..1
  "outputPath": null,
  "error": null,
  "createdAt": 1760000000000,
  "updatedAt": 1760000010000
}
```

### `GET /api/renders/:id/download`

Download the rendered MP4. **Scope: `read`.** Returns 404 until `status == "done"`.

---

## Using this from another AI agent (connector pattern)

This is the pattern that makes the API most useful: **give an AI agent your `vf_live_...` key as a credential, and they can edit video on your behalf**.

### 1. Mint a scoped key

For an agent that should be able to upload and edit video but not create more keys:

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer vf_admin_..." \
  -d '{"label":"Claude","scope":"write"}'
```

### 2. Give the agent two things

- **Base URL** (e.g. `https://your-videoforge.example.com`)
- **The key** (e.g. `vf_live_...`)

Store them in the agent's secret store. The agent then makes standard REST calls:

```
POST /api/media/upload       Authorization: Bearer <key>
POST /api/projects
POST /api/projects/<id>/timeline/ops
POST /api/renders
GET  /api/renders/<jobId>
GET  /api/renders/<jobId>/download
```

### 3. Sample agent workflow

```bash
# upload a video
curl -X POST $BASE/api/media/upload -H "Authorization: Bearer $KEY" \
     -F "files=@input.mp4"

# create a project
curl -X POST $BASE/api/projects -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"auto-edit","timeline":{"fps":30,"resolution":{"width":1280,"height":720},"clips":[]}}'

# add a clip from that asset, trim to 5s
curl -X POST $BASE/api/projects/$PROJECT_ID/timeline/ops \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"op":"add_clip","args":{"assetId":"'"$ASSET_ID"'","track":"video","start":0,"inPoint":0,"outPoint":5}}'

# render
curl -X POST $BASE/api/renders -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"projectId":"'"$PROJECT_ID"'"}'

# poll
while true; do
  s=$(curl -s $BASE/api/renders/$JOB_ID -H "Authorization: Bearer $KEY" | jq -r '.status')
  [ "$s" == "done" ] && break
  [ "$s" == "error" ] && echo "render failed" && exit 1
  sleep 2
done

# download
curl -o output.mp4 $BASE/api/renders/$JOB_ID/download -H "Authorization: Bearer $KEY"
```

### 4. Revoke access when done

```bash
curl -X DELETE $BASE/api/keys/$KEY_ID -H "Authorization: Bearer $KEY"
```

### MCP-style connector

If your AI platform supports "connectors" that let an agent call an arbitrary REST API with a stored credential, configure it as:

| Field | Value |
|---|---|
| Base URL | `https://your-videoforge.example.com` |
| Auth header | `Authorization: Bearer <vf_live_...>` |
| Content type | JSON (multipart for `/api/media/upload`) |
| Scopes required | `write` for full edit; `read` for read-only |

The server is intentionally plain REST (no OAuth dance) because API keys are simpler and more compatible with AI-agent credential stores.

---

## Errors

All errors return JSON with an HTTP status code and a `message` field.

| Status | Meaning |
|---|---|
| `400` | Malformed request body (e.g. missing required field). |
| `401` | Missing or malformed `Authorization` header, or unknown/revoked key. |
| `403` | Key exists but doesn't have the required scope, or has been revoked. |
| `404` | Resource not found (asset / project / render / download). |
| `413` | Request body too large (upload size limit). |
| `422` | Semantic validation failed (e.g. `timeline/ops` op failed because the clip doesn't exist). |
| `500` | Internal server error. |

Example 403 response:

```json
{ "message": "Forbidden: this key has scope 'read' but this action requires 'write'." }
```

---

## Limits and best practices

- **Upload size**: no built-in limit in Express; front your server with Nginx or a reverse proxy with a sane `client_max_body_size`.
- **Render duration**: render progress is tracked as a fraction of the timeline's total video duration. Very long timelines can take a while; poll at 2s+ intervals.
- **Storage**: SQLite stores metadata; raw media lives under `data/media/`; renders under `data/renders/`. Keep both on a disk with capacity.
- **Concurrency**: multiple simultaneous renders are supported (each is an independent ffmpeg process). Keep an eye on CPU for large files.
- **Security**: always serve over HTTPS in production. Never log or commit API keys. Revoke keys when an agent stops needing them.

---

## Contributing / further reading

- The editor UI lives in `client/`.
- The API + render worker live in `server/`.
- Shared TypeScript types live in `shared/schema.ts`.
- The in-app API reference is rendered at `#/api-docs`.
- The full permission model lives in `server/auth.ts`.


## Live watching (master admins)

Admin keys can watch any project as it is edited. Watching is strictly view-only: the endpoints below have no write verbs, and read or write keys get 403.

| Endpoint | Who | Purpose |
|----------|-----|---------|
| `GET /api/live` | admin | Every project with `live` (activity in the last 15 seconds), who last edited, playhead, clip count and watcher count. `refreshMs` is the suggested poll interval (100). |
| `GET /api/live/:id?since=REV&tsince=TIMELINE_REV` | admin | The editor's working copy: timeline (including unsaved edits), playhead `time`, `selectedId`, `playing`, `actor`, and the recent `activity`. If nothing changed since `since`, the reply is a few bytes (`changed: false`). The timeline is omitted when `tsince` matches. |
| `POST /api/live/:id/publish` | write | Used by the studio about ten times a second to share its working copy. It is not counted against `requestsPerMinute` and never writes to the saved project. Replies with `{ watchers }`. |

API edits, saves and exports also appear in the feed, so an admin sees agent activity live. In the studio, the editor sees a "watching" badge while an admin has the project open. Presence and the feed are in memory only.


## Presence: live cursors and Follow

Everyone in a project can see each other. The studio shows colored cursors on the timeline and the preview, each person's playhead, and a colored outline on the clips they have selected. Click a person's avatar in the studio bar to Follow them: your playhead, playback and selection track theirs. Seeking, playing or selecting something yourself stops Follow.

| Endpoint | Who | Purpose |
|----------|-----|---------|
| `POST /api/projects/:id/presence` | read, write or admin | Body `{cid, time?, playing?, selectedIds?, cursor?, leave?}`. `cid` is a client id you choose (4 to 40 letters, digits, `-` or `_`), one per browser tab or agent. `cursor` is `{area:"timeline", t, lane}` or `{area:"preview", x, y}` with x and y from 0 to 1. The response lists everyone else: `{peers:[{cid, name, color, time, playing, selectedIds, cursor}]}`. Call it every 150 ms or so; entries expire after 4 seconds without a call. It is not counted against `requestsPerMinute`. |
| `GET /api/live/:id` | admin | The `peers` array is included, so master admins see cursors while watching. |

Presence lives in memory only. A client id belongs to the key that first used it; another key gets 409.

## Multi-select and transitions in the studio

- Shift-click or Ctrl-click toggles clips in the selection. Drag on an empty part of the timeline to box-select; hold Shift to add. Ctrl+A selects everything, Escape clears.
- Dragging any selected clip moves the whole group. Delete, Duplicate, copy and paste work on the group and keep relative offsets.
- The inspector for a group offers align starts and ends, join end to end, space evenly, delete and close gaps, a transition between every selected video clip, and shared look and sound settings.
- Effects apply to every selected clip. Drop a Transitions chip onto a video clip, or use the Transition in section of the clip inspector.
