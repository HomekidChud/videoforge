import { normalizeKeyframes, type Keyframes } from "./animation";
import { normalizeShape, type Shape } from "./graphics";
// Timeline model shared by the editor, the HTTP API and the FFmpeg renderer.
// Everything coming from a client is passed through normalizeTimeline() so the
// renderer only ever sees bounded, well-typed values.

export const TRANSITION_TYPES = ["dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "iris"] as const;
export type TrackName = "video" | "overlay" | "audio";
export type ClipFilter = "none" | "mono" | "sepia" | "vivid" | "cool" | "warm" | "faded";

export type Clip = {
  shape?: Shape;
  transitionIn?: import("./transitions").Transition;
  id: string;
  assetId: string; // "" for asset-free text or shape clips
  track: TrackName;
  start: number; // timeline seconds
  inPoint: number; // source seconds
  outPoint: number; // source seconds (for images/text: inPoint + display duration)
  volume: number; // 0..1
  muted: boolean;
  text?: string;
  speed?: number; // 0.25..4
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
  filter?: ClipFilter;
  brightness?: number; // -0.5..0.5
  contrast?: number; // 0.5..2
  saturation?: number; // 0..2
  reveal?: number; // 0..1 left-to-right mask, applied before transforms
  opacity?: number; // 0..1
  x?: number; // 0..1 centre position (overlay track and text)
  y?: number;
  scale?: number; // 0.1..1 of frame width (overlay track)
  textSize?: number; // % of frame height, 2..20
  textColor?: string; // #rrggbb
  keyframes?: Keyframes;
  rotation?: number;
  fit?: "contain" | "cover";
  flipX?: boolean;
  flipY?: boolean;
  blur?: number; // 0..20 pixels
  label?: string;
  textBg?: boolean; // translucent box behind text
};

export type Timeline = {
  version: number;
  fps: number;
  resolution: { width: number; height: number };
  clips: Clip[];
  background?: string;
  markers?: { id: string; time: number; label: string; color?: string }[];
  tracks?: Partial<Record<TrackName, { muted?: boolean; hidden?: boolean; locked?: boolean }>>;
};

export const TRACKS: TrackName[] = ["overlay", "video", "audio"];
export const FILTERS: ClipFilter[] = ["none", "mono", "sepia", "vivid", "cool", "warm", "faded"];
export const RESOLUTIONS = [
  { label: "16:9 HD (1280×720)", width: 1280, height: 720 },
  { label: "16:9 Full HD (1920×1080)", width: 1920, height: 1080 },
  { label: "9:16 Vertical (1080×1920)", width: 1080, height: 1920 },
  { label: "1:1 Square (1080×1080)", width: 1080, height: 1080 },
  { label: "4:5 Portrait (1080×1350)", width: 1080, height: 1350 },
];
export const MAX_CLIPS = 200;
export const MIN_CLIP = 0.1;

const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const round = (n: number) => Math.round(n * 1000) / 1000;

export function clipSpeed(c: Pick<Clip, "speed">): number { return c.speed && c.speed > 0 ? c.speed : 1; }
/** Duration the clip occupies on the timeline (after speed is applied). */
export function clipDuration(c: Pick<Clip, "inPoint" | "outPoint" | "speed" | "track" | "assetId">): number {
  const src = Math.max(MIN_CLIP, c.outPoint - c.inPoint);
  return round(c.assetId ? src / clipSpeed(c) : src);
}
export function clipEnd(c: Clip): number { return round(c.start + clipDuration(c)); }
export function timelineDuration(t: Timeline): number {
  return t.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

export function normalizeClip(raw: any): Clip {
  if (!raw || typeof raw !== "object") throw new Error("clip must be an object");
  const track: TrackName = ["video", "overlay", "audio"].includes(raw.track) ? raw.track : "video";
  const assetId = typeof raw.assetId === "string" ? raw.assetId.slice(0, 64) : "";
  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.slice(0, 500) : undefined;
  const shape = normalizeShape(raw.shape);
  if (!assetId && !text && !shape) throw new Error("clip needs an assetId, text, or shape");
  if (shape && (assetId || text || track === "audio")) throw new Error("shape clips must be visual and cannot also contain media or text");
  if (!assetId && !shape && ((typeof raw.reveal === "number" && raw.reveal < 1) || raw.keyframes?.reveal?.length)) throw new Error("reveal applies to media and shape clips; use opacity or position keyframes for text");
  const inPoint = round(num(raw.inPoint, 0, 86400, 0));
  const outPoint = round(Math.max(inPoint + MIN_CLIP, num(raw.outPoint, 0, 86400, inPoint + 5)));
  const clip: Clip = {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 64) : Math.random().toString(36).slice(2, 10),
    assetId, track,
    start: round(num(raw.start, 0, 86400, 0)),
    inPoint, outPoint,
    volume: round(num(raw.volume, 0, 1, 1)),
    muted: !!raw.muted,
  };
  if (text) clip.text = text;
  if (shape) clip.shape = shape;
  if(raw.transitionIn && (TRANSITION_TYPES as readonly string[]).includes(raw.transitionIn.type) && typeof raw.transitionIn.fromClipId === "string") clip.transitionIn = { fromClipId: raw.transitionIn.fromClipId.slice(0,64), type: raw.transitionIn.type, duration: round(num(raw.transitionIn.duration,.05,3,.6)) };
  const opt = (k: keyof Clip, v: unknown, lo: number, hi: number, def: number) => {
    if (v === undefined || v === null) return;
    const n = round(num(v, lo, hi, def));
    if (n !== def) (clip as any)[k] = n;
  };
  opt("speed", raw.speed, 0.25, 4, 1);
  opt("fadeIn", raw.fadeIn, 0, 10, 0);
  opt("fadeOut", raw.fadeOut, 0, 10, 0);
  opt("brightness", raw.brightness, -0.5, 0.5, 0);
  opt("contrast", raw.contrast, 0.5, 2, 1);
  opt("saturation", raw.saturation, 0, 2, 1);
  opt("reveal", raw.reveal, 0, 1, 1);
  opt("opacity", raw.opacity, 0, 1, 1);
  opt("x", raw.x, 0, 1, 0.5);
  opt("y", raw.y, 0, 1, track === "overlay" && !assetId && !shape ? 0.82 : 0.5);
  opt("scale", raw.scale, 0.1, 2, assetId && track === "overlay" ? 0.35 : 1);
  opt("rotation", raw.rotation, -360, 360, 0);
  opt("blur", raw.blur, 0, 20, 0);
  if(raw.fit === "cover") clip.fit = "cover";
  if(raw.flipX) clip.flipX = true;
  if(raw.flipY) clip.flipY = true;
  if(typeof raw.label === "string" && raw.label.trim()) clip.label = raw.label.slice(0,120);
  const keyframes = normalizeKeyframes(raw.keyframes, clipDuration(clip));
  if(Object.keys(keyframes).length) clip.keyframes = keyframes;
  opt("textSize", raw.textSize, 2, 20, 6);
  if (FILTERS.includes(raw.filter) && raw.filter !== "none") clip.filter = raw.filter;
  if (typeof raw.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.textColor) && raw.textColor.toLowerCase() !== "#ffffff") clip.textColor = raw.textColor.toLowerCase();
  if (raw.textBg === true) clip.textBg = true;
  return clip;
}

export function normalizeTimeline(raw: any): Timeline {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.clips)) throw new Error("timeline.clips must be an array");
  if (raw.clips.length > MAX_CLIPS) throw new Error(`a timeline can contain at most ${MAX_CLIPS} clips`);
  const seen = new Set<string>();
  const clips = raw.clips.map((c: any) => {
    const clip = normalizeClip(c);
    while (seen.has(clip.id)) clip.id = Math.random().toString(36).slice(2, 10);
    seen.add(clip.id);
    return clip;
  });
  const w = Math.round(num(raw.resolution?.width, 160, 3840, 1280) / 2) * 2;
  const h = Math.round(num(raw.resolution?.height, 160, 3840, 720) / 2) * 2;
  const tracks: Timeline["tracks"] = {};
  for(const name of TRACKS) { const t = raw.tracks?.[name]; if(t) tracks[name] = { muted: !!t.muted, hidden: !!t.hidden, locked: !!t.locked }; }
  const markers = (Array.isArray(raw.markers) ? raw.markers : []).slice(0,100).map((m:any,i:number)=>({ id: typeof m.id === "string" ? m.id.slice(0,64) : `marker${i}`, time: round(num(m.time,0,86400,0)), label: String(m.label??"Marker").slice(0,120), color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : "#f6a447" })).sort((a:any,b:any)=>a.time-b.time);
  return { version: 4, background: /^#[0-9a-fA-F]{6}$/.test(raw.background) ? raw.background : "#000000", markers, tracks, fps: Math.round(num(raw.fps, 1, 60, 30)), resolution: { width: w, height: h }, clips };
}

// Effective values with defaults applied (normalizeClip omits defaults).
export const clipX = (c: Clip) => c.x ?? 0.5;
export const clipY = (c: Clip) => c.y ?? (!c.assetId && !c.shape ? 0.82 : 0.5);
export const clipScale = (c: Clip) => c.scale ?? (c.assetId && c.track === "overlay" ? 0.35 : 1);
export const isTextClip = (c: Clip) => !c.assetId && !c.shape;
