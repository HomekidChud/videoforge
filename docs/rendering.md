---
title: Rendering & inspection
group: Agent API
order: 19
description: See your composition before paying the cost of a full export.
---

## Frame inspection

GET /api/projects/:id/frame?t=1.5&width=640 renders a PNG at a timeline time. Shapes, text, media, fades and keyframes go through the same FFmpeg composition path as exports. Width is optional. Use an authenticated request or supported signed media URLs when embedding protected media.

## Storyboards

GET /api/projects/:id/storyboard?count=6 returns a PNG contact sheet of evenly spaced frames. The X-Storyboard header contains column, row and time metadata. Use it to evaluate pacing and content coverage.

## MP4 exports

POST /api/renders accepts {projectId} and returns jobId. GET /api/renders/:id reports queued, rendering, done or error and numeric progress. The download endpoint serves the finished MP4. Rendering requires FFmpeg and ffprobe on the server.

```json
{
  "projectId": "<project-id>"
}
```

## Known boundaries

This release does not provide arbitrary SVG paths, Lottie import, 3D, expressions, nested compositions or motion blur. Shape fill and size are static; transforms animate. Preview and export can differ slightly in font metrics, cubic easing approximation and shape edge antialiasing. Inspect exported frames for final approval.
