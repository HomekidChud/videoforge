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
- [x] Many more edit tools: the Edit group covers transform, flip and mirror, row/column placement and distribute, snap to grid, crop, opacity, colour looks and filters, brightness/contrast/saturation/blur, speed and duration, volume, mute, audio fades, tracks and layering, copy with offset, replace words, and for-each filtering by colour and contained text. (True edge-to-edge alignment is still open — see the bucket list.)
- [x] True z-order: clips carry a z field (-100..100). Overlay visuals — media, shapes and text alike — stack by z in one order, in both the preview and the renderer; move_layer blocks step past the nearest neighbour even with unequal ranks.
- [x] Spatial crop for media clips: a crop box (fractions of the layer box) applied by the preview's clip-path and the renderer's crop filter (the layer keeps its box, padded back transparent, so preview and export match), driven by the friendly trim-sides Crop block.
- [x] Motion blocks take an easing pick; audio clips are walkable by for-each (kind "audio") for volume tools.
- [x] Hosted API server documented: https://videoforge-api-s54w.onrender.com is stated in the introduction, quickstart, self-hosting guide and README, with per-deployment keys.
- [x] Palette tabs: the studio palette is a Scratch-style rail of coloured categories (Create, Edit, Entrances, Exits, Attention, Springy, Camera, Animate, Text, Style, Clips, Timing, Advanced, Flow) with the palette showing only the selected category.
- [x] First-tool tutorial: a six-step guided tour opens the first time a new blocks tool is created — name the tool, meet the block menu, edit the Add title block, run it and find it again — replayable from the 🎓 Tutorial button.

## Bucket list

Big and small ideas, roughly by value. Each one is a candidate for its own commit and browser-verified round.

- [ ] Real edge alignment for the Line up block: left/right/top/bottom edges flush against the frame or each other — needs per-clip width/height, including measuring rendered text.
- [ ] Real speed ramps and freeze frames as first-class timeline ops (currently speed is a static per-clip value).
- [ ] Undo/redo for studio palette drags (adding a block is one edit; consider coalescing node drops).
- [ ] Shareable tool links: export a tool as a compact string so kids can pass automations around (they are localStorage-only today).
- [ ] Server-side tool library per account, synced between browsers.
- [ ] A "save clip as sticker" block that turns any clip into a reusable asset.
- [ ] More help: hover tooltips on palette groups.
- [ ] Export code tools as standalone snippets that run via the API (same vf helper, server-side).
- [ ] Localization of the block labels and descriptions for a first second language.
