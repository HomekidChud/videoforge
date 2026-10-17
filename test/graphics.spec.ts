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
import { motionPreset, MOTION_PRESETS } from "../shared/presets";
import { beatTimes, retimeAnimation, reverseAnimation } from "../shared/motion";
import { easeAt } from "../shared/animation";
import { TRANSITION_TYPES } from "../shared/timeline";
import { evaluateExpression, expressionToFfmpeg, validateExpression, codeRecipe, CODE_RECIPES } from "../shared/expr";
import { textLayout, fitReport, fitClip, clipBounds } from "../shared/layout";
import { valueAt } from "../shared/animation";
import { presetGroup } from "../shared/presets";
import { EXAMPLES, buildExample, exampleDuration } from "../shared/examples";

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

// --- Motion engine v2: presets with timing, new easings, reveal, sequences, retime/reverse, beats
check(()=>assert.equal(MOTION_TEMPLATES.length,13));
check(()=>assert.ok(MOTION_PRESETS.length>=33));
const subject=applyTimelineOp(empty(),{op:"add_shape_clip",args:{id:"m",duration:4,shape:{type:"rectangle"}}},lookup).clips[0];
for(const preset of MOTION_PRESETS) {
  const keys=motionPreset(subject,preset.id).keyframes!;
  check(()=>assert.ok(Object.keys(keys).length>0,preset.id));
  check(()=>assert.doesNotThrow(()=>normalizeClip({...subject,keyframes:keys}),preset.id));
}
check(()=>assert.throws(()=>motionPreset(subject,"nope"),/unknown motion preset/));
check(()=>assert.throws(()=>motionPreset(subject,"fade",{duration:9}),/duration/));
check(()=>assert.throws(()=>motionPreset(subject,"fade",{strength:NaN}),/strength/));
const slow=motionPreset(subject,"rise",{delay:1,duration:2,strength:.5}).keyframes!;
check(()=>assert.equal(slow.y![0].time,1));
check(()=>assert.equal(slow.y![1].time,3));
check(()=>assert.ok(Math.abs(slow.y![0].value-.6)<1e-9));
const exitKeys=motionPreset(subject,"fade-out",{duration:1}).keyframes!;
check(()=>assert.equal(exitKeys.opacity![1].value,0));
check(()=>assert.equal(exitKeys.opacity![1].time,4));
check(()=>assert.throws(()=>applyTimelineOp(empty(),{op:"add_text_clip",args:{text:"hi",duration:2,keyframes:{reveal:[{time:0,value:0},{time:1,value:1}]}}},lookup),/reveal applies/));
check(()=>assert.throws(()=>motionPreset(normalizeClip({id:"t",assetId:"",text:"x",track:"overlay",outPoint:2}),"reveal"),/wipe reveal/));
check(()=>assert.equal(easeAt("step-start",0),0));
check(()=>assert.equal(easeAt("step-start",.001),1));
check(()=>assert.ok(easeAt("anticipate",.15)<0,"anticipate dips below zero first"));
check(()=>assert.ok(easeAt("snappy",.2)>.5));
// legacy presets keep their original short opacity ramps
check(()=>assert.equal(motionPreset(subject,"rise").keyframes!.opacity![1].time,.3));
check(()=>assert.equal(motionPreset(subject,"pop").keyframes!.opacity![1].time,.2));
check(()=>assert.equal(motionPreset(subject,"fade").keyframes!.opacity![1].time,.8));
// idPrefix + explicit text ids
const prefixed=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"title-card",title:"Hi",idPrefix:"tc"}},lookup);
check(()=>assert.deepEqual(prefixed.clips.map(c=>c.id),["tc-0","tc-1","tc-2"]));
check(()=>assert.throws(()=>applyTimelineOp(prefixed,{op:"add_motion_template",args:{template:"title-card",title:"Hi",idPrefix:"tc"}},lookup),/already in use/));
check(()=>assert.throws(()=>applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"title-card",idPrefix:"bad id!"}},lookup),/idPrefix/));
const named=applyTimelineOp(empty(),{op:"add_text_clip",args:{id:"headline",text:"Hello",duration:2}},lookup);
check(()=>assert.equal(named.clips[0].id,"headline"));
check(()=>assert.throws(()=>applyTimelineOp(named,{op:"add_text_clip",args:{id:"headline",text:"Again"}},lookup),/already exists/));
// examples build, are valid and stay deterministic
for(const ex of EXAMPLES) {
  const tl=buildExample(ex);
  check(()=>assert.ok(tl.clips.length>0&&exampleDuration(ex)>1,ex.id));
  check(()=>assert.deepEqual(normalizeTimeline(tl),tl,ex.id));
  check(()=>assert.equal(JSON.stringify(buildExample(ex).clips.map(c=>c.id)),JSON.stringify(tl.clips.map(c=>c.id)),ex.id));
}
check(()=>assert.equal(EXAMPLES.length,17));
const springed=motionPreset(subject,"spring").keyframes!.scale!;
check(()=>assert.ok(springed.some(k=>k.value>1)||springed.some(k=>k.value<subject.scale!),"spring oscillates"));
check(()=>assert.equal(springed[springed.length-1].value,1));
// sequence + reverse + retime
let seq=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"kinetic-type",title:"one two three",duration:3}},lookup);
const ids=seq.clips.map(c=>c.id);
seq=applyTimelineOp(seq,{op:"apply_motion_sequence",args:{clipIds:ids,preset:"pop",stagger:.25,start:1}},lookup);
check(()=>assert.deepEqual(ids.map(id=>seq.clips.find(c=>c.id===id)!.start),[1,1.25,1.5]));
check(()=>assert.ok(seq.clips.every(c=>c.keyframes?.scale)));
check(()=>assert.throws(()=>applyTimelineOp(seq,{op:"apply_motion_sequence",args:{clipIds:[ids[0],ids[0]],preset:"pop"}},lookup),/unique/));
const animTl=applyTimelineOp(shaped,{op:"set_keyframes",args:{clipId:"shape",property:"x",keyframes:[{time:0,value:.2,easing:"ease-in"},{time:1,value:.5,easing:"hold"},{time:2,value:.8}]}},lookup),anim=animTl.clips[0];
const rev=reverseAnimation(anim).x!;
check(()=>assert.deepEqual(rev.map(k=>[k.time,k.value]),[[0,.8],[1,.5],[2,.2]]));
check(()=>assert.equal(rev[0].easing,"step-start"));
check(()=>assert.deepEqual(rev[1].easing,[0,0,.58,1]));
check(()=>assert.equal(rev[2].easing,undefined));
const fast=retimeAnimation(anim,1,.5).x!;
check(()=>assert.deepEqual(fast.map(k=>k.time),[.5,1,1.5]));
check(()=>assert.throws(()=>retimeAnimation({...anim,keyframes:undefined},1),/no animation/));
check(()=>assert.throws(()=>retimeAnimation(anim,5),/fit within/));
const retimed=applyTimelineOp(animTl,{op:"retime_animation",args:{clipId:"shape",duration:1,delay:.5}},lookup).clips[0].keyframes!.x!;
check(()=>assert.deepEqual(retimed.map(k=>k.time),[.5,1,1.5]));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"retime_animation",args:{clipId:"shape",duration:1}},lookup),/no animation/));
const reversedTl=applyTimelineOp(animTl,{op:"reverse_animation",args:{clipId:"shape"}},lookup).clips[0];
check(()=>assert.equal(reversedTl.keyframes!.x![0].value,.8));
// beats
check(()=>assert.deepEqual(beatTimes(120,4),[0,.5,1,1.5]));
check(()=>assert.deepEqual(beatTimes(120,3,1,2),[1,2,3]));
check(()=>assert.throws(()=>beatTimes(5,4),/bpm/));
const beats=applyTimelineOp(empty(),{op:"add_beat_markers",args:{bpm:90,count:4}},lookup);
check(()=>assert.equal(beats.markers!.length,4));
check(()=>assert.throws(()=>applyTimelineOp(beats,{op:"add_beat_markers",args:{bpm:90,count:101}},lookup),/count/));
const moved2=applyTimelineOp(applyTimelineOp(many,{op:"move_clip",args:{clipId:"second",start:1.3}},lookup),{op:"snap_to_beats",args:{clipIds:["second"],bpm:120}},lookup);
check(()=>assert.equal(moved2.clips.find(c=>c.id==="second")!.start,1.5));
check(()=>assert.equal(TRANSITION_TYPES.length,10));
check(()=>assert.equal(normalizeClip({...subject,transitionIn:{fromClipId:"a",type:"iris",duration:.5}}).transitionIn?.type,"iris"));

// --- animate with code: expressions
check(()=>assert.ok(Math.abs(evaluateExpression("0.5 + 0.2 * sin(t * 3)",{t:1.25,d:4,base:.5})-(0.5+0.2*Math.sin(3.75)))<1e-12));
check(()=>assert.equal(evaluateExpression("-2^2",{t:0,d:1,base:0}),-4));
check(()=>assert.equal(evaluateExpression("mod(-7,3)",{t:0,d:1,base:0}),2));
check(()=>assert.equal(evaluateExpression("1/0",{t:0,d:1,base:.7}),.7,"non-finite falls back to base"));
check(()=>assert.equal(evaluateExpression("p",{t:1,d:4,base:0}),.25));
for(const bad of ["foo(1)","sin()","1 +","t.x","__proto__","constructor","a","process","sin(1,2)","'x'","t;t","(((((((((((((((((((1)))))))))))))))))))",""]) check(()=>assert.throws(()=>validateExpression(bad),Error,bad));
check(()=>assert.throws(()=>validateExpression("1".repeat(301)),/300/));
check(()=>assert.throws(()=>validateExpression(Array(100).fill("t").join("+")),/long|nodes|complex/));
check(()=>assert.ok(expressionToFfmpeg("wiggle(2,3)",{clock:"t",duration:2,base:0}).includes("sin(")));
check(()=>assert.equal(CODE_RECIPES.length,13));
for(const r of CODE_RECIPES) check(()=>assert.doesNotThrow(()=>normalizeClip({...shaped.clips[0],expressions:codeRecipe(r.id,1.5,1.2)}),r.id));
check(()=>assert.throws(()=>codeRecipe("nope"),/unknown code recipe/));
check(()=>assert.throws(()=>codeRecipe("float",9),/speed/));
const coded=applyTimelineOp(shaped,{op:"animate_code",args:{clipId:"shape",expressions:{x:"0.25 + 0.25 * t",rotation:"base + 10 * sin(t)"}}},lookup);
check(()=>assert.equal(coded.clips[0].expressions!.x,"0.25 + 0.25 * t"));
check(()=>assert.ok(Math.abs(animatedValues(coded.clips[0],1).x!-.5)<1e-9));
check(()=>assert.ok(Math.abs(valueAt(coded.clips[0],"rotation",1)-10*Math.sin(1))<1e-9));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"animate_code",args:{clipId:"shape",expressions:{x:"evil(1)"}}},lookup),/unknown function/));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"animate_code",args:{clipId:"shape",expressions:{colour:"1"}}},lookup),/cannot animate/));
const cleared=applyTimelineOp(coded,{op:"animate_code",args:{clipId:"shape",expressions:{x:"",rotation:null}}},lookup);
check(()=>assert.equal(cleared.clips[0].expressions,undefined));
check(()=>assert.throws(()=>applyTimelineOp(applyTimelineOp(empty(),{op:"add_text_clip",args:{id:"t",text:"Hi",duration:2}},lookup),{op:"animate_code",args:{clipId:"t",expressions:{reveal:"p"}}},lookup),/reveal/));
const looped=applyTimelineOp(shaped,{op:"apply_code_motion",args:{clipId:"shape",recipe:"orbit",speed:2}},lookup);
check(()=>assert.ok(looped.clips[0].expressions!.x&&looped.clips[0].expressions!.y));
const baked=applyTimelineOp(looped,{op:"bake_expression",args:{clipId:"shape",samples:20}},lookup);
check(()=>assert.equal(baked.clips[0].expressions,undefined));
check(()=>assert.equal(baked.clips[0].keyframes!.x!.length,20));
check(()=>assert.ok(Math.abs(valueAt(baked.clips[0],"x",.5)-valueAt(looped.clips[0],"x",.5))<.01));
check(()=>assert.throws(()=>applyTimelineOp(shaped,{op:"bake_expression",args:{clipId:"shape"}},lookup),/no expression/));
const represet=applyTimelineOp(looped,{op:"apply_motion",args:{clipId:"shape",preset:"slide-right"}},lookup);
check(()=>assert.equal(represet.clips[0].expressions!.x,undefined,"a preset replaces code on the property it animates"));
check(()=>assert.ok(represet.clips[0].expressions!.y));
// --- presets, groups, easings
check(()=>assert.equal(presetGroup("exit-up"),"exit"));
check(()=>assert.equal(presetGroup("tada"),"emphasis"));
check(()=>assert.equal(presetGroup("rise"),"entrance"));
for(const e of ["ease-in-cubic","ease-out-cubic","ease-in-out-cubic","ease-in-expo","ease-in-back"]) check(()=>assert.ok(Math.abs(easeAt(e as any,0))<1e-6&&Math.abs(easeAt(e as any,1)-1)<1e-6,e));
check(()=>assert.throws(()=>motionPreset(applyTimelineOp(empty(),{op:"add_text_clip",args:{id:"t",text:"x",duration:2}},lookup).clips[0],"reveal-out"),/text/));
// --- fit: text layout, reports and fixes
const canvas={width:1280,height:720};
const longText=normalizeClip({text:"This is an extremely long headline that would never fit on one line at this size",textSize:9,outPoint:3});
const lay=textLayout(longText,canvas);
check(()=>assert.ok(lay.lines.length>1,"long text wraps"));
check(()=>assert.ok(lay.width<=canvas.width*.9+.5&&lay.height<=canvas.height*.5+.5,"laid out text fits its box"));
check(()=>assert.equal(lay.text.replace(/\n/g," "),longText.text));
const shortLay=textLayout(normalizeClip({text:"Hi",textSize:6,outPoint:3}),canvas);
check(()=>assert.ok(Math.abs(shortLay.fontSize-720*.06)<.01));
const hugeWord=textLayout(normalizeClip({text:"Supercalifragilisticexpialidocious",textSize:30,outPoint:3}),canvas);
check(()=>assert.ok(hugeWord.width<=canvas.width*.9+.5,"one huge word shrinks to fit"));
check(()=>assert.ok(Math.abs(textLayout(normalizeClip({...longText,textFit:"none"}),canvas).fontSize-720*.09)<.01));
const corner=textLayout(normalizeClip({text:"Edge text that is fairly long",x:.15,textSize:8,outPoint:3}),canvas);
check(()=>assert.ok(corner.width<=canvas.width*.3+.5,"text near an edge is limited by the nearer frame edge"));
const spinning=textLayout(normalizeClip({text:"Rotated headline text",textSize:12,rotation:90,outPoint:3}),canvas);
check(()=>assert.ok(spinning.width<=canvas.height*.9,"rotated text still fits"));
const bigShape=applyTimelineOp(empty(),{op:"add_shape_clip",args:{id:"big",shape:{type:"rectangle",width:.5,height:.5},scale:2,x:.9,duration:2}},lookup);
const issues=fitReport(bigShape);
check(()=>assert.equal(issues.length,1));
check(()=>assert.equal(issues[0].clipId,"big"));
check(()=>assert.ok(issues[0].overflow.right>0));
const fixed=applyTimelineOp(bigShape,{op:"fit_clip",args:{clipId:"big"}},lookup);
check(()=>assert.equal(fitReport(fixed,undefined,.04).length,0,"fit_clip leaves nothing outside the safe margin"));
const textOver=applyTimelineOp(bigShape,{op:"add_text_clip",args:{id:"tt",text:"A very long caption that runs well off the edge of the frame",x:.95,textSize:10,textFit:"none",duration:2}},lookup);
check(()=>assert.ok(fitReport(textOver).some(i=>i.clipId==="tt")));
const allFixed=applyTimelineOp(textOver,{op:"fit_all",args:{}},lookup);
check(()=>assert.equal(fitReport(allFixed,undefined,.04).length,0,"fit_all fixes shapes and text"));
check(()=>assert.throws(()=>applyTimelineOp(bigShape,{op:"fit_clip",args:{clipId:"big",mode:"cover"}},lookup),/media/));
check(()=>assert.throws(()=>applyTimelineOp(bigShape,{op:"fit_all",args:{media:"zoom"}},lookup),/media/));
check(()=>assert.throws(()=>fitReport(bigShape,undefined,.9),/margin/));
const resized=applyTimelineOp(bigShape,{op:"set_project",args:{resolution:{width:720,height:1280},refit:true}},lookup);
check(()=>assert.equal(fitReport(resized,undefined,.04).length,0,"refit after changing the canvas"));
const animatedBig=applyTimelineOp(applyTimelineOp(empty(),{op:"add_shape_clip",args:{id:"shape",shape:{type:"rectangle",width:.8,height:.5},duration:2}},lookup),{op:"set_keyframes",args:{clipId:"shape",property:"scale",keyframes:[{time:0,value:.5},{time:1,value:2}]}},lookup);
check(()=>assert.ok(fitReport(animatedBig).length===1,"animated scale is checked at its peak"));
check(()=>assert.equal(fitReport(applyTimelineOp(animatedBig,{op:"fit_clip",args:{clipId:"shape"}},lookup),undefined,.04).length,0));
check(()=>assert.ok(clipBounds(shaped.clips[0],{width:320,height:180})!.w===.5));
check(()=>assert.equal(normalizeClip({text:"x",outPoint:1,textMaxWidth:.9}).textMaxWidth,undefined));
check(()=>assert.equal(normalizeClip({text:"x",outPoint:1,textMaxWidth:3}).textMaxWidth,1));
check(()=>assert.equal(normalizeClip({assetId:"a",outPoint:1,fit:"fill"}).fit,"fill"));

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
// The real-render checks need ffmpeg on PATH; skip them loudly where it is absent.
const ffmpegOk = spawnSync("ffmpeg", ["-version"], { timeout: 5000 }).status === 0;
if (ffmpegOk) {
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

  // reveal: half way through a left-to-right wipe the left half is solid and the right half empty
  const wiped=applyTimelineOp(shaped,{op:"set_keyframes",args:{clipId:"shape",property:"reveal",keyframes:[{time:0,value:0,easing:"linear"},{time:2,value:1}]}},lookup);
  const half=render(wiped,"reveal-half.png",1);
  // shape is 50% of the canvas wide (x 80..240); at reveal .5 only its left half (80..160) is visible
  check(()=>assert.ok(pixel(half,120,90)[0]>240,"left of reveal edge is drawn"));
  check(()=>assert.ok(pixel(half,200,90).every(v=>v<8),"right of reveal edge is clear"));
  check(()=>assert.ok(pixel(render(wiped,"reveal-end.png",1.9),200,90)[0]>240,"fully revealed at the end"));
  check(()=>assert.ok(pixel(render(wiped,"reveal-start.png",0),120,90).every(v=>v<8),"nothing drawn at the start"));
  // every preset compiles to a valid ffmpeg graph on a shape
  for(const preset of MOTION_PRESETS) {
    const tl=applyTimelineOp(shaped,{op:"apply_motion",args:{clipId:"shape",preset:preset.id}},lookup);
    check(()=>assert.ok(render(tl,`preset-${preset.id}.png`,1.2),preset.id));
  }
  // step-start easing holds the end value the instant a segment begins
  const stepped=applyTimelineOp(shaped,{op:"set_keyframes",args:{clipId:"shape",property:"x",keyframes:[{time:0,value:.25,easing:"step-start"},{time:2,value:.75}]}},lookup);
  check(()=>assert.ok(pixel(render(stepped,"step.png",.5),240,90)[0]>240,"step-start jumps immediately"));
  for(const t of MOTION_TEMPLATES) {
    const tl=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:t.id,title:"Hello motion",duration:1}},lookup);
    check(()=>assert.ok(render(tl,`${t.id}.png`,.5)));
  }
  for(const ex of EXAMPLES) check(()=>assert.ok(render(buildExample(ex,{width:320,height:180}),`ex-${ex.id}.png`,1.2),ex.id));
  // stat ring renders an outline with a clear centre; progress bar fill grows
  const stat=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"stat-highlight",title:"98%",duration:3,color:"#00ff00"}},lookup);
  check(()=>assert.ok(pixel(render(stat,"stat.png",2),160,90).every(v=>v<=255)));
  const bar=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"progress-bar",title:"Loading",duration:5,color:"#ff0000"}},lookup);
  const early=render(bar,"bar-early.png",.5),late=render(bar,"bar-late.png",4.4);
  check(()=>assert.ok(pixel(late,150,90)[0]>200,"progress filled late"));
  check(()=>assert.ok(pixel(early,150,90)[0]<120,"progress track only early"));

  // code animation renders the same position the preview evaluates
  const codedPos=applyTimelineOp(shaped,{op:"animate_code",args:{clipId:"shape",expressions:{x:"0.25 + 0.25 * t"}}},lookup);
  const atStart=render(codedPos,"code-0.png",0),atOne=render(codedPos,"code-1.png",1);
  check(()=>assert.ok(pixel(atStart,40,90)[0]>240&&pixel(atStart,200,90).every(v=>v<8),"x expression at t=0"));
  check(()=>assert.ok(pixel(atOne,200,90)[0]>240&&pixel(atOne,40,90).every(v=>v<8),"x expression at t=1"));
  for(const r of CODE_RECIPES) check(()=>assert.ok(render(applyTimelineOp(shaped,{op:"apply_code_motion",args:{clipId:"shape",recipe:r.id}},lookup),`code-${r.id}.png`,1),r.id));
  const codedScale=applyTimelineOp(shaped,{op:"animate_code",args:{clipId:"shape",expressions:{scale:"base * (1 - 0.5 * p)",opacity:"1 / 0"}}},lookup);
  check(()=>assert.ok(pixel(render(codedScale,"code-scale.png",0),160,90)[0]>240,"invalid maths falls back to base opacity"));
  // text that is far too long still renders inside the frame
  const longTitle=applyTimelineOp(empty(),{op:"add_text_clip",args:{id:"long",text:"An extremely long headline that used to run off both sides of the frame",textSize:12,duration:2}},lookup);
  const longPng=render(longTitle,"long-text.png",1);
  check(()=>assert.ok(pixel(longPng,0,90).every(v=>v<20)&&pixel(longPng,319,90).every(v=>v<20),"wrapped text keeps the frame edges clear"));
  const manualBreaks=applyTimelineOp(empty(),{op:"add_text_clip",args:{id:"m",text:"Line one\nLine two",duration:2,textBg:true}},lookup);
  check(()=>assert.ok(render(manualBreaks,"two-lines.png",1)));
  const stretched=applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"bullet-list",title:"Why it works",items:["One","Two","Three"],duration:3}},lookup);
  check(()=>assert.ok(render(stretched,"bullets.png",2.5)));
  check(()=>assert.throws(()=>applyTimelineOp(empty(),{op:"add_motion_template",args:{template:"bullet-list",items:[]}},lookup),/items/));

  check(()=>assert.ok(render(shaped,"shape.mp4")));
} finally {fs.rmSync(dir,{recursive:true,force:true});}
} else {fs.rmSync(dir,{recursive:true,force:true});console.log("ffmpeg not found: skipping the real-render checks");}
console.log(`${checks} graphics checks passed`);
