import { normalizeExpressions, normalizeKeyframes, type Expressions, type Keyframes } from "./animation";
import { DEFAULT_FONT, FONT_IDS, FONT_MAP, getFont } from "./fonts";
import { normalizeShape, type Shape } from "./graphics";
// Timeline model shared by the editor, the HTTP API and the FFmpeg renderer.
// Everything coming from a client is passed through normalizeTimeline() so the
// renderer only ever sees bounded, well-typed values.

export const TRANSITION_TYPES = ["dissolve", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "iris", "barn-h", "barn-v", "diamond", "wipe-diagonal"] as const;
export type TrackName = "video" | "overlay" | "audio";
export type ClipFilter = "none" | "mono" | "sepia" | "vivid" | "cool" | "warm" | "faded";

/** One step of a speed ramp: play at `speed` (0 = freeze) for `duration` seconds. */
export type SpeedStep = { speed: number; duration: number };

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
  /** Speed steps over displayed time (0 = freeze). Replaces `speed` when set. */
  speedRamp?: SpeedStep[];
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
  expressions?: Expressions; // animate with code: property -> expression of t, d, p, base
  rotation?: number;
  z?: number; // layer order within a track; higher draws on top (-100..100)
  crop?: { x: number; y: number; w: number; h: number }; // fractions of the layer box to keep (0..1)
  fit?: "contain" | "cover" | "fill"; // fill stretches footage to the frame
  flipX?: boolean;
  flipY?: boolean;
  blur?: number; // 0..20 pixels
  label?: string;
  textBg?: boolean; // translucent box behind text
  textFit?: "none"; // text auto-wraps and shrinks to fit the frame unless this is "none"
  textMaxWidth?: number; // fraction of the frame width text may use (0.1..1, default 0.9)
  textMaxHeight?: number; // fraction of the frame height text may use (0.05..1, default 0.5)
  font?: string; // catalog id from shared/fonts (default noto-sans)
  fontWeight?: 400 | 700; // 700 only when the family has a bold cut
  textAlign?: "left" | "center" | "right"; // alignment inside the text box (default center)
  lineHeight?: number; // 1..2, default 1.4
  letterSpacing?: number; // -0.05..0.25 em
  textTransform?: "none" | "uppercase";
  /** Animated text reveal: typewriter (per character), words, or lines. */
  textReveal?: { mode: "typewriter" | "words" | "lines"; duration?: number; delay?: number };
  /** Steps the text colour through a list of colours over time. */
  textColorCycle?: { steps: string[]; duration?: number };
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
/** Total displayed time of speed steps. */
export function rampDuration(r: SpeedStep[]): number { return r.reduce((s, x) => s + x.duration, 0); }
/** Total source time the speed steps consume. */
export function rampSource(r: SpeedStep[]): number { return r.reduce((s, x) => s + x.speed * x.duration, 0); }
/** Source-time position for a displayed offset into ramp steps. */
export function rampSourceAt(r: SpeedStep[], t: number): number {
  let acc = 0;
  for (const s of r) {
    if (t <= s.duration) return acc + s.speed * t;
    acc += s.speed * s.duration; t -= s.duration;
  }
  return acc;
}
/** The speed a clip plays at for a displayed offset into ramp steps. */
export function rampSpeedAt(r: SpeedStep[], t: number): number {
  for (const s of r) {
    if (t < s.duration) return s.speed;
    t -= s.duration;
  }
  return r[r.length - 1]?.speed ?? 1;
}
/** Split ramp steps at a displayed offset: the steps before it and from it on. */
export function sliceRamp(r: SpeedStep[], at: number): [SpeedStep[], SpeedStep[]] {
  const left: SpeedStep[] = [], right: SpeedStep[] = [];
  let t = 0;
  for (const s of r) {
    if (at >= t + s.duration - 1e-6) left.push({ ...s });
    else if (at <= t + 1e-6) right.push({ ...s });
    else { const rel = round(at - t); left.push({ speed: s.speed, duration: rel }); right.push({ speed: s.speed, duration: round(s.duration - rel) }); }
    t += s.duration;
  }
  return [left, right];
}
/** Normalise raw speed steps: 1..20 steps, each 0.1..3600s at 0..4x. */
export function normalizeSpeedRamp(raw: unknown): SpeedStep[] {
  if (!Array.isArray(raw)) throw new Error("speed steps must be a list of { speed, duration }");
  const steps = raw.slice(0, 20).map((s: any) => ({
    speed: Math.min(4, Math.max(0, num(s?.speed, 0, 4, 1))),
    duration: round(Math.max(0.1, num(s?.duration, 0.1, 3600, 1))),
  }));
  if (!steps.length) throw new Error("speed steps need at least one step");
  if (rampSource(steps) < 0.04) throw new Error("speed steps need at least one step faster than a freeze");
  return steps;
}
/** Duration the clip occupies on the timeline (after speed is applied). */
export function clipDuration(c: Pick<Clip, "inPoint" | "outPoint" | "speed" | "track" | "assetId" | "speedRamp">): number {
  if (c.speedRamp?.length) return round(rampDuration(c.speedRamp));
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
  if (!assetId && !shape && ((typeof raw.reveal === "number" && raw.reveal < 1) || raw.keyframes?.reveal?.length || raw.expressions?.reveal)) throw new Error("reveal applies to media and shape clips; use opacity or position keyframes for text");
  const inPoint = round(num(raw.inPoint, 0, 86400, 0));
  const outPoint = round(Math.max(inPoint + MIN_CLIP, num(raw.outPoint, 0, 86400, inPoint + 5)));
  // Speed steps: they define the whole timeline of the clip, the source window
  // must cover exactly what the steps play. Media clips only.
  let speedRamp: SpeedStep[] | undefined;
  if (raw.speedRamp !== undefined && raw.speedRamp !== null) {
    if (!assetId) throw new Error("speed steps apply to media clips");
    speedRamp = normalizeSpeedRamp(raw.speedRamp);
  }
  const clip: Clip = {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 64) : Math.random().toString(36).slice(2, 10),
    assetId, track,
    start: round(num(raw.start, 0, 86400, 0)),
    inPoint, outPoint: speedRamp ? round(Math.max(inPoint + 0.04, inPoint + rampSource(speedRamp))) : outPoint,
    volume: round(num(raw.volume, 0, 1, 1)),
    muted: !!raw.muted,
  };
  if (speedRamp) clip.speedRamp = speedRamp;
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
  opt("z", raw.z, -100, 100, 0); // layer order within a track; higher draws on top
  if (raw.crop !== undefined && raw.crop !== null) {
    const cr = raw.crop as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
    const parts = [cr.x, cr.y, cr.w, cr.h];
    if (parts.every((n) => typeof n === "number" && Number.isFinite(n))) {
      const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
      const x = clamp01(cr.x as number), y = clamp01(cr.y as number);
      const w = clamp01(cr.w as number), h = clamp01(cr.h as number);
      if (w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001) clip.crop = { x, y, w, h };
    }
  }
  if(raw.fit === "cover" || raw.fit === "fill") clip.fit = raw.fit;
  if(raw.flipX) clip.flipX = true;
  if(raw.flipY) clip.flipY = true;
  if(typeof raw.label === "string" && raw.label.trim()) clip.label = raw.label.slice(0,120);
  const keyframes = normalizeKeyframes(raw.keyframes, clipDuration(clip));
  if(Object.keys(keyframes).length) clip.keyframes = keyframes;
  const expressions = normalizeExpressions(raw.expressions);
  if(Object.keys(expressions).length > 10) throw new Error("a clip accepts at most 10 expressions");
  if(Object.keys(expressions).length) clip.expressions = expressions;
  opt("textSize", raw.textSize, 2, 20, 6);
  if (FILTERS.includes(raw.filter) && raw.filter !== "none") clip.filter = raw.filter;
  if (typeof raw.textColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.textColor) && raw.textColor.toLowerCase() !== "#ffffff") clip.textColor = raw.textColor.toLowerCase();
  if (raw.textReveal && typeof raw.textReveal === "object" && text) {
    const mode = raw.textReveal.mode;
    if (mode === "typewriter" || mode === "words" || mode === "lines") {
      const duration = round(num(raw.textReveal.duration, 0.1, 60, 1.5));
      const delay = round(num(raw.textReveal.delay, 0, 60, 0));
      clip.textReveal = delay > 0 ? { mode, duration, delay } : { mode, duration };
    }
  }
  if (raw.textColorCycle && typeof raw.textColorCycle === "object" && text) {
    const steps = Array.isArray(raw.textColorCycle.steps) ? raw.textColorCycle.steps.filter((s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s)).slice(0, 8) : [];
    if (steps.length >= 2) clip.textColorCycle = { steps, duration: round(num(raw.textColorCycle.duration, 0.2, 60, 2)) };
  }
  if (raw.textBg === true) clip.textBg = true;
  if (raw.textFit === "none") clip.textFit = "none";
  opt("textMaxWidth", raw.textMaxWidth, .1, 1, .9);
  opt("textMaxHeight", raw.textMaxHeight, .05, 1, .5);
  // Text style: font family, weight, alignment, line height, letter spacing and case.
  if (raw.font !== undefined) {
    if (typeof raw.font !== "string" || !FONT_MAP.has(raw.font)) throw new Error(`font must be a catalog id such as ${FONT_IDS.slice(0, 4).join(", ")}`);
    if (raw.font !== DEFAULT_FONT) clip.font = raw.font;
  }
  if (raw.fontWeight !== undefined) {
    if (raw.fontWeight !== 400 && raw.fontWeight !== 700) throw new Error("fontWeight must be 400 or 700");
    if (raw.fontWeight === 700) {
      if (!getFont(clip.font).weights.includes(700)) throw new Error(`fontWeight 700 is not available for ${getFont(clip.font).id}`);
      clip.fontWeight = 700;
    }
  }
  if (raw.textAlign !== undefined) {
    if (raw.textAlign !== "left" && raw.textAlign !== "center" && raw.textAlign !== "right") throw new Error("textAlign must be left, center or right");
    if (raw.textAlign !== "center") clip.textAlign = raw.textAlign;
  }
  opt("lineHeight", raw.lineHeight, 1, 2, 1.4);
  if (raw.letterSpacing !== undefined) {
    const ls = round(num(raw.letterSpacing, -0.05, 0.25, 0));
    if (ls !== 0) clip.letterSpacing = ls;
  }
  if (raw.textTransform !== undefined) {
    if (raw.textTransform !== "none" && raw.textTransform !== "uppercase") throw new Error("textTransform must be none or uppercase");
    if (raw.textTransform === "uppercase") clip.textTransform = "uppercase";
  }
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

/** Export presets offered by the Studio export menu. The target sits on the short side of
 *  the frame, so 720p is 1280×720 in landscape and 720×1280 in portrait; the project aspect
 *  is always preserved. "Project" (no scaling) is the default and not listed here. */
export const EXPORT_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type ExportResolution = (typeof EXPORT_RESOLUTIONS)[number];
export function exportDimensions(project: { width: number; height: number }, target: ExportResolution): { width: number; height: number } {
  const short = Number(target.replace("p", ""));
  const aspect = project.width / Math.max(1, project.height);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1 ? { width: even(short * aspect), height: even(short) } : { width: even(short), height: even(short / aspect) };
}

// Effective values with defaults applied (normalizeClip omits defaults).
export const clipX = (c: Clip) => c.x ?? 0.5;
export const clipY = (c: Clip) => c.y ?? (!c.assetId && !c.shape ? 0.82 : 0.5);
export const clipScale = (c: Clip) => c.scale ?? (c.assetId && c.track === "overlay" ? 0.35 : 1);
export const isTextClip = (c: Clip) => !c.assetId && !c.shape;
