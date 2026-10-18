---
title: Using the editor
group: Studio
order: 15
description: Cut media, build graphics and refine keyframes visually.
---

## Open your workspace

Open Studio and sign in with a read, write or admin key. The left library holds Media, Effects, Graphics and Projects. Drag the dividers to resize the library, inspector and timeline. Focus a divider and use arrow keys to resize with a keyboard. Tools lets you hide panels or reset the layout. Layout changes last for the current page session.

## Work on a smaller screen

On mobile, the preview stays above the active Timeline, Library or Inspector panel. Switch panels with the panel buttons rather than scrolling away from the preview. Tools contains composition JSON, add title, redo, snapping and documentation links.

## Blocks and scripts

The **Blocks** tab opens the block studio: snap blocks together, preview what they would change, then press the green **Apply to edit** button to change your timeline in one undoable step. The Tools tab lists saved scripts written in JavaScript. See Blocks & scripts.

> [!TIP] Press Preview in the block studio to see exactly what Apply would do before it touches your edit.

## Animator

The **Animator** button in the top bar opens a Roblox-style animation editor for clips, text and shapes. Add clips as parts of a rig, parent them, set joints, pose them on a timeline and press Apply to edit. See Animator.

## Typography for text clips

Select a text clip and open the Typography section of the inspector to choose a family from the catalog, a weight, an alignment, line height, letter spacing and uppercase. The preview loads every catalog font, so what you pick is what renders. The font catalog is documented in Fonts & text.

## Create graphics

Open Graphics and select a visual template card. Hover a preview to see its animation; reduced-motion preferences keep previews still. Customize the headline, supporting text, accent and duration, then choose Add to timeline. Generated clips are inserted at the playhead and selected. Click a single object in the canvas or its named timeline lane to edit it. Shift-click adds or removes objects from the selection. Shape primitives can also be inserted directly.

## Animate and refine

Choose Animate to open a dedicated property graph alongside the timeline. Selected graphic clips expand into property-labelled keyframe lanes. Click a diamond to seek and select that exact property and key in the graph. Add keys at the playhead, drag graph diamonds and adjust outgoing tween slopes. The inspector's Motion tab remains available in Edit mode. On-canvas handles move and scale selected visual clips.

## Understand graphic lanes

Each overlay clip has a named lane in document order, so moving it in time does not repack it onto a different row. These are clip lanes, not user-defined tracks or a new layer-order system. Existing rendering order is unchanged: media first, then shapes, then text. Video and audio categories still pack overlapping clips.

## Share a composition with your agent

Open Tools → Composition JSON to copy or download the full timeline. Paste a JSON composition, validate it, then apply it as one undoable edit. Missing assets must be uploaded first. With several clips selected, Stagger places them at the playhead with 0.15-second spacing.

## Work together

Everyone with a key that can read a project sees coloured live cursors on the timeline and preview, plus each other's playheads and selections. Click a person's avatar in the top bar to Follow them, and press Stop to go back to your own view. Shift-click or drag a box to select several clips, then move or edit them together.

Master admins also get a Live page that lists every project and opens any of them in a view-only mode. It follows the editor's unsaved timeline, playhead, selection and animated values about ten times a second, with an activity feed that also shows API and agent edits. A small badge in the editor tells you when an admin is watching.

## Add transitions

Open the Effects tab and look under Transitions. Dissolve, five wipes, iris, barn doors and diamond open can be dragged onto a video clip that follows another clip, or chosen in the inspector. Transitions work in the preview and in the FFmpeg export. See Transitions for the full list.

## Keyboard shortcuts

Shortcuts are ignored while typing in an input. Editing commands require a write-capable key.

| Key | Action |
|---|---|
| Space | Play / pause |
| S | Split at playhead |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Delete | Delete selection |
| Shift + Delete | Ripple delete |
| Left / Right | Seek one frame |
| [ / ] | Trim to playhead |
| + / - | Timeline zoom |

## Save and export

Projects autosave as you edit. Check the save status before leaving. Export is a menu, not a single button: pick a quality (Draft for the fastest render, Standard, or High for the most detail) and a resolution (the project's own, or 480p/720p/1080p with the aspect kept), then start the export. Your choices are remembered for next time, and a failed save stops the export rather than rendering something stale. The download supports resuming, so a dropped connection does not restart from zero. Public sharing requires an admin to change visibility and a completed render. A public share link does not expose your API key or source footage.

The studio bar also shows a live clock with the time of day, and a language selector that switches the Studio chrome and the block studio between English and Español together.

- [Motion graphics tutorial](motion-graphics-tutorial)
- [Transitions](transitions)
- [Animator](animator)
- [Blocks & scripts](custom-tools)
- [Rendering](rendering)
