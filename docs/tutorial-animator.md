---
title: Animator tutorial
group: Get started
order: 5
description: Rig a figure in the Animator, pose it, key the poses and bake the result onto your edit.
---

## What you will make

A waving figure: the ready-made stick figure rigged in the Animator, with one arm keyed to wave twice over two seconds, eased so it swings naturally. You pose, key and play inside the Animator, then press **Apply to edit** and the whole motion lands on your timeline as ordinary keyframes.

It takes about ten minutes. Because the result is plain keyframes, the preview, the FFmpeg export and the API all agree with no new renderer.

> [!TIP] Open the Studio at `#/editor` in a second tab. You need at least one clip in the project before the Animator has something to rig.

## Put something on the timeline

Open the Studio and click **Stick figure** in the Animator, or add a couple of shapes first: an ellipse for a head and two rectangles for arms work well. For this tutorial, open the Animator with the **Animator** button in the top bar and press **Stick figure**. Ten shapes land on the timeline, already rigged.

## Meet the rig

The Rig list on the left shows every part. Parts can hang off a **parent** and turn about a **joint**. In the stick figure the forearm is parented to the upper arm, the way a Roblox character's arm works: rotate the upper arm and the whole chain follows.

Open a part's **Joint & parent** row to see where its joint sits. Put the joint at the shoulder of an arm and rotating the arm swings it from there, not from its middle.

## Pose and key

Drag the playhead to `0.0`. Nothing to key yet — this is the rest pose.

Drag the playhead to `0.3`. Now pose the forearm: drag it on the stage, or type into its **Pose** fields. Set **Turn** to `-60` so the forearm swings out. Each change writes a keyframe at the playhead, and a first key at the start pins the resting value so nothing jumps.

Move the playhead to `1.0` and pose the forearm the other way: **Turn** `40`. A second key appears.

Two keys are a wave, but a stiff one. Select the second key and set its **Easing** to **ease-in-out**, then drag between keys to check the swing. Add one more pair of keys at `1.7` (`-50`) and `2.4` (`0`) so the arm settles back to rest.

> [!NOTE] Every property keys on its own: position, size, turn and see-through. The summary row on a part shows every key time at once, and the Keyframes panel expands each property onto its own line.

## Play it back

Press play in the Animator. The figure waves twice and settles. Scrub the playhead to check individual poses. If a key lands in the wrong place, drag the diamond — it snaps to frames.

Useful keys while you work:

| Key | Action |
|---|---|
| K | Key pose: keys every property of the selected part at the playhead |
| Ctrl+Z | Undo, one pose or key at a time |

## Apply to edit

Press the green **Apply to edit** button. The Animator closes and the motion is baked onto the clips as ordinary keyframes. Select the forearm in the editor and open **Animate** to see them: position and rotation curves you can trim, retime, or hand-edit like any other keyframes.

Nothing is lost by baking. The animation is also saved with the project, so you can reopen the Animator and keep posing.

## Build the same thing with the API

The Animator's result is one `rig_bake` operation. Send this to `POST /api/projects/:id/timeline/ops` with a write key and the same wave lands on the timeline — parts, joints and keyframes included.

```json
{
  "ops": [
    {"op": "add_shape_clip", "args": {"id": "upper-arm", "start": 0, "duration": 3, "x": 0.44, "y": 0.5, "shape": {"type": "rectangle", "width": 0.03, "height": 0.18, "fill": "#e8edf4"}}},
    {"op": "add_shape_clip", "args": {"id": "forearm", "start": 0, "duration": 3, "x": 0.44, "y": 0.62, "shape": {"type": "rectangle", "width": 0.028, "height": 0.16, "fill": "#e8edf4"}}},
    {"op": "rig_bake", "args": {"start": 0, "animation": {"name": "Wave", "length": 3, "parts": [{"clipId": "upper-arm"}, {"clipId": "forearm", "parentId": "upper-arm", "pivotX": 0, "pivotY": -0.08}], "tracks": {"forearm": {"rotation": [{"time": 0, "value": 0, "easing": "ease-in-out"}, {"time": 0.3, "value": -60, "easing": "ease-in-out"}, {"time": 1.0, "value": 40, "easing": "ease-in-out"}, {"time": 1.7, "value": -50, "easing": "ease-in-out"}, {"time": 2.4, "value": 0}]}}}}}
  ]
}
```

The forearm is parented to the upper arm with a joint above it, and only its rotation is keyed — the same rig you posed by hand.

## Where to go next

Rig your own clips instead of the figure, parent a hand to a forearm and drag it, or pose a lower third onto a clip. Everything you key bakes to ordinary keyframes you can keep editing.

- [Animator](animator)
- [Block coding tutorial](tutorial-blocks)
- [Keyframes & easing](keyframes)
- [Motion graphics tutorial](motion-graphics-tutorial)
- [Examples gallery](examples)
