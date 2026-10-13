import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { applyTimelineOp } from "../shared/editing";
import { normalizeClip, normalizeTimeline, clipDuration } from "../shared/timeline";
import { MOTION_TEMPLATES, normalizeShape, templateClips } from "../shared/graphics";
import { animatedValues } from "../shared/animation";
import { buildRenderPlan } from "../server/render";

const empty = () => normalizeTimeline({clips:[],resolution:{width:320,height:180}});
const lookup = () => undefined;
let checks = 0;
const check = (fn:()=>void) => {fn();checks++;};
check(()=>assert.equal(normalizeShape({type:"ellipse"})?.fill,"#f6a447"));
check(()=>assert.throws(()=>normalizeShape({type:"path"}),/shape.type/));
check(()=>assert.throws(()=>normalizeShape({type:"ellipse",script:"alert(1)"}),/unknown shape field/));
check(()=>assert.throws(()=>normalizeShape({type:"rectangle",fill:"red;movie=secret"}),/fill/));
for (const v of [-1,NaN,Infinity,2,".5"]) check(()=>assert.throws(()=>normalizeShape({type:"rectangle",width:v}),/width/));
check(()=>assert.throws(()=>normalizeClip({shape:{type:"ellipse"},assetId:"private",outPoint:2}),/cannot also/));
check(()=>assert.throws(()=>normalizeClip({shape:{type:"ellipse"},track:"audio",outPoint:2}),/visual/));
check(()=>assert.equal(normalizeClip({shape:{type:"ellipse"},track:"overlay",outPoint:2}).shape?.type,"ellipse"));
const shapeOp={op:"add_shape_clip",args:{id:"shape",shape:{type:"rectangle",fill:"#ff0000",width:.5,height:.5},duration:2}};
const shaped=applyTimelineOp(empty(),shapeOp,lookup);
check(()=>assert.throws(()=>applyTimelineOp(shaped,shapeOp,lookup),/already exists/));
check(()=>assert.equal(animatedValues(shaped.clips[0],0).y,.5));
check(()=>assert.equal(clipDuration(shaped.clips[0]),2));
check(()=>assert.equal(empty().clips.length,0));
check(()=>assert.throws(()=>applyTimelineOp(empty(),{...shapeOp,args:{...shapeOp.args,duration:NaN}},lookup),/duration/));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"stagger_clips",args:{clipIds:["shape","shape"],delay:.2}},lookup),/unique/));
const many=applyTimelineOp(shaped,{op:"duplicate_clip",args:{clipId:"shape",newId:"second"}},lookup);
const stagger=applyTimelineOp(many,{op:"stagger_clips",args:{clipIds:["second","shape"],start:1,delay:.2}},lookup);
check(()=>assert.equal(stagger.clips.find(c=>c.id==="shape")?.start,1.2));
check(()=>assert.equal(stagger.clips.find(c=>c.id==="second")?.start,1));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"stagger_clips",args:{clipIds:["missing"],delay:.2}},lookup),/not found/));
for(const t of MOTION_TEMPLATES) {
  const tl=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:t.id,title:"Hello motion",duration:.5}},lookup);
  check(()=>assert.ok(tl.clips.length>0&&tl.clips.every(c=>!c.assetId)));
  check(()=>assert.doesNotThrow(()=>normalizeTimeline(tl)));
}
check(()=>assert.throws(()=>templateClips({template:"callout",duration:.1},()=>""),/duration/));
check(()=>assert.throws(()=>templateClips({template:"callout",title:"  "},()=>""),/title/));
check(()=>assert.throws(()=>templateClips({template:"evil"},()=>""),/unknown/));
check(()=>assert.throws(()=>templateClips({template:"kinetic-type",title:"one two three four five six seven eight nine"},()=>""),/8 words/));
check(()=>assert.ok(templateClips({template:"title-card",title:"A longer headline designed for a portrait composition"},()=>"",9/16).filter(c=>c.text).every(c=>c.textSize<=3)));

// Real FFmpeg output checks: exact center color, transparent outside, ellipse border,
// animation, hidden track, PNGs for every template, and a playable asset-free MP4.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"vf-graphics-"));
function render(tl:ReturnType<typeof empty>,name:string,frameAt?:number) {
  const out=path.join(dir,name),plan=buildRenderPlan(tl,new Map(),dir,dir,name,out,frameAt===undefined?{}:{frameAt});
  try {
    const p=spawnSync("ffmpeg",plan.args,{encoding:"utf8",timeout:60000});
    assert.equal(p.status,0,p.stderr.slice(-2000));assert.ok(fs.statSync(out).size>0);return out;
  } finally {plan.tempFiles.forEach(p=>fs.rmSync(p,{force:true}));}
}
function pixel(file:string,x:number,y:number) {
  const p=spawnSync("ffmpeg",["-v","error","-i",file,"-vf",`format=rgb24,crop=1:1:${x}:${y}`,"-frames:v","1","-f","rawvideo","-"],{timeout:10000});
  assert.equal(p.status,0,String(p.stderr));return Array.from(p.stdout.slice(0,3));
}
try {
  const rect=render(shaped,"rect.png",1);
  check(()=>assert.ok(pixel(rect,160,90)[0]>240));
  check(()=>assert.ok(pixel(rect,0,0).every(v=>v<8)));
  const ellipse=applyTimelineOp(empty(),{op:"add_shape_clip",args:{duration:1,shape:{type:"ellipse",fill:"transparent",stroke:"#00ff00",strokeWidth:8,width:.5,height:.5}}},lookup);
  const ell=render(ellipse,"ellipse.png",.5);
  check(()=>assert.ok(pixel(ell,160,90).every(v=>v<8)));
  check(()=>assert.ok(pixel(ell,160,48)[1]>200));
  const rounded=applyTimelineOp(empty(),{op:"add_shape_clip",args:{duration:1,shape:{type:"rectangle",fill:"#00ff00",radius:24,width:.5,height:.5}}},lookup);
  const round=render(rounded,"rounded.png",.5);
  check(()=>assert.ok(pixel(round,81,47).every(v=>v<8)));
  const hidden=normalizeTimeline({...shaped,tracks:{overlay:{hidden:true}}});
  check(()=>assert.ok(pixel(render(hidden,"hidden.png",1),160,90).every(v=>v<8)));
  const moving=applyTimelineOp(shaped,{op:"set_keyframes",args:{clipId:"shape",property:"x",keyframes:[{time:0,value:.25},{time:1,value:.75}]}},lookup);
  const moved=render(moving,"moved.png",1);
  check(()=>assert.ok(pixel(moved,240,90)[0]>240));
  check(()=>assert.ok(pixel(moved,80,90).every(v=>v<8)));
  for(const t of MOTION_TEMPLATES) {
    const tl=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:t.id,title:"Hello motion",duration:1}},lookup);
    check(()=>assert.ok(render(tl,`${t.id}.png`,.5)));
  }
  check(()=>assert.ok(render(shaped,"shape.mp4")));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
console.log(`${checks} graphics checks passed`);
