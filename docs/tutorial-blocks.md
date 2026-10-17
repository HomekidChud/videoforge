---
title: Block coding tutorial
group: Get started
order: 4
description: Build your first set of blocks, wire values into them and apply the result to your edit.
---

## What you will make

A set of blocks called **Title every clip** that adds a styled title to the playhead and fades every clip in your edit in half a second. You build it in the block studio without writing a line of code, check it with Preview, then press Apply to edit and watch the whole change land as one undoable step.

It takes about ten minutes. The same blocks run through the same operations and validation as the API, so what you build here is exactly what an agent could send as a batch.

> [!TIP] Open the Studio at `#/editor` in a second tab and keep this page next to it.

## Open the block studio

Sign in to the Studio and click the **Blocks** tab, next to Effects. The block studio takes over the screen: the palette sits on the left, the canvas in the middle and the run controls in the header.

If you have never used blocks before, press the 🎓 **Tutorial** button in the header first. It walks you through naming a set of blocks, the block menu and your first Apply. It replays any time.

## Start from the green block

Every set of blocks begins with the green **When Apply is pressed** block. It is already on the canvas when you start. Its **Work on** setting decides what `$selection` means later — set it to **Every clip**, so this set of blocks works on the whole edit without you selecting anything.

Click the set's name in the header and type `Title every clip`. The description is optional; write one if you plan to share it.

## Build the chain

The run order follows the lines between blocks, from the green block down. You will add three blocks to it.

Drag an **Add title** block from the **Create** category onto the canvas. Drag from the green block's bottom dot to the Add title block's top dot: the line snaps in place, so the title is added first. In the block's Text field, type `Made with blocks`.

Next, from the **Animate** category, drag **Fade in**. Connect it under the Add title block. Fade in asks which clips to work on: click its clip field and pick `$selection`.

Finally, from the **Timing** category, drag a **For each clip** block and drop it on empty canvas. Move the Fade in block into its body — connect it to the dot on the block's right side, not the bottom. Then connect the For each clip block under the Add title block. Fade in now runs once per clip instead of once for the selection.

> [!NOTE] The coloured dots on a block's fields are sockets. Clip fields take clip blocks, time fields take frame blocks, and any field can take a Values block instead of a typed value.

## Wire a value block

The title's text does not have to be typed into the field. From the **Values** category, drag a 📝 **Text** block next to the Add title block, type `Made with blocks` into it, and drag from its dot into the Add title block's Text field. The connected value wins over whatever is typed in the field.

This is the whole idea of block coding: values, clips and frames are blocks too, so a set of blocks can be re-wired without retyping anything. Try a 🔢 **Number** block in Fade in's Duration field with `0.5`.

## Preview, then apply

Press **Preview** in the header. The preview lists exactly what Apply would change, one line per change, without touching your edit: a title is added, every clip gets a fade.

Press **▶ Apply to edit**. The title lands at the playhead and every clip in the edit fades in. One Ctrl+Z in the editor undoes the whole apply, because it is one step.

If something is wrong, the error bar at the bottom of the studio explains what and jumps to the offending block. Applying is disabled until errors are fixed.

> [!TIP] Switch **Work on** between **Every clip** and **Selected clips** and press Preview each time. The same blocks then work on the whole edit or just what you have selected.

## Save, share and reuse

Your blocks save to your account as you work. Back in the Studio, the Tools panel lists them, and pressing ▶ Apply to edit on a saved set runs it against the timeline you have open.

- The 🔗 **Share** button copies a compact `VFT1:` code that anyone can paste into their Tools panel.
- The **Save as sticker** block turns any clip into a reusable building block that appears in its own palette category.
- The Code tab shows the same set of blocks as JavaScript, and Export as standalone script downloads a single `.mjs` that runs against the API.

## Build the same thing with the API

Everything the blocks did is one operations batch. Send this to `POST /api/projects/:id/timeline/ops` with a write key and you get the same result.

```json
{
  "ops": [
    {"op": "add_text_clip", "args": {"id": "blocks-title", "text": "Made with blocks", "start": 0, "duration": 5, "x": 0.5, "y": 0.15, "textSize": 5, "textColor": "#ffffff"}},
    {"op": "update_clips", "args": {"patch": {"fadeIn": 0.5}}}
  ]
}
```

`update_clips` without `clipIds` or `track` hits every clip in the edit, which is what the For each clip block did.

## Where to go next

Small changes go a long way: rewire the value blocks, add a Repeat block around the fade, or build a second set of blocks that styles titles. The same blocks, code and API all describe one edit.

- [Blocks & scripts](custom-tools)
- [Motion graphics tutorial](motion-graphics-tutorial)
- [Animator tutorial](tutorial-animator)
- [Batch operations](batch-operations)
- [Animator](animator)
