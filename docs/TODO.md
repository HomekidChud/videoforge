---
title: Bucket list
group: Studio
order: 99
description: What is done in the block studio and custom tools, and what to build next.
---

## Where we are

The block studio, the code editor and the tool engine are in good shape. Each item below shipped with its own tests and a commit to main, and everything on this page reflects the current state of the repo. The remaining ideas are roughly ordered by value for kids making videos.

## Shipped

- [x] Full-screen Scratch-style block studio (React Flow) with palette drag and drop, custom nodes, per-edge delete buttons, inline param handles, live validation and the error console bar.
- [x] Code tab as a real editor: helper reference sidebar with click-to-insert examples, $-template reference, line numbers, tab-key support, bigger monospace font and inline run errors.
- [x] Blocks → Code conversion on tab switch, with generated JavaScript that produces the same operations the blocks would, and a notice that the tool now runs the code.
- [x] Animation everything: all motion presets in the palette (entrances, exits, attention, springy, camera), animate-any-property keyframe blocks with easings, text effects (typewriter, word/line reveal, colour cycle), draw-on, pulsing glow, parallax, speed and timing blocks.
- [x] Many more edit tools: the Edit group covers transform, flip and mirror, align and distribute, snap to grid, crop, opacity, colour looks and filters, brightness/contrast/saturation/blur, speed and duration, volume, mute, audio fades, tracks and layering, copy with offset, replace words, and for-each filtering by colour and contained text.

## Bucket list

Big and small ideas, roughly by value. Each one is a candidate for its own commit and browser-verified round.

- [ ] True z-order within a track: the renderer layers clips by track then start time, so Bring to front / Send to back currently switch tracks. A per-clip z-index would need renderer support (FFmpeg filter order and the preview sort) before a block can honestly promise it.
- [ ] Spatial crop and vignette for media clips (today's Crop block uses the left-to-right reveal mask).
- [ ] Real speed ramps and freeze frames as first-class timeline ops (currently speed is a static per-clip value).
- [ ] Undo/redo for studio palette drags (adding a block is one edit; consider coalescing node drops).
- [ ] Shareable tool links: export a tool as a compact string so kids can pass automations around (they are localStorage-only today).
- [ ] Server-side tool library per account, synced between browsers.
- [ ] A "save clip as sticker" block that turns any clip into a reusable asset.
- [ ] More help: a short guided tour of the studio the first time it opens, and hover tooltips on palette groups.
- [ ] Export code tools as standalone snippets that run via the API (same vf helper, server-side).
- [ ] Localization of the block labels and descriptions for a first second language.
