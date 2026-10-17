---
title: Motion graphics tutorial
group: Get started
order: 3
description: Build an animated intro in the Studio, step by step. No footage needed.
---

## What you will make

A five second intro: a headline that springs in, an accent bar that wipes open, a tagline that rises, a badge that floats forever and a lower third that arrives at two seconds. You build it in the Studio with the mouse, and the last section shows the same result as one API call.

It takes about fifteen minutes and needs no uploads. Every layer is a normal clip, so you can change anything afterwards.

> [!TIP] Follow along in a second tab. Open the Studio at `#/editor` and keep this page next to it.

## Start the project

Open the Studio and sign in. Click the project name at the top left and type `Animated intro`. With nothing selected, the right panel shows Project settings. Leave Canvas on 16:9 HD (1280×720) and Frame rate on 30 fps. Click the Background swatch and choose a dark navy such as `#101826`.

The black preview turns navy straight away. Everything you add from here sits on top of this colour.

## Add a headline

Click Add title in the top bar. A title appears at the playhead and its settings open on the right. In the Text box, replace the words with `Make your move`.

Scroll to Typography. Choose Poppins as the Font and Bold as the weight. Back under Text, raise Size to about 10%. Under Timing set Duration to 5 so it lasts the whole intro, and under Transform set Vertical to 44% so it sits just above the middle.

> [!NOTE] Size is a percentage of the frame height, and Horizontal and Vertical are percentages of the frame, so the same numbers work at any resolution.

## Make it spring in

With the headline still selected, open the Motion tab on the right and expand Motion presets. Set Duration to 0.9 and leave Delay at 0 and Strength at 1.0×. Click Spring.

Press Space to play. The headline pops in with a damped bounce. The preset wrote keyframes for Scale and Opacity, and nothing else, so you can still move the headline or change its colour freely.

> [!TIP] Click any preset to preview it, then press Ctrl+Z to undo and try another. Presets replace only the properties they animate.

## Add an accent bar

Open the Graphics tab on the left, scroll to Shape primitives and click rectangle. A shape lands on the canvas and its Shape settings open in the Edit tab.

Set Shape width to about 22% and Shape height to 1 or 2%, so it becomes a thin bar. Set the fill to orange `#f6a447` and raise Corner radius a little for rounded ends. Under Timing set Start to 0.3 and Duration to 4.7, then under Transform set Vertical to 56%.

Switch to the Motion tab, expand Motion presets and click Wipe reveal with a Duration of 0.7. The bar draws itself from left to right.

> [!NOTE] Shape width and height are fractions of the frame. On a 16:9 canvas, equal percentages do not make a square, which matters for the next circle.

## Add a tagline

Click Add title again. Type `Motion graphics, made in the Studio`. Set Size to about 3.5%, pick Poppins, set the colour to a soft blue grey such as `#9fb3c8`, and set Vertical to 62%. Under Timing set Start to 0.5 and Duration to 4.5.

In the Motion tab choose the Rise preset with a Duration of 0.6. It lifts into place just after the bar finishes.

## Add a badge that keeps moving

In Graphics click ellipse. On a 16:9 frame a circle needs a smaller width than height, so set Shape width to 7% and Shape height to 12%. Fill it orange, set Vertical to 22% and Duration to 5.

Open the Motion tab, expand Animate with code, and under Looping recipe choose Float. Leave Speed and Strength at 1.0× and click Apply recipe. The badge bobs gently for as long as the clip lasts.

> [!TIP] A recipe is a formula, not keyframes, so it keeps looping at any clip length. Click Bake to keyframes if you later want to edit the movement by hand.

## Drop in a lower third

Click the timeline ruler at 2 seconds to place the playhead. Open the Graphics tab and click Lower third. Under Customize, set Headline to `Ada Lovelace`, Supporting text to `Pioneer of computing`, keep the orange Accent, and set Duration to 3. Click Add to timeline.

The template expands into three ordinary clips: the plate, the name and the subtitle. Click any of them in the preview or in the timeline to edit it, exactly like the layers you built by hand.

## Tune the motion on a graph

Click Animate in the top bar and select the headline. Its clip opens into Scale and Opacity lanes in the timeline, and an Animation panel appears at the bottom right. Choose Scale in the property list, which also shows how many keys it has. The spring is drawn as a curve that overshoots and then settles.

Drag the highest diamond down a little to soften the bounce, or drag a diamond sideways to change its timing. Click Key at playhead to add a new key where the playhead sits. Click Edit in the top bar when you are done.

## Fade everything out

Select the headline, then drag the Fade out slider in the Edit tab to 0.6 seconds. Do the same for the tagline. Fade out is separate from keyframes, so it never fights the spring you set up earlier.

Open the Effects tab if you prefer to drag: Fade out under Fades and looks can be dropped straight onto a clip in the timeline or the preview.

## Check it fits and play it back

With nothing selected, click Fit all layers in the Project panel. This pulls anything that sticks out of the frame back inside. Click the skip-to-start button next to Play, then press Space and watch the whole intro through once.

Look at the save status next to the project name. When it says All changes saved your work is stored with your account.

## Export your video

Click Export in the top bar. A progress bar shows the render and the MP4 is ready to download when it finishes. The server renders with FFmpeg and downloads each font the first time it is used, so the first render with a new font can take a little longer.

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
