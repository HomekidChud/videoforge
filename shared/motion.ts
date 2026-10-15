import { ANIMATABLE, easingCurve, type AnimationProperty, type Easing, type Keyframes } from "./animation";
import { clipDuration, type Clip } from "./timeline";

export type MotionOptions = { duration?: number; delay?: number; strength?: number };
export function motionTiming(c: Clip, options: MotionOptions = {}) {
  const total = clipDuration(c);
  const finite = (n: unknown, name: string, min: number, max: number, fallback: number) => {
    if (n === undefined) return fallback;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be ${min}..${max}`);
    return n;
  };
  const delay = finite(options.delay, "motion delay", 0, Math.max(0, total - .01), 0);
  const duration = finite(options.duration, "motion duration", .01, total - delay, Math.min(.8, total - delay));
  const strength = finite(options.strength, "motion strength", .1, 2, 1);
  return { total, delay, duration, strength };
}

/** Time reversal includes outgoing easing; step-start is the mirror of hold. */
export function reverseAnimation(c: Clip): Keyframes {
  const duration = clipDuration(c), out: Keyframes = {};
  const reverseEase = (e: Easing | undefined): Easing => {
    if (e === "hold") return "step-start";
    if (e === "step-start") return "hold";
    const [x1, y1, x2, y2] = easingCurve(e);
    const r = (n: number) => Math.round(n * 10000) / 10000;
    return [r(1 - x2), r(1 - y2), r(1 - x1), r(1 - y1)];
  };
  for (const p of Object.keys(c.keyframes ?? {}) as AnimationProperty[]) {
    const frames = c.keyframes![p]!;
    out[p] = frames.map((k, i) => ({ time: Math.round((duration - k.time) * 1000) / 1000, value: k.value,
      ...(i > 0 ? { easing: reverseEase(frames[i - 1].easing) } : {}) })).reverse();
  }
  return out;
}

/** Move/scale every property together without changing the clip or its media speed. */
export function retimeAnimation(c: Clip, duration: number, delay = 0): Keyframes {
  if (!Number.isFinite(duration) || duration < .01 || !Number.isFinite(delay) || delay < 0 || delay + duration > clipDuration(c) + 1e-6) throw new Error("animation window must fit within the clip (duration >= 0.01, delay >= 0)");
  const all = Object.values(c.keyframes ?? {}).flat();
  if (!all.length) throw new Error("clip has no animation to retime");
  const first = Math.min(...all.map(k => k.time)), span = Math.max(...all.map(k => k.time)) - first;
  if (span <= 0) throw new Error("retiming needs at least two different keyframe times");
  const out: Keyframes = {};
  for (const p of Object.keys(ANIMATABLE) as AnimationProperty[]) if (c.keyframes?.[p]) {
    out[p] = c.keyframes[p]!.map(k => ({ ...k, time: Math.round((delay + (k.time - first) / span * duration) * 1000) / 1000 }));
    if (new Set(out[p]!.map(k => k.time)).size !== out[p]!.length) throw new Error("retime window is too short for millisecond keyframe precision");
  }
  return out;
}

export function beatTimes(bpm: number, count: number, start = 0, every = 1): number[] {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error("bpm must be 20..300");
  if (!Number.isFinite(start) || start < 0 || start > 86400) throw new Error("beat start must be 0..86400");
  if (!Number.isInteger(every) || every < 1 || every > 16) throw new Error("every must be an integer 1..16");
  return Array.from({ length: count }, (_, i) => Math.round((start + i * 60 / bpm * every) * 1000) / 1000);
}
