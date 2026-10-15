# VideoForge motion graphics upgrade

## Fit, animate with code and a bigger motion library

Capabilities version 6, timeline schema still v4 (every new field is optional and ignored by older clients).

### What is new

- Animate with code: any animatable property accepts an expression of `t`, `d`, `p` and `base` (clip field `expressions`). The same parsed expression is evaluated in the browser preview and compiled to an FFmpeg expression. 33 functions plus `wiggle(freq, amount)`, a 300 character limit, no loops, strings or property access. Ops: `animate_code`, `apply_code_motion` (13 looping recipes), `bake_expression`.
- Perfect fit: text wraps and shrinks to its box by default (`textMaxWidth`, `textMaxHeight`, opt out with `textFit: "none"`), footage supports `fit: "fill"` besides contain and cover, ops `fit_clip` and `fit_all`, `set_project` with `refit: true`, and `GET /api/projects/:id/fit-report`. Studio gets a Fit to frame section, an auto-fit toggle, a Fit everything button and an automatic refit when the canvas changes.
- Presets: 33 (was 14), grouped into entrances, emphasis and exits. New: `slide-right`, `drop`, `bounce-in`, `zoom-out`, `swing`, `wobble`, `rubber`, `tada`, `heartbeat`, `blink`, `flash`, `glitch`, `exit-right`, `exit-up`, `exit-down`, `shrink-out`, `spin-out`, `pop-out`, `reveal-out`.
- Easings: `ease-in-cubic`, `ease-out-cubic`, `ease-in-out-cubic`, `ease-in-expo`, `ease-in-back`.
- Templates: `bullet-list`, `social-handle`, `chapter-number`, `starburst` (thirteen in total).
- Transitions: `barn-h`, `barn-v`, `diamond`, `wipe-diagonal` (ten in total).
- Examples: 17 (was 8), including entrance, emphasis and exit samplers, an orbit built from expressions, all 13 code recipes and a text-fit demo. A second transitions reel shows the new transitions.
- Docs: new Fit & layout and Animate with code pages.

### Compatibility

- The six original presets produce the same keyframes as before. Applying a preset to a property drops any expression on that property, so the preset takes effect.
- Existing text that already fits renders as before. Text that overflowed now wraps and shrinks; set `textFit: "none"` on a clip to keep the old behaviour.
- Multi-line text is now centred in renders. This needs FFmpeg 6.1 or newer; older builds keep the previous left-aligned block automatically.

### Known boundaries

- Text width uses a Noto Sans based estimate with about 12% spare room. An unusual font can fit more loosely or tightly.
- Fit looks at the static position and the peak animated scale and rotation, not at x/y travel of entrance animations.
- Division by zero or invalid maths in an expression falls back to the property's static value. FFmpeg builds `mod` and `noise` from `mod` and `sin` sums, so values match to display precision rather than bit for bit.
- Spring, shake, bounce-in, rubber, tada, wobble, swing and heartbeat are sampled keyframes. Reveal expressions and the reveal presets are not allowed on text.
- Still no SVG, Lottie, 3D or nested scene graph.

### Verification

- `npm run check`, `npm run build` and `npm test`.
- FFmpeg pixel checks that an `x` expression renders where the preview evaluates it, that every code recipe and preset renders, and that wrapped text keeps the frame edges clear. Unit checks cover rejected expressions, layout, fit reports and fixes.

---

## Motion engine v2

Built on top of the motion graphics release below. Capabilities version 5, timeline schema still v4 (new fields are optional and ignored by older clients).

### What is new

- Presets: 14 (was 6). New: `spring`, `whip`, `spin`, `pulse`, `shake`, `reveal`, `exit-left`, `fade-out`. `apply_motion` takes `duration`, `delay` and `strength`.
- Easings: `snappy`, `anticipate` and `step-start` join the curve list.
- New animatable property and clip field `reveal` (0..1 wipe mask) for media and shapes, in browser preview and FFmpeg.
- Ops: `apply_motion_sequence`, `reverse_animation`, `retime_animation`, `add_beat_markers`, `snap_to_beats`. `add_motion_template` accepts `idPrefix`; `add_text_clip` honours `id`.
- Templates: `quote-card`, `split-reveal`, `progress-bar`, `stat-highlight` (nine in total).
- Transitions: `wipe-up`, `wipe-down`, `iris`.
- Studio: preset Duration/Delay/Strength controls, Reverse animation, the new transitions in the Effects tab and inspector, template previews that show strokes, ellipses and reveals.
- Docs: Motion presets, Transitions and Examples pages (with a live gallery), and a README gallery of GIFs rendered by `npm run examples`.

### Compatibility

- Existing projects, presets and API calls behave as before. `apply_motion` without options produces the same keyframes as the old presets, except that the `reveal`-family and new presets are additive.
- Clients built against capabilities v4 will not know the new ops, but timelines containing `reveal` or the new transitions still load in this version only; an older server would drop unknown transition types and ignore `reveal`.
- Text clips reject `reveal` (422) because the renderer cannot know the width of text. Use position or opacity instead.

### Known boundaries

- `spring` and `shake` use 25 sampled keyframes of the 64 a property allows.
- If a clip has both a running transition and a `reveal`, the preview shows the transition only; the FFmpeg render applies both.
- Transitions still need a preceding video-track clip. Iris is centred; there is no focus-point control yet.

### Verification

- `npm run check`, `npm test` (graphics, API, durable, deployment and media lifecycle suites) and `npm run build`.
- FFmpeg pixel checks for the reveal mask (start, half, end) and for step-start; every preset and every template renders as a still; every example builds.
- API tests post sequenced presets, reverse, beat markers and the three new transitions against a live server, and check that capabilities advertise them.

---

# Motion graphics upgrade (previous release)

## Scope

- Original public homepage and guide-oriented documentation, inspired by the navigation and clean reading layout of [Vortex Docs](https://create.playvortex.io/guides/intro/), not its wording, branding or game-engine content.
- Thirteen documentation guides with search, keyboard access, table-of-contents navigation, previous/next links, public access, mobile navigation and light/dark themes.
- Asset-free rectangles, ellipses and lines, with validated shape fields, browser preview, shape inspector, timeline labels and FFmpeg frame/video output.
- Five editable motion templates: lower-third, title-card, callout, kinetic-type and countdown.
- Agent features: atomic dry-run ops, optional revision guards, created clip IDs, stagger sequencing, schema/template discovery and whole-timeline validation.
- Editor features: Graphics library, multi-selection staggering and composition JSON copy/download/validated import with undo.
- Existing project/media/render/security APIs and the legacy `#/api-docs` URL retained. Studio moves from `#/` to `#/editor`. Browser keys are now session-memory only.

## QA inventory

### Automated code and render checks

- TypeScript and production build.
- Full existing API regression suite plus graphics discovery, dry-run non-persistence, stale-write guards, batch atomicity, template IDs, malformed shapes and missing-media validation.
- Graphic normalization, bounds, unsafe colors, every template, minimum-duration templates and stagger timing.
- Actual FFmpeg pixel checks: rectangle fill, clear background, ellipse transparent center/stroke, rounded corners, hidden shapes and animated position.
- FFmpeg PNG for each template and playable asset-free MP4 output.

### Browser checks

- Homepage desktop/mobile and light/dark themes; all feature CTA destinations.
- Every guide desktop/mobile, no horizontal document overflow and working sidebar routes.
- Search button, Ctrl+K, Enter result navigation, no-match state, Escape, focus trapping and focus restoration.
- TOC, previous/next, mobile navigation and copy buttons.
- Motion playground: each preset, title edits, pause/play, restart and playhead scrub.
- Key-gated Studio, Graphics tab, template insertion, shape insertion, inspector changes, timeline selection, motion tab and playback.
- Composition JSON: invalid JSON, validation, apply/undo, download and copy.
- Multi-selection Stagger, export queue, final render preview and download availability.
- Off-happy-path coverage: unknown documentation slug, no search matches, invalid JSON, missing media and bad shape bounds.

## Verification results

- `npm run check`: passed.
- `npm test`: 50 graphics checks, 131 API assertions and 7 media lifecycle checks (188 total).
- `npm run build`: passed. Existing PostCSS/Zod annotation and large-chunk warnings remain.
- Browser checks passed for the homepage, all thirteen guide routes at desktop and 375px mobile, themes, search/focus trapping, pagination, copy feedback, playground controls and legacy/unknown routes.
- Studio exercised template creation, staggering, shape editing, Motion/Edit tabs, playback, JSON invalid-input validation, import, undo, JSON download and a completed MP4 export.
- Mobile Studio template tapping was re-tested after removing competing library scroll surfaces; the timeline zoom toolbar now wraps rather than overflowing the viewport.

## Known boundaries

- No arbitrary SVG paths, Lottie, 3D, expressions, nested compositions or motion blur.
- Shape geometry/colors are static; transform properties animate.
- Media draws first, shapes next and text last; no general z-index.
- The API revision guard applies to timeline ops only, not full-timeline PUT.
- Dry-run generated IDs are provisional; committed `createdClipIds` are authoritative.
- Font metrics, antialiasing and sampled cubic easing can differ slightly between browser and FFmpeg output.
- The repository's pre-existing dependency audit reports Tailwind/PostCSS/globbing advisories. This upgrade does not perform a breaking Tailwind migration.
