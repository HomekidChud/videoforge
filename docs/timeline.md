---
title: Timeline & layers
group: Core concepts
order: 4
description: Understand seconds, normalized coordinates and composition order.
---

## The timeline model

A project has fps, resolution, background, tracks, markers and clips. All timeline coordinates are seconds. Media clips reference an assetId; text and shape clips have an empty assetId. Shapes and text are separate clips.

```json
{
  "version": 4,
  "fps": 30,
  "resolution": {
    "width": 1280,
    "height": 720
  },
  "background": "#17191b",
  "clips": []
}
```

## Timing and coordinates

start is a timeline offset. inPoint and outPoint define the source window. Media duration is (outPoint - inPoint) / speed; asset-free clip duration is outPoint - inPoint. x and y are normalized center coordinates from 0 to 1. Keyframe times are relative to the clip start.

## Layer order

Footage on video is below media on overlay. Shapes are composited next; text and captions are composited last. Within each family, later entries draw over earlier entries in the renderer. There is no general z-index or nested scene graph in this version. Track hidden and muted settings affect preview and rendering.

## Limits

A timeline accepts up to 200 clips. Each animated property supports up to 64 keyframes. A batch accepts at most 100 operations. Canvas dimensions normalize to even values between 160 and 3840; fps is 1 to 60. Validate before rendering if your agent is generating complex JSON.

- [Batch operations](batch-operations)
- [Animation keyframes](keyframes)
