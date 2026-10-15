---
title: Custom tools
group: Studio
order: 15

description: Write your own one-click automations in JavaScript or snap them together in a full-screen block studio.
---

## Your own tools

Custom tools are small automations you write once and run with a click: "three beat titles at the playhead", "bold every title", "orbit the selection". A tool returns a list of timeline operations, and running it applies them as one atomic, undoable step — the same operations the API uses, with the same validation. Open the Tools tab of the Studio library.

## Two ways to write one

Every tool has a name, a description, and a program written in one of two modes, both edited in the full-screen block studio.

- **Blocks** is a canvas like Scratch: drag friendly blocks, connect them with lines, and run them — no code required.
- **Code** is a short JavaScript function that receives a `vf` helper and returns operations. The studio's Code tab is a plain editor for coders.

Duplicate a built-in example to get started; your tools are stored in your browser and run only against the timeline you have open.

## The block studio

Open any tool (or create one) and the studio takes over the screen. Blocks live in the palette on the left — drag them onto the canvas. Connect a block's bottom dot to the next block's top dot to say "then do this": the line snaps in place and that becomes the run order. A tool starts at the **Start** block and follows the lines.

| Block family | What it does |
|---|---|
| Create | add a title, shape or sticker |
| Entrances | every entrance move: fade, slide, rise, drop, pop, spring, swing, spin, wipe reveal and more |
| Exits | slide out, fade out, shrink, spin out, pop out |
| Attention | pulse, shake, wobble, tada, heartbeat, blink, flash, glitch |
| Springy | spring, whip, rubber, bounce — the bouncy ones |
| Camera | slow zoom and drift, like a moving camera |
| Animate | animate any property from one value to another with an easing, plus ready-made moves and expression-driven floats and glows |
| Text | typewriter, word-by-word and line-by-line reveal, colour cycling |
| Style | bold or colour the text of a clip |
| Clips | delete or duplicate clips, stagger a selection, beat markers |
| Timing | stagger to beats, speed changes, reverse and stretch motion, Repeat and For each clip |
| Flow | Function defines a named group; Call runs it by name |

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

- [Using the editor](editor)
- [Batch operations](batch-operations)
- [Fonts & text](fonts-and-text)
