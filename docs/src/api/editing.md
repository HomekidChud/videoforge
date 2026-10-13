# Editing API

`POST /api/v1/projects/:id/timeline`

Body: `{ "ops": [{ "op": string, "args": object }, ...] }`

## Contract

- **Atomic** — every op in a request applies together, or none do.
- **Strict** — invalid input throws. There is no "best effort" mode.
- **Revertible** — a batch is one undo step in the Studio.
- **Broadcast** — every peer watching the project receives the change.

## Ops

| Op | Key args |
| --- | --- |
| `add_clip` | `assetId`, `start`, `duration`, `track` |
| `add_text_clip` | `text`, `start`, `duration`, `x`, `y`, `textSize`, `textColor` |
| `add_shape` | `kind`, `color`, `width`, `height`, `start`, `duration` — [motion graphics](/docs/api/motion-graphics/) |
| `apply_graphic_preset` | `preset`, `id`, `start`, `duration` |
| `update_shape` | `clipId`, any graphic field |
| `remove_clip` | `clipId` |
| `remove_clips` | `clipIds[]` |
| `trim_clip` | `clipId`, `inPoint`, `outPoint` |
| `move_clip` | `clipId`, `start`, `track` |
| `split_clip` | `clipId`, `at` |
| `update_clip` | `clipId`, patch object |
| `set_keyframes` | `clipId`, `property`, `keyframes[]` |
| `upsert_keyframe` | `clipId`, `property`, `keyframe` |
| `remove_keyframe` | `clipId`, `property`, `time` |
| `set_transition` | `clipId`, `type`, `duration` |
| `apply_motion` | `clipId`, `preset` |
| `ripple_delete` | `clipId` |
| `shift_clips` | `fromTime`, `delta` |
| `close_gaps` | `track` |
| `copy_style` | `fromClipId`, `toClipId` |
| `duplicate_clip` | `clipId` |
| `reorder` | `clipId`, `position` |
| `set_marker` / `add_marker` / `remove_marker` | `id`, `time`, `label`, `color` |
| `set_track` | `track`, `hidden`, `muted` |
| `set_project` | patch object |

See the [editing guide](/docs/guides/ops/) for worked examples.
