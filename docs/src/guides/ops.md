# Editing operations

Every timeline edit is an operation ("op") sent to
`POST /api/v1/projects/:id/timeline`. Each request is atomic: either every
op applies, or none do. A batch is recorded as a single undo step.

## Core ops

| Op | What it does |
| --- | --- |
| `add_clip` | Place an asset on the timeline |
| `add_text_clip` | Place a styled text clip |
| `add_shape` | Place a motion-graphics shape |
| `apply_graphic_preset` | Apply a named preset (lower-third, title-card, …) |
| `remove_clip` / `remove_clips` | Delete one or many clips |
| `trim_clip` | Change in/out points |
| `move_clip` | Move a clip in time and across tracks |
| `split_clip` | Cut a clip at a time |
| `update_clip` / `update_clips` | Patch properties |
| `set_keyframes` / `upsert_keyframe` / `remove_keyframe` | Keyframe a property |
| `set_transition` | Dissolve, wipe-left, wipe-right |
| `apply_motion` | Apply a motion preset (slide-in, fade, etc.) |
| `ripple_delete` | Remove a clip and close the gap |
| `shift_clips` / `close_gaps` | Rearrange |
| `copy_style` / `duplicate_clip` / `reorder` | Copy, clone, reorder |
| `set_marker` / `add_marker` / `remove_marker` | Timeline markers |

See the [API reference](/docs/api/editing/) for argument schemas.

## Batching

Multiple ops in one request are applied in order and undone together:

```json
{ "ops": [
  { "op": "apply_graphic_preset", "args": { "preset": "lower-third", "id": "lt-1", "start": 0, "duration": 4 } },
  { "op": "add_text_clip", "args": { "text": "Jane Doe", "start": 0.2, "duration": 3.6 } }
] }
```

If op 2 fails, op 1 is rolled back.
