import { setTransition } from "./transitions";
import { normalizeClip, normalizeTimeline, clipDuration, clipEnd, clipX, clipY, clipSpeed, rampSource, rampSourceAt, sliceRamp, normalizeSpeedRamp, TRACKS, type Clip, type Timeline, type TrackName } from "./timeline";
import { normalizeKeyframes, isProperty, sliceKeyframes, type AnimationProperty, type Keyframe } from "./animation";
import { motionPreset } from "./presets";
import { templateClips } from "./graphics";
import { beatTimes, retimeAnimation, reverseAnimation } from "./motion";
import { codeRecipe } from "./expr";
import { RIG_PROPS, applyAnimationToClips, bakeFollow, followAnimation, normalizeAnimation, restPose, type RigProp } from "./rig";
import { fitClip, clipBounds, type FitMode } from "./layout";
import { normalizeExpressions, valueAt, ANIMATABLE } from "./animation";
const uid = () => Math.random().toString(36).slice(2,14);
const round = (n: number) => Math.round(n * 1000) / 1000;
export type TimelineOp = { op: string; args?: any };
export function splitKeyframes(c:Clip, at:number) { return [sliceKeyframes(c,0,at),sliceKeyframes(c,at,clipDuration(c))]; }
/** A preset that animates a property takes over from any code expression on it. */
function usePreset(c: Clip, preset: string, options: { duration?: number; delay?: number; strength?: number; easing?: string }) {
  const patch = motionPreset(c, preset, options);
  // An explicit easing (anything but "preset") replaces the curves' own easings —
  // except sampled curves (spring, bounce), whose shape lives in the samples.
  // The preset's patch carries over the clip's other curves unchanged (same array
  // reference), so only curves whose array the preset replaced get the new easing —
  // and the expression cleanup below still recognises which properties it owns.
  const easing = typeof options.easing === "string" && options.easing && options.easing !== "preset" ? options.easing : undefined;
  if (easing && patch.keyframes) {
    for (const p of Object.keys(patch.keyframes) as AnimationProperty[]) {
      const frames = patch.keyframes[p] ?? [];
      if (patch.keyframes[p] === c.keyframes?.[p]) continue; // not the preset's curve
      if (frames.length > 4 && frames.every((k) => (k.easing ?? "linear") === "linear")) continue;
      if (!frames.some((k) => k.easing !== undefined && k.easing !== easing)) continue;
      patch.keyframes[p] = frames.map((k) => k.easing === undefined ? k : { ...k, easing: easing as Keyframe["easing"] });
    }
  }
  if (c.expressions) {
    const rest = { ...c.expressions };
    for (const p of Object.keys(patch.keyframes ?? {}) as AnimationProperty[]) if (patch.keyframes![p] !== c.keyframes?.[p]) delete rest[p];
    if (Object.keys(rest).length) c.expressions = rest; else delete c.expressions;
  }
  Object.assign(c, patch);
}
export function patchWithAnimation(c:Clip, patch:Partial<Clip>):Clip {
  const next={...c,...patch}; const dur=clipDuration(next), oldDur=clipDuration(c);
  const windowChanged = Math.abs(dur-oldDur)>1e-6 || next.speed!==c.speed || (!!c.assetId && next.inPoint!==c.inPoint);
  if(patch.keyframes===undefined && c.keyframes && windowChanged) {
    const oldSpeed=c.assetId ? c.speed??1 : 1, newSpeed=next.assetId ? next.speed??1 : 1;
    // Keep animation pinned to the footage: a left trim drops the front of every curve.
    const from=c.assetId ? Math.max(0,(next.inPoint-c.inPoint)/oldSpeed) : next.start!==c.start ? Math.max(0,next.start-c.start) : 0;
    const to=Math.min(oldDur,from+dur*newSpeed/oldSpeed);
    next.keyframes=sliceKeyframes(c,from,to);
    if(next.keyframes) for(const p of Object.keys(next.keyframes) as AnimationProperty[]) next.keyframes[p]=next.keyframes[p]!.map(k=>({...k,time:Math.min(dur,Math.round(k.time*oldSpeed/newSpeed*1000)/1000)}));
  }
  return normalizeClip(next);
}
/** Stretch a clip's keyframe times so a copied animation fits a clip of a different length. */
function scaleKeys(keys: Record<string, { time: number; value: number; easing?: unknown }[]>, from: number, to: number) {
  const k = from > 0 ? to / from : 1; const out: any = {};
  for (const p of Object.keys(keys)) out[p] = keys[p].map((f) => ({ ...f, time: Math.round(f.time * k * 1000) / 1000 }));
  return out;
}
export function applyTimelineOp(raw:Timeline, {op,args={}}:TimelineOp, getAsset:(id:string)=>{kind:string;duration:number;width?:number|null;height?:number|null}|undefined):Timeline {
  const timeline=normalizeTimeline(JSON.parse(JSON.stringify(raw)));
  const clips=timeline.clips;
  const find=(id:unknown)=> { const c=clips.find(x=>x.id===id); if(!c) throw new Error(`clip ${id} not found`); return c; };
      switch (op) {
        case "add_shape_clip": {
          const { duration = 3, shape, ...style } = args;
          if (!shape) throw new Error("shape required");
          if (!Number.isFinite(duration) || duration < .1 || duration > 3600) throw new Error("shape duration must be 0.1..3600");
          if (style.id && clips.some(c=>c.id===style.id)) throw new Error(`clip ${style.id} already exists`);
          clips.push(normalizeClip({ ...style, id: style.id ?? uid(), assetId: "", text: undefined, track: "overlay", inPoint: 0, outPoint: duration, shape }));
          break;
        }
        case "add_motion_template": {
          // idPrefix gives the generated layers stable ids (prefix-0, prefix-1, ...) so later ops in the same batch can target them.
          if (args.idPrefix !== undefined && !/^[\w-]{1,32}$/.test(args.idPrefix)) throw new Error("idPrefix must be 1..32 letters, digits, _ or -");
          let n = 0; const nextId = args.idPrefix ? () => `${args.idPrefix}-${n++}` : uid;
          const made = templateClips(args, nextId, timeline.resolution.width/timeline.resolution.height).map(normalizeClip);
          if (made.some(m => clips.some(c => c.id === m.id))) throw new Error(`idPrefix ${args.idPrefix} is already in use`);
          clips.push(...made);
          break;
        }
        case "stagger_clips": {
          if (!Array.isArray(args.clipIds) || !args.clipIds.length || new Set(args.clipIds).size !== args.clipIds.length) throw new Error("unique clipIds required");
          if (!Number.isFinite(args.delay) || args.delay < 0 || args.delay > 60) throw new Error("delay must be 0..60 seconds");
          const start = args.start ?? Math.min(...args.clipIds.map((id: string) => find(id).start));
          if (!Number.isFinite(start) || start < 0) throw new Error("start must be nonnegative");
          args.clipIds.forEach((id: string, i: number) => { find(id).start = Math.round((start + i * args.delay) * 1000) / 1000; });
          break;
        }
        case "add_clip": {
          const c = (args || {}) as Partial<Clip>;
          const asset = c.assetId ? getAsset(c.assetId) : undefined;
          if (c.assetId && !asset) throw new Error(`asset ${c.assetId} not found`);
          if (!c.assetId && !c.text && !c.shape) throw new Error("assetId, text, or shape required");
          const inPoint = Math.max(0, c.inPoint ?? 0);
          const maxOut = asset && asset.kind !== "image" && asset.duration ? asset.duration : Infinity;
          const outPoint = Math.min(maxOut, c.outPoint ?? inPoint + (asset?.kind === "video" || asset?.kind === "audio" ? Math.min(asset.duration || 5, 5) : 5));
          const track = (c.track as any) || (asset?.kind === "audio" ? "audio" : c.assetId ? "video" : "overlay");
          clips.push(normalizeClip({ ...c, id: c.id || uid(), track, start: c.start ?? 0, inPoint, outPoint }));
          break;
        }
        case "add_text_clip": {
          const { text, start, duration, ...style } = args || {};
          if (typeof text !== "string" || !text.trim()) throw new Error("text required");
          if (style.id && clips.some(c => c.id === style.id)) throw new Error(`clip ${style.id} already exists`);
          clips.push(normalizeClip({ ...style, id: style.id ?? uid(), assetId: "", track: "overlay", text, start: start ?? 0, inPoint: 0, outPoint: duration ?? 3 }));
          break;
        }
        case "remove_clip": {
          const i = clips.findIndex((c) => c.id === args?.clipId);
          if (i < 0) throw new Error(`clip ${args?.clipId} not found`);
          clips.splice(i, 1);
          break;
        }
        case "trim_clip": {
          const { clipId, inPoint, outPoint } = args || {};
          const c = find(clipId);
          if (c.speedRamp?.length) throw new Error("this clip has speed steps — change its length with the Speed steps block");
          const patch: Partial<Clip> = {};
          if (typeof inPoint === "number") patch.inPoint = Math.max(0, inPoint);
          if (typeof outPoint === "number") patch.outPoint = Math.max((patch.inPoint ?? c.inPoint) + 0.1, outPoint);
          clips[clips.indexOf(c)] = patchWithAnimation(c, patch);
          break;
        }
        case "move_clip": {
          const { clipId, start, track } = args || {};
          const c = find(clipId);
          if (typeof start === "number") c.start = Math.max(0, start);
          if (["video", "overlay", "audio"].includes(track)) {
            // Text and shapes always render above video footage, so the video track
            // is for pictures and footage — keep them on the overlay track.
            if (track === "video" && (c.text || c.shape)) throw new Error("text and shapes stay on the overlay track");
            c.track = track;
          }
          break;
        }
        case "set_audio": {
          const { clipId, volume, muted } = args || {};
          const c = find(clipId);
          if (typeof volume === "number") c.volume = Math.min(1, Math.max(0, volume));
          if (typeof muted === "boolean") c.muted = muted;
          break;
        }
        case "add_text": {
          const { clipId, text } = args || {};
          const c = find(clipId);
          if (typeof text !== "string" || !text.trim()) throw new Error("text required");
          c.text = text;
          break;
        }
        case "update_clip": {
          const { clipId, ...patch } = args || {};
          const c = find(clipId);
          const { id: _id, assetId: _asset, ...safe } = patch;
          if (safe.crop !== undefined && !c.assetId) throw new Error("crop applies to picture and video clips — text and shapes cannot be cropped");
          // normalizeClip drops fields equal to their defaults, so replacing the
          // object (rather than merging) lets a patch reset a value to default.
          clips[clips.indexOf(c)] = patchWithAnimation(c, safe);
          break;
        }
        case "split_clip": {
          const { clipId, at } = args || {};
          const c = find(clipId);
          if (typeof at !== "number") throw new Error("at (timeline seconds) required");
          const dur = clipDuration(c);
          const rel = at - c.start;
          if (rel < 0.1 || rel > dur - 0.1) throw new Error("split point must be inside the clip (at least 0.1s from either edge)");
          if (c.speedRamp?.length) {
            // Speed steps split with the clip: the left keeps the steps before the
            // split, the right plays the rest from the matching source position.
            const [left, right] = sliceRamp(c.speedRamp, rel);
            const srcSplit = c.inPoint + rampSourceAt(c.speedRamp, rel);
            const rightClip: Clip = { ...c, id: uid(), start: at, inPoint: srcSplit, outPoint: c.outPoint, speedRamp: right.length ? right : undefined };
            delete rightClip.fadeIn;
            delete c.fadeOut;
            const parts = splitKeyframes(c, rel);
            c.keyframes = parts[0]; rightClip.keyframes = parts[1];
            c.speedRamp = left.length ? left : undefined;
            c.outPoint = srcSplit;
            clips.push(rightClip);
            break;
          }
          const speed = c.speed ?? 1;
          const srcSplit = c.assetId ? c.inPoint + rel * speed : c.inPoint + rel;
          const right: Clip = { ...c, id: uid(), start: at, inPoint: srcSplit };
          delete right.fadeIn;
          delete c.fadeOut;
          const parts = splitKeyframes(c, rel);
          c.keyframes = parts[0]; right.keyframes = parts[1];
          c.outPoint = srcSplit;
          clips.push(right);
          break;
        }
        case "swap_asset": {
          const { clipId, assetId, duration, inPoint, outPoint, keepKeyframes } = args || {};
          const c = find(clipId);
          if (typeof assetId !== "string" || !assetId.trim()) throw new Error("assetId required");
          if (c.assetId === "") throw new Error("swap_asset only applies to media clips (assetId set); text and shape clips cannot become media");
          // Preserve clip identity, placement, style, and playback speed. Only the source
          // and trim window change. Speed is NOT reset — the displayed duration follows
          // from (outPoint - inPoint) / speed exactly as before.
          const patch: Partial<Clip> = { assetId };
          if (typeof inPoint === "number") patch.inPoint = Math.max(0, inPoint);
          const src = getAsset(assetId);
          if (!src) throw new Error(`asset ${assetId} not found`);
          const newIn = (patch.inPoint as number | undefined) ?? c.inPoint;
          const oldSpeed = c.assetId ? c.speed ?? 1 : 1;
          const oldDisplayed = clipDuration(c);
          // Source-window length that preserves the displayed duration at the same speed.
          const defaultSrcSpan = Math.max(0.1, oldDisplayed * oldSpeed);
          if (src.kind === "image") {
            // Images have no in/out semantics. Only honour an explicit outPoint or
            // duration; otherwise keep the existing window untouched.
            if (typeof outPoint === "number") patch.outPoint = Math.max(newIn + 0.1, outPoint);
            else if (typeof duration === "number" && duration > 0) patch.outPoint = newIn + duration;
            // else: keep c.outPoint as-is
          } else {
            const maxOut = src.duration || Infinity;
            if (newIn > maxOut - 0.1) throw new Error(`inPoint ${newIn} is beyond the end of this asset (duration ${src.duration})`);
            // `duration` and `outPoint` are in SOURCE seconds (inPoint/outPoint space).
            const desiredSpan = (typeof duration === "number" && duration > 0 ? duration : null) ?? defaultSrcSpan;
            const explicit = typeof outPoint === "number" && outPoint > newIn ? outPoint : null;
            patch.outPoint = Math.min(maxOut, explicit ?? Math.max(newIn + 0.1, newIn + desiredSpan));
          }
          // Keyframes: default = proportionally stretch the original curves to the new
          // displayed duration (so a shortened clip still ends at its original final
          // values). keepKeyframes:true preserves the original arrays verbatim — even
          // beyond the new window — which normalization may then clamp.
          if (keepKeyframes === true) {
            clips[clips.indexOf(c)] = patchWithAnimation({ ...c, ...patch }, { keyframes: c.keyframes } as any);
          } else {
            const base = { ...c, ...patch };
            const newDisplayed = clipDuration(base);
            const scale = newDisplayed > 0 && oldDisplayed > 0 ? newDisplayed / oldDisplayed : 1;
            let scaled: typeof c.keyframes = undefined;
            if (c.keyframes) {
              scaled = {} as typeof c.keyframes;
              for (const p of Object.keys(c.keyframes) as AnimationProperty[]) {
                const arr = c.keyframes[p]!;
                (scaled as any)[p] = arr.map(f => ({ ...f, time: scale === 1 ? f.time : Math.round(Math.min(f.time * scale, newDisplayed) * 1000) / 1000 }));
              }
            }
            clips[clips.indexOf(c)] = patchWithAnimation(base, { ...(patch as any), keyframes: scaled } as any);
          }
          break;
        }
        case "set_project": {
          const { fps, resolution } = args || {};
          if (args.background !== undefined) timeline.background = args.background;
          if (fps) timeline.fps = fps;
          if (resolution) timeline.resolution = resolution;
          if (args.refit) { const size = normalizeTimeline(timeline).resolution; timeline.resolution = size; clips.forEach((c, i) => { if (c.track === "audio" || (c.assetId && c.track === "video")) return; const asset = c.assetId ? getAsset(c.assetId) : undefined; clips[i] = normalizeClip({ ...c, ...fitClip(c, size, { width: asset?.width, height: asset?.height }, "safe", args.margin ?? .04) }); }); }
          break;
        }
        case "reorder": {
          const { order } = args || {};
          if (!Array.isArray(order)) throw new Error("order (array of clip ids) required");
          const byId = new Map(clips.map((c) => [c.id, c]));
          const next = order.map((id: string) => byId.get(id)).filter(Boolean) as Clip[];
          if (next.length !== clips.length) throw new Error("order must contain every clip id");
          let t = 0;
          for (const c of next.filter((c) => c.track === "video")) {
            c.start = t;
            t += clipDuration(c);
          }
          timeline.clips = next;
          break;
        }
        case "set_keyframes": {
          const c=find(args?.clipId); if(!isProperty(args?.property)) throw new Error("unknown animation property");
          c.keyframes = { ...c.keyframes, ...normalizeKeyframes({ [args.property]: args.keyframes },clipDuration(c)) };
          if(!args.keyframes?.length) delete c.keyframes[args.property as AnimationProperty];
          break;
        }
        case "rig_bake": {
          // Bake an animator animation (parts, joints, local keyframes) into plain clip keyframes.
          const rawAnim = args?.animation;
          if (!rawAnim || typeof rawAnim !== "object" || !Array.isArray(rawAnim.parts)) throw new Error("rig_bake needs an animation with parts");
          const restDefaults: Record<string, unknown> = {};
          for (const p of rawAnim.parts) if (p && typeof p.clipId === "string") restDefaults[p.clipId] = restPose(find(p.clipId));
          const anim = normalizeAnimation({ ...rawAnim, start: args.start ?? rawAnim.start, rest: { ...restDefaults, ...(rawAnim.rest ?? {}) } });
          const { clips: baked, changed } = applyAnimationToClips(anim, clips, timeline.resolution);
          for (const id of changed) { const i = clips.findIndex((c) => c.id === id); clips[i] = normalizeClip(baked[i]); }
          break;
        }
        case "rig_pose": {
          // Move several clips to a pose together: any of x, y, scale, rotation, opacity, from where they are now.
          const ids: unknown[] = Array.isArray(args?.clipIds) ? args.clipIds : String(args?.clipIds ?? "").split(",").map((x) => x.trim()).filter(Boolean);
          if (!ids.length) throw new Error("rig_pose needs clipIds");
          const targets: Partial<Record<RigProp, number>> = {};
          for (const prop of RIG_PROPS) if (args[prop] !== undefined && args[prop] !== "") { const n = Number(args[prop]); if (!Number.isFinite(n)) throw new Error(`rig_pose: ${prop} must be a number`); targets[prop] = n; }
          if (!Object.keys(targets).length) throw new Error("rig_pose needs at least one of x, y, scale, rotation, opacity");
          const delay = Math.max(0, Number(args.delay ?? 0) || 0), duration = Math.max(0.01, Number(args.duration ?? 0.8) || 0.8);
          const easing = typeof args.easing === "string" && args.easing ? args.easing : "ease-out";
          for (const id of ids) {
            const c = find(id); if (c.track === "audio") throw new Error("audio clips cannot be posed");
            const dur = clipDuration(c), kf: Record<string, unknown> = { ...(c.keyframes ?? {}) };
            for (const [prop, to] of Object.entries(targets)) {
              const from = valueAt(c, prop as AnimationProperty, Math.min(delay, dur));
              kf[prop] = [{ time: round(Math.min(delay, dur)), value: from, easing }, { time: round(Math.min(delay + duration, dur)), value: to }].filter((k, i, a) => i === 0 || k.time > a[0].time);
            }
            c.keyframes = normalizeKeyframes(kf, dur);
            const expr = { ...(c.expressions ?? {}) } as Record<string, string>; Object.keys(targets).forEach((p) => delete expr[p]);
            if (Object.keys(expr).length) c.expressions = expr; else delete c.expressions;
          }
          break;
        }
        case "rig_follow": {
          // Make one clip ride another, turning and scaling with it about the parent's joint.
          const parent = find(args?.parentId), child = find(args?.childId);
          const anim = followAnimation(parent, child, timeline.resolution, { pivotX: args.pivotX, pivotY: args.pivotY });
          const next = bakeFollow(anim, clips, timeline.resolution, child.id);
          const i = clips.findIndex((c) => c.id === child.id); clips[i] = normalizeClip(next[i]);
          break;
        }
        case "upsert_keyframe": {
          const c=find(args?.clipId); if(!isProperty(args?.property)) throw new Error("unknown animation property");
          const p=args.property as AnimationProperty;
          const frames = (c.keyframes?.[p] ?? []).filter(k=>Math.abs(k.time-args.time)>.0005);
          frames.push({ time: args.time, value: args.value, easing: args.easing });
          c.keyframes = { ...c.keyframes, ...normalizeKeyframes({ [p]: frames },clipDuration(c)) }; break;
        }
        case "remove_keyframe": {
          const c=find(args?.clipId); if(!isProperty(args?.property)) throw new Error("unknown animation property");
          const p=args.property as AnimationProperty;
          c.keyframes = { ...c.keyframes, [p]: (c.keyframes?.[p]??[]).filter(k=>Math.abs(k.time-args.time)>.0005) }; break;
        }
        case "duplicate_clip": {
          const c=find(args?.clipId), copy=JSON.parse(JSON.stringify(c));
          copy.id=args.newId??uid();
          copy.start=args.start??clipEnd(c);
          // Optional position offset for the copy — shadows, rows, patterns.
          if (args.dx!==undefined) { const n=Number(args.dx); if(!Number.isFinite(n)) throw new Error("dx must be a number"); copy.x=Math.round((clipX(c)+n)*1000)/1000; }
          if (args.dy!==undefined) { const n=Number(args.dy); if(!Number.isFinite(n)) throw new Error("dy must be a number"); copy.y=Math.round((clipY(c)+n)*1000)/1000; }
          clips.push(copy); break;
        }
        case "set_speed_ramp": {
          // Real speed changes over time: steps of speed (0 = freeze) over displayed time.
          const c = find(args?.clipId);
          if (!c.assetId) throw new Error("speed steps apply to media clips");
          const steps = normalizeSpeedRamp(args.segments);
          const next: Partial<Clip> = { speedRamp: steps, outPoint: round(c.inPoint + Math.max(0.04, rampSource(steps))) };
          // Keyframes stay pinned to displayed time, so they carry over untouched.
          clips[clips.indexOf(c)] = normalizeClip({ ...c, ...next });
          break;
        }
        case "freeze_frame": {
          // Pause a clip on one frame and hold it: a zero-speed step at `at`.
          const c = find(args?.clipId);
          if (!c.assetId) throw new Error("freeze frames apply to media clips");
          const hold = args.duration ?? 2;
          if (!Number.isFinite(hold) || hold < 0.1 || hold > 60) throw new Error("hold must be 0.1..60 seconds");
          const at = Math.max(0, Math.min(clipDuration(c) - 0.05, Number(args.at) || 0));
          const base = c.speedRamp?.length ? c.speedRamp : [{ speed: clipSpeed(c), duration: clipDuration(c) }];
          const [left, right] = sliceRamp(base, at);
          const steps = [...left, { speed: 0, duration: round(hold) }, ...right];
          clips[clips.indexOf(c)] = normalizeClip({ ...c, speedRamp: steps, outPoint: round(c.inPoint + Math.max(0.04, rampSource(steps))) });
          break;
        }
        case "save_sticker": {
          // The timeline does not change — the studio saves the clip as a sticker
          // when the tool runs. Kept as a valid op so saved tools keep working.
          break;
        }
        case "align_clips": {
          // Line clips up by their REAL edges — measured bounds, wrapped text
          // included — against each other or flush with the frame.
          if (!Array.isArray(args.clipIds) || !args.clipIds.length) throw new Error("clipIds required");
          const modes = ["left", "center", "right", "top", "middle", "bottom", "frame-left", "frame-right", "frame-top", "frame-bottom", "distribute-h", "distribute-v"];
          const mode = modes.includes(args.mode) ? args.mode : "left";
          const targets = args.clipIds.map((id: string) => find(id)).filter((c: Clip) => c.track !== "audio");
          if (!targets.length) throw new Error("no visual clips to line up");
          const round3 = (n: number) => Math.round(n * 1000) / 1000;
          const boxes: Array<{ c: Clip; b: ReturnType<typeof clipBounds> }> = targets.map((c: Clip) => ({ c, b: clipBounds(c, timeline.resolution, c.assetId ? getAsset(c.assetId) : undefined) }));
          const measured = boxes.filter((x) => x.b);
          if (mode === "distribute-h") targets.forEach((c: Clip, i: number) => { c.x = round3(targets.length === 1 ? 0.5 : (i + 1) / (targets.length + 1)); });
          else if (mode === "distribute-v") targets.forEach((c: Clip, i: number) => { c.y = round3(targets.length === 1 ? 0.5 : (i + 1) / (targets.length + 1)); });
          else if (mode === "center") { const cx = measured.length ? measured.reduce((s, x) => s + x.b!.x, 0) / measured.length : 0.5; targets.forEach((c: Clip) => { c.x = round3(cx); }); }
          else if (mode === "middle") { const cy = measured.length ? measured.reduce((s, x) => s + x.b!.y, 0) / measured.length : 0.5; targets.forEach((c: Clip) => { c.y = round3(cy); }); }
          else if (mode === "frame-left") { const m = args.margin ?? 0.02; for (const { c, b } of measured) c.x = round3(Math.min(1, m + b!.w / 2)); }
          else if (mode === "frame-right") { const m = args.margin ?? 0.02; for (const { c, b } of measured) c.x = round3(Math.max(0, 1 - m - b!.w / 2)); }
          else if (mode === "frame-top") { const m = args.margin ?? 0.02; for (const { c, b } of measured) c.y = round3(m + b!.h / 2); }
          else if (mode === "frame-bottom") { const m = args.margin ?? 0.02; for (const { c, b } of measured) c.y = round3(1 - m - b!.h / 2); }
          else if (mode === "left" || mode === "right") {
            if (!measured.length) throw new Error("these clips have no measurable size");
            const edge = mode === "left" ? Math.min(...measured.map((x) => x.b!.x - x.b!.w / 2)) : Math.max(...measured.map((x) => x.b!.x + x.b!.w / 2));
            for (const { c, b } of measured) c.x = round3(mode === "left" ? edge + b!.w / 2 : edge - b!.w / 2);
          }
          else if (mode === "top" || mode === "bottom") {
            if (!measured.length) throw new Error("these clips have no measurable size");
            const edge = mode === "top" ? Math.min(...measured.map((x) => x.b!.y - x.b!.h / 2)) : Math.max(...measured.map((x) => x.b!.y + x.b!.h / 2));
            for (const { c, b } of measured) c.y = round3(mode === "top" ? edge + b!.h / 2 : edge - b!.h / 2);
          }
          break;
        }
        case "move_layer": {
          // True stacking order within a track: z is honoured by the preview and the renderer.
          // The clip moves exactly one position in the track's paint order (z, then start,
          // then list order) — front/back jump to the ends — and the track's z ranks are
          // renumbered 0..n-1 so the new order is exact, whatever the old ranks were.
          const c=find(args?.clipId);
          if (c.track === "audio") throw new Error("audio clips have no layers");
          const dir = ["forward", "backward", "front", "back"].includes(args.direction) ? args.direction : "forward";
          const track=clips.filter((x: Clip) => x.track === c.track);
          const order=track.map((x: Clip, i: number) => ({ x, i }))
            .sort((a, b) => ((a.x.z ?? 0) - (b.x.z ?? 0)) || (a.x.start - b.x.start) || (a.i - b.i))
            .map((e: { x: Clip }) => e.x);
          const from = order.indexOf(c);
          const to = dir === "front" ? order.length - 1 : dir === "back" ? 0 : dir === "forward" ? Math.min(order.length - 1, from + 1) : Math.max(0, from - 1);
          if (to === from) break; // nowhere to move (single clip, or already at the end)
          order.splice(to, 0, order.splice(from, 1)[0]);
          order.forEach((x: Clip, k: number) => { x.z = Math.max(-100, Math.min(100, k)); });
          break;
        }
        case "snap_to_grid": {
          // Round positions to a grid so clips line up neatly.
          if (!Array.isArray(args.clipIds) || !args.clipIds.length) throw new Error("clipIds required");
          const grid=args.grid??0.1;
          if (!Number.isFinite(grid) || grid<0.02 || grid>0.5) throw new Error("grid must be 0.02..0.5");
          const round3=(n:number)=>Math.round(n*1000)/1000;
          for (const id of args.clipIds) { const c=find(id); if (c.track==="audio") continue; c.x=round3(Math.round(clipX(c)/grid)*grid); c.y=round3(Math.round(clipY(c)/grid)*grid); }
          break;
        }
        case "ripple_delete": { const c=find(args?.clipId),end=clipEnd(c),dur=clipDuration(c); timeline.clips=clips.filter(x=>x!==c).map(x=>x.track===c.track && x.start>=end ? {...x,start:Math.max(0,x.start-dur)} : x); break; }
        case "set_track": { if(!TRACKS.includes(args?.track)) throw new Error("unknown track"); timeline.tracks={...timeline.tracks,[args.track]:{...timeline.tracks?.[args.track as TrackName],...args.settings}}; break; }
        case "add_marker": { timeline.markers=[...(timeline.markers??[]),{id:args.id??uid(),time:args.time,label:args.label??"Marker",color:args.color}]; break; }
        case "remove_marker": { timeline.markers=(timeline.markers??[]).filter(m=>m.id!==args?.id); break; }
        case "shift_clips": {
          const { delta, from = 0, track, clipIds } = args || {};
          if (typeof delta !== "number" || !Number.isFinite(delta)) throw new Error("delta (seconds) required");
          for (const c of clips) if ((!track || c.track === track) && (!Array.isArray(clipIds) || clipIds.includes(c.id)) && c.start >= from - 0.0005) c.start = Math.max(0, Math.round((c.start + delta) * 1000) / 1000);
          break;
        }
        case "close_gaps": {
          const track = (args?.track ?? "video") as TrackName; if (!TRACKS.includes(track)) throw new Error("unknown track");
          let t = 0; for (const c of clips.filter((x) => x.track === track).sort((a, b) => a.start - b.start)) { c.start = Math.round(t * 1000) / 1000; t += clipDuration(c); }
          break;
        }
        case "update_clips": {
          const { clipIds, track, patch } = args || {}; if (!patch || typeof patch !== "object") throw new Error("patch object required");
          const { id: _i, assetId: _a, ...safe } = patch; let n = 0;
          clips.forEach((c, i) => { if ((Array.isArray(clipIds) && clipIds.includes(c.id)) || (!Array.isArray(clipIds) && (!track || c.track === track))) { clips[i] = patchWithAnimation(c, safe); n++; } });
          if (!n) throw new Error("no clips matched");
          break;
        }
        case "copy_style": {
          const from = find(args?.fromClipId), ids: string[] = Array.isArray(args?.toClipIds) ? args.toClipIds : [];
          const fields = ["x", "y", "scale", "rotation", "opacity", "blur", "fit", "flipX", "flipY", "filter", "brightness", "contrast", "saturation", "fadeIn", "fadeOut", "textSize", "textColor", "textBg"] as const;
          for (const id of ids) {
            const target = find(id), next: any = { ...target };
            for (const f of fields) next[f] = (from as any)[f];
            const d = clipDuration(target);
            next.keyframes = from.keyframes ? normalizeKeyframes(scaleKeys(JSON.parse(JSON.stringify(from.keyframes)), clipDuration(from), d), d) : undefined;
            clips[clips.indexOf(target)] = normalizeClip(next);
          }
          break;
        }
        case "set_marker": {
          const m = (timeline.markers ?? []).find((x) => x.id === args?.id); if (!m) throw new Error(`marker ${args?.id} not found`);
          if (typeof args.time === "number") m.time = Math.max(0, args.time); if (typeof args.label === "string") m.label = args.label.slice(0, 80); if (typeof args.color === "string") m.color = args.color;
          timeline.markers = [...(timeline.markers ?? [])].sort((a, b) => a.time - b.time); break;
        }
        case "set_transition": return setTransition(timeline,args.clipId,args.type,args.duration,args.join!==false);
        case "remove_clips": { if(!Array.isArray(args.clipIds)) throw new Error("clipIds required"); timeline.clips=clips.filter(c=>!args.clipIds.includes(c.id)); break; }
        case "apply_motion": { const c=find(args?.clipId); usePreset(c,args.preset,{duration:args.duration,delay:args.delay,strength:args.strength,easing:args.easing}); break; }
        case "apply_motion_sequence": {
          // One preset across several clips, each starting `stagger` seconds after the previous one.
          if (!Array.isArray(args.clipIds) || !args.clipIds.length || new Set(args.clipIds).size !== args.clipIds.length) throw new Error("unique clipIds required");
          const stagger = args.stagger ?? .12;
          if (!Number.isFinite(stagger) || stagger < 0 || stagger > 60) throw new Error("stagger must be 0..60 seconds");
          const start = args.start ?? Math.min(...args.clipIds.map((id: string) => find(id).start));
          if (!Number.isFinite(start) || start < 0) throw new Error("start must be nonnegative");
          args.clipIds.forEach((id: string, i: number) => { const c = find(id); usePreset(c, args.preset, { duration: args.duration, delay: args.delay, strength: args.strength, easing: args.easing }); c.start = Math.round((start + i * stagger) * 1000) / 1000; });
          break;
        }
        case "reverse_animation": { const c=find(args?.clipId); if(!c.keyframes) throw new Error("clip has no animation to reverse"); c.keyframes=reverseAnimation(c); break; }
        case "retime_animation": { const c=find(args?.clipId); c.keyframes=retimeAnimation(c,args.duration,args.delay??0); break; }
        case "add_beat_markers": {
          const count = args.count ?? 8;
          if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("count must be an integer 1..100");
          const times = beatTimes(args.bpm, count, args.start ?? 0, args.every ?? 1);
          timeline.markers = [...(timeline.markers ?? []), ...times.map((time, i) => ({ id: `beat-${uid().slice(0,6)}${i}`, time, label: args.label ?? `Beat ${i + 1}`, color: args.color }))];
          if (timeline.markers.length > 100) throw new Error("a timeline can contain at most 100 markers");
          break;
        }
        case "snap_to_beats": {
          if (!Array.isArray(args.clipIds) || !args.clipIds.length) throw new Error("clipIds required");
          if (!Number.isFinite(args.bpm) || args.bpm < 20 || args.bpm > 300) throw new Error("bpm must be 20..300");
          const origin = args.start ?? 0, beat = 60 / args.bpm;
          for (const id of args.clipIds) { const c = find(id); c.start = Math.max(0, Math.round((origin + Math.round((c.start - origin) / beat) * beat) * 1000) / 1000); }
          break;
        }
        case "animate_code": {
          // Per-property expressions of t, d, p and base; "" or null clears a property. See shared/expr.ts.
          const c = find(args?.clipId);
          if (!args?.expressions || typeof args.expressions !== "object" || Array.isArray(args.expressions)) throw new Error("expressions: {property: code} required");
          const next = { ...(args.replace ? {} : c.expressions) } as Record<string, string>;
          for (const [property, code] of Object.entries(args.expressions)) { if (code === "" || code === null) delete next[property]; else Object.assign(next, normalizeExpressions({ [property]: code })); }
          if (Object.keys(next).length > 10) throw new Error("a clip accepts at most 10 expressions");
          if (!c.assetId && !c.shape && (next as any).reveal) throw new Error("reveal applies to media and shape clips; use opacity or position for text");
          if (Object.keys(next).length) c.expressions = next; else delete c.expressions;
          break;
        }
        case "apply_code_motion": {
          // A named looping behaviour (float, orbit, wiggle...). Reads each property's static value as `base`.
          const ids: string[] = Array.isArray(args?.clipIds) ? args.clipIds : [args?.clipId];
          if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== "string")) throw new Error("clipId or clipIds required");
          for (const id of ids) {
            const c = find(id), made = codeRecipe(args.recipe, args.speed ?? 1, args.strength ?? 1);
            if (c.track === "audio") throw new Error("audio clips cannot use code motion");
            c.expressions = { ...c.expressions, ...normalizeExpressions(made) };
            if (c.keyframes) for (const p of Object.keys(made)) delete (c.keyframes as any)[p];
            if (c.keyframes && !Object.keys(c.keyframes).length) delete c.keyframes;
          }
          break;
        }
        case "bake_expression": {
          // Turns code into ordinary keyframes you can drag, retime and ease by hand.
          const c = find(args?.clipId), dur = clipDuration(c), samples = args.samples ?? 48;
          if (!Number.isInteger(samples) || samples < 2 || samples > 64) throw new Error("samples must be an integer 2..64");
          const props = (args.property ? [args.property] : Object.keys(c.expressions ?? {})) as AnimationProperty[];
          if (!props.length || props.some(p => !c.expressions?.[p])) throw new Error("no expression to bake");
          const keyframes: any = { ...c.keyframes };
          for (const p of props) {
            const times = Array.from({ length: samples }, (_, i) => Math.round(dur * i / (samples - 1) * 1000) / 1000);
            keyframes[p] = Array.from(new Set(times)).map(time => ({ time, value: Math.round(valueAt(c, p, time) * 10000) / 10000, easing: "linear" }));
          }
          const rest = { ...c.expressions }; for (const p of props) delete rest[p];
          c.keyframes = normalizeKeyframes(keyframes, dur);
          if (Object.keys(rest).length) c.expressions = rest; else delete c.expressions;
          break;
        }
        case "fit_clip": {
          // Scale and nudge one clip until its animated bounds sit inside the frame. mode: safe | contain | cover | fill.
          const c = find(args?.clipId), asset = c.assetId ? getAsset(c.assetId) : undefined;
          clips[clips.indexOf(c)] = normalizeClip({ ...c, ...fitClip(c, timeline.resolution, { width: asset?.width, height: asset?.height }, (args.mode ?? "safe") as FitMode, args.margin ?? .04) });
          break;
        }
        case "fit_all": {
          // Fit every visual clip (or clipIds) inside the frame. media: keep (default) | contain | cover | fill for video-track footage.
          const media = args?.media ?? "keep", ids: unknown = args?.clipIds;
          if (![ "keep", "contain", "cover", "fill"].includes(media)) throw new Error("media must be keep, contain, cover or fill");
          if (ids !== undefined && !Array.isArray(ids)) throw new Error("clipIds must be an array");
          clips.forEach((c, i) => {
            if (c.track === "audio" || (Array.isArray(ids) && !ids.includes(c.id))) return;
            const asset = c.assetId ? getAsset(c.assetId) : undefined, size = { width: asset?.width, height: asset?.height };
            const mode = c.assetId && c.track === "video" && media !== "keep" ? media : "safe";
            if (mode === "safe" && c.assetId && c.track === "video" && (c.fit === "cover" || c.fit === "fill")) return;
            clips[i] = normalizeClip({ ...c, ...fitClip(c, timeline.resolution, size, mode as FitMode, args.margin ?? .04) });
          });
          break;
        }
        default:
          throw new Error(`unknown op: ${op}`);
      }
  return normalizeTimeline(timeline);
}
