import { ANIMATABLE, EASINGS } from "./animation";
import { FILTERS, MAX_CLIPS, RESOLUTIONS } from "./timeline";
import { MOTION_PRESETS, TITLE_PRESETS } from "./presets";

/** Machine-readable description of what the editor and API can do. Served at GET /api/capabilities. */
export function capabilities() {
  return {
    version: 3,
    overview: "Timeline coordinates are seconds. Keyframe time is relative to the clip start. Layer order: video track, overlay track, then text. Use ops with ops[] for atomic batches, GET /frame to look at the result, and GET /state to read animated values.",
    limits: { maxClips: MAX_CLIPS, maxKeyframesPerProperty: 64, maxOpsPerRequest: 100, maxSpeed: 4, minSpeed: .25, minClipSeconds: .1 },
    tracks: { video: "full-frame footage and images, fitted into the canvas", overlay: "picture-in-picture clips and titles above the video", audio: "music and voice-over" },
    animatableProperties: ANIMATABLE,
    easings: { presets: Object.keys(EASINGS).concat("hold"), custom: "[x1,y1,x2,y2] cubic-bezier, x 0..1 and y -2..3 (overshoot allowed)" },
    filters: FILTERS,
    canvases: RESOLUTIONS,
    clipFields: {
      timing: ["start", "inPoint", "outPoint", "speed", "fadeIn", "fadeOut"],
      transform: ["x", "y", "scale", "rotation", "fit", "flipX", "flipY", "opacity", "blur"],
      color: ["filter", "brightness", "contrast", "saturation"],
      audio: ["volume", "muted"],
      text: ["text", "textSize", "textColor", "textBg"],
      meta: ["label", "keyframes"],
    },
    motionPresets: MOTION_PRESETS,
    titlePresets: TITLE_PRESETS,
    ops: {
      add_clip: "assetId, track?, start?, inPoint?, outPoint?, plus any clip field",
      add_text_clip: "text, start?, duration?, plus text and transform fields",
      remove_clip: "clipId", ripple_delete: "clipId", duplicate_clip: "clipId, start?",
      trim_clip: "clipId, inPoint?, outPoint?", move_clip: "clipId, start?, track?",
      split_clip: "clipId, at (timeline seconds)", update_clip: "clipId plus any clip field",
      set_audio: "clipId, volume?, muted?", add_text: "clipId, text",
      set_keyframes: "clipId, property, keyframes: [{time,value,easing?}] replaces that property; [] clears it",
      upsert_keyframe: "clipId, property, time, value, easing?", remove_keyframe: "clipId, property, time",
      apply_motion: "clipId, preset (see motionPresets)",
      set_track: "track, settings: {muted?, hidden?, locked?}",
      add_marker: "time, label?, color?", remove_marker: "id",
      set_project: "fps?, resolution?: {width,height}, background?: #rrggbb",
      reorder: "order: [clipId...] re-spaces video clips sequentially",
    },
    endpoints: {
      "GET /api/projects/:id/frame?t=SECONDS&width=960": "PNG of the composed frame",
      "GET /api/projects/:id/state?t=SECONDS": "evaluated animated values for clips active at t",
      "POST /api/projects/:id/timeline/ops": "{op,args} or {ops:[...]}",
    },
  };
}
