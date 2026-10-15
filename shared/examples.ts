import { applyTimelineOp, type TimelineOp } from "./editing";
import { normalizeTimeline, timelineDuration, type Timeline } from "./timeline";
import { MOTION_PRESETS, presetGroup, type PresetGroup } from "./presets";
import { CODE_RECIPES } from "./expr";

/**
 * Asset-free example compositions. Each one is a plain list of timeline ops that
 * can be POSTed to /api/projects/:id/timeline/ops as {"ops": [...]}.
 * They power the live gallery in the docs, the README GIFs (script/render-examples.ts)
 * and the regression tests, so a broken example fails CI.
 */
export type Example = { id: string; title: string; summary: string; features: string[]; background: string; ops: TimelineOp[] };

const palette = ["#f6a447", "#ff6b6b", "#7cc4ff", "#4ade80", "#c4b7ef", "#fcd34d", "#f472b6"];

function samplerOps(group: PresetGroup): TimelineOp[] {
  const ops: TimelineOp[] = [];
  MOTION_PRESETS.filter(p => presetGroup(p.id) === group).forEach((preset, i) => {
    const col = i % 5, row = Math.floor(i / 5), x = .14 + .18 * col, y = .2 + .3 * row, id = `s-${preset.id}`;
    ops.push({ op: "add_shape_clip", args: { id, x, y, duration: 4, label: preset.label, shape: { type: "rectangle", width: .07, height: .124, fill: palette[i % palette.length], radius: 14 } } });
    ops.push({ op: "add_text_clip", args: { id: `${id}-label`, text: preset.id, x, y: y + .12, textSize: 3, duration: 4 } });
    ops.push({ op: "apply_motion", args: { clipId: id, preset: preset.id, delay: group === "emphasis" ? 1.2 : .3 } });
  });
  return ops;
}
function recipeOps(): TimelineOp[] {
  const ops: TimelineOp[] = [];
  CODE_RECIPES.forEach((r, i) => {
    const col = i % 5, row = Math.floor(i / 5), x = .14 + .18 * col, y = .2 + .3 * row, id = `r-${r.id}`;
    ops.push({ op: "add_shape_clip", args: { id, x, y, duration: 5, label: r.label, shape: { type: "rectangle", width: .07, height: .124, fill: palette[i % palette.length], radius: 14 } } });
    ops.push({ op: "add_text_clip", args: { id: `${id}-label`, text: r.id, x, y: y + .12, textSize: 3, duration: 5 } });
    ops.push({ op: "apply_code_motion", args: { clipId: id, recipe: r.id } });
  });
  return ops;
}
function orbitOps(): TimelineOp[] {
  const planets: [string, number, number, string][] = [["p1", .12, 1.6, "#7cc4ff"], ["p2", .2, 1.1, "#ff6b6b"], ["p3", .29, .7, "#4ade80"]];
  return [
    { op: "add_shape_clip", args: { id: "sun", x: .5, y: .5, duration: 6, shape: { type: "ellipse", width: .09, height: .16, fill: "#f6a447" } } },
    { op: "animate_code", args: { clipId: "sun", expressions: { scale: "base * (1 + 0.06 * sin(t * 3))" } } },
    ...planets.flatMap(([id, r, speed, fill]) => [
      { op: "add_shape_clip", args: { id, x: .5, y: .5, duration: 6, shape: { type: "ellipse", width: .04, height: .071, fill } } },
      { op: "animate_code", args: { clipId: id, expressions: { x: `0.5 + ${r} * 0.5625 * cos(t * ${speed * 2})`, y: `0.5 + ${r} * sin(t * ${speed * 2})` } } },
    ] as TimelineOp[]),
    { op: "add_text_clip", args: { id: "caption", text: "x: 0.5 + r * cos(t * speed)", y: .9, textSize: 3.6, textColor: "#a4a1a0", duration: 6 } },
    { op: "add_text_clip", args: { id: "head", text: "Animate with code", y: .1, textSize: 6, duration: 6 } },
    { op: "apply_motion", args: { clipId: "head", preset: "rise", duration: .6 } },
  ] as TimelineOp[];
}

export const EXAMPLES: Example[] = [
  { id: "preset-sampler", title: "Entrance presets", background: "#17191b",
    summary: "Every entrance preset side by side: slides, springs, bounces, wipes and fades, each one a handful of editable keyframes.",
    features: ["13 entrance presets", "apply_motion delay + duration", "wipe reveal", "damped spring"],
    ops: samplerOps("entrance") },
  { id: "emphasis-sampler", title: "Emphasis presets", background: "#17191b",
    summary: "Pulse, shake, wobble, rubber band, tada, heartbeat, blink, flash, glitch and more: beats that draw the eye to a layer that is already on screen.",
    features: ["11 emphasis presets", "sampled keyframes", "hold easing"],
    ops: samplerOps("emphasis") },
  { id: "exit-sampler", title: "Exit presets", background: "#17191b",
    summary: "Nine ways to leave: slides, shrinks, spins, pops and wipes that finish exactly at the end of the clip.",
    features: ["9 exit presets", "ends at clip end", "reveal-out"],
    ops: samplerOps("exit") },
  { id: "code-orbit", title: "Orbit with code", background: "#0f1020",
    summary: "A sun and three planets driven only by expressions of time. No keyframes, so the motion never runs out.",
    features: ["animate_code", "sin / cos", "base + t"],
    ops: orbitOps() },
  { id: "loop-recipes", title: "Looping code recipes", background: "#14161a",
    summary: "Thirteen ready-made looping behaviours: float, orbit, wiggle, heartbeat, glitch and more, each a single apply_code_motion call.",
    features: ["apply_code_motion", "13 recipes", "wiggle noise"],
    ops: recipeOps() },
  { id: "fit-demo", title: "Text that always fits", background: "#17191b",
    summary: "A headline far too long for one line wraps and shrinks to fit, while an oversized card and a stray caption are pulled back into the frame with fit_all.",
    features: ["textFit auto", "fit_all", "wrap + shrink"],
    ops: [
      { op: "add_shape_clip", args: { id: "card", x: .93, y: .5, scale: 2, duration: 5, shape: { type: "rectangle", width: .5, height: .5, fill: "#2a2d33", radius: 24 } } },
      { op: "add_text_clip", args: { id: "headline", text: "This headline is much too long for a single line but it wraps and shrinks until it fits", textSize: 11, duration: 5, y: .4 } },
      { op: "add_text_clip", args: { id: "stray", text: "A caption pushed against the right edge that would otherwise be cut off", x: .97, y: .86, textSize: 4.5, textColor: "#f6a447", textFit: "none", duration: 5 } },
      { op: "fit_all", args: { clipIds: ["card", "stray"] } },
      { op: "apply_motion", args: { clipId: "headline", preset: "rise", duration: .6 } },
    ] },
  { id: "bullet-points", title: "Bullet list", background: "#13171a",
    summary: "A headline and four points that slide in one after another.",
    features: ["bullet-list", "items[]", "stagger"],
    ops: [{ op: "add_motion_template", args: { template: "bullet-list", title: "Why VideoForge", items: ["Scriptable timelines", "Animation by code", "Everything fits", "Renders with FFmpeg"], color: "#4ade80", duration: 5, idPrefix: "bl" } }] },
  { id: "starburst-badge", title: "Starburst badge", background: "#181414",
    summary: "A rocking two-square burst with a label, rocked by an expression instead of keyframes.",
    features: ["starburst", "expressions", "back-out easing"],
    ops: [{ op: "add_motion_template", args: { template: "starburst", title: "NEW", color: "#ff6b6b", duration: 4, idPrefix: "sb" } }] },
  { id: "chapter-opener", title: "Chapter number", background: "#1d1a24",
    summary: "A huge chapter number, a rule and the chapter title.",
    features: ["chapter-number", "number option"],
    ops: [{ op: "add_motion_template", args: { template: "chapter-number", number: "03", title: "Motion that fits", subtitle: "Chapter three", color: "#c4b7ef", duration: 4, idPrefix: "cn" } }] },
  { id: "social-handle", title: "Social handle", background: "#17191b",
    summary: "A rounded pill wipes open around a handle with a call to action beneath it.",
    features: ["social-handle", "reveal on a rounded shape"],
    ops: [{ op: "add_motion_template", args: { template: "social-handle", title: "@videoforge", subtitle: "Follow for more", color: "#f6a447", duration: 4, idPrefix: "sh" } }] },
  { id: "lower-third-reveal", title: "Lower third with wipe reveal", background: "#1b1d20",
    summary: "The classic nameplate, with the plate wiping open and each line rising in on its own delay.",
    features: ["add_motion_template", "reveal property", "per-layer delay"],
    ops: [
      { op: "add_motion_template", args: { template: "lower-third", title: "Ada Lovelace", subtitle: "First computer programmer", color: "#f6a447", duration: 4.5, idPrefix: "lt" } },
      { op: "apply_motion", args: { clipId: "lt-0", preset: "reveal", duration: .7 } },
      { op: "apply_motion", args: { clipId: "lt-1", preset: "rise", delay: .25, duration: .55 } },
      { op: "apply_motion", args: { clipId: "lt-2", preset: "rise", delay: .45, duration: .55 } },
    ] },
  { id: "kinetic-whip", title: "Kinetic type with whip-ins", background: "#14161a",
    summary: "A headline whips in word by word using one sequenced preset instead of hand-placed keyframes.",
    features: ["kinetic-type", "apply_motion_sequence", "anticipate easing"],
    ops: [
      { op: "add_motion_template", args: { template: "kinetic-type", title: "Motion made simple", color: "#7cc4ff", duration: 4, idPrefix: "k" } },
      { op: "apply_motion_sequence", args: { clipIds: ["k-0", "k-1", "k-2"], preset: "whip", stagger: .22, start: .2, duration: .6 } },
    ] },
  { id: "quote-card", title: "Quote card", background: "#1d1a24",
    summary: "A springing quotation mark, a rising quote and an attribution rule.",
    features: ["quote-card", "spring preset", "idPrefix"],
    ops: [
      { op: "add_motion_template", args: { template: "quote-card", title: "Make it move.", subtitle: "Every great edit", color: "#c4b7ef", duration: 5, idPrefix: "qc" } },
      { op: "apply_motion", args: { clipId: "qc-0", preset: "spring", duration: 1 } },
    ] },
  { id: "split-reveal", title: "Split reveal chapter title", background: "#181414",
    summary: "Two accent rules wipe open and a headline rises between them.",
    features: ["split-reveal", "reveal keyframes", "snappy easing"],
    ops: [{ op: "add_motion_template", args: { template: "split-reveal", title: "Chapter One", subtitle: "The story begins", color: "#ff6b6b", duration: 4, idPrefix: "sr" } }] },
  { id: "progress-bar", title: "Progress bar", background: "#13171a",
    summary: "A rounded track fills to 100 percent using a reveal keyframe on a shape.",
    features: ["progress-bar", "reveal on shapes"],
    ops: [{ op: "add_motion_template", args: { template: "progress-bar", title: "Rendering your film", subtitle: "Almost there", color: "#4ade80", duration: 5, idPrefix: "pb" } }] },
  { id: "stat-highlight", title: "Stat highlight", background: "#17191b",
    summary: "A big number inside a springing accent ring with a supporting caption.",
    features: ["stat-highlight", "ellipse stroke", "back-out easing"],
    ops: [{ op: "add_motion_template", args: { template: "stat-highlight", title: "98%", subtitle: "of renders finish first try", color: "#f6a447", duration: 4, idPrefix: "st" } }] },
  { id: "beat-drop", title: "Beat-synced circles", background: "#0f1020",
    summary: "Four circles spring in one beat apart at 120 BPM and leave together. Beat markers show up on the Studio timeline.",
    features: ["add_beat_markers", "apply_motion_sequence", "spring preset"],
    ops: [
      { op: "add_beat_markers", args: { bpm: 120, count: 8, color: "#f6a447" } },
      ...[0, 1, 2, 3].map(i => ({ op: "add_shape_clip", args: { id: `b${i}`, x: .2 + .2 * i, y: .46, duration: 4 - i * .5, shape: { type: "ellipse", width: .11, height: .196, fill: palette[i * 2 % palette.length] } } })),
      { op: "apply_motion_sequence", args: { clipIds: ["b0", "b1", "b2", "b3"], preset: "spring", stagger: .5, start: 0, duration: .9 } },
      { op: "add_text_clip", args: { id: "bpm", text: "120 BPM", y: .82, textSize: 4, duration: 4 } },
    ] },
];

export const exampleDuration = (e: Example) => timelineDuration(buildExample(e));

/** Applies an example's ops to an empty 16:9 composition. */
export function buildExample(e: Example, resolution = { width: 1280, height: 720 }): Timeline {
  let t = normalizeTimeline({ clips: [], resolution, background: e.background, fps: 30 });
  for (const op of e.ops) t = applyTimelineOp(t, op, () => undefined);
  return t;
}
