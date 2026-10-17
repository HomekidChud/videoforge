---
title: Transitions
group: Motion graphics
order: 13
description: Dissolves, wipes, an iris, barn doors and a diamond between video clips.
---

## Add a transition

set_transition overlaps a video or image clip with the clip before it. With join:true (the default) the clip first moves to touch its predecessor, then later video clips move up by the overlap. Duration is 0.1 to 3 seconds and never more than half of either clip. Use type none to remove one.

```json
{
  "op": "set_transition",
  "args": {
    "clipId": "clip-b",
    "type": "iris",
    "duration": 1
  }
}
```

## Available types

Every type previews in Studio and renders in FFmpeg. Wipes reveal the incoming clip from the named edge; the iris opens a circle from the centre; barn doors open from the middle; the diamond grows from the centre; the diagonal wipe sweeps from the top-left corner.

| Type | Effect |
|---|---|
| {{auto:transitions}} |

## Audio

Overlapping clips cross-fade their audio over the same duration, so the sound follows the picture.

- [Using the editor](editor)
