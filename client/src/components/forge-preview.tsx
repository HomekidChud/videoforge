import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { clipDuration, clipEnd, clipScale, clipX, clipY, type Clip, type Timeline } from "@shared/timeline";
import type { AssetDTO } from "@/lib/editor-model";

export function previewFilter(c:Clip) {
  const preset:Record<string,string>={none:"",mono:"grayscale(1)",sepia:"sepia(1)",vivid:"saturate(1.45) contrast(1.08)",cool:"sepia(.2) hue-rotate(165deg)",warm:"sepia(.25) saturate(1.15)",faded:"saturate(.7) contrast(.88) brightness(1.04)"};
  return `${preset[c.filter??"none"]??""} brightness(${1+(c.brightness??0)}) contrast(${c.contrast??1}) saturate(${c.saturation??1})`;
}
export function envelope(c:Clip,time:number) {
  const relative=time-c.start,remain=clipEnd(c)-time;
  const fadeIn=(c.fadeIn??0)>0?Math.min(1,Math.max(0,relative/c.fadeIn!)):1;
  const fadeOut=(c.fadeOut??0)>0?Math.min(1,Math.max(0,remain/c.fadeOut!)):1;
  return Math.min(fadeIn,fadeOut);
}

function MediaLayer({clip,asset,time,playing,source,onError}:{clip:Clip;asset:AssetDTO;time:number;playing:boolean;source:string;onError:(message:string)=>void}) {
  const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
  const active=time>=clip.start && time<clipEnd(clip);
  const [failed,setFailed]=useState(false);
  const desired=clip.inPoint+Math.max(0,time-clip.start)*(clip.speed??1);
  const sync=()=>{
    const el=media.current;if(!el)return;
    el.playbackRate=clip.speed??1;
    el.muted=clip.muted;
    el.volume=Math.min(1,Math.max(0,clip.volume*envelope(clip,time)));
    if(active && (!playing || Math.abs(el.currentTime-desired)>.2) && Number.isFinite(desired)) {
      try { el.currentTime=desired; } catch { /* metadata not loaded */ }
    }
    if(active&&playing&&el.paused) el.play().catch(()=>{}); else if(!active||!playing) el.pause();
  };
  useEffect(sync,[time,playing,clip,source]);
  useEffect(()=>{setFailed(false);},[source]);
  const visual=clip.track!=="audio"&&asset.kind!=="audio";
  const opacity=(clip.opacity??1)*envelope(clip,time);
  const style=clip.track==="overlay" ? {left:`${clipX(clip)*100}%`,top:`${clipY(clip)*100}%`,width:`${clipScale(clip)*100}%`,height:"auto",transform:"translate(-50%,-50%)",opacity,filter:previewFilter(clip),display:active?undefined:"none"} : {width:"100%",height:"100%",inset:0,opacity,filter:previewFilter(clip),display:active?undefined:"none"};
  const fail=()=>{if(!failed){setFailed(true);onError(`Couldn’t load ${asset.filename}. Check the source or API key.`);}};
  if(asset.kind==="image")return source&&visual?<img src={source} crossOrigin="anonymous" className="preview-media" style={style} alt="" onError={fail}/>:null;
  if(!source)return null;
  if(!visual)return <audio ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="metadata" onLoadedMetadata={sync} onError={fail}/>;
  return <video ref={el=>{media.current=el;}} src={source} crossOrigin="anonymous" preload="auto" playsInline className="preview-media" style={style} onLoadedMetadata={sync} onError={fail}/>;
}

export default function ForgePreview({timeline,assets,time,playing,mediaUrl,onError}:{timeline:Timeline;assets:AssetDTO[];time:number;playing:boolean;mediaUrl:(id:string,url:string)=>string;onError:(message:string)=>void}) {
  const area=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:640,height:360});
  const ratio=timeline.resolution.width/timeline.resolution.height;
  useEffect(()=>{
    const el=area.current;if(!el)return;
    const resize=()=>{const w=Math.max(100,el.clientWidth-48),h=Math.max(100,el.clientHeight-48);setSize({width:Math.min(w,h*ratio),height:Math.min(h,w/ratio)});};
    resize();const ro=new ResizeObserver(resize);ro.observe(el);return()=>ro.disconnect();
  },[ratio]);
  const ordered=[...timeline.clips].sort((a,b)=>a.track===b.track?a.start-b.start:a.track==="video"?-1:b.track==="video"?1:0);
  return <div className="preview-area" ref={area}>
    <div className="preview-stage" style={{width:size.width,height:size.height}} data-testid="preview-stage">
      {ordered.map(c=>{const a=assets.find(x=>x.id===c.assetId);return a?<MediaLayer key={c.id} clip={c} asset={a} time={time} playing={playing} source={mediaUrl(a.id,`/api/media/${a.id}/raw`)} onError={onError}/>:null;})}
      {ordered.filter(c=>c.text&&time>=c.start&&time<clipEnd(c)).map(c=><div key={`${c.id}-text`} className="preview-caption" style={{left:`${(c.assetId?.length?0.5:clipX(c))*100}%`,top:`${(c.assetId?.length?0.82:clipY(c))*100}%`,fontSize:Math.round(size.height*(c.textSize??6)/100),color:c.textColor??"#ffffff",background:c.textBg?"rgba(0,0,0,.55)":undefined,padding:c.textBg?".25em .35em":0,opacity:envelope(c,time),textShadow:c.textBg?"none":"0 1px 3px #000"}}>{c.text}</div>)}
      {!timeline.clips.length&&<div className="preview-empty"><Film size={28}/><h3>Your next story starts here.</h3><p>Import media or add a title to begin.</p></div>}
    </div><span className="preview-resolution mono">{timeline.resolution.width} × {timeline.resolution.height} · {timeline.fps} FPS</span>
  </div>;
}
