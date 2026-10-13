import type { Clip } from "./timeline";

export const ANIMATABLE = {
  x: { label: "Horizontal", min: 0, max: 1, step: .01, default: .5 },
  y: { label: "Vertical", min: 0, max: 1, step: .01, default: .5 },
  scale: { label: "Scale", min: .1, max: 2, step: .01, default: 1 },
  rotation: { label: "Rotation", min: -360, max: 360, step: 1, default: 0 },
  opacity: { label: "Opacity", min: 0, max: 1, step: .01, default: 1 },
  volume: { label: "Volume", min: 0, max: 1, step: .01, default: 1 },
  brightness: { label: "Brightness", min: -.5, max: .5, step: .01, default: 0 },
  contrast: { label: "Contrast", min: .5, max: 2, step: .01, default: 1 },
  saturation: { label: "Saturation", min: 0, max: 2, step: .01, default: 1 },
} as const;
export type AnimationProperty = keyof typeof ANIMATABLE;
export type Bezier = [number, number, number, number];
export const EASINGS = { linear: [0, 0, 1, 1], ease: [.25, .1, .25, 1], "ease-in": [.42, 0, 1, 1], "ease-out": [0, 0, .58, 1], "ease-in-out": [.42, 0, .58, 1], "back-out": [.34, 1.56, .64, 1] } satisfies Record<string, Bezier>;
export type Easing = keyof typeof EASINGS | "hold" | Bezier;
/** Time is relative to the clip's start, in timeline seconds. Easing belongs to the outgoing segment. */
export type Keyframe = { time: number; value: number; easing?: Easing };
export type Keyframes = Partial<Record<AnimationProperty, Keyframe[]>>;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const isProperty = (p: string): p is AnimationProperty => Object.prototype.hasOwnProperty.call(ANIMATABLE, p);
export function normalizeEasing(e: any): Easing {
  if (e === "hold" || typeof e === "string" && Object.prototype.hasOwnProperty.call(EASINGS, e)) return e;
  if (Array.isArray(e) && e.length === 4 && e.every(n => typeof n === "number" && Number.isFinite(n))) return [clamp(e[0], 0, 1), clamp(e[1], -2, 3), clamp(e[2], 0, 1), clamp(e[3], -2, 3)];
  throw new Error("easing must be a preset, hold, or [x1,y1,x2,y2] (x: 0..1, y: -2..3)");
}
export function normalizeKeyframes(raw: any, duration: number): Keyframes {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("keyframes must be a property map");
  const result: Keyframes = {};
  for (const [property, points] of Object.entries(raw)) {
    if (!isProperty(property)) throw new Error(`cannot animate ${property}`);
    if (!Array.isArray(points) || points.length > 64) throw new Error("each property accepts at most 64 keyframes");
    const meta = ANIMATABLE[property], seen = new Set<number>();
    const frames = points.map((p: any) => {
      if (!p || !Number.isFinite(p.time) || !Number.isFinite(p.value) || p.time < 0 || p.time > duration + .001) throw new Error(`invalid ${property} keyframe: time must be within clip (0..${duration}) and value finite`);
      const time = Math.round(Math.min(duration, p.time) * 1000) / 1000;
      if (seen.has(time)) throw new Error(`duplicate ${property} keyframe at ${time}`);
      seen.add(time);
      return { time, value: clamp(p.value, meta.min, meta.max), ...(p.easing === undefined ? {} : { easing: normalizeEasing(p.easing) }) };
    }).sort((a, b) => a.time - b.time);
    if (frames.length) result[property] = frames;
  }
  return result;
}
export function baseValue(c: Clip, p: AnimationProperty): number {
  if (p === "scale") return c.scale ?? (c.assetId && c.track === "overlay" ? .35 : 1);
  if (p === "y") return c.y ?? (!c.assetId && !c.shape ? .82 : .5);
  return (c as any)[p] ?? ANIMATABLE[p].default;
}
export function easingCurve(e: Easing | undefined): Bezier { return Array.isArray(e) ? e : EASINGS[e === "hold" ? "linear" : e ?? "linear"]; }
const cubic = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
export function easeAt(e: Easing | undefined, progress: number): number {
  const x = clamp(progress, 0, 1); if (e === "hold") return x >= 1 ? 1 : 0;
  const [x1, y1, x2, y2] = easingCurve(e);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (cubic(m, x1, x2) < x) lo = m; else hi = m; }
  return cubic((lo + hi) / 2, y1, y2);
}
export function valueAt(c: Clip, p: AnimationProperty, localTime: number): number {
  const frames = c.keyframes?.[p]; if (!frames?.length) return baseValue(c, p);
  if (localTime <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1]; if (localTime >= last.time) return last.value;
  const i = frames.findIndex(k => k.time > localTime), a = frames[i - 1], b = frames[i];
  const m = ANIMATABLE[p]; return clamp(a.value + (b.value - a.value) * easeAt(a.easing, (localTime - a.time) / (b.time - a.time)), m.min, m.max);
}
export function animatedValues(c: Clip, timelineTime: number) {
  const out: Record<string, number> = {};
  (Object.keys(ANIMATABLE) as AnimationProperty[]).forEach(p => { out[p] = Math.round(valueAt(c, p, timelineTime - c.start) * 10000) / 10000; });
  return out;
}
export function evaluateClip(c: Clip, timelineTime: number): Clip {
  const evaluated = { ...c }; Object.keys(c.keyframes ?? {}).forEach(p => { if (isProperty(p)) (evaluated as any)[p] = valueAt(c, p, timelineTime - c.start); }); return evaluated;
}
/** Clip animation slice. Sampled boundary segments preserve motion to 1/30s; original interior keys remain. */
export function sliceKeyframes(c: Clip, from: number, to: number): Keyframes | undefined {
  if (!c.keyframes) return undefined;
  const out: Keyframes = {};
  for (const p of Object.keys(c.keyframes) as AnimationProperty[]) {
    const src = c.keyframes[p]!;
    // Slice each segment. At cuts inside curves, bake only that segment at 30Hz.
    const times = new Set<number>([from, to, ...src.filter(k => k.time > from && k.time < to).map(k => k.time)]);
    for (let i = 0; i < src.length - 1; i++) {
      const a = src[i], b = src[i + 1];
      if ((from > a.time && from < b.time || to > a.time && to < b.time) && a.easing !== "hold") {
        const lo = Math.max(from, a.time), hi = Math.min(to, b.time);
        const n = Math.min(28, Math.max(1, Math.ceil((hi - lo) * 30)));
        for (let j = 1; j < n; j++) times.add(lo + (hi - lo) * j / n);
      }
    }
    const list = Array.from(times).sort((a,b)=>a-b).slice(0,64).map(t => {
      const original = src.find(k => Math.abs(k.time - t) < .0001);
      const seg = [...src].reverse().find(k => k.time <= t);
      const endSeg = src.find(k => k.time > t);
      const cut = seg && endSeg && (from > seg.time && from < endSeg.time || to > seg.time && to < endSeg.time);
      return { time: Math.round((t - from) * 1000)/1000, value: valueAt(c,p,t), easing: seg?.easing === "hold" ? "hold" as const : !cut && original ? original.easing : "linear" as const };
    });
    out[p] = list;
  }
  return out;
}
/** Trusted numeric expression for FFmpeg. Cubic segments are sampled at 24 intervals. */
export function animationExpression(c: Clip, p: AnimationProperty, clock = "t"): string {
  const frames = c.keyframes?.[p]; const fmt = (n:number) => String(Number(n.toFixed(6)));
  if (!frames?.length) return fmt(baseValue(c,p));
  let expression = fmt(frames[frames.length-1].value);
  for (let i = frames.length-2; i >= 0; i--) {
    const a=frames[i],b=frames[i+1],duration=b.time-a.time;
    let segment=fmt(a.value);
    if(a.easing !== "hold") {
      if(!a.easing||a.easing==="linear") segment=`${fmt(a.value)}+(${fmt(b.value-a.value)})*(${clock}-${fmt(a.time)})/${fmt(duration)}`;
      else {
        segment=fmt(b.value);
        for(let j=23;j>=0;j--) {
          const l=a.time+duration*j/24,r=a.time+duration*(j+1)/24,v0=valueAt(c,p,l),v1=valueAt(c,p,r);
          const line=`${fmt(v0)}+(${fmt(v1-v0)})*(${clock}-${fmt(l)})/${fmt(r-l)}`;
          segment=`if(lt(${clock},${fmt(r)}),${line},${segment})`;
        }
      }
    }
    expression=`if(lt(${clock},${fmt(b.time)}),${segment},${expression})`;
  }
  const m=ANIMATABLE[p]; return `clip(if(lt(${clock},${fmt(frames[0].time)}),${fmt(frames[0].value)},${expression}),${m.min},${m.max})`;
}
