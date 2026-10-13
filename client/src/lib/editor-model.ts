import { patchWithAnimation, splitKeyframes } from "@shared/editing";
import { clipDuration, clipEnd, normalizeClip, type Clip, type Timeline } from "@shared/timeline";

export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
export const EMPTY_TIMELINE = (): Timeline => ({ version:2, fps:30, resolution:{width:1280,height:720}, clips:[] });
export type AssetDTO = { id:string; filename:string; kind:"video"|"audio"|"image"; mime:string; duration:number; width:number; height:number; sizeBytes:number; uploadUrl:string; thumbnailUrl:string; hasAudio?:boolean; createdAt:number };
export type ProjectDTO = { id:string; name:string; timeline:Timeline; visibility:"private"|"public"; createdAt:number; updatedAt:number };
export type RenderDTO = { id:string; projectId:string; status:"queued"|"rendering"|"done"|"error"; progress:number; outputPath:string|null; error:string|null };
export const round = (n:number) => Math.round(n*1000)/1000;
export function timecode(seconds:number,fps=30) {
  const s = Math.max(0,seconds), frames = Math.floor((s%1)*fps);
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s)%60).padStart(2,"0")}:${String(frames).padStart(2,"0")}`;
}
export const snapshot = (t:Timeline) => JSON.parse(JSON.stringify(t)) as Timeline;
export const sameTimeline = (a:Timeline,b:Timeline) => JSON.stringify(a) === JSON.stringify(b);
export function newClip(asset:AssetDTO,start:number,track?:Clip["track"]):Clip {
  return normalizeClip({id:uid(),assetId:asset.id,track:track ?? (asset.kind==="audio"?"audio":"video"),start,inPoint:0,outPoint:asset.kind==="image"?5:asset.duration||5,volume:1,muted:false});
}
export function splitClip(t:Timeline,id:string,at:number):Timeline|null {
  const c=t.clips.find(x=>x.id===id);
  if(!c) return null;
  const rel=at-c.start;
  if(rel<0.1 || rel>clipDuration(c)-0.1) return null;
  const sourceSplit=round(c.inPoint+rel*(c.assetId?(c.speed??1):1));
  const left={...c,outPoint:sourceSplit},right={...c,id:uid(),start:round(at),inPoint:sourceSplit};
  delete left.fadeOut;delete right.fadeIn;
  const keys=splitKeyframes(c,rel); left.keyframes=keys[0];right.keyframes=keys[1];
  return {...t,clips:t.clips.flatMap(x=>x.id===id?[left,right]:[x])};
}
export function duplicateClip(t:Timeline,id:string):{timeline:Timeline;id:string}|null {
  const c=t.clips.find(x=>x.id===id);if(!c)return null;
  const next={...c,id:uid(),start:clipEnd(c)};
  return {timeline:{...t,clips:[...t.clips,next]},id:next.id};
}
export function rippleDelete(t:Timeline,id:string):Timeline {
  const c=t.clips.find(x=>x.id===id);if(!c)return t;
  const dur=clipDuration(c);
  return {...t,clips:t.clips.filter(x=>x.id!==id).map(x=>x.track===c.track && x.start>=clipEnd(c)?{...x,start:round(Math.max(0,x.start-dur))}:x)};
}
export function snapTime(value:number,targets:number[],threshold:number,fps:number):number {
  let best=Math.round(value*fps)/fps,nearest=threshold;
  for(const target of targets){const d=Math.abs(target-value);if(d<nearest){best=target;nearest=d;}}
  return round(Math.max(0,best));
}
export function clampClipPatch(c:Clip,patch:Partial<Clip>,asset?:AssetDTO):Clip {
  const raw={...c,...patch};
  const maxSource=asset&&asset.kind!=="image"&&asset.duration>0?asset.duration:86400;
  const inPoint=Math.min(Math.max(0,raw.inPoint),Math.max(0,maxSource-0.1));
  const outPoint=Math.max(inPoint+0.1,Math.min(maxSource,raw.outPoint));
  const adjusted:Partial<Clip>={...patch,inPoint,outPoint};
  if(asset?.kind==="image") adjusted.speed=undefined;
  return patchWithAnimation(c,adjusted);
}
