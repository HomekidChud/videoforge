import { baseValue, type Keyframes } from "./animation";
import { clipDuration, type Clip } from "./timeline";
export const MOTION_PRESETS = [
  { id: "fade", label: "Fade in", description: "Soft opacity entrance" },
  { id: "slide-left", label: "Slide left", description: "Arrive from the left" },
  { id: "rise", label: "Rise", description: "Lift into position" },
  { id: "zoom", label: "Slow zoom", description: "Gentle push-in" },
  { id: "pop", label: "Pop", description: "Scale with an overshoot" },
  { id: "drift", label: "Drift", description: "Slow pan across the frame" },
] as const;
export function motionPreset(c:Clip, preset:string):Partial<Clip> {
  const d=clipDuration(c), entrance=Math.min(.8,d), x=baseValue(c,"x"),y=baseValue(c,"y"),scale=baseValue(c,"scale"),opacity=baseValue(c,"opacity");
  let keys:Keyframes;
  switch(preset) {
    case "fade": keys={opacity:[{time:0,value:0,easing:"ease-out"},{time:entrance,value:opacity}]};break;
    case "slide-left": keys={x:[{time:0,value:Math.max(0,x-.35),easing:"ease-out"},{time:entrance,value:x}],opacity:[{time:0,value:0},{time:Math.min(.3,d),value:opacity}]};break;
    case "rise": keys={y:[{time:0,value:Math.min(1,y+.2),easing:"ease-out"},{time:entrance,value:y}],opacity:[{time:0,value:0},{time:Math.min(.3,d),value:opacity}]};break;
    case "zoom": keys={scale:[{time:0,value:scale,easing:"ease-in-out"},{time:d,value:Math.min(2,scale*1.2)}]};break;
    case "pop": keys={scale:[{time:0,value:Math.max(.1,scale*.5),easing:"back-out"},{time:entrance,value:scale}],opacity:[{time:0,value:0},{time:Math.min(.2,d),value:opacity}]};break;
    case "drift": keys={x:[{time:0,value:Math.max(0,x-.1),easing:"ease-in-out"},{time:d,value:Math.min(1,x+.1)}]};break;
    default: throw new Error("unknown motion preset");
  }
  return {keyframes:{...c.keyframes,...keys}};
}
export const TITLE_PRESETS=[
  {id:"headline",label:"Headline",text:"Your story starts here",textSize:10,y:.5,textBg:false},
  {id:"lower-third",label:"Lower third",text:"Name · Your role",textSize:5,y:.82,textBg:true},
  {id:"caption",label:"Caption",text:"Add your caption",textSize:4,y:.88,textBg:true},
  {id:"chapter",label:"Chapter card",text:"01 — A new chapter",textSize:8,y:.5,textBg:true},
] as const;
