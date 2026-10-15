---
title: Motion graphics
group: Motion graphics
order: 5
description: Build asset-free animation with primitives and editable templates.
---

## A toolkit, not a black box

Motion graphics are ordinary timeline clips. Create a shape, add text, and animate position, scale, rotation or opacity with keyframes. Templates are convenience operations that expand into these primitives, so the API and the editor can refine the same result.

## Add a motion template

Send add_motion_template to the timeline operations endpoint. Options are template, title, subtitle, color, start, duration and an optional idPrefix. Duration must be 0.5 to 60 seconds. The returned createdClipIds identify every generated layer. With the prefix lt the layers are lt-0, lt-1 and so on, so later ops in the same batch can target them without waiting for a response.

```json
{
  "op": "add_motion_template",
  "args": {
    "template": "lower-third",
    "title": "Ada Lovelace",
    "subtitle": "Pioneer of computing",
    "color": "#f6a447",
    "start": 0,
    "duration": 4
  }
}
```

## Template catalog

All templates support the same composition workflow. Kinetic type accepts up to eight words. Text size is estimated to fit the composition's aspect ratio; inspect long text before final export. The playground uses the same template compiler and keyframe evaluator as Studio.

| Template | What it makes |
|---|---|
| {{auto:templates}} |

## Refine the composition

Adjust generated clips with update_clip. Replace curves with set_keyframes or add an existing motion preset with apply_motion. Use stagger_clips to offset several clips in a deliberate order, or apply_motion_sequence to apply one preset across several clips with a stagger. Templates do not add an AI model or invoke arbitrary code.

- [Motion presets](motion-presets)
- [Examples gallery](examples)
- [Shape primitives](shapes)
- [Keyframes & easing](keyframes)
- [Agent workflow](agent-workflow)
