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
  { id: "slide-right", label: "Slide right", description: "Arrive from the right" },
  { id: "drop", label: "Drop in", description: "Fall into place with a small overshoot" },
  { id: "bounce-in", label: "Bounce in", description: "Fall from above and bounce to rest" },
  { id: "zoom-out", label: "Zoom settle", description: "Start oversized and settle into place" },
  { id: "swing", label: "Swing in", description: "Tilted arrival that swings to rest" },
  { id: "wobble", label: "Wobble", description: "Damped side-to-side rocking" },
  { id: "rubber", label: "Rubber band", description: "Elastic squash-and-stretch pulse" },
  { id: "tada", label: "Tada", description: "Pop with a celebratory shake" },
  { id: "heartbeat", label: "Heartbeat", description: "Two quick thumps" },
  { id: "blink", label: "Blink", description: "Hard on/off flashes" },
  { id: "flash", label: "Flash", description: "Fast opacity flicker" },
  { id: "glitch", label: "Glitch", description: "Hard horizontal jumps" },
  { id: "exit-right", label: "Exit right", description: "Slide away to the right and fade" },
  { id: "exit-up", label: "Exit up", description: "Float up and fade" },
  { id: "exit-down", label: "Exit down", description: "Sink down and fade" },
  { id: "shrink-out", label: "Shrink out", description: "Scale down and fade at the clip end" },
  { id: "spin-out", label: "Spin out", description: "Rotate, shrink and fade at the clip end" },
  { id: "pop-out", label: "Pop out", description: "Wind up, then collapse and fade" },
  { id: "reveal-out", label: "Wipe out", description: "Cover the layer from right to left" },
] as const;
const EXITS = ["exit-left", "exit-right", "exit-up", "exit-down", "fade-out", "shrink-out", "spin-out", "pop-out", "reveal-out"], EMPHASIS = ["pulse", "shake", "wobble", "rubber", "tada", "heartbeat", "blink", "flash", "glitch", "zoom", "drift"];
export type PresetGroup = "entrance" | "emphasis" | "exit";
export const presetGroup = (id: string): PresetGroup => EXITS.includes(id) ? "exit" : EMPHASIS.includes(id) ? "emphasis" : "entrance";
const bounceOut = (p: number) => { const n = 7.5625, d = 2.75; return p < 1 / d ? n * p * p : p < 2 / d ? n * (p -= 1.5 / d) * p + .75 : p < 2.5 / d ? n * (p -= 2.25 / d) * p + .9375 : n * (p -= 2.625 / d) * p + .984375; };

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
    case "slide-right": keys = { x: pair(Math.min(1, x + .35 * strength), x), opacity: quick(.3) }; break;
    case "drop": keys = { y: pair(Math.max(0, y - .25 * strength), y, "back-out"), opacity: quick(.2) }; break;
    case "bounce-in": keys = { y: sampled(p => clamp(y - .3 * strength * (1 - bounceOut(p)), 0, 1)), opacity: quick(.15) }; break;
    case "zoom-out": keys = { scale: pair(Math.min(2, scale * (1 + .5 * strength)), scale, "snappy"), opacity: quick(.3) }; break;
    case "swing": keys = { rotation: sampled(p => p === 1 ? baseValue(c, "rotation") : clamp(baseValue(c, "rotation") + 25 * strength * Math.exp(-3.5 * p) * Math.cos(10 * p), -360, 360)), opacity: quick(.2) }; break;
    case "wobble": keys = { x: sampled(p => p === 1 ? x : clamp(x + .05 * strength * Math.exp(-4 * p) * Math.sin(14 * p), 0, 1)), rotation: sampled(p => p === 1 ? baseValue(c, "rotation") : clamp(baseValue(c, "rotation") + 7 * strength * Math.exp(-4 * p) * Math.sin(14 * p), -360, 360)) }; break;
    case "rubber": keys = { scale: sampled(p => p === 1 ? scale : clamp(scale * (1 + .3 * strength * Math.exp(-4 * p) * Math.sin(p * Math.PI * 6)), .1, 2)) }; break;
    case "tada": keys = { scale: sampled(p => p === 1 ? scale : clamp(scale * (1 + .12 * strength * Math.sin(p * Math.PI)), .1, 2)), rotation: sampled(p => p === 1 ? baseValue(c, "rotation") : clamp(baseValue(c, "rotation") + 6 * strength * Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 10), -360, 360)) }; break;
    case "heartbeat": keys = { scale: sampled(p => p === 1 ? scale : clamp(scale * (1 + .18 * strength * (Math.exp(-(((p - .15) / .06) ** 2)) + .7 * Math.exp(-(((p - .4) / .06) ** 2)))), .1, 2)) }; break;
    case "blink": keys = { opacity: [0, .2, .4, .6, .8].map((f, i) => ({ time: t(f), value: i % 2 ? 0 : opacity, easing: "hold" as const })).concat([{ time: t(1), value: opacity, easing: "hold" as const }]) }; break;
    case "flash": keys = { opacity: [[0, 1], [.12, 0], [.24, 1], [.4, .1], [.52, 1]].map(([f, v]) => ({ time: t(f), value: opacity * v, easing: "linear" as const })).concat([{ time: t(1), value: opacity, easing: "linear" as const }]) }; break;
    case "glitch": keys = { x: [[0, 0], [.15, .03], [.2, -.02], [.35, 0], [.4, -.04], [.62, .02], [.68, 0]].map(([f, v]) => ({ time: t(f), value: clamp(x + v * strength, 0, 1), easing: "hold" as const })).concat([{ time: t(1), value: x, easing: "hold" as const }]) }; break;
    case "exit-right": keys = { x: [{ time: Math.round((d - duration) * 1000) / 1000, value: x, easing: "ease-in" }, { time: d, value: Math.min(1, x + .35 * strength) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "exit-up": keys = { y: [{ time: Math.round((d - duration) * 1000) / 1000, value: y, easing: "ease-in" }, { time: d, value: Math.max(0, y - .2 * strength) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "exit-down": keys = { y: [{ time: Math.round((d - duration) * 1000) / 1000, value: y, easing: "ease-in" }, { time: d, value: Math.min(1, y + .2 * strength) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "shrink-out": keys = { scale: [{ time: Math.round((d - duration) * 1000) / 1000, value: scale, easing: "ease-in" }, { time: d, value: Math.max(.1, scale * (1 - .8 * Math.min(1, strength))) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "spin-out": keys = { rotation: [{ time: Math.round((d - duration) * 1000) / 1000, value: baseValue(c, "rotation"), easing: "ease-in" }, { time: d, value: clamp(baseValue(c, "rotation") + 180 * strength, -360, 360) }], scale: [{ time: Math.round((d - duration) * 1000) / 1000, value: scale, easing: "ease-in" }, { time: d, value: Math.max(.1, scale * .3) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity }, { time: d, value: 0 }] }; break;
    case "pop-out": keys = { scale: [{ time: Math.round((d - duration) * 1000) / 1000, value: scale, easing: "anticipate" }, { time: d, value: Math.max(.1, scale * .2) }], opacity: [{ time: Math.round((d - duration) * 1000) / 1000, value: opacity, easing: "ease-in" }, { time: d, value: 0 }] }; break;
    case "reveal-out": if (!c.assetId && !c.shape) throw new Error("wipe out applies to media and shape clips; use fade-out for text"); keys = { reveal: [{ time: Math.round((d - duration) * 1000) / 1000, value: 1, easing: "ease-in" }, { time: d, value: 0 }] }; break;
    default: throw new Error("unknown motion preset");
  }
  // Small windows may round sampled times together; retain the last sample at each ms.
  for (const p of Object.keys(keys) as AnimationProperty[]) keys[p] = Array.from(new Map(keys[p]!.map(k => [k.time, k] as [number, Keyframe])).values());
  return { keyframes: { ...c.keyframes, ...keys } };
}
export type TitlePreset = { id: string; label: string; text: string; textSize: number; y: number; textBg: boolean; font?: string; fontWeight?: 400 | 700; lineHeight?: number; textTransform?: "none" | "uppercase" };
export const TITLE_PRESETS: TitlePreset[] = [
  {id:"headline",label:"Headline",text:"Your story starts here",textSize:10,y:.5,textBg:false,font:"playfair-display",fontWeight:700},
  {id:"lower-third",label:"Lower third",text:"Name · Your role",textSize:5,y:.82,textBg:true,font:"inter",fontWeight:700},
  {id:"caption",label:"Caption",text:"Add your caption",textSize:4,y:.88,textBg:true,font:"lato"},
  {id:"chapter",label:"Chapter card",text:"01, A new chapter",textSize:8,y:.5,textBg:true,font:"cinzel"},
  {id:"poster",label:"Poster shout",text:"MAKE IT LOUD",textSize:12,y:.5,textBg:false,font:"anton",textTransform:"uppercase"},
  {id:"note",label:"Handwritten note",text:"written by hand",textSize:6,y:.8,textBg:false,font:"caveat",lineHeight:1.3},
  {id:"quote",label:"Quote",text:"“Simplicity is the ultimate sophistication.”",textSize:5,y:.5,textBg:false,font:"lora",lineHeight:1.5},
];
