# Motion graphics

VideoForge's motion-graphics primitives are the pieces an AI agent needs to
build real graphics: **rectangles, ellipses, lines and progress bars**, plus
the existing styled text. They live on the overlay track, they are validated
like any other clip, and they render identically in the browser preview and
in the FFmpeg export.

## Why shapes (and not just text)

Text alone can't build a lower third, a progress bar, or a title card. Agents
asked to "add a lower third under the speaker" need a rectangle behind the
text, a way to position it, and a way to animate it in. That is what
`add_shape` and `apply_graphic_preset` give you.

## The four primitives

| Kind | What it draws | Typical use |
| --- | --- | --- |
| `rect` | Solid rectangle, optional rounded corners via `radius` | Lower thirds, backdrops, badges |
| `ellipse` | Ellipse | Avatars, dots, emphasis |
| `line` | Thin horizontal rule | Dividers, underlines |
| `bar` | Track + fill rectangle | Progress bars, volume bars, loading states |

## Add a shape

```json
{ "op": "add_shape", "args": {
  "id": "card-1",
  "kind": "rect",
  "color": "#3d50f5",
  "width": 0.4, "height": 0.1,
  "radius": 0.4,
  "start": 0, "duration": 4,
  "track": "overlay"
} }
```

Notes:

- `width` and `height` are **fractions of the frame** (0.01 to 1), not pixels.
- `x` and `y` are fractions too (0 to 1), centred on the shape's centre.
- `color` and `stroke` are `#rrggbb`. Invalid values fall back to the default,
  they don't throw — the shape always renders.
- Pass your own `id` so you can reference the layer later.

## Presets

Presets compose primitives into common graphics. Each is one op:

```json
{
  "op": "apply_graphic_preset",
  "args": {
    "preset": "lower-third",
    "id": "lt1",
    "start": 0,
    "duration": 4
  }
}
```

| Preset | What it gives you |
| --- | --- |
| `lower-third` | Accent bar at bottom-left, room for a title on top |
| `title-card` | Dark centred panel behind a title |
| `badge` | Small pill for top-right |
| `progress-bar` | Horizontal bar; animate `progress` 0 → 1 |
| `line` | Thin horizontal rule |

Presets accept `overrides` to change colour or size without rebuilding the
graphic from scratch.

## Animate a shape

Shapes reuse the existing keyframe system. The animatable properties are the
same ones text and media use, plus three shape-specific ones:

| Property | Range | What it drives |
| --- | --- | --- |
| `width` | 0.01 – 1 | Shape width (fraction of frame) |
| `height` | 0.01 – 1 | Shape height (fraction of frame) |
| `progress` | 0 – 1 | `bar` fill fraction |

Plus the shared properties: `x`, `y`, `scale`, `rotation`, `opacity`.

To animate a progress bar from 0 to 1 over four seconds:

```json
{ "op": "set_keyframes", "args": {
  "clipId": "pb-1",
  "property": "progress",
  "keyframes": [
    { "time": 0, "value": 0, "easing": "ease" },
    { "time": 4, "value": 1, "easing": "ease" }
  ]
} }
```

The easing options are the same as everywhere else: `linear`, `ease`,
`ease-in`, `ease-out`, `ease-in-out`, `back-out`, `hold`, or a custom
cubic-bezier array.

## Combine with text

A real lower third is a shape + a text clip:

```json
{
  "ops": [
    {
      "op": "apply_graphic_preset",
      "args": {
        "preset": "lower-third",
        "id": "lt-1",
        "start": 0,
        "duration": 4
      }
    },
    {
      "op": "add_text_clip",
      "args": {
        "text": "Jane Doe",
        "start": 0.2,
        "duration": 3.6,
        "x": 0.30,
        "y": 0.83
      }
    }
  ]
}
```

Both ops in one request become **one undo step** — the user can revert the
lower third with a single ⌘Z.

## Preview and export

The browser preview and the FFmpeg export share the shape geometry
(`shared/graphics.ts`). The renderer rasterises each shape to a transparent
PNG at the project's resolution, then overlays it with animated x/y.
Animated width, height and progress are baked into the PNG at render time —
the two surfaces draw the same shape, but they are separate implementations,
so small rasterisation differences are possible.

## Limits (v1)

Deliberate, and labelled as such — not silent omissions:

- Colours are **static**. Animated colour, gradients and masks are planned,
  not implemented.
- No **parenting** or **nested compositions** yet.
- `stroke` is a solid colour, no dash patterns.
- Shapes don't clip their own children — layer them manually.
