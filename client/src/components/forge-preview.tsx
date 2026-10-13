import { PreviewCursors, type Peer } from "./forge-presence";
import { incomingTransition, transitionProgress, transitionAudio } from "@shared/transitions";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { evaluateClip, valueAt } from "@shared/animation";
import { clipDuration, clipEnd, type Clip, type Timeline } from "@shared/timeline";
import type { AssetDTO } from "@/lib/editor-model";
import type { TimelineGesture } from "@/components/forge-timeline";

export function previewFilter(c:Clip,scaleBlur=1) {
  const preset:Record<string,string>={none:"",mono:"grayscale(1)",sepia:"sepia(1)",vivid:"saturate(1.45) contrast(1.08)",cool:"sepia(.2) hue-rotate(165deg)",warm:"sepia(.25) saturate(1.15)",faded:"saturate(.7) contrast(.88) brightness(1.04)"};
  return `${preset[c.filter??"none"]??""} brightness(${1+(c.brightness??0)}) contrast(${c.contrast??1}) saturate(${c.saturation??1})${c.blur?` blur(${c.blur*scaleBlur}px)`:""}`;
}
export function envelope(c:Clip,time:number) {
  const relative=time-c.start,remain=clipEnd(c)-time;
  const fadeIn=(c.fadeIn??0)>0?Math.min(1,Math.max(0,relative/c.fadeIn!)):1;
  const fadeOut=(c.fadeOut??0)>0?Math.min(1,Math.max(0,remain/c.fadeOut!)):1;
  return Math.min(fadeIn,fadeOut);
}
// Geometry mirrors the FFmpeg renderer: video fits the frame, overlays are a fraction of frame width.
export function layerTransform(c:Clip) {
  const x=c.x??.5,y=c.y??(!c.assetId?.length?.82:.5),scale=c.scale??(c.assetId&&c.track==="overlay"?.35:1);
  return {x,y,scale,transform:`translate(-50%,-50%) rotate(${c.rotation??0}deg) scale(${c.flipX?-1:1},${c.flipY?-1:1})`};
}

function MediaLayer({clip,asset,time,playing,source,hidden,muted,onError,timeline}:{timeline:Timeline;clip:Clip;asset:AssetDTO;time:number;playing:boolean;source:string;hidden:boolean;muted:boolean;onError:(message:string)=>void}) {
  const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
  const active=time>=clip.start && time<clipEnd(clip);
  const [failed,setFailed]=useState(false);
  const ev=evaluateClip(clip,time);
  const desired=clip.inPoint+Math.max(0,time-clip.start)*(clip.speed??1);
  const sync=()=>{
    const el=media.current;if(!el)return;
    el.playbackRate=clip.speed??1;
    el.muted=clip.muted||muted;
    el.volume=Math.min(1,Math.max(0,ev.volume*envelope(clip,time)*transitionAudio(timeline,clip,time)));
    if(active && (!playing || Math.abs(el.currentTime-desired)>.2) && Number.isFinite(desired)) {
      try { el.currentTime=desired; } catch { /* metadata not loaded */ }
    }
    if(active&&playing&&el.paused) el.play().catch(()=>{}); else if(!active||!playing) el.pause();
  };
  useEffect(sync,[time,playing,clip,source,muted]);
  useEffect(()=>{setFailed(false);},[source]);
  const visual=clip.track!=="audio"&&asset.kind!=="audio";
  const tr=incomingTransition(timeline,clip),p=transitionProgress(timeline,clip,time);
  const g=layerTransform(ev),opacity=(ev.opacity??1)*envelope(clip,time)*(tr?.type==="dissolve"?p:1);
  const base={opacity,clipPath:tr?.type==="wipe-left"?`inset(0 ${(1-p)*100}% 0 0)`:tr?.type==="wipe-right"?`inset(0 0 0 ${(1-p)*100}%)`:undefined,filter:previewFilter(ev,.6),display:active&&!hidden?undefined:"none",transform:g.transform,mixBlendMode:undefined};
  const style=clip.track==="overlay" ? {left:`${g.x*100}%`,top:`${g.y*100}%`,width:`${g.scale*100}%`,height:"auto",...base} : {left:`${g.x*100}%`,top:`${g.y*100}%`,width:"100%",height:"100%",objectFit:clip.fit==="cover"?"cover" as const:"contain" as const,...base,transform:`${g.transform} scale(${g.scale})`};
  const fail=()=>{if(!failed){setFailed(true);onError(`Couldn’t load ${asset.filename}. Check the source or API key.`);}};
  const common={"data-layer":clip.id} as any;
  if(asset.kind==="image")return source&&visual?<img {...common} src={source} crossOrigin="anonymous" className="preview-media" style={style} alt="" onError={fail}/>:null;
  if(!source)return null;
  if(!visual)return <audio ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="metadata" onLoadedMetadata={sync} onError={fail}/>;
  return <video {...common} ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="auto" playsInline className="preview-media" style={style} onLoadedMetadata={sync} onError={fail}/>;
}

type PreviewProps={timeline:Timeline;assets:AssetDTO[];time:number;playing:boolean;selectedId:string|null;readOnly:boolean;gesture:TimelineGesture;mediaUrl:(id:string,url:string)=>string;onError:(message:string)=>void;onValues:(id:string,values:Record<string,number>,live:boolean)=>void;muted?:boolean;onDropEffect?:(effect:any)=>void;peers?:Peer[];onCursor?:(c:{area:"preview";x:number;y:number}|null)=>void};
export default function ForgePreview({timeline,assets,time,playing,selectedId,readOnly,gesture,mediaUrl,onError,onValues,muted,onDropEffect,peers,onCursor}:PreviewProps) {
  const [dropHot,setDropHot]=useState(false);
  const area=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:640,height:360}),[box,setBox]=useState<{l:number;t:number;w:number;h:number}|null>(null);
  const ratio=timeline.resolution.width/timeline.resolution.height;
  useEffect(()=>{
    const el=area.current;if(!el)return;
    const resize=()=>{const w=Math.max(100,el.clientWidth-48),h=Math.max(100,el.clientHeight-48);setSize({width:Math.min(w,h*ratio),height:Math.min(h,w/ratio)});};
    resize();const ro=new ResizeObserver(resize);ro.observe(el);return()=>ro.disconnect();
  },[ratio]);
  const hiddenTrack=(c:Clip)=>!!timeline.tracks?.[c.track]?.hidden;
  const ordered=[...timeline.clips].sort((a,b)=>a.track===b.track?a.start-b.start:a.track==="video"?-1:b.track==="video"?1:0);
  const selected=timeline.clips.find(c=>c.id===selectedId),selectedActive=!!selected&&time>=selected.start&&time<clipEnd(selected)&&selected.track!=="audio"&&!hiddenTrack(selected);
  // Measure the selected layer so the on-canvas handles follow rotation, scale and keyframes.
  useLayoutEffect(()=>{
    const root=stage.current;if(!root||!selected||!selectedActive){setBox(prev=>prev?null:prev);return;}
    const el=root.querySelector(`[data-layer="${selected.id}"]`) as HTMLElement|null;if(!el){setBox(prev=>prev?null:prev);return;}
    const r=el.getBoundingClientRect(),s=root.getBoundingClientRect();
    // object-fit: contain footage fills the frame element, so use the intrinsic video rect when possible
    let {left,top,width,height}=r;
    const v=el as HTMLVideoElement;if(selected.track==="video"&&v.videoWidth&&v.videoHeight&&selected.fit!=="cover"){const aspect=v.videoWidth/v.videoHeight,fit=Math.min(r.width/aspect,r.height);width=Math.min(r.width,fit*aspect);height=fit;left=r.left+(r.width-width)/2;top=r.top+(r.height-height)/2;}
    const next={l:left-s.left,t:top-s.top,w:width,h:height};
    setBox(prev=>prev&&Math.abs(prev.l-next.l)<.5&&Math.abs(prev.t-next.t)<.5&&Math.abs(prev.w-next.w)<.5&&Math.abs(prev.h-next.h)<.5?prev:next);
  });
  const startDrag=(e:React.PointerEvent,mode:"move"|"scale")=>{
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
  const texts=ordered.filter(c=>c.text&&time>=c.start&&time<clipEnd(c)&&!hiddenTrack(c));
  return <div className={`preview-area ${dropHot?"drop-hot":""}`} ref={area} onDragOver={e=>{if(onDropEffect&&!readOnly&&e.dataTransfer.types.includes("application/x-vf-effect")){e.preventDefault();e.dataTransfer.dropEffect="copy";setDropHot(true);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropHot(false);}} onDrop={e=>{setDropHot(false);if(!onDropEffect||readOnly)return;try{const effect=JSON.parse(e.dataTransfer.getData("application/x-vf-effect"));e.preventDefault();e.stopPropagation();onDropEffect(effect);}catch{/* not an effect */}}}>
    <div className="preview-stage" ref={stage} style={{width:size.width,height:size.height,background:timeline.background??"#000"}} data-testid="preview-stage" onPointerMove={e=>{if(!onCursor)return;const r=e.currentTarget.getBoundingClientRect();onCursor({area:"preview",x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))});}} onPointerLeave={()=>onCursor?.(null)}>
      {ordered.map(c=>{const a=assets.find(x=>x.id===c.assetId);return a?<MediaLayer key={c.id} timeline={timeline} clip={c} asset={a} time={time} playing={playing} hidden={hiddenTrack(c)} muted={!!muted||!!timeline.tracks?.[c.track]?.muted} source={mediaUrl(a.id,`/api/media/${a.id}/raw`)} onError={onError}/>:null;})}
      {texts.map(c=>{const ev=evaluateClip(c,time),g=layerTransform(c.assetId?{...c,assetId:"",x:.5,y:.82,rotation:0,scale:1,keyframes:undefined}:ev);return <div key={`${c.id}-text`} data-layer={c.assetId?undefined:c.id} className="preview-caption" style={{left:`${g.x*100}%`,top:`${g.y*100}%`,fontSize:Math.round(size.height*(c.textSize??6)/100*g.scale),color:c.textColor??"#ffffff",background:c.textBg?"rgba(0,0,0,.55)":undefined,padding:c.textBg?".25em .35em":0,opacity:(c.assetId?1:(ev.opacity??1))*envelope(c,time),transform:g.transform,filter:c.blur?`blur(${c.blur*.6}px)`:undefined,textShadow:c.textBg?"none":"0 1px 3px #000"}}>{c.text}</div>;})}
      {box&&!playing&&<div className="selection-frame" style={{left:box.l,top:box.t,width:box.w,height:box.h}} onPointerDown={e=>startDrag(e,"move")} data-testid="selection-frame"><span className="scale-handle" onPointerDown={e=>startDrag(e,"scale")} aria-label="Drag to scale"/></div>}
      {peers&&<PreviewCursors peers={peers}/>}
      {!timeline.clips.length&&<div className="preview-empty"><Film size={28}/><h3>Your next story starts here.</h3><p>Import media or add a title to begin.</p></div>}
    </div><span className="preview-resolution mono">{timeline.resolution.width} × {timeline.resolution.height} · {timeline.fps} FPS</span>
  </div>;
}
