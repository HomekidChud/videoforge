---
title: Custom tools
group: Studio
order: 15

description: Write your own one-click automations in JavaScript or snap them together in a full-screen block studio.
---

## Your own tools

Custom tools are small automations you write once and run with a click: "three beat titles at the playhead", "bold every title", "orbit the selection". A tool returns a list of timeline operations, and running it applies them as one atomic, undoable step — the same operations the API uses, with the same validation. Click the **Blocks** tab, next to Effects, and the block studio opens straight away; code tools live in the Tools tab.

## Two ways to write one

Every tool has a name, a description, and a program written in one of two modes, both edited in the full-screen block studio.

- **Blocks** is a canvas like Scratch: drag friendly blocks, connect them with lines, and run them — no code required.
- **Code** is a short JavaScript function that receives a `vf` helper and returns operations. The studio's Code tab is a plain editor for coders.

Duplicate a built-in example to get started; your tools are stored in your browser and run only against the timeline you have open.

## The block studio

Open any tool (or create one) and the studio takes over the screen. Blocks live in the palette on the left. The narrow rail of coloured dots picks a **category** — Create, Edit, Animate, Text, Style, Clips, Timing, Values and Flow — and the palette shows that category's blocks. Drag them onto the canvas. Connect a block's bottom dot to the next block's top dot to say "then do this": the line snaps in place and that becomes the run order. A tool starts at the **Start** block and follows the lines.

Creating your first tool with **New tool with blocks** opens a short tutorial: name the tool, meet the block menu, change the text of the Add title block, press Run, and find your tool again in the Blocks panel. The 🎓 Tutorial button in the header replays it any time.

Every field on a block has a small dot on its left. Clip and frame blocks plug into clip and time fields; **Values** blocks plug into any field. Drag a 📝 Text, 🔢 Number or 🔘 Yes / No block next to a block, type the value, and drag from its dot into the field — the connected value wins over whatever is typed in the field itself. Number blocks that don't hold a number turn red, and an unplugged value block gets a nudge to connect it.

| Block family | What it does |
|---|---|
| Create | add a title, shape or sticker |
| Edit | change clips you already have: move, resize, rotate, flip and mirror, line up and distribute, snap to grid, crop, opacity, colour looks and filters, speed and duration, volume, mute, fades, tracks, real layer order, copy with offset, replace words |
| Animate | friendly from-to moves — fade in or out, slide in, rise up, drop down, zoom, spin, draw on — plus animate any property yourself, and expression-driven floats, glows and orbits |
| Text | typewriter, word-by-word and line-by-line reveal, colour cycling |
| Style | bold or colour the text of a clip |
| Clips | delete or duplicate clips, stagger a selection, beat markers |
| Timing | stagger to beats, speed changes, reverse and stretch motion, Repeat and For each clip |
| Values | little typed blocks — Text, Number, Yes / No — that plug into any block's field, so arguments can be wired instead of typed |
| Flow | Function defines a named group; Call runs it by name |

### Editing clips you already have

The **Edit** group is for everything that changes an existing clip. **Move**, **Set size** and **Rotate** transform a clip; **Flip upside down** and **Mirror** flip it; **Line up** and **Snap to grid** tidy a whole selection — place them in a tidy row or column at fixed frame spots, or spread them evenly across the frame. Colour and mood come from **Colour look**, **Brightness**, **Contrast**, **Colour strength** and **Blur**. Timing and sound: **Change speed**, **Set duration**, **Volume**, **Mute**, **Fade sound in/out**. Layering is real stacking order: **Forwards/Backwards one layer** and **Bring to front / Send to back** change a clip's z (higher draws on top, in both the preview and the render), and **Move to track** moves it between the overlay, video and audio tracks. **Crop** trims a picture or video in from the sides — the layer keeps its box with transparent padding where pixels were cut, so the preview and the export match. **Copy with offset** duplicates a clip and nudges the copy sideways — perfect for shadows and rows — and **Change words** rewrites a text clip while keeping its font, colour and size. Motion blocks also take an **easing** pick (the default, "preset", keeps each move's own built-in easing).

### Animating anything

**Animate a property** is the keyframe block: pick a property (position, size, rotation, opacity, colour filters, reveal, volume), a **from** and a **to** value, a duration, a delay and an easing — including bounce and elastic, which the studio converts into keyframe curves for you. Ready-made variants cover the popular moves (slide in, rise up, drop, zoom, spin, fade), and **Draw on** uncovers shapes and videos left to right. Expression blocks like **Pulsing glow** and **Parallax float** animate forever with small formulas of time.

### Text effects

Text clips can be revealed over time: **Typewriter** types them on character by character, **Reveal word by word** and **Reveal line by line** show them progressively, and **Colour cycle** steps the colour through a rainbow. All of them preview in the editor and export to video. **Stop text effects** turns them off.

Control blocks (Repeat, For each clip, Function) have a second dot on their right side: connect blocks there to fill their body.

## Clips and frames

Two special blocks plug your project straight into a tool.

- **Import clips** lists every clip in the timeline — add one and it becomes a clip block on the canvas.
- **Add frame** adds a frame block: a frame number that knows the project fps, so it shows the real seconds it stands for.

Connect a clip block's right dot into a block's **clip** field (a purple dot on its left edge) to make that block act on that clip. Connect a frame block into a **time** field and it becomes that many seconds. One connection per field — dragging a new one replaces the old.

## Errors, live

The studio checks the graph as you edit. Problems turn the block red and collect in the error panel at the bottom of the screen: click a message to jump to the block. A missing Start, a block with two blocks after it, a loop that never ends, a function that calls itself, a clip that no longer exists — all are caught before anything runs. Disconnected blocks only get a warning, and running with errors is disabled until they are fixed. Run failures land in the same panel.

## Templates

Any string value in a block can hold a template that is resolved when the tool runs.

| Template | Becomes |
|---|---|
| $playhead | the playhead position in seconds |
| $duration | the timeline duration in seconds |
| $index / $count | position inside a repeat or for-each group |
| $clipId | the current clip inside a for-each group |
| $selection | the selected clip ids, comma separated |

Arithmetic works too: `"$playhead + $index * 0.4"` staggers each step from the playhead. Fields marked JSON (patches, keyframes, expressions) are parsed into objects, so an update step can carry any clip fields, including the new text style.

For-each groups can also filter by what a clip looks like or says: pick **colour** and a colour swatch to run blocks for every clip of that colour, or pick **contains** and type a few words to catch every text clip containing them. Audio clips are included too (kind "audio"), so a for-each over audio can change volume across a whole soundtrack.

Switching a blocks tool to the Code tab converts the graph into readable JavaScript that produces the same operations; the `vf` helpers cover everything the blocks can do, including `vf.animateProperty`, `vf.textEffect` and `vf.colorCycle`.

## Blocks ↔ code

Switching a blocks tool to the Code tab converts the graph into readable, commented JavaScript that uses the `vf` helper — chains become sequential calls, Repeat becomes a `for` loop, For-each-clip becomes a filtered `vf.clips` loop, functions become `const name = (index, count, clipId) => …`, and clip/frame connections become arguments. The tool now runs that code (the blocks are kept, so you can switch back). The conversion is faithful: the generated code produces the same operations the blocks would, resolved at run time against the live playhead and selection. Invalid graphs stay in Blocks with an error instead of converting.

## Code tools

A code tool is the body of a JavaScript function. It receives one argument, `vf`, and returns one operation or an array of them. The Code tab is a real editor: line numbers, tab-key support, and a reference panel listing every `vf` helper — click an example to insert it at the cursor. The `$templates` the blocks use (like `$playhead`) are listed with their code equivalents (`vf.playhead`). When a run fails, the error shows inline above the code with the offending line highlighted in the gutter, as well as in the error console.

```js
// vf has the playhead, selection and every clip
const ops = [];
for (const id of vf.selection) {
  ops.push(vf.animate(id, { rotation: "wiggle(2, 4)" }));
}
ops.push(vf.markers(120, 8));
return ops;
```

| Helper | Returns |
|---|---|
| vf.addText({ text, start?, duration?, ... }) | add_text_clip |
| vf.addShape({ shape, ... }) | add_shape_clip |
| vf.update(id, patch) | update_clip with any clip fields |
| vf.motion(id, preset, opts?) | apply_motion |
| vf.stagger(ids, opts?) | stagger_clips |
| vf.keyframes(id, property, keys) | set_keyframes |
| vf.animate(id, expressions) | animate_code |
| vf.remove(id) / vf.duplicate(id) | remove_clip / duplicate_clip |
| vf.markers(bpm, count) | add_beat_markers |

## Safety and limits

Code tools run as ordinary JavaScript in your own browser page — there is no sandbox, so only run tools you wrote or trust. The server still validates every operation a tool produces and rejects anything invalid, atomically. Both block and code tools may produce at most 100 operations, matching the batch limit. Because tools are just operations, they respect scopes, undo, dry runs and everything else in the operation catalog.

## Where tools live

Your library syncs to your account (or API key), so it follows you between browsers — `GET/PUT/DELETE /api/tools/:id` — with the browser's local copy as the offline fallback. Share one with the 🔗 Share button: a compact `VFT1:` code anyone can import. The Code tab's **Export as standalone script** downloads a single `.mjs` that runs the same code against the API — set `VF_API_KEY` and pass a project id (`--dry-run` previews the change summary) — handy for agents and cron jobs. The studio speaks Spanish too: the 🌐 button switches every block label and description (remembered per browser).

- [Using the editor](editor)
- [Batch operations](batch-operations)
- [Fonts & text](fonts-and-text)
