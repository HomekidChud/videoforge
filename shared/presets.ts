import { baseValue, clamp, type AnimationProperty, type Keyframe, type Keyframes } from "./animation";
import { motionTiming, type MotionOptions } from "./motion";
import { type Clip } from "./timeline";
export const MOTION_PRESETS = [
  { id: "fade", label: "Fade in", description: "Soft opacity entrance" },
  { id: "slide-left", label: "Slide left", description: "Arrive from the left" },
  { id: "rise", label: "Rise", description: "Lift into position" },
  { id: "zoom", label: "Slow zoom", description: "Gentle push-in across the clip" },
  { id: "pop", label: "Pop", description: "Scale with an overshoot" },
  { id: "drift", label: "Drift", description: "Slow pan across the clip" },
  { id: "spring", label: "Spring", description: "Damped, bouncing scale entrance" },
  { id: "whip", label: "Whip in", description: "Fast right-to-left arrival with anticipation" },
  { id: "spin", label: "Spin in", description: "Rotation and scale settle together" },
  { id: "pulse", label: "Pulse", description: "One smooth emphasis beat" },
  { id: "shake", label: "Shake", description: "Damped horizontal impact" },
  { id: "reveal", label: "Wipe reveal", description: "Uncover the layer from left to right" },
  { id: "exit-left", label: "Exit left", description: "Slide away and fade at the clip end" },
  { id: "fade-out", label: "Fade out", description: "Fade at the clip end" },
] as const;

/** Presets compile to bounded, editable keys shared by browser and FFmpeg. */
export function motionPreset(c: Clip, preset: string, options: MotionOptions = {}): Partial<Clip> {
  const { total: d, duration, delay, strength } = motionTiming(c, options);
  const x = baseValue(c, "x"), y = baseValue(c, "y"), scale = baseValue(c, "scale"), opacity = baseValue(c, "opacity");
  const t = (fraction: number) => Math.round((delay + duration * fraction) * 1000) / 1000;
  const pair = (a: number, b: number, easing: Keyframe["easing"] = "ease-out"): Keyframe[] => [{ time: t(0), value: a, easing }, { time: t(1), value: b }];
  const fade = () => pair(0, opacity);
  // Short opacity ramp used alongside movement so the layer is visible while it travels.
  const quick = (length: number): Keyframe[] => [{ time: t(0), value: 0 }, { time: Math.round((delay + Math.min(length, duration)) * 1000) / 1000, value: opacity }];
  const sampled = (fn: (p: number) => number): Keyframe[] => Array.from({ length: 25 }, (_, i) => ({ time: t(i / 24), value: fn(i / 24), easing: "linear" }));
  let keys: Keyframes;
  switch (preset) {
    case "fade": keys = { opacity: fade() }; break;
    case "slide-left": keys = { x: pair(Math.max(0, x - .35 * strength), x), opacity: quick(.3) }; break;
    case "rise": keys = { y: pair(Math.min(1, y + .2 * strength), y), opacity: quick(.3) }; break;
    case "zoom": keys = { scale: [{ time: delay, value: scale, easing: "ease-in-out" }, { time: options.duration === undefined ? d : t(1), value: Math.min(2, scale * (1 + .2 * strength)) }] }; break;
    case "pop": keys = { scale: pair(Math.max(.1, scale * (1 - .5 * strength)), scale, "back-out"), opacity: quick(.2) }; break;
    case "drift": keys = { x: [{ time: delay, value: Math.max(0, x - .1 * strength), easing: "ease-in-out" }, { time: options.duration === undefined ? d : t(1), value: Math.min(1, x + .1 * strength) }] }; break;
    case "spring": keys = { scale: sampled(p => p === 1 ? scale : clamp(scale * (1 - .8 * strength * Math.exp(-7 * p) * Math.cos(12 * p)), .1, 2)), opacity: fade() }; break;
    case "whip": keys = { x: pair(Math.min(1, x + .45 * strength), x, "anticipate"), opacity: fade() }; break;
    case "spin": keys = { rotation: pair(clamp(baseValue(c, "rotation") - 120 * strength, -360, 360), baseValue(c, "rotation"), "snappy"), scale: pair(Math.max(.1, scale * .4), scale, "back-out"), opacity: fade() }; break;
    case "pulse": keys = { scale: [{ time: t(0), value: scale, easing: "ease-in-out" }, { time: t(.5), value: Math.min(2, scale * (1 + .2 * strength)), easing: "ease-in-out" }, { time: t(1), value: scale }] }; break;
    case "shake": keys = { x: sampled(p => p === 1 ? x : clamp(x + Math.sin(p * Math.PI * 8) * .04 * strength * (1 - p) ** 2, 0, 1)) }; break;
    case "reveal": if (!c.assetId && !c.shape) throw new Error("wipe reveal applies to media and shape clips; use fade or rise for text"); keys = { reveal: pair(0, 1, "snappy") }; break;
    case "exit-left": keys = { x: [{ time: Math.round((d - duration) * 1000) / 1000, value: x, easing: "ease-in" }, { time: d, value: Math.max(0, x - .35 * strength) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "fade-out": keys = { opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity, easing: "ease-in" }, { time: d, value: 0 }] }; break;
    default: throw new Error("unknown motion preset");
  }
  // Small windows may round sampled times together; retain the last sample at each ms.
  for (const p of Object.keys(keys) as AnimationProperty[]) keys[p] = Array.from(new Map(keys[p]!.map(k => [k.time, k] as [number, Keyframe])).values());
  return { keyframes: { ...c.keyframes, ...keys } };
}
export const TITLE_PRESETS = [
  {id:"headline",label:"Headline",text:"Your story starts here",textSize:10,y:.5,textBg:false},
  {id:"lower-third",label:"Lower third",text:"Name · Your role",textSize:5,y:.82,textBg:true},
  {id:"caption",label:"Caption",text:"Add your caption",textSize:4,y:.88,textBg:true},
  {id:"chapter",label:"Chapter card",text:"01 — A new chapter",textSize:8,y:.5,textBg:true},
] as const;
