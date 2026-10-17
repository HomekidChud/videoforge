import { ANIMATABLE, baseValue, clamp, isAnimated, valueAt, easeAt, normalizeKeyframes, type Easing, type Keyframe, type Keyframes } from "./animation";
import { clipDuration, type Clip } from "./timeline";

/**
 * Clip rigs.
 *
 * A rig turns ordinary clips (video, images, text, shapes) into puppet parts. Each part has a
 * joint (its pivot), may hang off a parent part, and carries a local track of keyframes in
 * animation time. Nothing here changes how clips render: a rig is baked into the plain
 * keyframes every clip already has, so previews, exports and the API behave exactly as before.
 *
 * Joint space. A part's pose is described at its joint, not its centre:
 *   x, y      where the joint sits in the frame (0..1)
 *   rotation  degrees clockwise about the joint
 *   scale     size multiplier of the clip
 *   opacity   0..1
 * The clip's centre follows from the joint: centre = joint + (scale / restScale) · R(rotation) · (-pivot).
 * With the pivot at (0, 0) the joint is the centre and joint space equals ordinary clip space.
 *
 * Hierarchy. A child's own track is authored as if its parent never moved. The parent's motion
 * is then applied on top: the child's joint is rotated and scaled about the parent's joint by how far the
 * parent has moved from its rest pose, so a forearm follows an upper arm that swings.
 */

export const RIG_PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;
export type RigProp = typeof RIG_PROPS[number];
export type RigPose = Record<RigProp, number>;
export type RigTrack = Partial<Record<RigProp, Keyframe[]>>;

export type RigPart = {
  clipId: string;
  name: string;
  kind: "media" | "text" | "shape";
  parentId?: string;
  /** Joint offset from the clip's centre when at rest, as a fraction of the frame width / height. */
  pivotX: number;
  pivotY: number;
};

export type RigAnimation = {
  id: string;
  name: string;
  /** Animation length in seconds. */
  length: number;
  /** Timeline second where the animation starts. */
  start: number;
  loop: boolean;
  parts: RigPart[];
  /** Clip pose before any animation; joint space is derived from it. */
  rest: Record<string, RigPose>;
  /** Local keyframes per part, time in animation seconds. */
  tracks: Record<string, RigTrack>;
};

export type Resolution = { width: number; height: number };

const MAX_PARTS = 40;
const MAX_LENGTH = 60;
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** What a pose means for each property when baking: how much error is invisible. */
const TOLERANCE: Record<RigProp, number> = { x: 0.0015, y: 0.0015, scale: 0.004, rotation: 0.4, opacity: 0.01 };

export function restPose(c: Clip): RigPose {
  return {
    x: baseValue(c, "x"),
    y: baseValue(c, "y"),
    scale: baseValue(c, "scale"),
    rotation: baseValue(c, "rotation"),
    opacity: baseValue(c, "opacity"),
  };
}

export const partKind = (c: Clip): RigPart["kind"] => (c.shape ? "shape" : c.assetId ? "media" : "text");

export function partName(c: Clip): string {
  const label = (c.label ?? c.text ?? "").trim();
  if (label) return label.slice(0, 28);
  return c.shape ? c.shape.type : c.assetId ? "Clip" : "Text";
}

export function newAnimation(id: string, name: string, start: number, length = 2): RigAnimation {
  return { id, name, length: clamp(length, 0.2, MAX_LENGTH), start: Math.max(0, start), loop: true, parts: [], rest: {}, tracks: {} };
}

/** Add clips as parts. Already-present clips are ignored; audio clips cannot be rigged. */
export function addParts(anim: RigAnimation, clips: Clip[]): RigAnimation {
  const next: RigAnimation = { ...anim, parts: [...anim.parts], rest: { ...anim.rest }, tracks: { ...anim.tracks } };
  for (const c of clips) {
    if (c.track === "audio" || next.parts.some((p) => p.clipId === c.id)) continue;
    if (next.parts.length >= MAX_PARTS) throw new Error(`a rig holds at most ${MAX_PARTS} parts`);
    next.parts.push({ clipId: c.id, name: partName(c), kind: partKind(c), pivotX: 0, pivotY: 0 });
    next.rest[c.id] = restPose(c);
  }
  return next;
}

export function removePart(anim: RigAnimation, clipId: string): RigAnimation {
  const tracks = { ...anim.tracks }; delete tracks[clipId];
  const rest = { ...anim.rest }; delete rest[clipId];
  return {
    ...anim, tracks, rest,
    parts: anim.parts.filter((p) => p.clipId !== clipId).map((p) => (p.parentId === clipId ? { ...p, parentId: undefined } : p)),
  };
}

/** True when `parentId` is the part itself or hangs below it. */
export function wouldCycle(anim: RigAnimation, childId: string, parentId: string): boolean {
  let at: string | undefined = parentId; let guard = 0;
  while (at && guard++ < MAX_PARTS + 2) {
    if (at === childId) return true;
    at = anim.parts.find((p) => p.clipId === at)?.parentId;
  }
  return false;
}

export function setParent(anim: RigAnimation, childId: string, parentId: string | undefined): RigAnimation {
  if (parentId && !anim.parts.some((p) => p.clipId === parentId)) throw new Error("parent is not part of this rig");
  if (parentId && wouldCycle(anim, childId, parentId)) throw new Error("a part cannot be its own ancestor");
  return { ...anim, parts: anim.parts.map((p) => (p.clipId === childId ? { ...p, parentId } : p)) };
}

export function setPivot(anim: RigAnimation, clipId: string, pivotX: number, pivotY: number): RigAnimation {
  return { ...anim, parts: anim.parts.map((p) => (p.clipId === clipId ? { ...p, pivotX: clamp(pivotX, -1, 1), pivotY: clamp(pivotY, -1, 1) } : p)) };
}

/** Parts ordered parents-first with their depth, for drawing the explorer tree. */
export function partTree(anim: RigAnimation): { part: RigPart; depth: number }[] {
  const out: { part: RigPart; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | undefined, depth: number) => {
    for (const p of anim.parts) {
      if ((p.parentId ?? undefined) !== parentId || seen.has(p.clipId)) continue;
      seen.add(p.clipId); out.push({ part: p, depth }); walk(p.clipId, depth + 1);
    }
  };
  walk(undefined, 0);
  for (const p of anim.parts) if (!seen.has(p.clipId)) out.push({ part: p, depth: 0 });
  return out;
}

// ---- Keyframe evaluation ---------------------------------------------------------------------

export function sampleFrames(frames: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!frames?.length) return fallback;
  if (t <= frames[0].time) return frames[0].value;
  const last = frames[frames.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      return span <= 0 ? b.value : a.value + (b.value - a.value) * easeAt(a.easing, (t - a.time) / span);
    }
  }
  return last.value;
}

// ---- Joint space -----------------------------------------------------------------------------

const part = (anim: RigAnimation, id: string) => anim.parts.find((p) => p.clipId === id);
const restOf = (anim: RigAnimation, id: string): RigPose => anim.rest[id] ?? { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };

/** The joint's position in pixels for a clip pose. */
function jointOf(p: RigPart, clip: RigPose, rest: RigPose, res: Resolution): { x: number; y: number } {
  const o = { x: p.pivotX * res.width, y: p.pivotY * res.height };
  const s = clip.scale / (rest.scale || 1), a = rad(clip.rotation);
  const rx = o.x * Math.cos(a) - o.y * Math.sin(a), ry = o.x * Math.sin(a) + o.y * Math.cos(a);
  return { x: clip.x * res.width + s * rx, y: clip.y * res.height + s * ry };
}

/** Joint-space pose of a part at rest. */
export function restJoint(anim: RigAnimation, id: string, res: Resolution): RigPose {
  const p = part(anim, id), r = restOf(anim, id);
  if (!p) return r;
  const j = jointOf(p, r, r, res);
  return { ...r, x: j.x / res.width, y: j.y / res.height };
}

/** Clip pose (centre based) for a joint-space pose. */
export function toClipPose(p: RigPart, joint: RigPose, rest: RigPose, res: Resolution): RigPose {
  const o = { x: p.pivotX * res.width, y: p.pivotY * res.height };
  const s = joint.scale / (rest.scale || 1), a = rad(joint.rotation);
  const rx = o.x * Math.cos(a) - o.y * Math.sin(a), ry = o.x * Math.sin(a) + o.y * Math.cos(a);
  return { ...joint, x: (joint.x * res.width - s * rx) / res.width, y: (joint.y * res.height - s * ry) / res.height };
}

/** Joint-space pose for a clip pose. Inverse of toClipPose. */
export function fromClipPose(p: RigPart, clip: RigPose, rest: RigPose, res: Resolution): RigPose {
  const j = jointOf(p, clip, rest, res);
  return { ...clip, x: j.x / res.width, y: j.y / res.height };
}

/** The part's own authored pose at time t, in joint space. */
export function localPose(anim: RigAnimation, id: string, t: number, res: Resolution): RigPose {
  const rj = restJoint(anim, id, res), track = anim.tracks[id];
  const out = { ...rj };
  for (const prop of RIG_PROPS) out[prop] = sampleFrames(track?.[prop], t, rj[prop]);
  return out;
}

function delta(anim: RigAnimation, parentId: string, t: number, res: Resolution, cache: Map<string, RigPose>) {
  const pw = worldJoint(anim, parentId, t, res, cache), pr = restJoint(anim, parentId, res);
  const dTheta = pw.rotation - pr.rotation, s = pw.scale / (pr.scale || 1);
  return { pw, pr, dTheta, s };
}

/** Joint-space pose with every ancestor's motion applied. */
export function worldJoint(anim: RigAnimation, id: string, t: number, res: Resolution, cache = new Map<string, RigPose>(), depth = 0): RigPose {
  const hit = cache.get(id); if (hit) return hit;
  const local = localPose(anim, id, t, res);
  const parentId = part(anim, id)?.parentId;
  if (!parentId || depth > MAX_PARTS) { cache.set(id, local); return local; }
  const { pw, pr, dTheta, s } = delta(anim, parentId, t, res, cache);
  const a = rad(dTheta);
  const dx = local.x * res.width - pr.x * res.width, dy = local.y * res.height - pr.y * res.height;
  const nx = pw.x * res.width + s * (dx * Math.cos(a) - dy * Math.sin(a));
  const ny = pw.y * res.height + s * (dx * Math.sin(a) + dy * Math.cos(a));
  const parentRestOpacity = pr.opacity;
  const out: RigPose = {
    x: nx / res.width, y: ny / res.height,
    rotation: local.rotation + dTheta,
    scale: local.scale * s,
    opacity: parentRestOpacity > 0.001 ? local.opacity * (pw.opacity / parentRestOpacity) : local.opacity,
  };
  cache.set(id, out);
  return out;
}

/** The pose a clip should show at animation time t. */
export function clipPoseAt(anim: RigAnimation, id: string, t: number, res: Resolution, cache = new Map<string, RigPose>()): RigPose {
  const p = part(anim, id);
  if (!p) return restOf(anim, id);
  const w = worldJoint(anim, id, t, res, cache);
  const c = toClipPose(p, w, restOf(anim, id), res);
  return {
    x: clamp(c.x, ANIMATABLE.x.min, ANIMATABLE.x.max), y: clamp(c.y, ANIMATABLE.y.min, ANIMATABLE.y.max),
    scale: clamp(c.scale, ANIMATABLE.scale.min, ANIMATABLE.scale.max), rotation: clamp(c.rotation, ANIMATABLE.rotation.min, ANIMATABLE.rotation.max),
    opacity: clamp(c.opacity, 0, 1),
  };
}

/**
 * Convert a pose the user dragged on screen (clip space, world) back into the part's local joint
 * pose, so editing a child while its parent is mid-swing writes the right keyframe.
 */
export function localFromClip(anim: RigAnimation, id: string, t: number, world: RigPose, res: Resolution): RigPose {
  const p = part(anim, id); if (!p) return world;
  const rest = restOf(anim, id);
  const wj = fromClipPose(p, world, rest, res);
  if (!p.parentId) return wj;
  const { pw, pr, dTheta, s } = delta(anim, p.parentId, t, res, new Map());
  const a = rad(-dTheta), inv = 1 / (s || 1);
  const dx = wj.x * res.width - pw.x * res.width, dy = wj.y * res.height - pw.y * res.height;
  const lx = pr.x * res.width + inv * (dx * Math.cos(a) - dy * Math.sin(a));
  const ly = pr.y * res.height + inv * (dx * Math.sin(a) + dy * Math.cos(a));
  const restOpacity = pr.opacity;
  return {
    x: lx / res.width, y: ly / res.height,
    rotation: wj.rotation - dTheta, scale: wj.scale * inv,
    opacity: restOpacity > 0.001 && pw.opacity > 0.001 ? wj.opacity / (pw.opacity / restOpacity) : wj.opacity,
  };
}

// ---- Authoring -------------------------------------------------------------------------------

/** Insert or replace one keyframe on a part's track. Time is snapped to milliseconds. */
export function setKey(anim: RigAnimation, id: string, prop: RigProp, time: number, value: number, easing?: Easing): RigAnimation {
  const t = round(clamp(time, 0, anim.length), 3);
  const track: RigTrack = { ...(anim.tracks[id] ?? {}) };
  const frames = (track[prop] ?? []).filter((k) => Math.abs(k.time - t) > 0.0005);
  if (frames.length >= 64 && !(track[prop] ?? []).some((k) => Math.abs(k.time - t) <= 0.0005)) throw new Error("a property holds at most 64 keyframes");
  const prev = (track[prop] ?? []).find((k) => Math.abs(k.time - t) <= 0.0005);
  frames.push({ time: t, value: round(value), easing: easing ?? prev?.easing });
  frames.sort((a, b) => a.time - b.time);
  track[prop] = frames.map((k) => (k.easing === undefined ? { time: k.time, value: k.value } : k));
  return { ...anim, tracks: { ...anim.tracks, [id]: track } };
}

export function removeKey(anim: RigAnimation, id: string, prop: RigProp, time: number): RigAnimation {
  const track: RigTrack = { ...(anim.tracks[id] ?? {}) };
  const frames = (track[prop] ?? []).filter((k) => Math.abs(k.time - time) > 0.0005);
  if (frames.length) track[prop] = frames; else delete track[prop];
  return { ...anim, tracks: { ...anim.tracks, [id]: track } };
}

export function moveKey(anim: RigAnimation, id: string, prop: RigProp, from: number, to: number): RigAnimation {
  const frame = (anim.tracks[id]?.[prop] ?? []).find((k) => Math.abs(k.time - from) <= 0.0005);
  if (!frame) return anim;
  return setKey(removeKey(anim, id, prop, from), id, prop, to, frame.value, frame.easing);
}

export function setKeyEasing(anim: RigAnimation, id: string, prop: RigProp, time: number, easing: Easing | undefined): RigAnimation {
  const frames = (anim.tracks[id]?.[prop] ?? []).map((k) => {
    if (Math.abs(k.time - time) > 0.0005) return k;
    return easing === undefined ? { time: k.time, value: k.value } : { ...k, easing };
  });
  return { ...anim, tracks: { ...anim.tracks, [id]: { ...(anim.tracks[id] ?? {}), [prop]: frames } } };
}

/** Write a whole pose (all five properties) for one part at one time. */
export function setPose(anim: RigAnimation, id: string, time: number, pose: Partial<RigPose>, easing?: Easing): RigAnimation {
  let next = anim;
  for (const prop of RIG_PROPS) if (pose[prop] !== undefined) next = setKey(next, id, prop, time, pose[prop] as number, easing);
  return next;
}

/** Every distinct key time on a part, across properties. */
export function keyTimes(anim: RigAnimation, id: string): number[] {
  const set = new Set<number>();
  for (const prop of RIG_PROPS) for (const k of anim.tracks[id]?.[prop] ?? []) set.add(round(k.time, 3));
  return Array.from(set).sort((a, b) => a - b);
}

export function trimToLength(anim: RigAnimation, length: number): RigAnimation {
  const len = clamp(length, 0.2, MAX_LENGTH);
  const tracks: Record<string, RigTrack> = {};
  for (const [id, track] of Object.entries(anim.tracks)) {
    const t: RigTrack = {};
    for (const prop of RIG_PROPS) {
      const frames = (track[prop] ?? []).filter((k) => k.time <= len + 0.0005);
      if (frames.length) t[prop] = frames;
    }
    tracks[id] = t;
  }
  return { ...anim, length: len, tracks };
}

// ---- Presets ---------------------------------------------------------------------------------

export const RIG_PRESETS = [
  { id: "bounce", label: "Bounce", description: "Hops up and lands, again and again." },
  { id: "swing", label: "Swing", description: "Rocks left and right about the joint." },
  { id: "wave", label: "Wave", description: "A quick friendly wave about the joint." },
  { id: "pulse", label: "Pulse", description: "Breathes in and out." },
  { id: "float", label: "Float", description: "Drifts gently up and down." },
  { id: "pop-in", label: "Pop in", description: "Springs into view." },
  { id: "walk", label: "Walk cycle", description: "Swings limbs in opposite pairs. Best on the stick figure." },
] as const;
export type RigPresetId = typeof RIG_PRESETS[number]["id"];

/**
 * Apply a preset to some parts. Values are relative to each part's rest joint pose, so the preset
 * works wherever the clip currently sits. Existing keys on the touched properties are replaced.
 */
export function applyPreset(anim: RigAnimation, preset: RigPresetId, ids: string[], res: Resolution): RigAnimation {
  const L = anim.length;
  let next = anim;
  const put = (id: string, prop: RigProp, frames: [number, number, Easing?][]) => {
    const track: RigTrack = { ...(next.tracks[id] ?? {}) };
    track[prop] = frames.map(([t, v, e]) => ({ time: round(clamp(t, 0, L), 3), value: round(v), ...(e ? { easing: e } : {}) }));
    next = { ...next, tracks: { ...next.tracks, [id]: track } };
  };
  const cycle = (id: string, prop: RigProp, centre: number, amp: number, beats: number) => {
    const steps = Math.max(4, beats * 4);
    const frames: [number, number, Easing?][] = [];
    for (let i = 0; i <= steps; i++) frames.push([(L * i) / steps, centre + amp * Math.sin((2 * Math.PI * beats * i) / steps), "ease-in-out"]);
    put(id, prop, frames);
  };
  for (const id of ids) {
    if (!part(next, id)) continue;
    const r = restJoint(next, id, res);
    switch (preset) {
      case "bounce": {
        const hop = 0.08, n = Math.max(1, Math.round(L / 0.8));
        const frames: [number, number, Easing?][] = [];
        for (let i = 0; i < n; i++) { frames.push([(L * i) / n, r.y, "ease-out"]); frames.push([(L * (i + 0.5)) / n, r.y - hop, "ease-in"]); }
        frames.push([L, r.y]);
        put(id, "y", frames); break;
      }
      case "swing": cycle(id, "rotation", r.rotation, 14, Math.max(1, Math.round(L / 1.2))); break;
      case "wave": {
        const n = Math.max(2, Math.round(L / 0.5));
        const frames: [number, number, Easing?][] = [[0, r.rotation, "ease-out"]];
        for (let i = 1; i < n; i++) frames.push([(L * i) / n, r.rotation + (i % 2 ? -28 : 20), "ease-in-out"]);
        frames.push([L, r.rotation]);
        put(id, "rotation", frames); break;
      }
      case "pulse": {
        const n = Math.max(1, Math.round(L / 1.0));
        const frames: [number, number, Easing?][] = [];
        for (let i = 0; i < n; i++) { frames.push([(L * i) / n, r.scale, "ease-in-out"]); frames.push([(L * (i + 0.5)) / n, r.scale * 1.12, "ease-in-out"]); }
        frames.push([L, r.scale]);
        put(id, "scale", frames); break;
      }
      case "float": cycle(id, "y", r.y, 0.025, Math.max(1, Math.round(L / 2))); break;
      case "pop-in": {
        const d = Math.min(0.5, L / 2);
        put(id, "scale", [[0, Math.max(0.1, r.scale * 0.3), "back-out"], [d, r.scale]]);
        put(id, "opacity", [[0, 0, "ease-out"], [Math.min(0.2, d), r.opacity]]);
        break;
      }
      case "walk": {
        const role = roleOf(next, id);
        if (!role) break;
        const half = L / 2;
        // Front view: a limb steps outward, then settles. Opposite limbs alternate, and arms oppose the legs.
        const active = (t: number) => (role.activeAtStart ? t === 0 || t === L : t === half);
        const at = (t: number) => r.rotation + role.dir * role.amp * (active(t) ? 1 : role.rest) * role.sign;
        put(id, "rotation", [[0, at(0), "ease-in-out"], [half, at(half), "ease-in-out"], [L, at(L)]]);
        if (role.role === "torso") {
          const hop: [number, number, Easing?][] = [];
          for (let i = 0; i <= 4; i++) hop.push([(L * i) / 4, r.y - (i % 2 ? 0.012 : 0), "ease-in-out"]);
          put(id, "y", hop);
        }
        break;
      }
    }
  }
  return next;
}

/** Walk-cycle roles, matched by the names the stick figure gives its parts. */
function roleOf(anim: RigAnimation, id: string): { role: string; amp: number; rest: number; dir: number; sign: number; activeAtStart: boolean } | null {
  const name = (part(anim, id)?.name ?? "").toLowerCase();
  if (name.includes("torso")) return { role: "torso", amp: 3, rest: -1, dir: 1, sign: 1, activeAtStart: true };
  if (name.includes("head")) return { role: "head", amp: 3, rest: -1, dir: 1, sign: 1, activeAtStart: false };
  const side = name.includes("left") ? 1 : name.includes("right") ? -1 : 0; // +1: the figure's left, drawn on the viewer's left
  if (!side) return null;
  // Positive rotation turns clockwise, which swings a hanging limb on the viewer's left outward.
  if (name.includes("thigh")) return { role: "thigh", amp: 22, rest: 0.05, dir: side, sign: 1, activeAtStart: side > 0 };
  if (name.includes("shin")) return { role: "shin", amp: 16, rest: 0.05, dir: side, sign: -1, activeAtStart: side > 0 };
  if (name.includes("upper arm")) return { role: "arm", amp: 26, rest: 0.08, dir: side, sign: 1, activeAtStart: side < 0 };
  if (name.includes("forearm")) return { role: "forearm", amp: 14, rest: 0.08, dir: side, sign: -1, activeAtStart: side < 0 };
  return null;
}

// ---- Stick figure ----------------------------------------------------------------------------

export type StickFigure = { clips: Record<string, unknown>[]; parts: { clipId: string; name: string; parentId?: string; pivotX: number; pivotY: number }[] };

/**
 * A ready-made rig built from shape clips: torso, head, two arms and two legs, each with a
 * joint. The figure is sized from the frame height so it keeps its proportions on any canvas.
 */
export function stickFigure(res: Resolution, start: number, duration: number, nextId: () => string): StickFigure {
  const W = res.width, H = res.height, u = H; // pixels per unit height
  const px = (n: number) => n * u;
  const clips: Record<string, unknown>[] = []; const parts: StickFigure["parts"] = [];
  const BODY = "#f6a447", LIMB = "#e8e2d4";
  const add = (name: string, cx: number, cy: number, w: number, h: number, fill: string, type: "rectangle" | "ellipse", pivotYpx: number, parentId?: string, radius = 14): string => {
    const id = nextId();
    clips.push({
      id, assetId: "", track: "overlay", start, inPoint: 0, outPoint: duration, volume: 0, muted: true, label: name,
      x: round(cx / W), y: round(cy / H),
      shape: { type, width: round(w / W), height: round(h / H), fill, stroke: "transparent", strokeWidth: 0, radius },
    });
    parts.push({ clipId: id, name, parentId, pivotX: 0, pivotY: round(pivotYpx / H) });
    return id;
  };
  const cx = W / 2, top = px(0.37);
  const torso = add("Torso", cx, px(0.5), px(0.075), px(0.26), BODY, "rectangle", 0, undefined, 20);
  add("Head", cx, top - px(0.075), px(0.13), px(0.13), BODY, "ellipse", px(0.065), torso);
  for (const [side, dir] of [["Left", -1], ["Right", 1]] as const) {
    const sx = cx + dir * px(0.055);
    const upper = add(`${side} upper arm`, sx, top + px(0.02) + px(0.07), px(0.04), px(0.14), LIMB, "rectangle", -px(0.07), torso, 18);
    add(`${side} forearm`, sx, top + px(0.02) + px(0.14) + px(0.065), px(0.036), px(0.13), LIMB, "rectangle", -px(0.065), upper, 18);
    const hx = cx + dir * px(0.028), hip = px(0.63);
    const thigh = add(`${side} thigh`, hx, hip + px(0.075), px(0.045), px(0.15), LIMB, "rectangle", -px(0.075), torso, 18);
    add(`${side} shin`, hx, hip + px(0.15) + px(0.075), px(0.04), px(0.15), LIMB, "rectangle", -px(0.075), thigh, 18);
  }
  return { clips, parts };
}

// ---- Baking ----------------------------------------------------------------------------------

type ClipSpan = { id: string; start: number; duration: number; base: RigPose };

/** Which parts move because an ancestor moves. */
function ancestorsMove(anim: RigAnimation, id: string): boolean {
  let at = part(anim, id)?.parentId; let guard = 0;
  while (at && guard++ < MAX_PARTS) {
    const track = anim.tracks[at];
    if (track && RIG_PROPS.some((p) => track[p]?.length)) return true;
    at = part(anim, at)?.parentId;
  }
  return false;
}

/** Drop samples that a straight line between their neighbours reproduces within tolerance. */
function decimate(points: { time: number; value: number }[], tol: number): { time: number; value: number }[] {
  if (points.length <= 2) return points;
  const keep: { time: number; value: number }[] = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[anchor], b = points[i];
    let ok = true;
    for (let j = anchor + 1; j < i; j++) {
      const p = points[j], f = (p.time - a.time) / (b.time - a.time || 1);
      if (Math.abs(a.value + (b.value - a.value) * f - p.value) > tol) { ok = false; break; }
    }
    if (!ok) { keep.push(points[i - 1]); anchor = i - 1; }
  }
  keep.push(points[points.length - 1]);
  return keep;
}

export function spanOf(c: Clip): ClipSpan {
  return { id: c.id, start: c.start, duration: clipDuration(c), base: restPose(c) };
}

/**
 * Bake an animation into clip keyframes (times relative to each clip's start). Returns, for each
 * part whose clip exists, the five rig properties: a key list, or null to clear that property.
 */
export function bakeAnimation(anim: RigAnimation, spans: ClipSpan[], res: Resolution): Record<string, Partial<Record<RigProp, Keyframe[] | null>>> {
  const out: Record<string, Partial<Record<RigProp, Keyframe[] | null>>> = {};
  for (const span of spans) {
    const p = part(anim, span.id); if (!p) continue;
    // The part of the animation this clip is on screen for, in animation time.
    const a = Math.max(0, span.start - anim.start), b = Math.min(anim.length, span.start + span.duration - anim.start);
    if (b < a) continue;
    const cache0 = () => new Map<string, RigPose>();
    const times = new Set<number>([round(a, 3), round(b, 3)]);
    const chain: string[] = []; let at: string | undefined = span.id; let guard = 0;
    while (at && guard++ < MAX_PARTS) { chain.push(at); at = part(anim, at)?.parentId; }
    for (const cid of chain) for (const prop of RIG_PROPS) {
      const frames = anim.tracks[cid]?.[prop] ?? [];
      frames.forEach((k, i) => {
        if (k.time >= a && k.time <= b) times.add(round(k.time, 3));
        const next = frames[i + 1];
        if (k.easing === "hold" && next && next.time - 0.001 >= a && next.time - 0.001 <= b) times.add(round(next.time - 0.001, 3));
      });
    }
    const pivotFree = p.pivotX === 0 && p.pivotY === 0;
    const clipped = a > 0.0005 || b < anim.length - 0.0005;
    const exact = !ancestorsMove(anim, span.id) && pivotFree && !clipped;
    const step = Math.max(1 / 24, (b - a) / 60);
    if (!exact) for (let t = a; t <= b + 1e-6; t += step) times.add(round(t, 3));
    const sorted = Array.from(times).filter((t) => t >= a - 1e-6 && t <= b + 1e-6).sort((x, y) => x - y);
    const result: Partial<Record<RigProp, Keyframe[] | null>> = {};
    const trackOwn = anim.tracks[span.id] ?? {};
    for (const prop of RIG_PROPS) {
      const baseVal = span.base[prop];
      const moving = ancestorsMove(anim, span.id) || trackOwn[prop]?.length || ((prop === "x" || prop === "y") && (p.pivotX !== 0 || p.pivotY !== 0) && (trackOwn.rotation?.length || trackOwn.scale?.length));
      if (!moving) { result[prop] = null; continue; }
      let frames: Keyframe[];
      if (exact) {
        // The part's own keys already are the clip's keys.
        frames = (trackOwn[prop] ?? []).map((k) => ({ time: round(k.time + anim.start - span.start, 3), value: k.value, ...(k.easing ? { easing: k.easing } : {}) }));
      } else {
        const points = sorted.map((t) => ({ time: round(t + anim.start - span.start, 3), value: round(clipPoseAt(anim, span.id, t, res, cache0())[prop]) }));
        frames = decimate(points, TOLERANCE[prop]).map((k) => ({ time: Math.max(0, Math.min(span.duration, k.time)), value: k.value }));
      }
      // Fit the 64 key limit by loosening the tolerance if a complex rig needs it.
      let tol = TOLERANCE[prop];
      while (frames.length > 64) { tol *= 2; frames = decimate(frames, tol); if (tol > 10) break; }
      const flat = frames.every((k) => Math.abs(k.value - frames[0].value) < 1e-6);
      result[prop] = flat && Math.abs(frames[0]?.value - baseVal) < 1e-3 ? null : frames.slice(0, 64);
    }
    out[span.id] = result;
  }
  return out;
}

/** Merge baked keyframes into a clip's keyframes. Expressions on rig properties are dropped so the keys win. */
export function mergeBaked(c: Clip, baked: Partial<Record<RigProp, Keyframe[] | null>>): Pick<Clip, "keyframes" | "expressions"> {
  const keyframes: Keyframes = { ...(c.keyframes ?? {}) };
  const expressions = { ...(c.expressions ?? {}) };
  for (const prop of RIG_PROPS) {
    if (!(prop in baked)) continue;
    delete keyframes[prop]; delete (expressions as Record<string, string>)[prop];
    const frames = baked[prop];
    if (frames?.length) keyframes[prop] = frames;
  }
  const dur = clipDuration(c);
  return { keyframes: normalizeKeyframes(keyframes, dur), expressions: Object.keys(expressions).length ? expressions : undefined };
}

/** Apply a whole animation to a clip list. Returns new clip objects for the changed clips only through `clips`. */
export function applyAnimationToClips(anim: RigAnimation, clips: Clip[], res: Resolution): { clips: Clip[]; changed: string[] } {
  const spans = clips.filter((c) => anim.parts.some((p) => p.clipId === c.id)).map(spanOf);
  const baked = bakeAnimation(anim, spans, res);
  const changed: string[] = [];
  const next = clips.map((c) => {
    const b = baked[c.id]; if (!b) return c;
    const merged = mergeBaked(c, b);
    changed.push(c.id);
    const copy: Clip = { ...c, keyframes: merged.keyframes };
    if (merged.expressions) copy.expressions = merged.expressions; else delete copy.expressions;
    if (copy.keyframes && Object.keys(copy.keyframes).length === 0) delete copy.keyframes;
    return copy;
  });
  return { clips: next, changed };
}

// ---- Validation (API input) ------------------------------------------------------------------

/** Validate an animation that arrived from a client or a script. Throws readable errors. */
export function normalizeAnimation(raw: any): RigAnimation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("animation must be an object");
  const length = Number(raw.length);
  if (!Number.isFinite(length) || length < 0.2 || length > MAX_LENGTH) throw new Error(`animation.length must be 0.2..${MAX_LENGTH} seconds`);
  const start = raw.start === undefined ? 0 : Number(raw.start);
  if (!Number.isFinite(start) || start < 0 || start > 86400) throw new Error("animation.start must be 0..86400");
  if (!Array.isArray(raw.parts) || raw.parts.length < 1 || raw.parts.length > MAX_PARTS) throw new Error(`animation.parts must list 1..${MAX_PARTS} parts`);
  const ids = new Set<string>();
  const parts: RigPart[] = raw.parts.map((p: any) => {
    if (!p || typeof p.clipId !== "string" || !p.clipId) throw new Error("every part needs a clipId");
    if (ids.has(p.clipId)) throw new Error(`duplicate part ${p.clipId}`);
    ids.add(p.clipId);
    const pv = (v: unknown) => (v === undefined ? 0 : clamp(Number(v), -1, 1));
    const px = pv(p.pivotX), py = pv(p.pivotY);
    if (!Number.isFinite(px) || !Number.isFinite(py)) throw new Error("pivot must be a number");
    return { clipId: p.clipId, name: String(p.name ?? p.clipId).slice(0, 40), kind: p.kind === "text" || p.kind === "shape" ? p.kind : "media", parentId: typeof p.parentId === "string" && p.parentId ? p.parentId : undefined, pivotX: px, pivotY: py };
  });
  for (const p of parts) if (p.parentId && !ids.has(p.parentId)) throw new Error(`part ${p.clipId} has an unknown parent`);
  const draft: RigAnimation = { id: String(raw.id ?? "anim"), name: String(raw.name ?? "Animation").slice(0, 60), length, start, loop: raw.loop !== false, parts, rest: {}, tracks: {} };
  for (const p of parts) {
    let at: string | undefined = p.parentId; let hops = 0;
    while (at) { if (at === p.clipId || ++hops > parts.length) throw new Error("parts form a cycle"); at = parts.find((x) => x.clipId === at)?.parentId; }
  }
  const rest: Record<string, RigPose> = {}; const tracks: Record<string, RigTrack> = {};
  for (const p of parts) {
    const r = raw.rest?.[p.clipId] ?? {};
    rest[p.clipId] = { x: Number(r.x ?? 0.5), y: Number(r.y ?? 0.5), scale: Number(r.scale ?? 1), rotation: Number(r.rotation ?? 0), opacity: Number(r.opacity ?? 1) };
    if (Object.values(rest[p.clipId]).some((n) => !Number.isFinite(n))) throw new Error(`rest pose of ${p.clipId} must be numbers`);
    const t = raw.tracks?.[p.clipId];
    if (t === undefined) continue;
    if (!t || typeof t !== "object") throw new Error(`track of ${p.clipId} must be an object`);
    const own: RigTrack = {};
    for (const prop of Object.keys(t)) {
      if (!(RIG_PROPS as readonly string[]).includes(prop)) throw new Error(`cannot animate ${prop} in a rig`);
      const normalized = normalizeKeyframes({ [prop]: t[prop] }, length);
      const frames = (normalized as Keyframes)[prop as RigProp];
      if (frames?.length) own[prop as RigProp] = frames;
    }
    tracks[p.clipId] = own;
  }
  return { ...draft, rest, tracks };
}

// ---- Following and posing (used by blocks and the API) ----------------------------------------

/** Sample whatever animates a clip (keyframes or code) into a joint-space track in animation time. */
export function trackFromClip(anim: RigAnimation, c: Clip, res: Resolution): RigTrack {
  const p = part(anim, c.id); if (!p) return {};
  const rest = restOf(anim, c.id);
  const step = Math.max(1 / 24, anim.length / 60);
  const track: RigTrack = {};
  const animated = RIG_PROPS.filter((prop) => isAnimated(c, prop));
  // Joint x/y depend on rotation and scale when the pivot is off-centre.
  const offCentre = p.pivotX !== 0 || p.pivotY !== 0;
  let props: RigProp[] = [...animated];
  if (offCentre && (props.includes("rotation") || props.includes("scale"))) props = RIG_PROPS.filter((q) => q === "x" || q === "y" || props.includes(q));
  if (!props.length) return track;
  const series: Partial<Record<RigProp, Keyframe[]>> = {};
  for (let t = 0; t <= anim.length + 1e-6; t += step) {
    const tt = Math.min(t, anim.length);
    const local = tt + anim.start - c.start;
    if (local < 0 || local > clipDuration(c)) continue;
    const clip: RigPose = { x: valueAt(c, "x", local), y: valueAt(c, "y", local), scale: valueAt(c, "scale", local), rotation: valueAt(c, "rotation", local), opacity: valueAt(c, "opacity", local) };
    const joint = fromClipPose(p, clip, rest, res);
    for (const prop of props) (series[prop] ??= []).push({ time: round(tt, 3), value: round(joint[prop]) });
  }
  for (const prop of props) if (series[prop]?.length) track[prop] = decimate(series[prop], TOLERANCE[prop]);
  return track;
}

/**
 * Make `child` ride `parent`: the child keeps its own animation and additionally moves, turns and
 * scales with the parent about the parent's joint (default: its centre).
 */
export function followAnimation(parent: Clip, child: Clip, res: Resolution, joint?: { pivotX?: number; pivotY?: number }): RigAnimation {
  if (parent.id === child.id) throw new Error("a clip cannot follow itself");
  if (parent.track === "audio" || child.track === "audio") throw new Error("audio clips cannot be rigged");
  const length = clamp(clipDuration(parent), 0.2, MAX_LENGTH);
  let anim = newAnimation("follow", "Follow", parent.start, length);
  anim = addParts(anim, [parent, child]);
  anim = setPivot(anim, parent.id, Number(joint?.pivotX ?? 0) || 0, Number(joint?.pivotY ?? 0) || 0);
  anim = setParent(anim, child.id, parent.id);
  anim = { ...anim, tracks: { [parent.id]: trackFromClip(anim, parent, res), [child.id]: trackFromClip(anim, child, res) } };
  return anim;
}

/** Bake only some clips of an animation (used when a part's clip is cropped by the window). */
export function bakeFollow(anim: RigAnimation, clips: Clip[], res: Resolution, only: string): Clip[] {
  const spans = clips.filter((c) => c.id === only).map(spanOf);
  const baked = bakeAnimation(anim, spans, res);
  return clips.map((c) => {
    const b = baked[c.id]; if (!b) return c;
    const merged = mergeBaked(c, b);
    const copy: Clip = { ...c, keyframes: merged.keyframes };
    if (merged.expressions) copy.expressions = merged.expressions; else delete copy.expressions;
    if (copy.keyframes && Object.keys(copy.keyframes).length === 0) delete copy.keyframes;
    return copy;
  });
}

// ---- Storage ---------------------------------------------------------------------------------

const storageKey = (projectKey: string) => `vf.animator.v1.${projectKey || "draft"}`;

/** Animations saved for one project, in this browser. Damaged entries are skipped. */
export function loadAnimations(storage: Pick<Storage, "getItem">, projectKey: string): RigAnimation[] {
  try {
    const raw = JSON.parse(storage.getItem(storageKey(projectKey)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const out: RigAnimation[] = [];
    for (const a of raw.slice(0, 40)) {
      try {
        if (Array.isArray(a?.parts) && a.parts.length === 0) {
          out.push(newAnimation(String(a.id ?? `a-${out.length}`), String(a.name ?? "Animation").slice(0, 60), Number(a.start) || 0, Number(a.length) || 2));
        } else {
          out.push(normalizeAnimation(a));
        }
      } catch { /* skip an animation that no longer validates */ }
    }
    return out;
  } catch { return []; }
}

export function saveAnimations(storage: Pick<Storage, "setItem">, projectKey: string, list: RigAnimation[]): void {
  try { storage.setItem(storageKey(projectKey), JSON.stringify(list.slice(0, 40))); } catch { /* storage is optional */ }
}

/** Saved animations keyed by name, for the "Play an Animator animation" block. */
export function animationsByName(list: RigAnimation[]): Record<string, RigAnimation> {
  const out: Record<string, RigAnimation> = {};
  for (const a of list) if (a.parts.length) out[a.name.trim()] = a;
  return out;
}
