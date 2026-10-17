/**
 * The Studio's keyboard shortcuts, in one list.
 * The shortcut sheet (press ?), the command palette and the generated
 * Keyboard shortcuts docs page all read from here, so they cannot drift apart.
 */
export type ShortcutGroup = "Playback" | "Editing" | "Selection" | "Timeline" | "Studio";

export type Shortcut = { id: string; group: ShortcutGroup; label: string; keys: string[] };

export const SHORTCUTS: Shortcut[] = [
  { id: "play", group: "Playback", label: "Play or pause", keys: ["Space"] },
  { id: "step-back", group: "Playback", label: "Back one frame", keys: ["Left"] },
  { id: "step-forward", group: "Playback", label: "Forward one frame", keys: ["Right"] },
  { id: "jump-back", group: "Playback", label: "Back one second", keys: ["Shift", "Left"] },
  { id: "jump-forward", group: "Playback", label: "Forward one second", keys: ["Shift", "Right"] },
  { id: "start", group: "Playback", label: "Jump to start", keys: ["Home"] },
  { id: "end", group: "Playback", label: "Jump to end", keys: ["End"] },

  { id: "split", group: "Editing", label: "Split at the playhead", keys: ["S"] },
  { id: "trim-in", group: "Editing", label: "Trim the start to the playhead", keys: ["["] },
  { id: "trim-out", group: "Editing", label: "Trim the end to the playhead", keys: ["]"] },
  { id: "delete", group: "Editing", label: "Delete the selection", keys: ["Delete"] },
  { id: "ripple", group: "Editing", label: "Ripple delete", keys: ["Shift", "Delete"] },
  { id: "duplicate", group: "Editing", label: "Duplicate", keys: ["Ctrl", "D"] },
  { id: "copy", group: "Editing", label: "Copy", keys: ["Ctrl", "C"] },
  { id: "paste", group: "Editing", label: "Paste at the playhead", keys: ["Ctrl", "V"] },
  { id: "undo", group: "Editing", label: "Undo", keys: ["Ctrl", "Z"] },
  { id: "redo", group: "Editing", label: "Redo", keys: ["Ctrl", "Shift", "Z"] },

  { id: "select-all", group: "Selection", label: "Select every clip", keys: ["Ctrl", "A"] },
  { id: "multi-select", group: "Selection", label: "Add to the selection", keys: ["Shift", "Click"] },
  { id: "clear", group: "Selection", label: "Clear the selection", keys: ["Esc"] },

  { id: "marker", group: "Timeline", label: "Add a marker at the playhead", keys: ["M"] },
  { id: "zoom-in", group: "Timeline", label: "Zoom in", keys: ["+"] },
  { id: "zoom-out", group: "Timeline", label: "Zoom out", keys: ["-"] },
  { id: "zoom-wheel", group: "Timeline", label: "Zoom with the mouse wheel", keys: ["Ctrl", "Wheel"] },

  { id: "palette", group: "Studio", label: "Open the command palette", keys: ["Ctrl", "K"] },
  { id: "shortcuts", group: "Studio", label: "Show this shortcut sheet", keys: ["?"] },
  { id: "save", group: "Studio", label: "Save now", keys: ["Ctrl", "S"] },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = ["Playback", "Editing", "Selection", "Timeline", "Studio"];

export function shortcutFor(id: string): string {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? s.keys.join(" ") : "";
}
