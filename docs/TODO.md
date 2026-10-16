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
- [x] Palette tabs: the studio palette is a Scratch-style rail of coloured categories (Create, Edit, Move in, Move out, Attention, Springy, Camera, Animate, Text, Style, Clips, Timing, Values, Flow) with the palette showing only the selected category.
- [x] First-tool tutorial: a six-step guided tour opens the first time a new blocks tool is created — name the tool, meet the block menu, edit the Add title block, run it and find it again — replayable from the 🎓 Tutorial button.
- [x] Value blocks: Text, Number and Yes / No blocks in a new Values category plug into any block field — typed arguments without touching code; bad numbers turn red and unplugged values get a warning, and blocks-to-code conversion inlines them identically.
- [x] Arguments JSON editor removed: the Advanced op block and its Arguments (JSON) box are gone from the palette and the studio — every operation shows named, friendly fields, and a saved JSON object (like update_clip's patch) becomes editable property rows instead of raw text (saved advanced tools keep working).
- [x] Motion blocks are edit tools: "Entrances"/"Exits" became Move in / Move out with labels like "Move a clip in", framed as animating a clip you already have; saved block ids are unchanged.
- [x] Blocks panel: the block studio now opens from its own Blocks tab next to Effects — the Tools tab is code-only (no block editor: its studio hides the Blocks tab and the block-creation buttons), while it still runs tools.
- [x] Blocks tab opens the canvas itself: clicking Blocks goes straight into the block studio (your latest tool, or a fresh draft with the tutorial) — no tools list in between; closing it returns to the panel you came from.
- [x] Palette diet: the canned motion chips (Move in, Move out, Attention, Springy, Camera and their Animate duplicates) are out of the palette — the friendly from/to Animate blocks and presets cover them; hidden ids still load older saved tools.
- [x] Real edge alignment for the Line up block: clips line up by their measured edges — against each other or flush with the frame — including text clips (the renderer measures rendered text with drawtext/ascent).
- [x] Real speed ramps and freeze frames as first-class timeline ops: the Speed steps block builds a per-clip ramp (segments of constant speed, 0 = freeze), rendered with per-segment trim/setpts/concat (audio silenced and padded to match), and the preview plays the same ramp. Freeze frame is its own block.
- [x] Undo/redo for the studio: one entry per drop, delete, paste or edge; drags are one entry (committed at drag start); quick typing coalesces (900 ms). Ctrl+Z / Ctrl+Shift+Z, with a capture-phase listener so text fields don't swallow it.
- [x] Shareable tool codes: the 🔗 Share button copies a compact `VFT1:` code; the tools panel imports it. Old links keep working (damaged codes get a friendly error).
- [x] Server-side tool library: tools sync per account (or per API key) with `GET/PUT/DELETE /api/tools/:id`, merged with the browser's local copy as the offline fallback.
- [x] Save as sticker: the block turns any clip into a reusable building block; stickers appear in their own palette category and drop as fresh clips.
- [x] Hover help on palette groups and a searchable palette (search matches either language).
- [x] Export code tools as standalone scripts: the Code tab's “Export as standalone script” downloads a single .mjs that runs the same code against the API (`VF_API_KEY` env, `--dry-run` preview), for agents and cron jobs.
- [x] Localization: Spanish labels and descriptions for every block and group (🌐 button in the studio, remembered per browser; the browser language is the default). Search matches either language.
- [x] Accounts with durable sign-ins: email + password (first account needs the owner key), Google when configured, API keys for agents; sessions live in SQLite so they survive restarts. No API key needed to use the studio.
- [x] Calmer blocks: the coloured field dots (clip / frame / value sockets) only show when you hover a block, select it, focus it or while dragging a connection — dots that already have something plugged in stay visible, and the 🔌 Connectors button pins them all on. The canvas legend explains the dots.
- [x] Neater blocks: every block got more breathing room (roomier header, field and hint spacing) and a cleaner look — soft gradient card, one-pixel border, a colour-coded accent bar per block kind, circular glowing handles and hover states on the palette chips.
- [x] One ✕ per wire, not per canvas: a wire's delete button now appears when you click that wire (or hover the ✕ itself), instead of every ✕ lighting up whenever you touch the canvas.
- [x] 🧹 Tidy button: lines the run chain up a column, puts repeat bodies to its right, helper blocks (values, clips, frames) beside the blocks they feed and notes in a far column — one undo entry, like a drag. Presets and free spots also land further apart, so new blocks no longer stack on old ones.
- [x] Bigger tutorial: six steps became eleven in three parts (Your first tool, Connecting things, Power moves) with part chips you can jump between — now covering wires vs field dots, importing clips, value blocks, undo, presets and where saved tools live.

## Bucket list

Big and small ideas, roughly by value. Each one is a candidate for its own commit and browser-verified round.

- [ ] **Rig animations — a Roblox-Studio-style rig animator.** The big one: characters and props built from a joint hierarchy (bones with parent/child transforms), posed by selecting a joint and rotating/moving it, the way Roblox Studio's Animation Editor works. Poses captured as per-joint keyframes on a timeline, interpolated (linear + easing, maybe the existing bezier tween slopes), and baked into an **animation clip that lands on the video timeline as a normal, editable clip** — trim it, retime it, layer it, run it backwards with the existing tools. Stretch: onion skinning, IK handles for limbs, walk-cycle presets, and a library of rigs (stick figure, mascot, hands). This is skeletal animation — today's motion presets only animate whole clips, so this needs a new rig data model, a pose/keyframe editor panel and renderer support (browser canvas first, FFmpeg export after). Big but the future of the studio.
- [ ] Your idea here — the studio is in good shape; what should kids be able to make next?
