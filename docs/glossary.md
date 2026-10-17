---
title: Glossary
group: Resources
order: 27
description: The words this documentation uses, each with a one-line meaning.
---

## How to use it

Hover a dotted-underlined word anywhere in the docs to see its meaning; this page collects them all.

## Timeline

The words of the edit itself.

| Term | Meaning |
|---|---|
| timeline | The whole edit: clips, their order and their animated properties. Studio, the API and the renderer all read the same one. |
| clip | One building block of the timeline: media, text or a shape, with its own timing, transform and effects. |
| track | A layer of the timeline: video, overlay or audio. Clips sit on tracks and stack by z-order. |
| z-order | The stacking rank of a clip, from -100 to 100. Overlays draw in one order in preview and export alike. |
| keyframe | A value for a property at one moment in time. The engine eases from one keyframe to the next. |
| easing | The curve a property follows between two keyframes: linear, springy, bouncy and more. |
| expression | A formula of time that drives a property live in the preview and compiles to FFmpeg. |
| preset | A ready-made entrance, exit, attention or camera move applied to a clip. |
| template | A composed motion-graphics block such as a lower third or title card, added with one operation. |
| scope | What a key may do: read, write or admin. API keys are scoped; accounts have roles. |
| rig | A poseable group of clips in the Animator: each part has a joint, an optional parent and its own keys. |
| dope sheet | The Animator's key list: one row per part, one column per moment in time. |
| block | A drag-and-drop node in the block studio that builds timeline operations without code. |
| render | The FFmpeg pass that turns a timeline into an MP4 server-side. |
| storyboard | A PNG contact sheet of evenly spaced frames, one request for the whole edit. |

- [Keyframes](keyframes)
- [Shapes](shapes)
- [Batch operations](batch-operations)
- [Animator](animator)
