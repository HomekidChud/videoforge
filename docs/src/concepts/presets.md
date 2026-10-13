# Presets

Presets compose primitives into named graphics so agents don't have to
hand-build common layouts.

## Graphic presets

Applied with `apply_graphic_preset`:

| Preset | Result |
| --- | --- |
| `lower-third` | Bottom-left accent bar |
| `title-card` | Centred dark backdrop |
| `badge` | Top-right pill |
| `progress-bar` | Bottom progress bar |
| `line` | Thin horizontal rule |

## Motion presets

Applied with `apply_motion` to any clip:

`fade-in`, `fade-out`, `slide-up`, `slide-down`, `slide-left`, `slide-right`,
`zoom-in`, `zoom-out`, `rotate-in`.

```json
{ "op": "apply_motion", "args": { "clipId": "t1", "preset": "slide-up" } }
```

## Text presets

Title presets are available in the editor's text panel and map to the same
underlying properties the API exposes.
