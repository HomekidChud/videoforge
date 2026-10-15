import { applyTimelineOp, type TimelineOp } from "./editing";
import { normalizeTimeline, timelineDuration, type Timeline } from "./timeline";
import { MOTION_PRESETS } from "./presets";

/**
 * Asset-free example compositions. Each one is a plain list of timeline ops that
 * can be POSTed to /api/projects/:id/timeline/ops as {"ops": [...]}.
 * They power the live gallery in the docs, the README GIFs (script/render-examples.ts)
 * and the regression tests, so a broken example fails CI.
 */
export type Example = { id: string; title: string; summary: string; features: string[]; background: string; ops: TimelineOp[] };

const palette = ["#f6a447", "#ff6b6b", "#7cc4ff", "#4ade80", "#c4b7ef", "#fcd34d", "#f472b6"];

function samplerOps(): TimelineOp[] {
  const ops: TimelineOp[] = [];
  MOTION_PRESETS.forEach((preset, i) => {
    const col = i % 5, row = Math.floor(i / 5), x = .14 + .18 * col, y = .2 + .3 * row, id = `s-${preset.id}`;
    ops.push({ op: "add_shape_clip", args: { id, x, y, duration: 4, label: preset.label, shape: { type: "rectangle", width: .07, height: .124, fill: palette[i % palette.length], radius: 14 } } });
    ops.push({ op: "add_text_clip", args: { id: `${id}-label`, text: preset.id, x, y: y + .12, textSize: 3, duration: 4 } });
    ops.push({ op: "apply_motion", args: { clipId: id, preset: preset.id, delay: ["pulse", "shake"].includes(preset.id) ? 1.4 : .3 } });
  });
  return ops;
}

export const EXAMPLES: Example[] = [
  { id: "preset-sampler", title: "Preset sampler", background: "#17191b",
    summary: "All fourteen motion presets side by side: entrances, emphasis beats and exits, each one a handful of editable keyframes.",
    features: ["14 motion presets", "apply_motion delay + duration", "wipe reveal", "damped spring"],
    ops: samplerOps() },
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
