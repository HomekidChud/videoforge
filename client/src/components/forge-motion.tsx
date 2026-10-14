import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Diamond, Plus, Trash2 } from "lucide-react";
import { ANIMATABLE, EASINGS, baseValue, clamp, easeAt, easingCurve, valueAt, type AnimationProperty, type Bezier, type Easing, type Keyframe } from "@shared/animation";
import { clipDuration, type Clip } from "@shared/timeline";
import { MOTION_PRESETS, motionPreset } from "@shared/presets";
import { round } from "@/lib/editor-model";
import type { TimelineGesture } from "./forge-timeline";

type Props={clip:Clip;time:number;fps:number;audioOnly:boolean;readOnly:boolean;patch:(p:Partial<Clip>,live?:boolean)=>void;seek:(t:number)=>void;gesture:TimelineGesture;focusKey?:{property:AnimationProperty;time:number}};

function useCanvas(draw:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void,deps:unknown[]) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;const paint=()=>{const w=el.clientWidth,h=el.clientHeight,dpr=devicePixelRatio||1;el.width=w*dpr;el.height=h*dpr;const ctx=el.getContext("2d")!;ctx.scale(dpr,dpr);draw(ctx,w,h);};paint();const ro=new ResizeObserver(paint);ro.observe(el);return()=>ro.disconnect();},deps);
  return ref;
}
function curveBounds(points:Keyframe[],property:AnimationProperty) {
  const m=ANIMATABLE[property];if(points.length<2)return [m.min,m.max];
  const vals=points.map(k=>k.value),lo=Math.min(...vals),hi=Math.max(...vals),padding=Math.max(m.step*4,(hi-lo)*.3);
  return [Math.max(m.min,lo-padding),Math.min(m.max,hi+padding)];
}
function ValueGraph({clip,property,time,fps,selected,onSelect,patch,seek,gesture,readOnly}:Props & {property:AnimationProperty;selected:number;onSelect:(i:number)=>void}) {
  const points=clip.keyframes?.[property]??[],dur=clipDuration(clip),[lo,hi]=curveBounds(points,property);
  const dragging=useRef<number|null>(null);
  const ref=useCanvas((ctx,w,h)=>{
    const L=34,R=w-12,T=14,B=h-24,X=(t:number)=>L+t/dur*(R-L),Y=(v:number)=>B-(v-lo)/Math.max(.001,hi-lo)*(B-T);
    ctx.fillStyle="#101011";ctx.fillRect(0,0,w,h);ctx.font="10px monospace";ctx.lineWidth=1;
    for(let i=0;i<=4;i++){const y=T+(B-T)*i/4;ctx.strokeStyle="#2e2e32";ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.fillStyle="#919095";ctx.fillText(round(hi-(hi-lo)*i/4).toString(),2,y+3);}
    for(let i=0;i<=4;i++){const x=L+(R-L)*i/4;ctx.strokeStyle="#252528";ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,B);ctx.stroke();ctx.fillStyle="#919095";ctx.fillText(`${round(dur*i/4)}s`,x-8,h-6);}
    ctx.strokeStyle="#f6a447";ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=180;i++){const t=dur*i/180,x=X(t),y=Y(valueAt(clip,property,t));i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    ctx.strokeStyle="#f6a44760";ctx.lineWidth=1;const tx=X(clamp(time-clip.start,0,dur));ctx.beginPath();ctx.moveTo(tx,T);ctx.lineTo(tx,B);ctx.stroke();
    points.forEach((k,i)=>{const x=X(k.time),y=Y(k.value);ctx.fillStyle=i===selected?"#fff":"#f6a447";ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();});
  },[clip,property,time,selected,lo,hi]);
  const pos=(e:React.PointerEvent)=>{const r=e.currentTarget.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height};};
  return <canvas ref={ref} className="value-graph" aria-label={`${ANIMATABLE[property].label} keyframe graph`} data-testid="value-graph"
    onPointerDown={e=>{if(readOnly)return;const p=pos(e);const idx=points.findIndex(k=>Math.hypot(34+k.time/dur*(p.w-46)-p.x,p.h-24-(k.value-lo)/Math.max(.001,hi-lo)*(p.h-38)-p.y)<12);
      if(idx<0){seek(clip.start+clamp((p.x-34)/(p.w-46)*dur,0,dur));return;}onSelect(idx);seek(clip.start+points[idx].time);dragging.current=idx;e.currentTarget.setPointerCapture(e.pointerId);gesture.begin();}}
    onPointerMove={e=>{const idx=dragging.current;if(idx===null||!e.buttons)return;const p=pos(e),m=ANIMATABLE[property];
      const t=clamp(Math.round(clamp((p.x-34)/(p.w-46)*dur,0,dur)*fps)/fps,idx>0?points[idx-1].time+.001:0,idx<points.length-1?points[idx+1].time-.001:dur),value=round(clamp(lo+(p.h-24-p.y)/(p.h-38)*(hi-lo),m.min,m.max));
      const frames=points.map((k,i)=>i===idx?{...k,time:round(t),value}:k);patch({keyframes:{...clip.keyframes,[property]:frames}},true);}}
    onPointerUp={()=>{dragging.current=null;gesture.end();}} onPointerCancel={()=>{dragging.current=null;gesture.end();}}/>;
}
function BezierEditor({value,onChange,gesture,disabled}:{value:Easing|undefined;onChange:(b:Bezier,live?:boolean)=>void;gesture:TimelineGesture;disabled:boolean}) {
  const curve=easingCurve(value),drag=useRef<number|null>(null);
  const ref=useCanvas((ctx,w,h)=>{
    const L=26,R=w-24,T=30,B=h-28,X=(x:number)=>L+x*(R-L),Y=(y:number)=>B-y*(B-T);
    ctx.fillStyle="#101011";ctx.fillRect(0,0,w,h);ctx.strokeStyle="#2f2f33";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,B);ctx.lineTo(R,B);ctx.moveTo(L,T);ctx.lineTo(L,B);ctx.stroke();
    const p1=[X(curve[0]),Y(curve[1])],p2=[X(curve[2]),Y(curve[3])];
    ctx.strokeStyle="#707078";ctx.beginPath();ctx.moveTo(L,B);ctx.lineTo(p1[0],p1[1]);ctx.moveTo(R,T);ctx.lineTo(p2[0],p2[1]);ctx.stroke();
    ctx.strokeStyle="#f6a447";ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=100;i++){const x=i/100,y=value==="hold"?(i===100?1:0):easeAt(curve,x);i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y));}ctx.stroke();
    for(const p of [p1,p2]){ctx.fillStyle="#c4b7ef";ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle="#99969e";ctx.font="10px monospace";ctx.fillText("0",L-3,B+16);ctx.fillText("1",R-3,B+16);ctx.fillText("Progress →",w/2-34,h-2);
  },[JSON.stringify(curve),value]);
  return <><canvas ref={ref} className="bezier-graph" aria-label="Drag tween slope handles" data-testid="bezier-graph"
    onPointerDown={e=>{if(disabled||value==="hold")return;const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const pos=(i:number)=>[26+curve[i]*(r.width-50),r.height-28-curve[i+1]*(r.height-58)];
      const p1=pos(0),p2=pos(2),d1=Math.hypot(x-p1[0],y-p1[1]),d2=Math.hypot(x-p2[0],y-p2[1]);if(Math.min(d1,d2)>16)return;drag.current=d1<d2?0:2;e.currentTarget.setPointerCapture(e.pointerId);gesture.begin();}}
    onPointerMove={e=>{const i=drag.current;if(i===null||!e.buttons)return;const r=e.currentTarget.getBoundingClientRect(),next=[...curve] as Bezier;next[i]=round(clamp((e.clientX-r.left-26)/(r.width-50),0,1));next[i+1]=round(clamp((r.height-28-(e.clientY-r.top))/(r.height-58),-2,3));onChange(next,true);}}
    onPointerUp={()=>{drag.current=null;gesture.end();}} onPointerCancel={()=>{drag.current=null;gesture.end();}}/>
    <div className="curve-inputs">{["x₁","y₁","x₂","y₂"].map((label,i)=><label key={i}>{label}<input aria-label={`Bezier ${label}`} type="number" step=".01" min={i%2?-2:0} max={i%2?3:1} value={curve[i]} disabled={disabled} onChange={e=>{const next=[...curve] as Bezier;next[i]=clamp(Number(e.target.value),i%2?-2:0,i%2?3:1);onChange(next);}}/></label>)}</div>
    <p className="help-text">Handles control acceleration and braking. Drag above the graph for overshoot.</p></>;
}
export default function ForgeMotion(props:Props) {
  const {clip,time,readOnly,patch,seek}=props;
  const [property,setProperty]=useState<AnimationProperty>(()=>props.audioOnly?"volume":(Object.keys(clip.keyframes??{}) as AnimationProperty[]).find(p=>clip.keyframes?.[p]?.length)??"x"),[selected,setSelected]=useState(0);
  useEffect(()=>{
    if(!props.focusKey)return;
    setProperty(props.focusKey.property);
    setSelected(Math.max(0,(clip.keyframes?.[props.focusKey.property]??[]).findIndex(k=>Math.abs(k.time-props.focusKey!.time)<.001)));
  },[props.focusKey,clip.id]);
  const frames=clip.keyframes?.[property]??[],dur=clipDuration(clip),local=round(clamp(time-clip.start,0,dur)),meta=ANIMATABLE[property],point=frames[selected];
  const allowed=(Object.keys(ANIMATABLE) as AnimationProperty[]).filter(p=>props.audioOnly?p==="volume":p!=="volume"||!!clip.assetId);
  const replace=(list:Keyframe[],live=false)=>patch({keyframes:{...clip.keyframes,[property]:list}},live);
  const update=(partial:Partial<Keyframe>,live=false)=>{if(!point)return;const list=frames.map((k,i)=>i===selected?{...k,...partial}:k).sort((a,b)=>a.time-b.time);if(new Set(list.map(k=>k.time)).size!==list.length)return;replace(list,live);if(partial.time!==undefined)setSelected(list.findIndex(k=>k.time===partial.time));};
  const add=()=>{const existing=frames.findIndex(k=>Math.abs(k.time-local)<.001);if(existing>=0){setSelected(existing);return;}const list=[...frames,{time:local,value:round(valueAt(clip,property,local)),easing:"ease-in-out" as Easing}].sort((a,b)=>a.time-b.time);replace(list);setSelected(list.findIndex(k=>k.time===local));};
  const remove=()=>{replace(frames.filter((_,i)=>i!==selected));setSelected(Math.max(0,selected-1));};
  return <div className="motion-body" data-testid="motion-inspector">
    <div className="motion-heading"><span><Diamond size={14}/>Keyframes</span><b className="mono">{local.toFixed(2)}s local</b></div>
    <select aria-label="Animated property" value={property} onChange={e=>{setProperty(e.target.value as AnimationProperty);setSelected(0);}}>{allowed.map(p=><option key={p} value={p}>{ANIMATABLE[p].label}{clip.keyframes?.[p]?.length?` · ${clip.keyframes[p]!.length} keys`:""}</option>)}</select>
    <div className="key-toolbar"><button className="icon-btn" aria-label="Previous keyframe" disabled={!frames.length||selected===0} onClick={()=>{setSelected(selected-1);seek(clip.start+frames[selected-1].time);}}><ChevronLeft size={16}/></button><button className="secondary-btn" onClick={add} disabled={readOnly||frames.length>=64} data-testid="add-keyframe"><Plus size={14}/>Key at playhead</button><button className="icon-btn" aria-label="Next keyframe" disabled={selected>=frames.length-1} onClick={()=>{setSelected(selected+1);seek(clip.start+frames[selected+1].time);}}><ChevronRight size={16}/></button></div>
    <ValueGraph {...props} property={property} selected={selected} onSelect={setSelected}/>
    {!frames.length?<p className="help-text">Add keys at two different times to animate {meta.label.toLowerCase()}. Drag diamonds to retime and change values.</p>:<>
      <div className="key-pills">{frames.map((k,i)=><button key={i} className={selected===i?"selected":""} onClick={()=>{setSelected(i);seek(clip.start+k.time);}}><Diamond size={10}/>{k.time.toFixed(2)}s</button>)}</div>
      {point&&<><div className="two-col"><label className="field compact">Time (seconds)<input aria-label="Keyframe time" type="number" min={0} max={dur} step={1/props.fps} value={point.time} disabled={readOnly} onChange={e=>update({time:round(clamp(Number(e.target.value),0,dur))})}/></label><label className="field compact">{meta.label}<input aria-label="Keyframe value" type="number" min={meta.min} max={meta.max} step={meta.step} value={point.value} disabled={readOnly} onChange={e=>update({value:clamp(Number(e.target.value),meta.min,meta.max)})}/></label></div>
      {selected<frames.length-1&&<details className="tween-details" open><summary>Tween slope <span>{Array.isArray(point.easing)?"Custom":point.easing??"Linear"}</span></summary><select aria-label="Keyframe easing" value={Array.isArray(point.easing)?"custom":point.easing??"linear"} disabled={readOnly} onChange={e=>update({easing:e.target.value==="custom"?[.25,.1,.25,1]:e.target.value as Easing})}>{[...Object.keys(EASINGS),"hold","custom"].map(e=><option key={e} value={e}>{e.replace(/-/g," ")}</option>)}</select><BezierEditor value={point.easing} onChange={(b,live)=>update({easing:b},live)} gesture={props.gesture} disabled={readOnly}/></details>}
      <button className="ghost-link danger" onClick={remove} disabled={readOnly}><Trash2 size={13}/>Remove selected key</button></>}
    </>}
    {!props.audioOnly&&<details className="motion-presets"><summary>Motion presets</summary><div className="preset-grid">{MOTION_PRESETS.map(p=><button key={p.id} title={p.description} disabled={readOnly} onClick={()=>{patch(motionPreset(clip,p.id));setSelected(0);}} data-testid={`motion-${p.id}`}>{p.label}</button>)}</div><p className="help-text">Presets replace only the properties they animate.</p></details>}
    {frames.length>0&&<button className="ghost-link muted" disabled={readOnly} onClick={()=>{replace([]);setSelected(0);}}>Clear {meta.label.toLowerCase()} animation</button>}
  </div>;
}
