---
title: Using the editor
group: Studio
order: 14
description: Cut media, build graphics and refine keyframes visually.
---

## Open your workspace

Open Studio and sign in with a read, write or admin key. The left library holds Media, Effects, Graphics and Projects. Drag the dividers to resize the library, inspector and timeline. Focus a divider and use arrow keys to resize with a keyboard. Tools lets you hide panels or reset the layout. Layout changes last for the current page session.

## Work on a smaller screen

On mobile, the preview stays above the active Timeline, Library or Inspector panel. Switch panels with the panel buttons rather than scrolling away from the preview. Tools contains composition JSON, add title, redo, snapping and documentation links.

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

Projects autosave as you edit. Check the save status before leaving. Export queues a server-side MP4 job. Public sharing requires an admin to change visibility and a completed render. A public share link does not expose your API key or source footage.

- [Rendering](rendering)
