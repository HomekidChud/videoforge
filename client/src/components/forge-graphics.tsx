import { useEffect, useMemo, useState } from "react";
import { MOTION_TEMPLATES, SHAPE_TYPES, templateClips } from "@shared/graphics";
import { evaluateClip } from "@shared/animation";
import { normalizeClip, type Clip } from "@shared/timeline";
import { type Timeline } from "@shared/timeline";
import { applyTimelineOp } from "@shared/editing";
import { revealClip } from "./forge-preview";

function TemplatePreview({ template, color }: { template: string; color: string }) {
  const [hovered, setHovered] = useState(false);
  const [time, setTime] = useState(1);
  useEffect(() => {
    if (!hovered) return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){setTime(1);return;}
    const start = performance.now();
    let frame: number;
    const tick = () => { setTime(((performance.now() - start) / 1000) % 4); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hovered]);
  // Render the actual template model rather than unrelated marketing thumbnails.
  const clips = useMemo(()=>templateClips({ template, color, title: template === "countdown" ? "3" : "Your headline", subtitle: "Supporting text", duration: 4 }, (() => { let i = 0; return () => `preview-${i++}`; })()).map(c => normalizeClip(c as Clip)),[template,color]);
  return <span className={`template-preview preview-${template}`} aria-hidden="true"
    onPointerEnter={() => { setHovered(true); setTime(0); }}
    onPointerLeave={() => { setHovered(false); setTime(1); }}>
    {clips.filter(c => time >= c.start && time < c.start + c.outPoint).map(c => {
      const ev = evaluateClip(c, time);
      return <span key={c.id} style={{ position: "absolute", left: `${(ev.x ?? .5)*100}%`, top: `${(ev.y ?? .5)*100}%`,
        transform: `translate(-50%,-50%) scale(${ev.scale ?? 1}) rotate(${ev.rotation ?? 0}deg)`,
        opacity: ev.opacity ?? 1, width: c.shape ? `${c.shape.width*100}%` : undefined,
        height: c.shape ? `${c.shape.height*100}%` : undefined, background: c.shape?.fill, border: c.shape && c.shape.stroke !== "transparent" ? `${Math.max(1, c.shape.strokeWidth/6)}px solid ${c.shape.stroke}` : undefined, boxSizing: "border-box", clipPath: revealClip(ev.reveal),
        borderRadius: c.shape ? (c.shape.type === "ellipse" ? "50%" : c.shape.radius/10) : undefined, color: c.textColor ?? "#fff",
        fontSize: c.text ? `${(c.textSize ?? 6)*1.1}px` : undefined, whiteSpace: "nowrap", fontWeight: 700 }}>{c.text}</span>;
    })}
  </span>;
}

export default function ForgeGraphics({disabled,onApply}:{disabled:boolean;onApply:(op:{op:string;args:any})=>void}) {
  const [title,setTitle]=useState("Your headline"),[subtitle,setSubtitle]=useState(""),[color,setColor]=useState("#f6a447"),[duration,setDuration]=useState(4);
  const [chosen,setChosen]=useState<string>("lower-third"),[points,setPoints]=useState("First point\nSecond point\nThird point"),[chapter,setChapter]=useState("01");
  const items=points.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,6);
  return <div className="effects-panel" data-testid="graphics-library">
    <div className="library-heading"><h3>Motion graphics</h3></div>
    <section className="effect-group"><div className="graphics-template-list">{MOTION_TEMPLATES.map(t=><button key={t.id} className={`graphics-template ${chosen===t.id?"chosen":""}`} aria-pressed={chosen===t.id} disabled={disabled} title={t.description} onClick={()=>setChosen(t.id)} data-testid={`template-${t.id}`}>
      <TemplatePreview template={t.id} color={color}/><span className="template-card-label"><b>{t.label}</b><span>{t.description}</span></span>
    </button>)}</div></section>
    <label className="field">Headline<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} disabled={disabled} data-testid="graphics-title"/></label>
    <label className="field">Supporting text<input maxLength={120} value={subtitle} onChange={e=>setSubtitle(e.target.value)} disabled={disabled}/></label>
    {chosen==="bullet-list"&&<label className="field">Points (one per line, up to 6)<textarea rows={4} maxLength={400} value={points} onChange={e=>setPoints(e.target.value)} disabled={disabled} data-testid="graphics-items"/></label>}
    {chosen==="chapter-number"&&<label className="field">Chapter number<input maxLength={4} value={chapter} onChange={e=>setChapter(e.target.value)} disabled={disabled} data-testid="graphics-number"/></label>}
    <div className="two-col"><label className="field">Duration (s)<input type="number" min={.5} max={60} step={.5} value={duration} disabled={disabled} onChange={e=>setDuration(Number(e.target.value))}/></label><label className="field">Accent<input type="color" aria-label="Graphics accent" value={color} disabled={disabled} onChange={e=>setColor(e.target.value)}/></label></div>
    <button className="primary-btn full" disabled={disabled||!title.trim()||(chosen==="bullet-list"&&!items.length)||!Number.isFinite(duration)||duration<.5||duration>60} onClick={()=>onApply({op:"add_motion_template",args:{template:chosen,title,subtitle,color,duration,...(chosen==="bullet-list"?{items}:{}),...(chosen==="chapter-number"?{number:chapter}:{})}})} data-testid="button-insert-template">Add to timeline</button>
    <section className="effect-group"><h4>Shape primitives</h4><div className="effect-grid">{SHAPE_TYPES.map(type=><button key={type} className="effect-chip" disabled={disabled} data-testid={`add-shape-${type}`} onClick={()=>onApply({op:"add_shape_clip",args:{duration,shape:{type,fill:color},label:type}})}>{type}</button>)}</div></section>
  </div>;
}

export function applyGraphics(t:Timeline,op:{op:string;args:any},start:number):Timeline {
  return applyTimelineOp(t,{...op,args:{...op.args,start}},()=>undefined);
}
