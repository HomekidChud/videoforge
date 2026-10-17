---
title: Fire edit tutorial
group: Get started
order: 6
description: Turn one clip into a finished edit: trim to the beat, warm it up, add motion graphics, cut with transitions and export.
---

## What you will make

A fifteen second edit from a single clip: two trimmed cuts joined with a dissolve, a warm colour look over everything, a headline that springs in, a floating badge and a lower third that arrives late. You upload a clip (a screen recording works just as well as camera footage), cut it in the editor, dress it with motion graphics and export an MP4.

It takes about twenty minutes. Every layer is a normal clip, so you can retime and restyle anything afterwards.

> [!TIP] Follow along in a second tab. Open the Studio at `#/editor` and keep this page next to it. Any clip will do: a screen recording, phone footage or something from a stock library.

## Get the clip in

Open the **Media** tab in the left library and drag your clip onto the timeline, or click upload and pick the file. The clip is probed once: its length, size and thumbnail appear straight away, and it plays back with range requests so scrubbing stays smooth.

Give the project a name: click the project name at the top left and type `Fire edit`.

## Trim to the beat

Watch the clip once and find its two best moments. Trim each end of the clip by dragging its edges in the timeline, or select the clip and set **In** and **Out** in the inspector under Timing.

For this tutorial, keep the first cut to about eight seconds: set the clip's **Out** to `8`.

## Make the second cut

Right-click the clip and choose **Duplicate**, or select it and press the duplicate button in the inspector. Drag the copy so it starts where the first cut ends, then trim it to about seven seconds and, if the moment you want is later in the source, set its **In** to a different point so the second cut shows new footage.

Two cuts of the same source back to back is the fastest way to build rhythm from one clip. With a 0.5 second dissolve joining them, the second cut needs about seven and a half seconds so the video still ends where the overlays do.

## Warm the whole edit up

Select both clips — shift-click the second one — and open the **Edit** tab in the inspector. Under colour, set the **look** to **Warm**. Fire edits live in warm tones: everything shifts toward amber, and the highlights roll off gently.

If your footage is dark, raise **Brightness** a little. If it is flat, raise **Contrast** and **Colour strength**.

## Add the headline

Click **Add title** in the top bar. In the Text box, type `Fire edit`. Set Size to about 10%, pick a bold weight, and set Vertical to 20% so it sits near the top. Under Timing, set Start to `0` and Duration to `15` so it runs the whole edit.

Open the **Motion** tab, expand Motion presets and click **Spring** with a Duration of 0.9. The headline pops in with a damped bounce and stays put.

## Add a badge that floats

Open the **Graphics** tab and click **ellipse**. Set Shape width to 7% and height to 12% so it reads as a circle on 16:9, fill it orange `#f6a447`, and set Vertical to 68%, low on the frame.

In the Motion tab, expand **Animate with code** and under Looping recipe choose **Float**, then click **Apply recipe**. The badge bobs gently for the whole edit — a formula, not keyframes, so it loops at any length.

## Add the lower third

In the **Graphics** tab, find the lower third template card. Set the title to your name, the subtitle to `Cut · graded · exported`, and the accent colour to the same orange. Set Start to `2` and Duration to `4`.

Hover the card to preview its animation, then click **Add to timeline**. It lands at the playhead, already selected — drag it or set its start until it sits where you want.

## Join the cuts with a dissolve

Open the **Effects** tab and look under **Transitions**. Drag **Dissolve** onto the second clip — the one that follows the first — or select the second clip and choose Dissolve in the inspector. Set its duration to about `0.5`.

The transition overlaps the two cuts and moves later video up, so the edit stays tight. It plays in the preview and survives the FFmpeg export.

> [!TIP] Try the other transitions on the same cut: iris for a punch-in feel, wipe-left for a harder rhythm. One transition per cut is plenty.

## Check it, then export

Press Space and watch the whole edit once: headline springs in, badge floats, lower third arrives at two seconds, the two cuts dissolve into each other. Use the arrow keys to step frame by frame over anything you are unsure about.

When you are happy, click **Export** in the top bar, choose MP4, and start the render. The render runs server side with FFmpeg; the progress page shows the percentage, and the finished MP4 downloads from the same place.

## Build the same thing with the API

Everything you did in the editor is operations. This batch assumes the clip is uploaded and its asset id is `clip-1` — replace it with the id from `GET /api/media`. Send the ops to `POST /api/projects/:id/timeline/ops` with a write key, then enqueue a render with `POST /api/renders`.

```json
{
  "ops": [
    {"op": "add_clip", "args": {"assetId": "clip-1", "id": "cut-1", "start": 0, "outPoint": 8, "track": "video"}},
    {"op": "add_clip", "args": {"assetId": "clip-1", "id": "cut-2", "start": 8, "inPoint": 8, "outPoint": 15.5, "track": "video"}},
    {"op": "update_clips", "args": {"clipIds": ["cut-1", "cut-2"], "patch": {"filter": "warm"}}},
    {"op": "set_transition", "args": {"clipId": "cut-2", "type": "dissolve", "duration": 0.5}},
    {"op": "add_text_clip", "args": {"id": "headline", "text": "Fire edit", "start": 0, "duration": 15, "x": 0.5, "y": 0.2, "textSize": 10, "fontWeight": 700, "textColor": "#ffffff"}},
    {"op": "apply_motion", "args": {"clipId": "headline", "preset": "spring", "duration": 0.9}},
    {"op": "add_shape_clip", "args": {"id": "badge", "start": 0, "duration": 15, "x": 0.5, "y": 0.68, "shape": {"type": "ellipse", "width": 0.07, "height": 0.124, "fill": "#f6a447"}}},
    {"op": "apply_code_motion", "args": {"clipIds": ["badge"], "recipe": "float", "speed": 1, "strength": 1}},
    {"op": "add_motion_template", "args": {"template": "lower-third", "title": "Your name", "subtitle": "Cut · graded · exported", "color": "#f6a447", "start": 2, "duration": 4, "idPrefix": "lt"}}
  ]
}
```

`update_clips` with `clipIds` warms both cuts at once, exactly like selecting them in the editor. The transition, presets and templates are the same operations the Studio sends.

## Where to go next

Try the same structure on your own footage: more cuts, a kinetic type title, or the Animator rigging the badge and headline as one part. The edit is ordinary clips all the way down, so anything can be retimed or restyled.

- [Motion graphics tutorial](motion-graphics-tutorial)
- [Transitions](transitions)
- [Rendering](rendering)
- [Motion presets](motion-presets)
- [Animator tutorial](tutorial-animator)
