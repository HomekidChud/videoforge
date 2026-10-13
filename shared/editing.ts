import { normalizeClip, normalizeTimeline, clipDuration, clipEnd, TRACKS, type Clip, type Timeline, type TrackName } from "./timeline";
import { normalizeKeyframes, isProperty, sliceKeyframes, type AnimationProperty } from "./animation";
import { motionPreset } from "./presets";
const uid = () => Math.random().toString(36).slice(2,14);
export type TimelineOp = { op: string; args?: any };
export function splitKeyframes(c:Clip, at:number) { return [sliceKeyframes(c,0,at),sliceKeyframes(c,at,clipDuration(c))]; }
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
export function applyTimelineOp(raw:Timeline, {op,args={}}:TimelineOp, getAsset:(id:string)=>{kind:string;duration:number}|undefined):Timeline {
  const timeline=normalizeTimeline(JSON.parse(JSON.stringify(raw)));
  const clips=timeline.clips;
  const find=(id:unknown)=> { const c=clips.find(x=>x.id===id); if(!c) throw new Error(`clip ${id} not found`); return c; };
      switch (op) {
        case "add_clip": {
          const c = (args || {}) as Partial<Clip>;
          const asset = c.assetId ? getAsset(c.assetId) : undefined;
          if (c.assetId && !asset) throw new Error(`asset ${c.assetId} not found`);
          if (!c.assetId && !c.text) throw new Error("assetId or text required");
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
          clips.push(normalizeClip({ ...style, id: uid(), assetId: "", track: "overlay", text, start: start ?? 0, inPoint: 0, outPoint: duration ?? 3 }));
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
          if (["video", "overlay", "audio"].includes(track)) c.track = track;
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
        case "set_project": {
          const { fps, resolution } = args || {};
          if (args.background !== undefined) timeline.background = args.background;
          if (fps) timeline.fps = fps;
          if (resolution) timeline.resolution = resolution;
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
        case "duplicate_clip": { const c=find(args?.clipId); clips.push({...JSON.parse(JSON.stringify(c)),id:args.newId??uid(),start:args.start??clipEnd(c)}); break; }
        case "ripple_delete": { const c=find(args?.clipId),end=clipEnd(c),dur=clipDuration(c); timeline.clips=clips.filter(x=>x!==c).map(x=>x.track===c.track && x.start>=end ? {...x,start:Math.max(0,x.start-dur)} : x); break; }
        case "set_track": { if(!TRACKS.includes(args?.track)) throw new Error("unknown track"); timeline.tracks={...timeline.tracks,[args.track]:{...timeline.tracks?.[args.track as TrackName],...args.settings}}; break; }
        case "add_marker": { timeline.markers=[...(timeline.markers??[]),{id:args.id??uid(),time:args.time,label:args.label??"Marker",color:args.color}]; break; }
        case "remove_marker": { timeline.markers=(timeline.markers??[]).filter(m=>m.id!==args?.id); break; }
        case "apply_motion": { const c=find(args?.clipId); Object.assign(c, motionPreset(c,args.preset)); break; }
        default:
          throw new Error(`unknown op: ${op}`);
      }
  return normalizeTimeline(timeline);
}
