# VideoForge Upgrade Audit

Date: 2026-10-13
Branch baseline: commit `63490af`.

This audit covers the "turn VideoForge into a complete platform" milestone:
render/export pipeline, collaboration, Live, extensions, templates, product
polish, billing, observability. Before any of that, document what exists.

## 1. How export works today

**Server-side FFmpeg only. No client-side export.**

Flow: `POST /api/renders` → creates a `render_jobs` row → `setImmediate(() => runRender(jobId, projectId))`
→ `buildRenderPlan()` (`server/render.ts`) builds an ffmpeg `filter_complex`
graph → `runFfmpeg` spawns `ffmpeg` → progress parsed from stderr
`time=HH:MM:SS.ms` and written to the DB every 400 ms → client polls
`GET /api/renders/:jobId` every 1.2 s (`editor.tsx:83`) → on `status: "done"`
the export panel shows an inline `<video>` and a download link.

Strengths:
- One implementation of compositing (both the preview and the export use
  `shared/animation.ts` expressions, so keyframes/transform/opacity line up
  between the DOM preview and the FFmpeg render — mostly).
- Text rendered via `textfile=` so user text can never inject ffmpeg filter
  syntax (safe).
- Missing assets fail loudly instead of silently dropping footage
  (`routes.ts:96-98`).

Limitations:
- **No client-side WebCodecs export.** All exports hit the server.
- **No cancel.** `POST /api/renders` queues a job, but there is no
  `DELETE /api/renders/:id` or `POST /:id/cancel`. A stuck ffmpeg process
  stays stuck.
- **No resume.** A failed render restarts from 0.
- **No streaming to disk on the client** (File System Access API) — export is
  a download of a finished file.
- **No quota per plan.** A user can queue unlimited renders.
- **No concurrency limit.** `setImmediate` fires immediately; 100 queued jobs
  spawn 100 ffmpeg processes.
- **Progress is a float 0–1** — fine, but there's no ETA, no estimated remaining
  time.
- **Codec options are hardcoded** to `libx264 -crf 20 -preset veryfast -pix_fmt yuv420p`
  and AAC 192 kbps. No resolution/fps/codec choice at render time (only via
  `set_project` op before rendering).

## 2. What "Live" currently does

`server/live.ts` — **not collaboration, not streaming.** It is an in-memory
"watch this project's unsaved state" feature:

- The editor publishes (`POST /api/live/:id/publish`) its current in-browser
  timeline on every state change (throttled to ≥100 ms) plus a 4 s heartbeat
  interval (`editor.tsx:280`).
- A master-admin viewer polls `GET /api/live/:id?since=&tsince=` every 100 ms.
- `syncTimeline` / `diffTimelines` generate an activity feed
  ("Added title", "Edited clip xyz: trim", "Started an export").
- Presence: `POST /api/projects/:id/presence` — every 150 ms, each client
  sends its own cursor/playhead/selection and gets everyone else's back.
  Expire after 4 s. Bounded at 64 peers per project.

What Live is **not**:
- Not real-time co-editing. Two editors both publish; the last one wins. No
  conflict resolution, no CRDT, no merge.
- Not live-streaming / RTMP / WebRTC output.
- Not multi-user editing in the "two people drag the same clip" sense.

The task says "if the audit shows it's unclear, implement a recording studio".
It's not unclear — it's a view-only watch mode. For the upgrade, the decision
is: keep the watch mode, and add real collaboration separately (Milestone 2).

## 3. How projects are stored and synced

- **SQLite** (`better-sqlite3`, Drizzle ORM) at `data.db` (override with
  `VIDEOFORGE_DB`). Tables: `media_assets`, `projects`, `render_jobs`,
  `api_keys`. Media files on disk at `data/media/<id>`.
- **No per-user isolation.** The `projects` table has no `owner_id`. Any key
  with the right scope can read/write any project (subject to per-key
  `projectIds` restrictions, which is opt-in and empty by default).
- **Sync**: none. The editor holds a local `Timeline` in React state and PUTs
  the whole thing on autosave (debounced 1.4 s). Two tabs editing the same
  project will clobber each other (last-write-wins at the whole-timeline level).
- **No offline.** All state is server-side.

## 4. Editor actions that bypass the command layer

The task requires the UI and AI to call the same command layer. Today:

| Action | Used by UI? | Used by API? | Shared? |
|---|---|---|---|
| `add_clip` | No (inline `mutate`) | Yes | Diverged |
| `add_text_clip` | No | Yes | Diverged |
| `remove_clip`, `remove_clips` | No (inline filter) | Yes | Diverged |
| `trim_clip` | No (inline `patchClip`) | Yes | Diverged |
| `move_clip` | No (inline drag) | Yes | Diverged |
| `set_audio` | No (inline `patchClip`) | Yes | Diverged |
| `add_text` | No | Yes | Diverged |
| `update_clip`, `update_clips` | No | Yes | Diverged |
| `split_clip` | **Divergent implementations** (`editor-model.ts:splitClip` vs `shared/editing.ts:split_clip`) | Yes | Two code paths |
| `set_keyframes`, `upsert_keyframe`, `remove_keyframe` | No (inline `setValues`, `toggleKey` in editor.tsx) | Yes | Diverged |
| `set_transition` | Yes (`setTransition` in `shared/transitions.ts` — same fn) | Yes | **Shared** |
| `duplicate_clip` | **Divergent** (`editor-model.ts:duplicateClip` vs `shared/editing.ts:duplicate_clip`) | Yes | Two code paths |
| `ripple_delete` | **Divergent** (`editor-model.ts:rippleDelete` vs `shared/editing.ts:ripple_delete`) | Yes | Two code paths |
| `apply_motion` | No | Yes | Diverged |
| `shift_clips`, `close_gaps`, `copy_style`, `reorder` | No | Yes | Diverged |
| `set_project` | No (inline `setProjectSettings`) | Yes | Diverged |
| `set_track`, `add_marker`, `remove_marker`, `set_marker` | No (inline `mutate`) | Yes | Diverged |

**Root cause**: `client/src/lib/editor-model.ts` re-implements every op
locally (so the UI can operate offline/instantly) instead of calling the
shared `applyTimelineOp`. This is a real bug class — e.g. `splitClip` in
`editor-model.ts:24` computes `sourceSplit` differently from
`shared/editing.ts:103`.

## 5. Current test coverage

`test/api.spec.ts` — 115 assertions across 20 test groups. Covers:
- Auth: missing header, unknown key, revoked key, scope enforcement.
- Key management: create read/write keys, list, revoke, restrictions.
- Upload / probe / render / download.
- Project visibility (public/private).
- Timeline ops: trim, add_text, keyframes, transitions, multi-track render.
- Live: watch, publish, presence, activity feed.
- Media tokens: mint, verify, revoke.

Not covered:
- **No IDOR tests** (two keys with different restrictions on the same project).
- No concurrent-edit / lost-update tests.
- No performance / load tests.
- No client-side tests (no Vitest / Playwright).
- No golden-frame regression for the renderer (only that the render exits 0
  and downloads).
- No test for `MAX_CLIPS = 200` enforcement path.

## 6. Top 10 UX friction points

Walking through the task's requested scenarios:

1. **Creating a project** — No `/home` dashboard. The user lands directly in
   the editor with a "New project" button buried in the left sidebar's
   "Projects" tab. No templates. No recent projects grid with thumbnails.
2. **Importing media** — Drag-and-drop works. But there is no upload progress
   per file (one aggregate percentage), no way to cancel mid-upload, and the
   `probe()` call (ffprobe) blocks the response — a 1 GB file's metadata is
   computed before the UI sees the asset.
3. **Editing** — Autosave is 1.4 s debounce with a "Not saved yet" label
   before the first save (confusing). No keyboard-shortcut cheat-sheet.
   Timeline zoom is a slider; no pinch. Undo/redo works but is capped at 100
   steps and is not shown as a stack.
4. **Timeline performance** — Re-renders the whole tree on every frame of
   playback and every pointermove during a drag. A 50-clip timeline on a
   slow laptop will feel sluggish.
5. **Preview** — All clips decode simultaneously (`preload="auto"`), so memory
   and CPU spike on project load. No proxy/low-res path.
6. **Export** — Progress bar exists but no ETA, no cancel, no codec choice,
   no file-size estimate. The in-app preview re-downloads the whole MP4 to
   show it.
7. **Sharing** — Public share page is all-or-nothing; no expiring links, no
   password, no viewer comments.
8. **Multi-user** — Two editors can be in the same project and will silently
   overwrite each other. There's no "someone else is editing" warning beyond
   the presence avatars.
9. **Mobile / tablet** — The `forge-app` layout is desktop-only (fixed
   three-column grid). Timeline is unusable on touch (pointer events, no
   long-press menus).
10. **Empty / error states** — The 404 page exists. Errors show as toasts
    with no "Copy diagnostics". No offline banner.

## 7. Decision points before building

- **Do NOT build on the current single-user model for collaboration.** Adding
  Yjs on top of the `Timeline` snapshot state requires first normalizing the
  client state (Milestone 2 of the perf work) — otherwise every Yjs update
  triggers the full-tree re-render.
- **Extension SDK** requires the command layer to be the single mutation path
  (currently violated, see §4). Land that first.
- **Billing (Stripe)** requires user accounts. The app has **no users** — only
  API keys. Either introduce an `users` table (breaking change to the key
  model) or scope billing to per-key plans. Flag this to the user as a
  trade-off before implementing.
- **Cloud render path** requires a queue (BullMQ / SQS). The current
  `setImmediate` model is fine for single-node dev; document this and add
  the queue only when the client-side WebCodecs export exists (both paths
  are required by the task).

## 8. Milestone plan (matching the task)

1. **Audit + env system** (this branch) — `.env.example`, typed env module,
   fail-fast startup, security headers, secret-scan pre-commit hook.
2. **Auth & authorization** — add `users` table decision, IDOR tests, per-key
   storage quotas.
3. **Web hardening + uploads** — CSP, magic bytes, ffprobe timeout, upload
   quotas.
4. **AI & API platform** — command layer unification, OpenAPI +
   `commands.schema.json`, AI endpoint with diff/Apply.
5. **CI & docs** — GitHub Actions for lint/typecheck/test/secret-scan, docs
   site rebuild per `DOCS_AUDIT.md`.

Stop after each milestone and report what passed and what's still open.
