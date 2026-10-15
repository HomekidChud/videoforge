---
title: Motion presets & sequencing
group: Motion graphics
order: 8
description: One-line entrances, emphasis beats and exits, with timing you control.
---

## Presets are keyframes, not magic

Every preset compiles to ordinary keyframes on the clip, so you can open the Motion tab afterwards and edit each one. Presets replace only the properties they animate. Use them from Studio (Effects tab or the Motion inspector) or from the API with apply_motion.

| Preset | Group | What it does |
|---|---|---|
| {{auto:presets}} |

## Timing and strength

apply_motion accepts three optional controls. duration is how long the move takes, delay is how far into the clip it starts, and strength (0.1 to 2) scales distance and overshoot. Entrances play from the delay; every exit preset finishes exactly at the end of the clip. Studio exposes the same three controls in the Motion presets panel.

```json
{
  "op": "apply_motion",
  "args": {
    "clipId": "badge",
    "preset": "spring",
    "delay": 0.4,
    "duration": 1.2,
    "strength": 1.5
  }
}
```

## Sequence many layers

apply_motion_sequence applies one preset to several clips and offsets each start by stagger seconds (default 0.12). Pass the clips in reading order. It is one atomic step, so a failure leaves the timeline unchanged.

```json
{
  "op": "apply_motion_sequence",
  "args": {
    "clipIds": [
      "k-0",
      "k-1",
      "k-2"
    ],
    "preset": "whip",
    "stagger": 0.2,
    "start": 0.2,
    "duration": 0.6
  }
}
```

## Reverse and retime

reverse_animation plays every curve of a clip backwards and mirrors each easing, which turns an entrance into a matching exit. retime_animation squeezes or stretches all of a clip's keyframes into a window you give it, keeping relative timing between properties.

```json
[
  {
    "op": "reverse_animation",
    "args": {
      "clipId": "badge"
    }
  },
  {
    "op": "retime_animation",
    "args": {
      "clipId": "badge",
      "duration": 0.8,
      "delay": 3
    }
  }
]
```

## Sync to a beat

add_beat_markers drops markers on every beat of a tempo (20 to 300 BPM) so they show on the Studio timeline. snap_to_beats moves clips onto the nearest beat. Combine them with apply_motion_sequence and a stagger of 60 / BPM seconds to land motion on the beat.

```json
[
  {
    "op": "add_beat_markers",
    "args": {
      "bpm": 120,
      "count": 8
    }
  },
  {
    "op": "snap_to_beats",
    "args": {
      "clipIds": [
        "b0",
        "b1"
      ],
      "bpm": 120
    }
  }
]
```

## Rendering notes

Spring, shake, bounce-in, rubber, tada, wobble, swing and heartbeat are sampled into 25 linear keyframes so the browser and FFmpeg draw the same curve. These presets therefore use more of the 64 keyframes a property allows, and preset window times round to milliseconds.

- [Keyframes & easing](keyframes)
- [Examples gallery](examples)
