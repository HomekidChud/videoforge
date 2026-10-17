---
title: Bucket list
group: Studio
order: 99
description: Progress on the block studio, the Animator, the docs and the editor, with what is in progress and what comes next.
---

## Where we are

**Overall: 44 of 103 done, 43%.** █████████░░░░░░░░░░░

Nothing is being built right now, and 59 items are still to do. Done items are ticked, items being worked on carry an In progress label, items first in line carry an Up next label, and every open item has a priority of High, Medium or Low. Each item below ships with its own tests and a commit to main, so this page always matches the repo.

The next three pushes are real tutorial videos, a calmer editor interface and a much stronger docs site. They are broken down further down this page.

## Progress by area

Each bar counts finished items in that area. The block studio and the shipped docs are complete, and the rest is the work ahead.

| Area | Done | In progress | To do | Progress |
|---|---|---|---|---|
| Block studio | 30 | 0 | 0 | ████████ 100% |
| Animator and rigs | 3 | 0 | 6 | ██░░░░░░ 33% |
| Docs shipped | 6 | 0 | 0 | ████████ 100% |
| Accounts and media | 4 | 0 | 3 | █████░░░ 57% |
| Tutorial videos | 1 | 0 | 10 | █░░░░░░░ 9% |
| Editor UI revamp | 0 | 0 | 14 | ░░░░░░░░ 0% |
| Docs: reading and navigation | 0 | 0 | 12 | ░░░░░░░░ 0% |
| Docs: live and generated | 0 | 0 | 8 | ░░░░░░░░ 0% |
| Docs: quality and reach | 0 | 0 | 6 | ░░░░░░░░ 0% |
| Everything | 44 | 0 | 59 | ███░░░░░ 43% |

## In progress

Work that has started and is not finished. Nothing is in progress at the moment. When a task starts it moves here with an In progress label, and these three are first in line:

- ☐ **High.** **Up next.** Record a screen capture of the whole motion graphics tutorial, one short clip per section, with the Studio shown at a readable size.
- ☐ **High.** **Up next.** Audit every panel and the top bar, listing what is used daily, what is rare and what can move into a menu.
- ☐ **High.** **Up next.** Copy button and syntax highlighting on every code block.

## Next: tutorial videos

Tutorials become motion graphics and real video: recordings of VideoForge being used, placed next to the steps they show. █░░░░░░░ 1 of 11 done.

- ☑ Written motion graphics tutorial with a matching API batch.
- ☐ **High.** **Up next.** Record a screen capture of the whole motion graphics tutorial, one short clip per section, with the Studio shown at a readable size.
- ☐ **High.** Play each clip inside the docs page next to the step it shows: a video block with a poster image, captions and play, pause and replay.
- ☐ **High.** Chapters on every tutorial video that link to the page section, and a section link that jumps the video to the right second.
- ☐ **High.** Loop recordings for every motion preset, template and shape, shown beside its entry in the docs.
- ☐ **Medium.** Recorded walkthroughs of the Studio tour, the Animator, the block studio and the agent API workflow.
- ☐ **Medium.** Make the recordings with a script (Playwright plus FFmpeg) so they can be rebuilt in one command whenever the interface changes.
- ☐ **Medium.** More tutorials: Animator rig, blocks and Apply to edit, a YouTube lower third, kinetic type, a product promo, captions on a talking-head clip, and driving an edit from an agent.
- ☐ **Medium.** Transcripts for every video, so each tutorial also works as text and in search.
- ☐ **Low.** A short intro film for the docs home page and a recorded changelog for each release.
- ☐ **Low.** Host videos outside git (a release asset or storage bucket) so the repository stays small.

## Next: editor UI revamp

The editor has grown crowded. The goal is a calmer layout where the common controls are obvious and the rest is one step away. ░░░░░░░░ 0 of 14 done.

- ☐ **High.** **Up next.** Audit every panel and the top bar, listing what is used daily, what is rare and what can move into a menu.
- ☐ **High.** Calmer top bar: keep Edit and Animate, Add title, Project and Export in view and move the rest into a single More menu.
- ☐ **High.** Workspace presets (Edit, Animate, Graphics, Audio, Blocks) that show only the panels each job needs, and remember the last one.
- ☐ **High.** A command palette on Ctrl+K for every Studio action, with recent commands and shortcuts shown beside each.
- ☐ **High.** Inspector with progressive disclosure: the common controls first, advanced groups folded, and a search box inside the inspector.
- ☐ **Medium.** Icon dock for the left panels (Media, Effects, Blocks, Graphics, Tools, Projects) with tooltips, instead of a block of text tabs.
- ☐ **Medium.** Simple and Advanced modes, so a first-time user sees a small set of tools and can switch the rest on.
- ☐ **Medium.** One spacing, type and colour scale shared by the Studio, Animator and block studio, built from the same design tokens.
- ☐ **Medium.** Timeline polish: tidier track headers, collapsible tracks, a minimap for long projects and clearer selection.
- ☐ **Medium.** Keyboard shortcut sheet on the ? key, and an editor tour for first-time users.
- ☐ **Medium.** Better empty states for media, graphics and the timeline, each with one clear next action.
- ☐ **Low.** A mobile editor layout built around one panel at a time.
- ☐ **Low.** A light theme for the Studio.
- ☐ **Low.** Screenshot checks at three window sizes in CI, so the layout cannot drift back into clutter.

## Next: docs reading and navigation

Small features that make the docs faster to read and easier to trust. ░░░░░░░░ 0 of 12 done.

- ☐ **High.** Previous and next links at the bottom of every page, in reading order.
- ☐ **High.** **Up next.** Copy button and syntax highlighting on every code block.
- ☐ **High.** Language tabs on API examples: curl, JavaScript and Python side by side.
- ☐ **High.** Is this page helpful? buttons, and a link that opens a prefilled GitHub issue for the page.
- ☐ **Medium.** Last updated date on every page, taken from git.
- ☐ **Medium.** Roles on the home page: cards for Studio user, agent builder and contributor, each with a short path.
- ☐ **Medium.** Troubleshooting and FAQ pages, plus a cookbook of short recipes.
- ☐ **Medium.** A glossary with hover definitions for words like clip, track, keyframe, scope and rig.
- ☐ **Medium.** Keyboard shortcuts page generated from the Studio's own shortcut list.
- ☐ **Medium.** New and Updated badges on pages and sidebar entries.
- ☐ **Low.** Click-to-zoom images, a print stylesheet and an offline copy of the docs.
- ☐ **Low.** Docs search: remember filters, show a preview of the section on hover and add a / hint on every page.

## Next: docs live and generated

Pages that run, update themselves and can be read by agents. ░░░░░░░░ 0 of 8 done.

- ☐ **High.** Try it panel on each endpoint: paste a key, send a real request and see the response.
- ☐ **High.** Interactive examples that embed the real preview, so a page shows a preset or template playing live.
- ☐ **High.** An OpenAPI file generated from the operation list, linked from the API reference.
- ☐ **Medium.** Generate the changelog page from commit messages.
- ☐ **Medium.** Docs versions, so a self-hosted older release reads the matching pages.
- ☐ **Medium.** A Markdown copy of every page and an llms.txt, so agents can read the docs directly.
- ☐ **Medium.** Spanish docs that follow the Spanish block labels already in the studio.
- ☐ **Low.** A page that shows the live status of the hosted deployment.

## Next: docs quality and reach

Checks that stop the docs drifting from the product, and work that helps people find them. ░░░░░░░░ 0 of 6 done.

- ☐ **High.** Link checker in CI for internal links, section anchors and external URLs.
- ☐ **High.** Test every JSON and shell example in the docs against the real API, the way the tutorial batch is tested.
- ☐ **Medium.** Style and spelling checks on docs pull requests.
- ☐ **Medium.** An accessibility pass on the docs: contrast, focus order, skip link and screen reader labels.
- ☐ **Medium.** Social preview images and page descriptions for each page, plus a sitemap.
- ☐ **Low.** A contributors list on the Contribute page.

## Animator and rigs ideas

What would make the Animator feel complete. ██░░░░░░ 3 of 9 done.

- ☑ **Rig animations, for clips.** The Animator is a Roblox-style animation editor where the parts are your own clips instead of bones: video clips, images, text and shapes all become rig parts with a joint, an optional parent and their own keyframes. Pose by dragging on the stage or typing values, key on a dope sheet with easing per key, parent parts by dragging, and bake the result into plain clip keyframes with the green Apply to edit button. Presets (bounce, swing, wave, pulse, float, pop in, walk cycle), a ready-made stick figure, undo and redo, and animations saved per project. Because it bakes into ordinary keyframes the preview, FFmpeg export and API need no new renderer.
- ☑ **Animator button.** Opens from the Studio top bar and from the block studio header.
- ☑ **Rig blocks and operations.** Pose clips together, Make a clip follow another and Play an Animator animation join the palette, backed by new `rig_pose`, `rig_follow` and `rig_bake` timeline operations that agents can call too.
- ☐ **High.** Onion skinning and a ghost of the previous pose in the Animator.
- ☐ **High.** Save Animator animations to the project on the server so they follow you between browsers.
- ☐ **Medium.** IK handles so dragging a hand moves the whole arm.
- ☐ **Medium.** Rig keys on text effects and colour, not just position, size, turn and see-through.
- ☐ **Medium.** A library of ready-made rigs beyond the stick figure: mascot, hands.
- ☐ **Low.** Copy and paste poses between parts and between animations.

## Media and studio ideas

Uploads, playback speed and open ideas. ░░░░░░░░ 0 of 3 done.

- ☐ **Medium.** Resumable and chunked uploads for very large files.
- ☐ **Medium.** Background proxies for large video, so scrubbing stays smooth.
- ☐ **Low.** Your idea here: the studio is in good shape, so what should people be able to make next?

## Shipped: block studio

████████ 30 items.

- ☑ Full-screen Scratch-style block studio (React Flow) with palette drag and drop, custom nodes, per-edge delete buttons, inline param handles, live validation and the error console bar.
- ☑ Code tab as a real editor: helper reference sidebar with click-to-insert examples, $-template reference, line numbers, tab-key support, bigger monospace font and inline run errors.
- ☑ Blocks → Code conversion on tab switch, with generated JavaScript that produces the same operations the blocks would, and a notice that the tool now runs the code.
- ☑ Animation everything: all motion presets in the palette (entrances, exits, attention, springy, camera), animate-any-property keyframe blocks with easings, text effects (typewriter, word/line reveal, colour cycle), draw-on, pulsing glow, parallax, speed and timing blocks.
- ☑ Many more edit tools: the Edit group covers transform, flip and mirror, row/column placement and distribute, snap to grid, crop, opacity, colour looks and filters, brightness/contrast/saturation/blur, speed and duration, volume, mute, audio fades, tracks and layering, copy with offset, replace words, and for-each filtering by colour and contained text. (True edge-to-edge alignment is still open — see the bucket list.)
- ☑ True z-order: clips carry a z field (-100..100). Overlay visuals — media, shapes and text alike — stack by z in one order, in both the preview and the renderer; move_layer blocks step past the nearest neighbour even with unequal ranks.
- ☑ Spatial crop for media clips: a crop box (fractions of the layer box) applied by the preview's clip-path and the renderer's crop filter (the layer keeps its box, padded back transparent, so preview and export match), driven by the friendly trim-sides Crop block.
- ☑ Motion blocks take an easing pick; audio clips are walkable by for-each (kind "audio") for volume tools.
- ☑ Palette tabs: the studio palette is a Scratch-style rail of coloured categories (Create, Edit, Move in, Move out, Attention, Springy, Camera, Animate, Text, Style, Clips, Timing, Values, Flow) with the palette showing only the selected category.
- ☑ First-tool tutorial: a six-step guided tour opens the first time a new blocks tool is created — name the tool, meet the block menu, edit the Add title block, run it and find it again — replayable from the 🎓 Tutorial button.
- ☑ Value blocks: Text, Number and Yes / No blocks in a new Values category plug into any block field — typed arguments without touching code; bad numbers turn red and unplugged values get a warning, and blocks-to-code conversion inlines them identically.
- ☑ Arguments JSON editor removed: the Advanced op block and its Arguments (JSON) box are gone from the palette and the studio — every operation shows named, friendly fields, and a saved JSON object (like update_clip's patch) becomes editable property rows instead of raw text (saved advanced tools keep working).
- ☑ Motion blocks are edit tools: "Entrances"/"Exits" became Move in / Move out with labels like "Move a clip in", framed as animating a clip you already have; saved block ids are unchanged.
- ☑ Blocks panel: the block studio now opens from its own Blocks tab next to Effects — the Tools tab is code-only (no block editor: its studio hides the Blocks tab and the block-creation buttons), while it still runs tools.
- ☑ Blocks tab opens the canvas itself: clicking Blocks goes straight into the block studio (your latest tool, or a fresh draft with the tutorial) — no tools list in between; closing it returns to the panel you came from.
- ☑ Palette diet: the canned motion chips (Move in, Move out, Attention, Springy, Camera and their Animate duplicates) are out of the palette — the friendly from/to Animate blocks and presets cover them; hidden ids still load older saved tools.
- ☑ Real edge alignment for the Line up block: clips line up by their measured edges — against each other or flush with the frame — including text clips (the renderer measures rendered text with drawtext/ascent).
- ☑ Real speed ramps and freeze frames as first-class timeline ops: the Speed steps block builds a per-clip ramp (segments of constant speed, 0 = freeze), rendered with per-segment trim/setpts/concat (audio silenced and padded to match), and the preview plays the same ramp. Freeze frame is its own block.
- ☑ Undo/redo for the studio: one entry per drop, delete, paste or edge; drags are one entry (committed at drag start); quick typing coalesces (900 ms). Ctrl+Z / Ctrl+Shift+Z, with a capture-phase listener so text fields don't swallow it.
- ☑ Shareable tool codes: the 🔗 Share button copies a compact `VFT1:` code; the tools panel imports it. Old links keep working (damaged codes get a friendly error).
- ☑ Save as sticker: the block turns any clip into a reusable building block; stickers appear in their own palette category and drop as fresh clips.
- ☑ Hover help on palette groups and a searchable palette (search matches either language).
- ☑ Export code tools as standalone scripts: the Code tab's “Export as standalone script” downloads a single .mjs that runs the same code against the API (`VF_API_KEY` env, `--dry-run` preview), for agents and cron jobs.
- ☑ Localization: Spanish labels and descriptions for every block and group (🌐 button in the studio, remembered per browser; the browser language is the default). Search matches either language.
- ☑ Calmer blocks: the coloured field dots (clip / frame / value sockets) only show when you hover a block, select it, focus it or while dragging a connection — dots that already have something plugged in stay visible, and the 🔌 Connectors button pins them all on. The canvas legend explains the dots.
- ☑ Neater blocks: every block got more breathing room (roomier header, field and hint spacing) and a cleaner look — soft gradient card, one-pixel border, a colour-coded accent bar per block kind, circular glowing handles and hover states on the palette chips.
- ☑ One ✕ per wire, not per canvas: a wire's delete button now appears when you click that wire (or hover the ✕ itself), instead of every ✕ lighting up whenever you touch the canvas.
- ☑ 🧹 Tidy button: lines the run chain up a column, puts repeat bodies to its right, helper blocks (values, clips, frames) beside the blocks they feed and notes in a far column — one undo entry, like a drag. Presets and free spots also land further apart, so new blocks no longer stack on old ones.
- ☑ Bigger tutorial: six steps became eleven in three parts (Your first tool, Connecting things, Power moves) with part chips you can jump between — now covering wires vs field dots, importing clips, value blocks, undo, presets and where saved tools live.
- ☑ **Blocks are about the whole edit, not one tool.** The green block now reads "When Apply is pressed" and the Run button is ▶ Apply to edit. Preview lists what Apply would change before it touches the edit, and the green block's Work on setting picks which clips the blocks use: selected, every clip, under the playhead, or all video, text or shapes. Wording across the studio and the Tools panel changed from tools to blocks and scripts.

## Shipped: Animator and rigs

████████ 3 items.

- ☑ **Rig animations, for clips.** The Animator is a Roblox-style animation editor where the parts are your own clips instead of bones: video clips, images, text and shapes all become rig parts with a joint, an optional parent and their own keyframes. Pose by dragging on the stage or typing values, key on a dope sheet with easing per key, parent parts by dragging, and bake the result into plain clip keyframes with the green Apply to edit button. Presets (bounce, swing, wave, pulse, float, pop in, walk cycle), a ready-made stick figure, undo and redo, and animations saved per project. Because it bakes into ordinary keyframes the preview, FFmpeg export and API need no new renderer.
- ☑ **Animator button.** Opens from the Studio top bar and from the block studio header.
- ☑ **Rig blocks and operations.** Pose clips together, Make a clip follow another and Play an Animator animation join the palette, backed by new `rig_pose`, `rig_follow` and `rig_bake` timeline operations that agents can call too.

## Shipped: docs

████████ 6 items.

- ☑ **Better docs.** Sidebar guide groups open and close with an arrow (remembered per browser, plus Collapse all), every section folds with its own arrow, and there are reading times, a progress bar, a highlighted on-this-page list, copyable section links, breadcrumbs, note, tip and warning callouts, bullet lists with bold, code and links, an edit-on-GitHub link and a back-to-top button.
- ☑ **Docs search.** Every section is searched, typos are forgiven only for words the docs do not contain, weak matches are trimmed, four pages show first with Show more, and a closest-match fallback appears when no page has every word.
- ☑ **Docs start tidy.** Only Get started is open on arrival, and the group you are reading opens by itself.
- ☑ **Motion graphics tutorial.** An animated intro built step by step in the Studio, plus the same result as one API batch that a test keeps honest.
- ☑ **Contribute and Storage pages.** Setup, code layout, tests and recipes for presets, templates, operations and blocks, and a page on disks, backups and the optional MongoDB store.
- ☑ **Short README.** A one-screen overview with a docs index, instead of repeating the docs.

## Shipped: accounts and media

████████ 4 items.

- ☑ Hosted API server documented: https://videoforge-api-s54w.onrender.com is stated in the introduction, quickstart, self-hosting guide and README, with per-deployment keys.
- ☑ Server-side tool library: tools sync per account (or per API key) with `GET/PUT/DELETE /api/tools/:id`, merged with the browser's local copy as the offline fallback.
- ☑ Accounts with durable sign-ins: email + password (first account needs the owner key), Google when configured, API keys for agents; sessions live in SQLite so they survive restarts. No API key needed to use the studio.
- ☑ **Faster uploads, and the sign-in bug fixed.** The session cookie is now sent with uploads, four files go up at once, each file is probed once, thumbnails are ready straight after upload and media plays with range requests.
