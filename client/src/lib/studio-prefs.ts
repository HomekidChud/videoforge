/** Small, per-browser Studio preferences: layout preset, Simple or Advanced mode, tour and recent commands. */
export type Preset = "edit" | "animate" | "graphics" | "audio" | "blocks";
export type Mode = "simple" | "advanced";

export const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: "edit", label: "Edit", hint: "Media, timeline and inspector" },
  { id: "animate", label: "Animate", hint: "Keyframes and motion beside the timeline" },
  { id: "graphics", label: "Graphics", hint: "Titles, shapes and templates" },
  { id: "audio", label: "Audio", hint: "A taller timeline with the audio track in focus" },
  { id: "blocks", label: "Blocks", hint: "Build repeatable edits from blocks" },
];

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v == null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
}
function write(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }

export const prefs = {
  preset: () => { const p = read<Preset>("vf:preset", "edit"); return PRESETS.some((x) => x.id === p) ? p : "edit"; },
  setPreset: (p: Preset) => write("vf:preset", p),
  mode: () => (read<Mode>("vf:mode", "advanced") === "simple" ? "simple" : "advanced") as Mode,
  setMode: (m: Mode) => write("vf:mode", m),
  toured: () => read<boolean>("vf:toured", false),
  setToured: (v: boolean) => write("vf:toured", v),
  recent: () => read<string[]>("vf:recent-commands", []),
  pushRecent: (id: string) => write("vf:recent-commands", [id, ...read<string[]>("vf:recent-commands", []).filter((x) => x !== id)].slice(0, 5)),
};
