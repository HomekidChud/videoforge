---
title: Rendering & inspection
group: Agent API
order: 21
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

## Export speed

Exports are built to be quick for motion graphics and animation, not just for footage.

- **Text is drawn once.** A label is rasterised a single time, on a canvas sized to its glyphs, then the animation (fades, moves, scale, rotation) runs on that small layer. It is no longer redrawn at the full frame size on every frame.
- **Reveals and wipes are rectangles.** A reveal or a straight wipe transition erases one rectangle per frame, worked out ahead of time, instead of evaluating an expression for every pixel.
- **Plain footage skips transparency.** A full-frame clip with no fade, transform or transition is composited as opaque video.
- **Draft quality** uses the fastest encoder preset for quick checks. Use Standard or High for the final file.

On a 2 core machine at 1920 by 1080, the preset sampler (26 animated shapes and labels) went from 9.2 to 2.3 seconds, the loop recipes from 9.2 to 2.1, and a 15 second intro of five motion templates from 17.0 to 6.6. Output frames match the earlier renderer, apart from glyph edges moving by a pixel at most.

To time your own machine without starting a server, run the benchmark. It renders four representative projects through the real FFmpeg pipeline and prints the speed of each.

```shell
npx tsx script/bench-render.ts
```

## Known boundaries

This release does not provide arbitrary SVG paths, Lottie import, 3D, expressions, nested compositions or motion blur. Shape fill and size are static; transforms animate. Preview and export can differ slightly in font metrics, cubic easing approximation and shape edge antialiasing. Inspect exported frames for final approval.
