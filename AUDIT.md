# VideoForge Architecture & Performance Audit

Date: 2026-10-13
Branch baseline: commit `63490af` (before any changes in this workstream).

## 1. Stack & Entry Points

| Layer | Technology |
|---|---|
| Client | React 18, Vite 7, Tailwind 3, shadcn/ui, wouter (hash routing), TanStack Query |
| Server | Express 5 (Node 20), better-sqlite3 (Drizzle ORM), ffmpeg + ffprobe |
| Storage | `data/media/` (uploads), `data/renders/` (renders), `data.db` (SQLite) |
| Realtime | In-memory Live/presence (no CRDT, no Yjs). Client publishes on state change (rate-limited to ≥100 ms) plus a 4 s heartbeat; admin watchers poll every 100 ms. |
| Auth | API-key only (Bearer), sha256 hash at rest, three scopes (`read`/`write`/`admin`) |
| Docs | `docs/API.md` (single 26 KB Markdown file, not a docs site) |

Routes (client, hash-based via wouter):

| Route | Purpose |
|---|---|
| `/` | Studio editor (the only page the user actually opens) |
| `/api-key` | Sign-in with API key |
| `/api-docs` | In-app reference (renders `docs/API.md`?) |
| `/platform` | Developer platform (key management) |
| `/live`, `/live/:id` | Live watch pages (admin only) |
| `/share/:id` | Public share page |

There is **no** `/home` dashboard, no per-project URL, no routes for docs site — those are part of the next milestone.

## 2. State Management

- `client/src/pages/editor.tsx` is the single source of truth: `useState<Timeline>` (whole-timeline snapshot) plus `useRef` for undo/redo stacks (`past`, `future`, `tlRef`, `gestureBase`).
- There is **no** Zustand / Redux / Jotai. Each mutation creates a new `Timeline` object and triggers a full React re-render of the entire editor tree (`ForgePreview`, `ForgeTimeline`, `ClipInspector`, `ForgeEffects`, etc.) because every child depends on the `timeline` prop.
- Every mutation calls `JSON.parse(JSON.stringify(...))` for the undo snapshot — O(n) bytes per edit.
- Autosave (`saveNow`) is debounced 1.4 s and serializes the timeline to the server. Save state is displayed but the label says "Not saved yet" before the first save — a UX gap called out in the task.

## 3. Timeline Rendering

- `client/src/components/forge-timeline.tsx`: renders **every clip** in every lane; no virtualization (no `react-window`, no viewport clipping). With 200 clips (server-enforced max via `MAX_CLIPS` in `shared/timeline.ts:62`) at default zoom 64 pps, the DOM would hold ~200 clip divs plus ruler ticks.
- Waveform drawn per audio clip via `<canvas>` in a `useQuery` (`Waveform` subcomponent). Canvas is cleared and re-drawn on every clip property change (`inPoint`, `outPoint`, `width`), so a trim re-runs the same canvas redraw. Peaked payload fetched once per asset.
- Snapping happens on every `pointermove` and walks the full clip list (`targets()` in `forge-timeline.tsx:74`) — O(n) per pointer event.
- **Critical perf flaw**: the parent editor re-renders on every `setTime` (~60 fps during playback) because `time` is passed down through every child. `ForgePreview` re-renders each frame → `MediaLayer` sync calls (`currentTime`, `volume`, `playbackRate`) re-run. This is the primary cause of main-thread jank during playback.

## 4. Preview / Playback Pipeline

- `client/src/components/forge-preview.tsx`: DOM/CSS-based compositing (not WebGL, not a single canvas). Each clip is a `<video>` element layered with CSS transforms, filters (`filter: brightness() contrast() saturate() blur()`), `mixBlendMode`, and `clipPath` for wipe transitions.
- This violates the "never mount one `<video>` per clip" requirement — one `<video>` element is mounted per video clip, always.
- `preload="auto"` on every `<video>`, so all clips buffer simultaneously. With 20+ clips on a timeline, the browser holds multiple decoders, frames, and HTTP connections open at once.
- Audio: one `<audio>` element per audio clip, volume synced on every frame.
- Playback: `requestAnimationFrame` in `editor.tsx` (`useEffect` around `playing`) that calls `setTime(t)` each frame, which re-renders the entire tree.
- There is **no** OffscreenCanvas, WebCodecs, Worker, or proxy/low-res media path. Original asset bytes are streamed straight from `/api/media/:id/raw`.

## 5. AI / API Edit Endpoint

- All editor mutations for agents go through `POST /api/projects/:id/timeline/ops` → `applyTimelineOp` in `shared/editing.ts`. Ops are validated structurally via `normalizeTimeline`, which caps values (`inPoint`, `outPoint`, `speed`, etc.) and drops unknown fields — a soft schema.
- The UI does **not** use this command layer. `editor.tsx` mutates `Timeline` directly via `mutate()`, duplicating op logic inline (`splitClip`, `duplicateClip`, `rippleDelete`, etc. in `client/src/lib/editor-model.ts`). So there are **two parallel implementations of every edit action** — a documented gap the command-layer milestone is meant to close.
- There is no function-calling / tool-call structured output; agents send raw JSON `{ op, args }`.
- No schema (JSON Schema / OpenAPI) is published; only `docs/API.md` prose.
- No confirm/diff preview before applying; ops are applied atomically but not surfaced as a preview.

## 6. Where the main thread freezes (duplication test)

The task asks for a duplication test with 10 / 50 / 100 copies. Server-enforced `MAX_CLIPS = 200` (`shared/timeline.ts:62`) blocks literal 100 duplicates of one clip only if the starting clip count exceeds 100 already; the test as specified is still reachable from a 100-clip starting timeline (100 duplicates → 200 total = the cap).

Analysis (from static code; a live browser profile is the next step):

| Trigger | Cost | Cause |
|---|---|---|
| Duplicating 1 clip (`duplicateClip` in `editor-model.ts:30`) | O(1) shallow copy + O(n) React re-render | New `Timeline` object → full React tree re-render |
| Duplicating N selected clips | O(n) per clip (shallow, not deep clone) | Each duplicate is cheap in JS; the cost is N React re-renders |
| Undo/redo of a duplicate | O(n) `JSON.parse(JSON.stringify(...))` | Snapshots stored as full deep clones |
| Playback | 60 Hz full-tree re-render | `time` prop is read by every child |
| Drag (move/trim) | `pointermove` → `gesture.update` → `apply()` per move | Every move re-renders the full tree, no memoization |

**My working hypothesis (not yet profiled)**: the dominant cost is React re-rendering, not JS-object cloning (which is shallow). Decoding happens in browser `<video>` elements off the main thread. But a real browser profile is the only way to confirm this — marked **unverified / blocked** until the Performance panel run happens.

## 7. What already works (don't rewrite)

- Server-side FFmpeg render pipeline (`server/render.ts`) is well-built: layered compositing, text via `textfile=` (safe from filter injection), audio `amix`, transitions via `geq`, keyframe-aware animation expressions, and golden-frame-friendly `frameAt` for a single frame.
- Owner-key bootstrap, API-key scopes, media-token HMAC (6 h TTL, bound to issuer, revocable), project-visibility model, per-key restrictions.
- `shared/editing.ts` timeline ops: `add_clip`, `trim_clip`, `move_clip`, `set_audio`, `add_text`, `split_clip`, `set_keyframes`, `set_transition`, `ripple_delete`, `shift_clips`, `close_gaps`, `update_clips`, `copy_style`, `set_marker`, `apply_motion`, `reorder`, `duplicate_clip`, `remove_clip(s)`, `add_marker`, `remove_marker`, `set_track`, `set_project`, `add_text_clip`.
- Live watch + presence polling (not collaboration, but working).
- 115 integration tests (`test/api.spec.ts`) cover scopes, restrictions, render, transitions, keyframes, presence, activity — these pass today and are the regression guard.

## 8. Gaps the next milestones must close

### Milestone 1 (routes & storage)
- Add `/home` dashboard, `/project/:id`, redirect `/`, 404 states, autosave label.
- Move project storage behind an interface (currently direct `storage.*` calls scattered in routes) and add IndexedDB/local storage path. **Trade-off**: IndexedDB for a server-backed app is awkward; the existing SQLite is already the single source of truth. I'll propose keeping SQLite as the canonical store and adding a client-side IndexedDB mirror for offline/draft state only, gated behind the storage interface.

### Milestone 2 (performance)
- Introduce Zustand with per-clip selectors; split `timeline` into normalized stores keyed by clip ID.
- Virtualize timeline clip rendering (viewport-only) and memoize clip components.
- Replace per-clip `<video>` DOM layering with a single WebGL canvas compositor + a small frame cache. Keep original `<video>` for scrubbing fallback during the migration so the existing UX isn't broken in one step.
- Generate proxy media (server-side low-res transcode on upload) and have preview prefer proxy, export uses original. Add a `proxyPath` column + `ffmpeg` transcode step to `routes.ts` upload handler.
- Batch and debounce; use `requestAnimationFrame` for playhead and drag (already partly there for playback — but the tree re-render is the issue).

### Milestone 3 (command layer & AI)
- Extract the UI's inline mutations (`split`, `duplicate`, `rippleDelete`, `align`, etc.) into the same `applyTimelineOp` used by the API. Single implementation, both call sites.
- Publish `commands.schema.json` + `openapi.json` (already have `capabilities()` in `shared/capabilities.ts` as a starting point).
- Add an AI endpoint that returns structured ops with a preview/diff and Apply/Reject.

### Milestone 4 (editor depth)
- Keyframes: already exist for a subset of properties (`shared/animation.ts` defines `position`, `scale`, `rotation`, `opacity`, `volume`, `brightness`, `contrast`, `saturation` with Bezier easing). Graph editor UI exists (`forge-motion.tsx` value graph). Extendable to all effect params.
- Missing: nested compositions, parenting, masks, blend modes, unlimited multi-track (currently fixed 3 tracks), graph editor for all properties, ripple/roll/slip/slide trims (only ripple delete exists).

## 9. Environment & security context

- `.env` is gitignored; no secrets are hardcoded in the repo or git history (verified by a scan; see `SECURITY_AUDIT.md`).
- `.env.example` does not exist — every variable (`VIDEOFORGE_DB`, `PORT`, `CORS_ORIGIN`, `VIDEOFORGE_MAX_UPLOAD_MB`, `VIDEOFORGE_BOOTSTRAP_KEY`, `VIDEOFORGE_FONT`, `VIDEOFORGE_REQUIRE_UI_AUTH`, `VITE_API_BASE`) is read inline via `process.env` with no validation. This is the first thing to fix (see `SECURITY_AUDIT.md` §1).
- Tests confirm the app runs with no env vars at all (all defaults); production hardening is off by default.
