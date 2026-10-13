# Clips and layers

A clip is one thing on the timeline. It has a start, a duration, a track, and
optional properties.

## Clip kinds

| What it holds | How to spot it |
| --- | --- |
| An asset | `assetId` is set |
| Text | `text` is set, no `assetId` |
| A motion-graphics shape | `graphic` is set, no `assetId` |

All three are validated by the same `normalizeClip` — dimensions, positions,
opacity and keyframes all obey the same bounds. There is no special case in
the renderer for "the AI's shape" versus "the user's text".

## Layer ordering

Within a track, clips are drawn in `start` order. Earlier clip wins where they
overlap. The video track renders below overlay; audio is independent.

## Limits

- Max 200 clips per timeline.
- Max 64 keyframes per property.
- Text is capped at 500 characters.
