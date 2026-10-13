# Motion graphics API

Everything the editor does with shapes goes through the same
`/api/v1/projects/:id/timeline` endpoint as every other edit. Operations are
strictly validated — bad input throws and changes nothing.

## `add_shape`

Create a shape clip.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Optional. If you supply one it must be unique. |
| `kind` | `rect` \| `ellipse` \| `line` \| `bar` | Required. |
| `color` | `#rrggbb` | Fill. Invalid falls back to `#3d50f5`. |
| `stroke` | `#rrggbb` | Optional outline. |
| `strokeWidth` | 0–4 | % of frame height. |
| `radius` | 0–10 | % of frame height, `rect` only. |
| `width` | 0.01–1 | Fraction of frame width. |
| `height` | 0.01–1 | Fraction of frame height. |
| `progress` | 0–1 | `bar` only. Fill fraction. |
| `trackColor` | `#rrggbb` | `bar` track colour. |
| `start`, `duration` | seconds | Clip placement. |
| `track` | `overlay` \| `video` | Shapes default to `overlay`. |

```json
POST /api/v1/projects/:id/timeline
{
  "ops": [
    { "op": "add_shape",
      "args": { "id": "bg-1", "kind": "rect", "color": "#0a0a0a", "width": 0.9, "height": 0.2, "start": 0, "duration": 4 } }
  ]
}
```

Errors:

- `400` `graphic.kind must be one of: rect, ellipse, line, bar`
- `400` `clip id <id> already exists`

## `update_shape`

Change a shape's graphic in place.

```json
{ "op": "update_shape", "args": { "clipId": "bg-1", "color": "#ff0000", "width": 0.8 } }
```

Unspecified fields keep their current value. `clipId` must reference a clip
that has a `graphic` — updating a text clip throws.

## `apply_graphic_preset`

Apply a named preset in one op.

```json
{ "op": "apply_graphic_preset", "args": { "preset": "lower-third", "id": "lt-1", "start": 0, "duration": 4 } }
```

| Preset | Result |
| --- | --- |
| `lower-third` | Bottom-left accent bar |
| `title-card` | Centred dark backdrop |
| `badge` | Top-right pill |
| `progress-bar` | Bottom progress bar |
| `line` | Thin rule |

`overrides` (object) merges into the preset's graphic — change colour, size or
progress without rebuilding it.

## Keyframable shape properties

These are set with the regular `set_keyframes` / `upsert_keyframe` / `remove_keyframe`
ops — the same ones used for text and media clips.

| Property | Min | Max | Notes |
| --- | --- | --- | --- |
| `width` | 0.01 | 1 | Fraction of frame width |
| `height` | 0.01 | 1 | Fraction of frame height |
| `progress` | 0 | 1 | `bar` fill |
| `x` | 0 | 1 | Fraction of frame width, centred |
| `y` | 0 | 1 | Fraction of frame height, centred |
| `scale` | 0.1 | 2 | Multiplies width/height |
| `rotation` | -360 | 360 | Degrees |
| `opacity` | 0 | 1 | Alpha |

## Errors

All shape ops fail closed — an invalid op throws and the timeline is unchanged:

| Status | Body |
| --- | --- |
| 400 | `{ "error": "..." }` with a human-readable reason |
| 404 | Project or clip not found |

See [editing operations](/docs/api/editing/) for the shared contract.
