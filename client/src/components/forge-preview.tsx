import { PreviewCursors, type Peer } from "./forge-presence";
import { incomingTransition, transitionProgress, transitionAudio, transitionClipPath } from "@shared/transitions";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Film } from "lucide-react";
import { evaluateClip, valueAt } from "@shared/animation";
import { clipDuration, clipEnd, rampSourceAt, rampSpeedAt, type Clip, type Timeline } from "@shared/timeline";
import { textLayout } from "@shared/layout";
import { getFont } from "@shared/fonts";
import type { AssetDTO } from "@/lib/editor-model";
import { useT } from "@/lib/lang";
import type { TimelineGesture } from "@/components/forge-timeline";

export function previewFilter(c:Clip,scaleBlur=1) {
  const preset:Record<string,string>={none:"",mono:"grayscale(1)",sepia:"sepia(1)",vivid:"saturate(1.45) contrast(1.08)",cool:"sepia(.2) hue-rotate(165deg)",warm:"sepia(.25) saturate(1.15)",faded:"saturate(.7) contrast(.88) brightness(1.04)"};
  return `${preset[c.filter??"none"]??""} brightness(${1+(c.brightness??0)}) contrast(${c.contrast??1}) saturate(${c.saturation??1})${c.blur?` blur(${c.blur*scaleBlur}px)`:""}`;
}
export const revealClip=(r?:number)=>r!==undefined&&r<1?`inset(0 ${(1-Math.max(0,r))*100}% 0 0)`:undefined;
/** A crop box (fractions of the layer box to keep) as a CSS inset, combined with the reveal mask. */
export const cropClip=(c?:{x:number;y:number;w:number;h:number},r?:number)=>{
  const l=c?c.x*100:0,t=c?c.y*100:0,rt=c?(1-(c.x+c.w))*100:0,b=c?(1-(c.y+c.h))*100:0;
  const rr=r!==undefined&&r<1?(1-Math.max(0,r))*100:0;
  return c||rr>0?`inset(${t}% ${Math.max(rt,rr)}% ${b}% ${l}%)`:undefined;
};
export function envelope(c:Clip,time:number) {
  const relative=time-c.start,remain=clipEnd(c)-time;
  const fadeIn=(c.fadeIn??0)>0?Math.min(1,Math.max(0,relative/c.fadeIn!)):1;
  const fadeOut=(c.fadeOut??0)>0?Math.min(1,Math.max(0,remain/c.fadeOut!)):1;
  return Math.min(fadeIn,fadeOut);
}
// Geometry mirrors the FFmpeg renderer: video fits the frame, overlays are a fraction of frame width.
export function layerTransform(c:Clip) {
  const x=c.x??.5,y=c.y??(!c.assetId?.length&&!c.shape?.82:.5),scale=c.scale??(c.assetId&&c.track==="overlay"?.35:1);
  return {x,y,scale,transform:`translate(-50%,-50%) rotate(${c.rotation??0}deg) scale(${c.flipX?-1:1},${c.flipY?-1:1})`};
}

function MediaLayer({clip,asset,time,playing,source,hidden,muted,onError,timeline}:{timeline:Timeline;clip:Clip;asset:AssetDTO;time:number;playing:boolean;source:string;hidden:boolean;muted:boolean;onError:(message:string)=>void}) {
  const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
  const active=time>=clip.start && time<clipEnd(clip);
  const [failed,setFailed]=useState(false);
  const ev=evaluateClip(clip,time);
  // Speed steps: the source position follows the steps (a freeze step holds the frame).
  const rel=Math.max(0,time-clip.start);
  const desired=clip.speedRamp?.length ? clip.inPoint+rampSourceAt(clip.speedRamp,rel) : clip.inPoint+rel*(clip.speed??1);
  const rate=clip.speedRamp?.length ? Math.max(0.0625, rampSpeedAt(clip.speedRamp,rel)) : (clip.speed??1);
  const sync=()=>{
    const el=media.current;if(!el)return;
    el.playbackRate=rate;
    el.muted=clip.muted||muted;
    el.volume=Math.min(1,Math.max(0,ev.volume*envelope(clip,time)*transitionAudio(timeline,clip,time)));
    if(active && Number.isFinite(desired)) {
      const drift=Math.abs(el.currentTime-desired);
      const frozen=rate<=0.01; // a freeze segment (speed ramp at ~0) holds one exact frame
      // While paused (scrubbing) sync exactly. While playing, only correct drift that
      // has grown large, and never stack a second seek on one still in flight: those
      // mid-playback seeks are what read as stutter. A freeze pauses and pins the frame.
      const wantSeek=!playing?(drift>0.001):frozen?(drift>0.05):(!el.seeking&&drift>0.5);
      if(wantSeek){ try { el.currentTime=desired; } catch { /* metadata not loaded */ } }
    }
    if(active&&playing&&rate>0.01&&el.paused) el.play().catch(()=>{}); else if(!active||!playing||rate<=0.01) el.pause();
  };
  useEffect(sync,[time,playing,clip,source,muted]);
  useEffect(()=>{setFailed(false);},[source]);
  const visual=clip.track!=="audio"&&asset.kind!=="audio";
  const tr=incomingTransition(timeline,clip),p=transitionProgress(timeline,clip,time);
  const g=layerTransform(ev),opacity=(ev.opacity??1)*envelope(clip,time)*(tr?.type==="dissolve"?p:1);
  const base={opacity,clipPath:tr&&p<1?transitionClipPath(tr.type,p):cropClip(clip.crop,ev.reveal),filter:previewFilter(ev,.6),display:active&&!hidden?undefined:"none",transform:g.transform,mixBlendMode:undefined};
  const style=clip.track==="overlay" ? {left:`${g.x*100}%`,top:`${g.y*100}%`,width:`${g.scale*100}%`,height:"auto",...base} : {left:`${g.x*100}%`,top:`${g.y*100}%`,width:"100%",height:"100%",objectFit:clip.fit==="cover"?"cover" as const:clip.fit==="fill"?"fill" as const:"contain" as const,...base,transform:`${g.transform} scale(${g.scale})`};
  const fail=()=>{if(!failed){setFailed(true);onError(`Couldn’t load ${asset.filename}. Check the source or API key.`);}};
  const common={"data-layer":clip.id} as any;
  if(asset.kind==="image")return source&&visual?<img {...common} src={source} crossOrigin="anonymous" className="preview-media" style={style} alt="" onError={fail}/>:null;
  if(!source)return null;
  if(!visual)return <audio ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="metadata" onLoadedMetadata={sync} onError={fail}/>;
  return <video {...common} ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="auto" playsInline className="preview-media" style={style} onLoadedMetadata={sync} onError={fail}/>;
}

type PreviewProps={emptyActions?:React.ReactNode;timeline:Timeline;assets:AssetDTO[];time:number;playing:boolean;selectedId:string|null;readOnly:boolean;gesture:TimelineGesture;mediaUrl:(id:string,url:string)=>string;onError:(message:string)=>void;onValues:(id:string,values:Record<string,number>,live:boolean)=>void;onSelect?:(id:string|null,mode?:"replace"|"toggle")=>void;muted?:boolean;onDropEffect?:(effect:any)=>void;peers?:Peer[];onCursor?:(c:{area:"preview";x:number;y:number}|null)=>void};
/** The visible part of a text clip's text at a moment in time, for reveal effects. */
function revealedText(text: string, reveal: { mode: "typewriter" | "words" | "lines"; duration?: number; delay?: number } | undefined, start: number, time: number): string {
  if (!reveal) return text;
  const p = Math.min(1, Math.max(0, (time - start - (reveal.delay ?? 0)) / Math.max(0.01, reveal.duration ?? 1.5)));
  if (p <= 0) return "";
  if (reveal.mode === "words") { const words = text.split(/\s+/); return words.slice(0, Math.ceil(p * words.length)).join(" "); }
  if (reveal.mode === "lines") { const lines = text.split("\n"); return lines.slice(0, Math.ceil(p * lines.length)).join("\n"); }
  const chars = Array.from(text);
  return chars.slice(0, Math.ceil(p * chars.length)).join("");
}

/** The current colour of a cycling text clip. */
function cycledColor(cycle: { steps: string[]; duration?: number } | undefined, start: number, time: number): string | undefined {
  if (!cycle || !cycle.steps.length) return undefined;
  const per = Math.max(0.05, (cycle.duration ?? 2) / cycle.steps.length);
  const elapsed = time - start;
  if (elapsed < 0) return cycle.steps[0];
  return cycle.steps[Math.floor(elapsed / per) % cycle.steps.length];
}

export default function ForgePreview({timeline,assets,time,playing,selectedId,readOnly,gesture,mediaUrl,onError,onValues,onSelect,muted,onDropEffect,peers,onCursor,emptyActions}:PreviewProps) {
  const t = useT();
  const [dropHot,setDropHot]=useState(false);
  const area=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:640,height:360}),[box,setBox]=useState<{l:number;t:number;w:number;h:number}|null>(null);
  const ratio=timeline.resolution.width/timeline.resolution.height;
  useEffect(()=>{
    const el=area.current;if(!el)return;
    const resize=()=>{const w=Math.max(32,el.clientWidth-24),h=Math.max(32,el.clientHeight-40);setSize({width:Math.min(w,h*ratio),height:Math.min(h,w/ratio)});};
    resize();const ro=new ResizeObserver(resize);ro.observe(el);return()=>ro.disconnect();
  },[ratio]);
  const hiddenTrack=(c:Clip)=>!!timeline.tracks?.[c.track]?.hidden;
  const ordered=[...timeline.clips].sort((a,b)=>a.track===b.track?((a.z??0)-(b.z??0))||(a.start-b.start):a.track==="video"?-1:b.track==="video"?1:0);
  const selected=timeline.clips.find(c=>c.id===selectedId),selectedActive=!!selected&&time>=selected.start&&time<clipEnd(selected)&&selected.track!=="audio"&&!hiddenTrack(selected);
  // Measure the selected layer so the on-canvas handles follow rotation, scale and keyframes.
  // Skipped while playing: the frame is hidden then, and measuring every animation
  // frame forced a layout read per frame.
  useLayoutEffect(()=>{
    const root=stage.current;if(!root||!selected||!selectedActive||playing){setBox(prev=>prev?null:prev);return;}
    const el=root.querySelector(`[data-layer="${selected.id}"]`) as HTMLElement|null;if(!el){setBox(prev=>prev?null:prev);return;}
    const r=el.getBoundingClientRect(),s=root.getBoundingClientRect();
    // object-fit: contain footage fills the frame element, so use the intrinsic video rect when possible
    let {left,top,width,height}=r;
    const v=el as HTMLVideoElement;if(selected.track==="video"&&v.videoWidth&&v.videoHeight&&selected.fit!=="cover"&&selected.fit!=="fill"){const aspect=v.videoWidth/v.videoHeight,fit=Math.min(r.width/aspect,r.height);width=Math.min(r.width,fit*aspect);height=fit;left=r.left+(r.width-width)/2;top=r.top+(r.height-height)/2;}
    const next={l:left-s.left,t:top-s.top,w:width,h:height};
    setBox(prev=>prev&&Math.abs(prev.l-next.l)<.5&&Math.abs(prev.t-next.t)<.5&&Math.abs(prev.w-next.w)<.5&&Math.abs(prev.h-next.h)<.5?prev:next);
  });
  const startDrag=(e:React.PointerEvent,mode:"move"|"scale")=>{
    if(mode==="move"&&e.shiftKey&&selected&&onSelect){e.preventDefault();e.stopPropagation();onSelect(selected.id,"toggle");return;}
    if(readOnly||!selected||!stage.current)return;e.preventDefault();e.stopPropagation();(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect=stage.current.getBoundingClientRect(),start=evaluateClip(selected,time),g=layerTransform(start);
    const center={x:rect.left+g.x*rect.width,y:rect.top+g.y*rect.height},d0=Math.max(8,Math.hypot(e.clientX-center.x,e.clientY-center.y)),p0={x:e.clientX,y:e.clientY};
    gesture.begin();
    const move=(ev:PointerEvent)=>{
      if(mode==="move")onValues(selected.id,{x:Math.min(1,Math.max(0,g.x+(ev.clientX-p0.x)/rect.width)),y:Math.min(1,Math.max(0,g.y+(ev.clientY-p0.y)/rect.height))},true);
      else onValues(selected.id,{scale:Math.min(2,Math.max(.1,g.scale*Math.hypot(ev.clientX-center.x,ev.clientY-center.y)/d0))},true);
    };
    const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);gesture.end();};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
  };
  const layerSort=(a:Clip,b:Clip)=>((a.z??0)-(b.z??0))||(a.start-b.start);
  const texts=timeline.clips.filter(c=>c.text&&time>=c.start&&time<clipEnd(c)&&!hiddenTrack(c)).sort(layerSort);
  // One stacking order for every overlay visual, media, shapes and text alike:
  // z first (higher draws on top), then start. Video-track footage stays beneath.
  const overlayItems:Array<{z:number;start:number;node:ReactNode}>=[];
  for(const c of ordered){
    if(c.track!=="overlay")continue;
    const a=assets.find(x=>x.id===c.assetId);
    if(a)overlayItems.push({z:c.z??0,start:c.start,node:<MediaLayer key={c.id} timeline={timeline} clip={c} asset={a} time={time} playing={playing} hidden={hiddenTrack(c)} muted={!!muted||!!timeline.tracks?.[c.track]?.muted} source={mediaUrl(a.id,`/api/media/${a.id}/raw`)} onError={onError}/>});
  }
  for(const c of timeline.clips.filter(c=>c.shape&&time>=c.start&&time<clipEnd(c)&&!hiddenTrack(c))){
    const ev=evaluateClip(c,time),g=layerTransform(ev),s=c.shape!;
    overlayItems.push({z:c.z??0,start:c.start,node:(
      <div key={c.id} data-layer={c.id} data-testid={`shape-layer-${c.id}`} style={{
        position:"absolute",boxSizing:"border-box",left:`${g.x*100}%`,top:`${g.y*100}%`,
        width:Math.max(2,Math.round(size.width*s.width/2)*2),height:Math.max(2,Math.round(size.height*s.height/2)*2),
        background:s.fill,border:`${s.strokeWidth*size.width/timeline.resolution.width}px solid ${s.stroke}`,
        borderRadius:s.type==="ellipse"?"50%":s.radius*size.width/timeline.resolution.width,
        clipPath:revealClip(ev.reveal),opacity:(ev.opacity??1)*envelope(c,time),transform:`${g.transform} scale(${g.scale})`,filter:previewFilter(ev,size.width/timeline.resolution.width),
      }}/>)});
  }
  for(const c of texts){const ev=evaluateClip(c,time),g=layerTransform(c.assetId?{...c,assetId:"",x:.5,y:.82,rotation:0,scale:1,keyframes:undefined}:ev),lay=textLayout(c,timeline.resolution),fitted=c.textFit!=="none",shown=revealedText(fitted?lay.text:(c.text??""),c.textReveal,c.start,time);overlayItems.push({z:c.z??0,start:c.start,node:(
    <div key={`${c.id}-text`} data-layer={c.assetId?undefined:c.id} className="preview-caption" style={{left:`${g.x*100}%`,top:`${g.y*100}%`,fontSize:fitted?lay.fontSize*size.height/timeline.resolution.height*g.scale:Math.round(size.height*(c.textSize??6)/100*g.scale),maxWidth:fitted?"none":undefined,whiteSpace:fitted?"pre":undefined,color:cycledColor(c.textColorCycle,c.start,time)??c.textColor??"#ffffff",fontFamily:getFont(c.font).stack,fontWeight:c.fontWeight??400,textAlign:c.textAlign,lineHeight:c.lineHeight,letterSpacing:c.letterSpacing?`${c.letterSpacing}em`:undefined,textTransform:c.textTransform==="uppercase"?"uppercase":undefined,background:c.textBg?"rgba(0,0,0,.55)":undefined,padding:c.textBg?".25em .35em":0,opacity:(c.assetId?1:(ev.opacity??1))*envelope(c,time),transform:g.transform,filter:c.blur?`blur(${c.blur*.6}px)`:undefined,textShadow:c.textBg?"none":"0 1px 3px #000"}}>{shown}</div>)});}
  overlayItems.sort((p,q)=>p.z-q.z||p.start-q.start);
  return <div className={`preview-area ${dropHot?"drop-hot":""}`} ref={area} onDragOver={e=>{if(onDropEffect&&!readOnly&&e.dataTransfer.types.includes("application/x-vf-effect")){e.preventDefault();e.dataTransfer.dropEffect="copy";setDropHot(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropHot(false);}} onDrop={e=>{setDropHot(false);if(!onDropEffect||readOnly)return;try{const effect=JSON.parse(e.dataTransfer.getData("application/x-vf-effect"));e.preventDefault();e.stopPropagation();onDropEffect(effect);}catch{/* not an effect */}}}>
    <div className={`preview-stage ${onSelect?"selectable-stage":""}`} ref={stage} style={{width:size.width,height:size.height,background:timeline.background??"#000"}} data-testid="preview-stage"
      onPointerDown={e=>{
        if(!onSelect||playing||e.button!==0)return;
        const layer=(e.target as HTMLElement).closest<HTMLElement>("[data-layer]");
        if(layer){e.stopPropagation();onSelect(layer.dataset.layer??null,e.shiftKey?"toggle":"replace");}
        else if(e.target===e.currentTarget)onSelect(null);
      }}
      onPointerMove={e=>{if(!onCursor)return;const r=e.currentTarget.getBoundingClientRect();onCursor({area:"preview",x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))});}} onPointerLeave={()=>onCursor?.(null)}>
      {ordered.filter(c=>c.track!=="overlay").map(c=>{const a=assets.find(x=>x.id===c.assetId);return a?<MediaLayer key={c.id} timeline={timeline} clip={c} asset={a} time={time} playing={playing} hidden={hiddenTrack(c)} muted={!!muted||!!timeline.tracks?.[c.track]?.muted} source={mediaUrl(a.id,`/api/media/${a.id}/raw`)} onError={onError}/>:null;})}
      {overlayItems.map((it)=>it.node)}
      {box&&!playing&&<div className="selection-frame" style={{left:box.l,top:box.t,width:box.w,height:box.h}} onPointerDown={e=>startDrag(e,"move")} data-testid="selection-frame"><span className="scale-handle" onPointerDown={e=>startDrag(e,"scale")} aria-label="Drag to scale"/></div>}
      {peers&&<PreviewCursors peers={peers}/>}
      {!timeline.clips.length&&<div className="preview-empty"><Film size={28}/><h3>{t("preview.emptyTitle", "Your next story starts here.")}</h3><p>{t("preview.emptyHint", "Import media or add a title to begin.")}</p>{emptyActions&&<div className="preview-empty-actions">{emptyActions}</div>}</div>}
    </div><span className="preview-resolution mono">{timeline.resolution.width} × {timeline.resolution.height} · {timeline.fps} FPS</span>
  </div>;
}
