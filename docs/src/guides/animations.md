# Keyframes and easing

Any clip — media, text or shape — can be animated by keyframing its numeric
properties. The same system drives the browser preview and the FFmpeg export.

## Animatable properties

| Property | Range | Default |
| --- | --- | --- |
| `x` | 0 – 1 | 0.5 |
| `y` | 0 – 1 | 0.5 |
| `scale` | 0.1 – 2 | 1 (0.35 for overlay media) |
| `rotation` | -360 – 360 | 0 |
| `opacity` | 0 – 1 | 1 |
| `volume` | 0 – 1 | 1 |
| `brightness` | -0.5 – 0.5 | 0 |
| `contrast` | 0.5 – 2 | 1 |
| `saturation` | 0 – 2 | 1 |
| `width` | 0.01 – 1 | 0.3 (shapes) |
| `height` | 0.01 – 1 | 0.08 (shapes) |
| `progress` | 0 – 1 | 0 (bar shapes) |

## Easing

| Easing | Curve |
| --- | --- |
| `linear` | constant speed |
| `ease` | cubic-bezier(.25,.1,.25,1) |
| `ease-in` / `ease-out` / `ease-in-out` | standard |
| `back-out` | slight overshoot, good for entrances |
| `hold` | step function, holds value until the next key |
| custom | `[x1, y1, x2, y2]` cubic-bezier |

## Add keyframes

```json
{ "op": "set_keyframes", "args": {
  "clipId": "pb-1",
  "property": "progress",
  "keyframes": [
    { "time": 0, "value": 0 },
    { "time": 4, "value": 1, "easing": "ease" }
  ]
} }
```

- Times are **relative to the clip's start**, in seconds.
- Duplicate times are rejected.
- At most 64 keyframes per property.
