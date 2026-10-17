---
title: Motion graphics tutorial
group: Get started
order: 3
description: Build an animated intro in the Studio, step by step. No footage needed.
---

## What you will make

{{video:mg}}

A five second intro: a headline that springs in, an accent bar that wipes open, a tagline that rises, a badge that floats forever and a lower third that arrives at two seconds. It takes about fifteen minutes and needs no uploads. Every layer is a normal clip, so you can change anything afterwards.

The video above follows every step below, with narration and captions. Use its chapter list to jump to a step, then repeat the step in your own tab.

> [!TIP] Follow along in a second tab. Open the Studio at `#/editor` and keep this page next to it.

## Start the project

Click the project name at the top left and type `Animated intro`. With nothing selected, the right panel shows Project settings: leave Canvas on 16:9 HD (1280×720) and Frame rate on 30 fps, and set the Background swatch to a dark navy such as `#101826`.

## Add a headline

Click Add title in the top bar, then type `Make your move` into the Text box. Set Size to about 10%, pick Poppins Bold in Typography, set Vertical to 44% and Duration to 5 seconds so it lasts the whole intro.

> [!NOTE] Size is a percentage of the frame height, and Horizontal and Vertical are percentages of the frame, so the same numbers work at any resolution.

## Make it spring in

Open the Motion tab, expand Motion presets, set Duration to 0.9 and click Spring. Press Space to play and the headline pops in with a damped bounce.

> [!TIP] Click any preset to preview it, then press Ctrl+Z and try another. Presets replace only the properties they animate.

## Add an accent bar

Open the Graphics tab and click rectangle. Set Shape width to 22% and height to 1 or 2%, fill it orange `#f6a447`, set Start to 0.3 and Duration to 4.7, and Vertical to 56%. Back in the Motion tab, click Wipe reveal with a Duration of 0.7 and the bar draws itself from left to right.

> [!NOTE] Shape width and height are fractions of the frame, so on a 16:9 canvas equal percentages do not make a square, which matters for the next circle.

## Add a tagline

Click Add title again and type `Motion graphics, made in the Studio`. Set Size to about 3.5%, Poppins, colour `#9fb3c8`, Vertical to 62%, Start to 0.5 and Duration to 4.5. In the Motion tab choose Rise with a Duration of 0.6.

## Add a badge that keeps moving

In Graphics click ellipse. A circle on 16:9 needs width 7% and height 12%. Fill it orange, set Vertical to 22% and Duration to 5. In the Motion tab expand Animate with code, choose the Float recipe and click Apply recipe: the badge bobs gently for as long as the clip lasts.

> [!TIP] A recipe is a formula, not keyframes, so it keeps looping at any clip length. Click Bake to keyframes if you later want to edit the movement by hand.

## Drop in a lower third

Click the timeline ruler at 2 seconds to place the playhead. In Graphics, click Lower third, set Headline to `Ada Lovelace`, Supporting text to `Pioneer of computing`, keep the orange Accent, set Duration to 3 and click Add to timeline. The template expands into three ordinary clips you can edit like any layer.

## Tune the motion on a graph

Click Animate in the top bar and select the headline. Its clip opens into Scale and Opacity lanes, with an Animation panel at the bottom right. The spring is drawn as a curve that overshoots and settles: drag the highest diamond down to soften the bounce, drag sideways to change timing, or click Key at playhead to add a key. Click Edit when you are done.

## Fade everything out

Select the headline, then drag the Fade out slider in the Edit tab to 0.6 seconds. Do the same for the tagline. Fade out is separate from keyframes, so it never fights the spring you set up earlier.

## Check it fits and play it back

With nothing selected, click Fit all layers in the Project panel to pull anything sticking out back inside. Click the skip-to-start button next to Play, press Space and watch the whole intro through once. Watch the save status next to the project name: when it says All changes saved, your work is stored with your account.

## Export your video

Click Export in the top bar. A progress bar shows the render and the MP4 is ready to download when it finishes. The server renders with FFmpeg and downloads each font the first time it is used, so a first render with a new font can take a little longer.

> [!NOTE] The preview and the export use the same formulas, but font metrics can differ by a pixel or two. Watch the export once before you publish it.

## Build the same thing with the API

Everything you did in the Studio is an operation, and the whole intro is one batch. Send this to `POST /api/projects/:id/timeline/ops` with a write key and you get the same layers. Add `"dryRun": true` first to see what would change.

```json
{
  "ops": [
    {"op": "set_project", "args": {"background": "#101826"}},
    {"op": "add_text_clip", "args": {"id": "headline", "text": "Make your move", "start": 0, "duration": 5, "x": 0.5, "y": 0.44, "textSize": 10, "font": "poppins", "fontWeight": 700, "textColor": "#ffffff", "fadeOut": 0.6}},
    {"op": "add_shape_clip", "args": {"id": "bar", "start": 0.3, "duration": 4.7, "x": 0.5, "y": 0.56, "shape": {"type": "rectangle", "width": 0.22, "height": 0.012, "fill": "#f6a447", "radius": 6}}},
    {"op": "add_text_clip", "args": {"id": "tagline", "text": "Motion graphics, made in the Studio", "start": 0.5, "duration": 4.5, "x": 0.5, "y": 0.62, "textSize": 3.5, "font": "poppins", "textColor": "#9fb3c8", "fadeOut": 0.6}},
    {"op": "add_shape_clip", "args": {"id": "badge", "start": 0, "duration": 5, "x": 0.5, "y": 0.22, "shape": {"type": "ellipse", "width": 0.07, "height": 0.124, "fill": "#f6a447"}}},
    {"op": "apply_motion", "args": {"clipId": "headline", "preset": "spring", "delay": 0, "duration": 0.9}},
    {"op": "apply_motion", "args": {"clipId": "bar", "preset": "reveal", "delay": 0, "duration": 0.7}},
    {"op": "apply_motion", "args": {"clipId": "tagline", "preset": "rise", "delay": 0, "duration": 0.6}},
    {"op": "apply_code_motion", "args": {"clipIds": ["badge"], "recipe": "float", "speed": 1, "strength": 1}},
    {"op": "add_motion_template", "args": {"template": "lower-third", "title": "Ada Lovelace", "subtitle": "Pioneer of computing", "color": "#f6a447", "start": 2, "duration": 3, "idPrefix": "lt"}}
  ]
}
```

## Where to go next

Try changing one thing at a time: swap Spring for Bounce in, add a second lower third, or use Animator to make the badge and bar move as one rig. Presets, keyframes and expressions all combine, so small changes go a long way.

- [Motion presets](motion-presets)
- [Keyframes & easing](keyframes)
- [Animate with code](animate-with-code)
- [Animator](animator)
- [Examples gallery](examples)
