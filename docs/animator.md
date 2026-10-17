---
title: Animator
group: Studio
order: 15
description: Pose clips, text and shapes like a rig, key them on a timeline and apply the result to your edit.
---

## What the Animator is

The Animator is a pose-and-keyframe editor in the style of Roblox Studio's Animation Editor, but the puppet parts are your own clips. A video clip, an image, a line of text or a shape can each be a **part**. Parts have a **joint** they turn about, can hang off a **parent**, and carry keyframes for position, size, turn and see-through. Press **Apply to edit** and the result lands on your timeline as ordinary keyframes, so you can still trim, retime and layer the clips with every other tool.

> [!NOTE] Nothing about rendering changes. The Animator bakes into the same keyframes every clip already has, so the preview, the FFmpeg export and the API all agree.

Open it with the **Animator** button in the top bar of the Studio, or the 🎞 Animator button inside the block studio.

## Build a rig

Select the clips you want to animate in the editor, open the Animator and press **Selected clips**. They appear in the Rig list on the left. **On screen** adds every clip that is visible while the animation plays, and **Stick figure** creates a ready-made figure of ten shapes on the timeline and rigs it for you.

- Drag a part onto another to make it a **child**. Drag it into empty space to unparent it.
- A child moves, turns and scales with its parent, about the parent's joint. Its own keyframes still work on top.
- Open **Joint & parent** to move the joint. Put the joint at the shoulder of an arm clip and rotating the arm swings it from there.

> [!TIP] Parent a hand to a forearm and the forearm to an upper arm. Rotating the upper arm carries the whole chain, the way a Roblox character's arm works.

## Pose and key

Move the playhead, then pose a part. You can drag the highlighted object on the stage, or type into the **Pose** fields. Each change writes a keyframe at the playhead. If a property had no keys yet, a first key at the start pins its resting value so nothing jumps.

| Control | What it does |
|---|---|
| Diamond beside a field | Adds or removes a key for that one property at the playhead |
| Key pose (K) | Keys every property of the selected part at the playhead |
| Double-click a property row | Adds a key at that time |
| Drag a diamond | Moves the key, snapped to a frame |
| Easing | Sets how the pose eases into the next key. Choose hold to step |

Open a part's row in the Keyframes panel to see each property on its own line. The summary row shows every key time at once.

## Presets

The **Presets** menu writes a ready-made motion onto the selected part, or onto all parts. Values are relative to each part's resting pose, so a preset works wherever the clip sits.

| Preset | Result |
|---|---|
| Bounce | Hops up and lands, again and again |
| Swing | Rocks left and right about the joint |
| Wave | A quick friendly wave |
| Pulse | Breathes in and out |
| Float | Drifts gently up and down |
| Pop in | Springs into view |
| Walk cycle | Swings limbs in opposite pairs. Made for the stick figure |

> [!TIP] Apply Walk cycle to all parts of the stick figure, press Space to play, then Apply to edit.

## Apply to your edit

**Apply to edit** is the green button. It bakes the active animation into the clips as one undoable step, so Ctrl+Z puts everything back. Keys outside the part of the clip the animation covers are left alone. **Starts at** sets where on the timeline the animation begins, and **At playhead** uses the current playhead.

> [!WARNING] Applying replaces the position, size, turn and see-through keyframes on the rigged clips, including any you added by hand. Keyframes on other properties are untouched. Use Clear from edit to remove a rig's keyframes from its clips.

Animations are saved in this browser for the project, so they are there when you reopen the Animator. A part whose clip has been deleted shows as missing and must be removed before you can apply.

## Use it from blocks and the API

Saved animations can run from blocks. Add **Play an Animator animation** and type the animation's name. Two more blocks work on clips directly: **Pose clips together** moves several clips to a pose at once, and **Make a clip follow another** lets one clip ride another's motion about a joint.

The same three actions exist as timeline operations, so agents can drive rigs without the Animator.

| Operation | Purpose |
|---|---|
| rig_bake | Bakes an animation with parts, parents, joints and local keyframes into clip keyframes |
| rig_pose | Moves several clips to a pose together, from where they are now |
| rig_follow | Makes a child clip ride a parent clip's motion |

```json
{
  "op": "rig_bake",
  "args": {
    "animation": {
      "name": "Wave",
      "length": 2,
      "start": 0,
      "parts": [
        { "clipId": "upper-arm", "pivotY": -0.07 },
        { "clipId": "forearm", "parentId": "upper-arm", "pivotY": -0.065 }
      ],
      "tracks": {
        "upper-arm": { "rotation": [{ "time": 0, "value": 0 }, { "time": 1, "value": 40, "easing": "ease-in-out" }, { "time": 2, "value": 0 }] }
      }
    }
  }
}
```

## Keyboard shortcuts

Shortcuts are ignored while typing in a field.

| Key | Action |
|---|---|
| Space | Play / pause the preview |
| K | Key the selected part's whole pose |
| Left / Right | Step one frame |
| Delete | Delete the selected key |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Escape | Close the Animator |

- [Keyframes & easing](keyframes)
- [Blocks & scripts](custom-tools)
