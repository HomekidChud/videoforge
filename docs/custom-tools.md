---
title: Custom tools
group: Studio
order: 15
description: Write your own one-click automations in JavaScript or snap them together from building blocks.
---

## Your own tools

Custom tools are small automations you write once and run with a click: "three beat titles at the playhead", "bold every title", "orbit the selection". A tool returns a list of timeline operations, and running it applies them as one atomic, undoable step — the same operations the API uses, with the same validation. Open the Tools tab of the Studio library.

## Two ways to write one

Every tool has a name, a description, and a program written in one of two modes.

- **Blocks** snap together like building blocks, no code required: operation steps, repeat groups, for-each loops over clips, and notes.
- **Code** is a short JavaScript function that receives a `vf` helper and returns operations.

Duplicate a built-in example to get started; your tools are stored in your browser and run only against the timeline you have open.

## Building blocks

A block tool is a list of steps. Operation steps run one timeline operation, repeat groups run their steps N times, and for-each groups run their steps for every clip that matches a filter (all, text, shape, media, or the current selection). Inside those groups, `$clipId` refers to the current clip.

| Block | What it does |
|---|---|
| Operation | runs one timeline operation such as add_text_clip or apply_motion |
| Repeat | runs its steps N times with $index and $count |
| For each clip | runs its steps for every matching clip with $clipId |
| Note | a comment for future you; does nothing |

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

## Code tools

A code tool is the body of a JavaScript function. It receives one argument, `vf`, and returns one operation or an array of them.

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
