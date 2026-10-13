import { useState } from "react";
import { MOTION_TEMPLATES, SHAPE_TYPES } from "@shared/graphics";
import { type Timeline } from "@shared/timeline";
import { applyTimelineOp } from "@shared/editing";

export default function ForgeGraphics({disabled,onApply}:{disabled:boolean;onApply:(op:{op:string;args:any})=>void}) {
  const [title,setTitle]=useState("Make your next move"),[subtitle,setSubtitle]=useState("Created with VideoForge"),[color,setColor]=useState("#f6a447"),[duration,setDuration]=useState(4);
  return <div className="effects-panel" data-testid="graphics-library">
    <h3>Motion graphics</h3><p className="help-text">Build without footage. Templates become regular shape and text clips you can edit, animate and export.</p>
    <label className="field">Headline<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} disabled={disabled} data-testid="graphics-title"/></label>
    <label className="field">Supporting text<input maxLength={120} value={subtitle} onChange={e=>setSubtitle(e.target.value)} disabled={disabled}/></label>
    <div className="two-col"><label className="field">Duration (s)<input type="number" min={.5} max={60} step={.5} value={duration} disabled={disabled} onChange={e=>setDuration(Number(e.target.value))}/></label><label className="field">Accent<input type="color" aria-label="Graphics accent" value={color} disabled={disabled} onChange={e=>setColor(e.target.value)}/></label></div>
    <section className="effect-group"><h4>Editable templates</h4><div className="graphics-template-list">{MOTION_TEMPLATES.map(t=><button key={t.id} className="graphics-template" disabled={disabled||!title.trim()} title={t.description} onClick={()=>onApply({op:"add_motion_template",args:{template:t.id,title,subtitle,color,duration}})} data-testid={`template-${t.id}`}><b>{t.label}</b><span>{t.description}</span></button>)}</div></section>
    <section className="effect-group"><h4>Shape primitives</h4><div className="effect-grid">{SHAPE_TYPES.map(type=><button key={type} className="effect-chip" disabled={disabled} data-testid={`add-shape-${type}`} onClick={()=>onApply({op:"add_shape_clip",args:{duration,shape:{type,fill:color},label:type}})}>{type}</button>)}</div></section>
    <a href="#/docs/motion-graphics" className="ghost-link">Motion graphics API guide</a>
  </div>;
}

export function applyGraphics(t:Timeline,op:{op:string;args:any},start:number):Timeline {
  return applyTimelineOp(t,{...op,args:{...op.args,start}},()=>undefined);
}
