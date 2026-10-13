# VideoForge motion graphics upgrade

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
