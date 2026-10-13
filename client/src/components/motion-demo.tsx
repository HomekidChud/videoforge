import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { templateClips, MOTION_TEMPLATES } from "@shared/graphics";
import { normalizeTimeline } from "@shared/timeline";
import ForgePreview from "./forge-preview";

export default function MotionDemo({compact=false}:{compact?:boolean}) {
  const [preset,setPreset]=useState("title-card"),[title,setTitle]=useState("Ideas, in motion."),[time,setTime]=useState(.8),[playing,setPlaying]=useState(!matchMedia("(prefers-reduced-motion: reduce)").matches);
  const timeline=useMemo(()=>{let i=0;return normalizeTimeline({clips:templateClips({template:preset,title,subtitle:"A timeline for people. An API for agents.",duration:4},()=>`demo-${++i}`),background:"#17191b",resolution:{width:1280,height:720},fps:30});},[preset,title]);
  useEffect(()=>{if(!playing)return;let frame=0,last=performance.now();const tick=(now:number)=>{const dt=(now-last)/1000;last=now;setTime(t=>(t+dt)%4);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing]);
  return <div className={`motion-demo ${compact?"compact":""}`} data-testid="motion-demo">
    <div className="demo-head"><span className="mono">composition / {preset}</span><span className="demo-live">LIVE PREVIEW</span></div>
    <div className="demo-monitor"><ForgePreview timeline={timeline} assets={[]} time={time} playing={playing} selectedId={null} readOnly gesture={{begin:()=>{},end:()=>{},update:()=>{}}} mediaUrl={()=>""} onError={()=>{}} onValues={()=>{}}/></div>
    <div className="demo-controls"><button aria-label={playing?"Pause demo":"Play demo"} onClick={()=>setPlaying(p=>!p)} data-testid="demo-play">{playing?<Pause size={16}/>:<Play size={16}/>}</button><button aria-label="Restart demo" onClick={()=>setTime(0)}><RotateCcw size={15}/></button><input aria-label="Demo playhead" type="range" min={0} max={3.99} step={.01} value={time} onChange={e=>{setPlaying(false);setTime(Number(e.target.value));}}/><span className="mono">{time.toFixed(2)}s</span></div>
    <div className="demo-inputs"><label>Template<select aria-label="Demo template" value={preset} onChange={e=>{setPreset(e.target.value);if(e.target.value==="kinetic-type")setTitle(t=>t.trim().split(/\s+/).slice(0,8).join(" "));setTime(.8);}} data-testid="demo-template">{MOTION_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>{preset==="kinetic-type"?"Headline (up to 8 words)":"Headline"}<input aria-label="Demo headline" maxLength={100} value={title} onChange={e=>{const text=e.target.value||"Your idea";setTitle(preset==="kinetic-type"?text.split(/\s+/).slice(0,8).join(" "):text);}} data-testid="demo-headline"/></label></div>
  </div>;
}
