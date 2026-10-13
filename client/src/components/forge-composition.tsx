import { useState } from "react";
import { Copy, Download, X } from "lucide-react";
import { normalizeTimeline, type Timeline } from "@shared/timeline";

/** A portable hand-off format for scripts and agents, validated before replacement. */
export default function ForgeComposition({timeline,disabled,onClose,onApply,assetIds}:{timeline:Timeline;disabled:boolean;onClose:()=>void;onApply:(t:Timeline)=>void;assetIds:Set<string>}) {
  const [draft,setDraft]=useState(()=>JSON.stringify(timeline,null,2)),[message,setMessage]=useState(""),[valid,setValid]=useState<Timeline|null>(null);
  function validate() {
    try {
      const next=normalizeTimeline(JSON.parse(draft));
      const missing=next.clips.filter(c=>c.assetId&&!assetIds.has(c.assetId));
      if(missing.length) throw new Error(`Upload the missing media first: ${Array.from(new Set(missing.map(c=>c.assetId))).join(", ")}`);
      setValid(next);setMessage(`Valid composition: ${next.clips.length} clips. Applying replaces the current timeline and can be undone.`);
    } catch(e:any) {setValid(null);setMessage(e.message);}
  }
  function download() {
    const url=URL.createObjectURL(new Blob([draft],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download="videoforge-composition.json";a.click();URL.revokeObjectURL(url);
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="composition-modal" role="dialog" aria-modal="true" aria-labelledby="composition-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const all=Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),textarea:not(:disabled)"));if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all[all.length-1].focus();}else if(!e.shiftKey&&document.activeElement===all[all.length-1]){e.preventDefault();all[0].focus();}}}}>
    <header><div><h2 id="composition-title">Composition JSON</h2><p className="help-text">Hand your timeline to an agent, or validate a composition before importing it.</p></div><button autoFocus className="icon-btn" onClick={onClose} aria-label="Close composition"><X size={18}/></button></header>
    <textarea aria-label="Composition JSON" className="mono" value={draft} spellCheck={false} onChange={e=>{setDraft(e.target.value);setValid(null);setMessage("");}} disabled={disabled} data-testid="composition-json"/>
    {message&&<p className={valid?"help-text":"error-box"} role="status" data-testid="composition-status">{message}</p>}
    <footer><button className="secondary-btn" onClick={async()=>{try{await navigator.clipboard.writeText(draft);setMessage("Composition copied.");}catch{setMessage("Select the composition text and copy it manually.");}}}><Copy size={14}/>Copy</button><button className="secondary-btn" onClick={download}><Download size={14}/>Download JSON</button><span className="flex-spacer"/><button className="secondary-btn" disabled={disabled} onClick={validate} data-testid="composition-validate">Validate</button><button className="primary-btn" disabled={disabled||!valid} onClick={()=>{if(valid)onApply(valid);onClose();}} data-testid="composition-apply">Apply composition</button></footer>
  </section></div>;
}
