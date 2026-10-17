---
title: Keyframes & easing
group: Motion graphics
order: 8
description: Precise animation that previews in the browser and renders through FFmpeg.
---

## Clip-local keyframes

Each property has an array of {time,value,easing}. Time is measured from the clip start, not from zero on the timeline. Easing belongs to the outgoing segment. Before the first and after the last keyframe, the endpoint value holds.

```json
{
  "op": "set_keyframes",
  "args": {
    "clipId": "badge",
    "property": "scale",
    "keyframes": [
      {
        "time": 0,
        "value": 0.5,
        "easing": "back-out"
      },
      {
        "time": 0.7,
        "value": 1
      },
      {
        "time": 4,
        "value": 1
      }
    ]
  }
}
```

## Animatable properties

The following bounds apply to both Studio and the agent API. Browser curves are evaluated directly; the FFmpeg renderer approximates cubic-bezier segments with 24 samples.

| Property | Range |
|---|---|
| {{auto:animatable}} |

## Easing options

Use linear, ease, ease-in, ease-out, ease-in-out, back-out, snappy (fast start, long settle), anticipate (dips backwards before launching), hold or step-start. A custom cubic bezier is [x1,y1,x2,y2], with x in 0..1 and y in -2..3. hold keeps the start value until the next keyframe; step-start jumps to the next value the moment the segment begins. Output values remain clamped to each property's bounds.

## Reveal: a wipe mask

reveal (0..1) is a left-to-right alpha mask on media and shape clips. At 0 nothing is drawn, at 1 the whole layer is. It is applied before scale and rotation, so it follows the layer. Text clips reject it; use opacity or position there. Combine it with the snappy easing for a crisp wipe, or animate it on a thin shape for progress bars.

```json
{
  "op": "set_keyframes",
  "args": {
    "clipId": "bar",
    "property": "reveal",
    "keyframes": [
      {
        "time": 0,
        "value": 0,
        "easing": "snappy"
      },
      {
        "time": 1.2,
        "value": 1
      }
    ]
  }
}
```

## Stagger several layers

Pass unique clipIds in your desired order. stagger_clips sets the first start, then offsets every following clip by delay seconds. This operation retimes clips without changing their clip-local animation curves.

```json
{
  "op": "stagger_clips",
  "args": {
    "clipIds": [
      "word-a",
      "word-b",
      "word-c"
    ],
    "start": 0,
    "delay": 0.15
  }
}
```
