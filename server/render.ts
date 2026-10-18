import { incomingTransition } from "@shared/transitions";
import { textLayout } from "@shared/layout";
import { textAdvance } from "@shared/textmetrics";
import { getFont } from "@shared/fonts";
import { fontFileCached } from "./fonts";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Asset } from "@shared/schema";
import { clipDuration, clipScale, clipSpeed, clipX, clipY, normalizeTimeline, timelineDuration, type Clip, type Timeline } from "@shared/timeline";

import { animationExpression, baseValue, isAnimated, valueAt, type AnimationProperty } from "@shared/animation";
import { RENDER_QUALITIES, type RenderOptions } from "@shared/render-options";

const f = (n: number) => Number(n.toFixed(3));

// Speed steps as play/hold segments: consecutive same-speed steps merge, and
// freezes (speed 0) become holds of the frame before them.
type PlaySeg = { kind: "play"; speed: number; duration: number; srcFrom: number };
type HoldSeg = { kind: "hold"; duration: number };
function rampSegs(c: Clip): Array<PlaySeg | HoldSeg> {
  const steps = c.speedRamp ?? [];
  const segs: Array<PlaySeg | HoldSeg> = [];
  let src = c.inPoint, i = 0;
  while (i < steps.length) {
    if (steps[i].speed === 0) {
      let d = 0;
      while (i < steps.length && steps[i].speed === 0) d += steps[i++].duration;
      segs.push({ kind: "hold", duration: d });
      continue;
    }
    const v = steps[i].speed; let d = 0;
    while (i < steps.length && steps[i].speed === v) d += steps[i++].duration;
    segs.push({ kind: "play", speed: v, duration: d, srcFrom: src });
    src += v * d;
  }
  return segs;
}

/** Video: each play segment trims its source window and retimes it; a hold pads
 *  the segment before it with its last frame (or pre-pads the first). Returns
 *  filter lines ending in [segv], ready for the clip's normal chain. */
function rampVideoEntry(c: Clip, idx: number): string {
  const segs = rampSegs(c);
  const plays = segs.filter((s): s is PlaySeg => s.kind === "play");
  const lines: string[] = [];
  if (plays.length > 1) lines.push(`[${idx}:v]split=${plays.length}${plays.map((_, k) => `[r${k}]`).join("")}`);
  else lines.push(`[${idx}:v]null[r0]`);
  let si = 0, pre = 0;
  while (si < segs.length && segs[si].kind === "hold") { pre += segs[si].duration; si++; }
  for (let k = 0; k < plays.length; k++) {
    const p = plays[k];
    si++; // past this play
    let post = 0;
    while (si < segs.length && segs[si].kind === "hold") { post += segs[si].duration; si++; }
    let line = `trim=start=${f(p.srcFrom)}:end=${f(p.srcFrom + p.speed * p.duration)},setpts=(PTS-STARTPTS)/${f(p.speed)}`;
    if (pre > 0) { line = `tpad=start_mode=clone:start_duration=${f(pre)},${line}`; pre = 0; }
    if (post > 0) line += `,tpad=stop_mode=clone:stop_duration=${f(post)}`;
    lines.push(`[r${k}]${line}[s${k}]`);
  }
  if (plays.length > 1) lines.push(`${plays.map((_, k) => `[s${k}]`).join("")}concat=n=${plays.length}:v=1:a=0[segv]`);
  else lines.push(`[s0]null[segv]`);
  return `${lines.join(";")};[segv]`;
}

/** Audio: play segments trim and tempo-shift; a hold is silence of the same length. */
function rampAudioEntry(c: Clip, idx: number): string {
  const segs = rampSegs(c);
  const plays = segs.filter((s): s is PlaySeg => s.kind === "play");
  const fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
  const lines: string[] = [];
  const parts: string[] = [];
  if (plays.length > 1) lines.push(`[${idx}:a]asplit=${plays.length}${plays.map((_, k) => `[ar${k}]`).join("")}`);
  else lines.push(`[${idx}:a]anull[ar0]`);
  let si = 0, pre = 0;
  while (si < segs.length && segs[si].kind === "hold") { pre += segs[si].duration; si++; }
  for (let k = 0; k < plays.length; k++) {
    const p = plays[k];
    if (pre > 0) { lines.push(`anullsrc=r=48000:cl=stereo:d=${f(pre)}[pre${k}]`); parts.push(`[pre${k}]`); pre = 0; }
    si++;
    let post = 0;
    while (si < segs.length && segs[si].kind === "hold") { post += segs[si].duration; si++; }
    lines.push(`[ar${k}]atrim=start=${f(p.srcFrom)}:end=${f(p.srcFrom + p.speed * p.duration)},asetpts=PTS-STARTPTS,${atempoChain(p.speed)},${fmt}[as${k}]`);
    parts.push(`[as${k}]`);
    if (post > 0) { lines.push(`anullsrc=r=48000:cl=stereo:d=${f(post)}[post${k}]`); parts.push(`[post${k}]`); }
  }
  if (parts.length > 1) lines.push(`${parts.join("")}concat=n=${parts.length}:v=0:a=1[sega]`);
  else lines.push(`${parts[0]}anull[sega]`);
  return `${lines.join(";")};[sega]`;
}

function atempoChain(speed: number): string {
  // atempo accepts 0.5..2 per instance
  const parts: string[] = [];
  let s = speed;
  while (s > 2) { parts.push("atempo=2"); s /= 2; }
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-6) parts.push(`atempo=${f(s)}`);
  return parts.join(",");
}

function colorFilters(c: Clip): string[] {
  const out: string[] = [];
  switch (c.filter) {
    case "mono": out.push("hue=s=0"); break;
    case "sepia": out.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0"); break;
    case "vivid": out.push("eq=saturation=1.45:contrast=1.08"); break;
    case "cool": out.push("colorbalance=rs=-.08:bs=.14"); break;
    case "warm": out.push("colorbalance=rs=.12:bs=-.12"); break;
    case "faded": out.push("eq=saturation=0.7:contrast=0.88:brightness=0.04"); break;
  }
  if (isAnimated(c,"brightness") || isAnimated(c,"contrast") || isAnimated(c,"saturation") || (c.brightness ?? 0) !== 0 || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1) {
    out.push(`eq=brightness='${animationExpression(c,"brightness")}':contrast='${animationExpression(c,"contrast")}':saturation='${animationExpression(c,"saturation")}':eval=frame`);
  }
  if(c.blur) out.push(`gblur=sigma=${c.blur}`);
  return out;
}


/**
 * A uniform opacity that changes over time. geq evaluates its expression for every pixel of every frame, which
 * is slow at 1080p, so the per-frame gain is written to a command file and applied with sendcmd instead.
 */
let gainFilter: ((dur: number, gainAt: (t: number) => number) => string) | null = null;

function transformFilters(c:Clip, width:number, height:number, dur:number, text=false):string[] {
  const chain:string[]=[];
  const dynamicScale=isAnimated(c,"scale"), rotation=!!c.rotation || isAnimated(c,"rotation");
  // Keep a constant transparent bounding box when scaling. This avoids downstream
  // filters caching old dimensions and clipping a growing/rotating layer.
  const scale=animationExpression(c,"scale"), maxScale=Math.min(2,Math.max(baseValue(c,"scale"),...(c.keyframes?.scale??[]).map(k=>k.value),...(c.expressions?.scale?Array.from({length:49},(_,i)=>valueAt(c,"scale",dur*i/48)):[]))*1.5);
  if(!text) {
    chain.push(c.fit==="fill" ? `scale=${width}:${height}` : `scale=${width}:${height}:force_original_aspect_ratio=${c.fit==="cover"?"increase":"decrease"}`);
    if(c.fit==="cover") chain.push(`crop=${width}:${height}`);
    chain.push("format=yuva420p",`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
    // Spatial crop: fractions of the padded layer box to keep, matching the preview's
    // inset, the layer keeps its box, with transparent padding where pixels were cut.
    if(c.crop){
      const even=(n:number)=>Math.round(n/2)*2;
      const cw=even(width*c.crop.w),chh=even(height*c.crop.h),x0=even(width*c.crop.x),y0=even(height*c.crop.y);
      chain.push(`crop=${cw}:${chh}:${x0}:${y0}`,`pad=${width}:${height}:${x0}:${y0}:color=black@0`);
    }
  }
  // Wipe reveal: a left-to-right alpha mask on the unscaled layer, so it follows later scale/rotation.
  if(isAnimated(c,"reveal")||(c.reveal??1)<1) chain.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*lt(X,W*(${animationExpression(c,"reveal","T")}))'`);
  if((c.scale??(c.track==="overlay"&&!text? .35:1))!==1||dynamicScale) {
    chain.push(`scale=w='max(2,trunc(${width}*(${scale})/2)*2)':h='max(2,trunc(${height}*(${scale})/2)*2)':eval=frame`);
  }
  if(dynamicScale) { const w=Math.ceil(width*maxScale/2)*2,h=Math.ceil(height*maxScale/2)*2; chain.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0:eval=frame`); }
  if(c.flipX) chain.push("hflip"); if(c.flipY) chain.push("vflip");
  if(rotation) chain.push(`rotate=a='(${animationExpression(c,"rotation")})*PI/180':ow='ceil(hypot(iw,ih)/2)*2':oh=ow:c=black@0`);
  if(isAnimated(c,"opacity")) {
    if(gainFilter) chain.push(gainFilter(dur,(t)=>valueAt(c,"opacity",t)));
    else chain.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${animationExpression(c,"opacity","T")})'`);
  }
  else if((c.opacity??1)<1) chain.push(`colorchannelmixer=aa=${f(c.opacity!)}`);
  if((c.fadeIn??0)>0) chain.push(`fade=t=in:st=0:d=${f(Math.min(c.fadeIn!,dur))}:alpha=1`);
  if((c.fadeOut??0)>0) chain.push(`fade=t=out:st=${f(Math.max(0,dur-c.fadeOut!))}:d=${f(Math.min(c.fadeOut!,dur))}:alpha=1`);
  return chain;
}

export type RenderPlan = { args: string[]; total: number; tempFiles: string[]; filter: string };

/**
 * Compose every clip onto a black canvas at its timeline position.
 * video/overlay tracks are layered (overlay above video), audio from every
 * unmuted clip is delayed to its start and mixed, text clips are drawn last.
 */
export function buildRenderPlan(rawTimeline: Timeline, assets: Map<string, Asset>, mediaDir: string, tmpDir: string, jobId: string, outPath: string, options: { frameAt?: number; width?: number; fps?: number; audio?: boolean; quality?: RenderOptions["quality"] } = {}): RenderPlan {
  const tl = normalizeTimeline(rawTimeline);
  const W = options.width ? Math.round(options.width / 2) * 2 : tl.resolution.width, H = options.width ? Math.round(tl.resolution.height * W / tl.resolution.width / 2) * 2 : tl.resolution.height, fps = options.fps ?? tl.fps;
  const total = Math.max(0.1, timelineDuration(tl));
  if (!tl.clips.length || timelineDuration(tl) <= 0) throw new Error("Timeline is empty, add at least one clip before rendering.");

  const inputs: string[] = [];
  const filters: string[] = [];
  const tempFiles: string[] = [];
  let gainCount = 0;
  gainFilter = (dur, gainAt) => {
    const id = gainCount++, name = `gain${id}`;
    const file = path.join(tmpDir, `${jobId}_gain${id}.txt`);
    const steps = Math.ceil(dur * fps) + 1;
    const lines: string[] = [];
    for (let i = 0; i <= steps; i++) { const t = i / fps; lines.push(`${t.toFixed(4)} colorchannelmixer@${name} aa ${Math.min(1, Math.max(0, gainAt(Math.min(t, dur)))).toFixed(4)};`); }
    fs.writeFileSync(file, lines.join("\n"));
    tempFiles.push(file);
    return `sendcmd=f=${file},colorchannelmixer@${name}=aa=${Math.min(1, Math.max(0, gainAt(0))).toFixed(4)}`;
  };
  let inputCount = 0;

  const visual = tl.clips
    .filter((c) => c.assetId && c.track !== "audio" && !tl.tracks?.[c.track]?.hidden)
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && (x.a.kind === "video" || x.a.kind === "image"))
    .sort((p, q) => (p.c.track === q.c.track ? ((p.c.z ?? 0) - (q.c.z ?? 0)) || (p.c.start - q.c.start) : p.c.track === "video" ? -1 : 1));

  const audioSources: { c: Clip; a: Asset }[] = tl.clips
    .filter((c) => c.assetId && !c.muted && !tl.tracks?.[c.track]?.muted && (c.volume > 0 || isAnimated(c,"volume")))
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && x.a.hasAudio === 1 && x.a.kind !== "image")
    .filter((x) => x.c.track === "audio" || x.a.kind === "video");

  if (options.frameAt !== undefined) audioSources.length = 0; // stills never need audio
  // An export with the sound off skips audio processing entirely, not just the output stream.
  if (options.audio === false) audioSources.length = 0;

  // Missing assets should fail loudly instead of silently dropping footage.
  const missing = tl.clips.filter((c) => c.assetId && !assets.get(c.assetId)).map((c) => c.assetId);
  if (missing.length) throw new Error(`Missing media for clip(s): ${Array.from(new Set(missing)).join(", ")}`);

  filters.push(`color=c=${tl.background ?? "#000000"}:s=${W}x${H}:r=${fps}:d=${f(total)}[base0]`);
  let current = "base0";
  let layer = 0;
  const videoInputIndex = new Map<Clip, number>();

  for (const { c, a } of visual.filter((v) => v.c.track !== "overlay")) {
    const idx = inputCount++;
    videoInputIndex.set(c, idx);
    const dur = clipDuration(c);
    if (a.kind === "image") inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(f(dur)), "-i", path.join(mediaDir, a.id));
    else inputs.push("-i", path.join(mediaDir, a.id));
    const chain: string[] = [];
    let entry: string;
    if (a.kind === "video" && c.speedRamp?.length) {
      entry = rampVideoEntry(c, idx);
    } else if (a.kind === "video") {
      entry = `[${idx}:v]trim=start=${f(c.inPoint)}:end=${f(c.outPoint)},setpts=(PTS-STARTPTS)/${f(clipSpeed(c))}`;
    } else {
      entry = `[${idx}:v]trim=duration=${f(dur)},setpts=PTS-STARTPTS`;
    }
    chain.push(`fps=${fps}`);
    chain.push(...colorFilters(c));
    const aspect = a.width && a.height ? a.width/a.height : W/H;
    const width=c.track==="overlay" ? W : W, height=c.track==="overlay" ? Math.max(2,Math.round(W/aspect/2)*2) : H;
    chain.push(...transformFilters(c,width,height,dur));
    const tr = incomingTransition(tl,c);
    if(tr) { const p=`min(1,max(0,T/${f(tr.duration)}))`, alpha=({dissolve:p,'wipe-left':`lte(X,W*(${p}))`,'wipe-right':`gte(X,W*(1-(${p})))`,'wipe-up':`gte(Y,H*(1-(${p})))`,'wipe-down':`lte(Y,H*(${p}))`,iris:`lte(hypot(X-W/2,Y-H/2),hypot(W/2,H/2)*(${p}))`,'barn-h':`lte(abs(X-W/2),W/2*(${p}))`,'barn-v':`lte(abs(Y-H/2),H/2*(${p}))`,diamond:`lte(abs(X-W/2)/W+abs(Y-H/2)/H,${p})`,'wipe-diagonal':`lte(X/W+Y/H,2*(${p}))`} as Record<string,string>)[tr.type];
      if (tr.type === "dissolve" && gainFilter) chain.push(gainFilter(dur, (t) => Math.min(1, Math.max(0, t / tr.duration))));
      else chain.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${alpha})'`); }

    chain.push(`setpts=PTS+${f(c.start)}/TB`);
    filters.push(`${entry}${chain.length ? "," + chain.join(",") : ""}[cv${layer}]`);
    const next = `base${layer + 1}`;
    const x = `main_w*(${animationExpression(c,"x",`(t-${f(c.start)})`)})-overlay_w/2`;
    const y = `main_h*(${animationExpression(c,"y",`(t-${f(c.start)})`)})-overlay_h/2`;
    filters.push(`[${current}][cv${layer}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start + dur)})':format=auto[${next}]`);
    current = next;
    layer++;
  }

  // Overlay visuals, overlay-track media, shapes and text, share one stacking
  // order: z first (higher draws on top), then start. Video-track footage stays
  // beneath every overlay visual.
  const overlayEmitters: Array<{ z: number; start: number; emit: () => void }> = [];

  for (const { c, a } of visual.filter((v) => v.c.track === "overlay")) {
    overlayEmitters.push({ z: c.z ?? 0, start: c.start, emit: () => {
    const idx = inputCount++;
    videoInputIndex.set(c, idx);
    const dur = clipDuration(c);
    if (a.kind === "image") inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(f(dur)), "-i", path.join(mediaDir, a.id));
    else inputs.push("-i", path.join(mediaDir, a.id));
    const chain: string[] = [];
    let entry: string;
    if (a.kind === "video" && c.speedRamp?.length) {
      entry = rampVideoEntry(c, idx);
    } else if (a.kind === "video") {
      entry = `[${idx}:v]trim=start=${f(c.inPoint)}:end=${f(c.outPoint)},setpts=(PTS-STARTPTS)/${f(clipSpeed(c))}`;
    } else {
      entry = `[${idx}:v]trim=duration=${f(dur)},setpts=PTS-STARTPTS`;
    }
    chain.push(`fps=${fps}`);
    chain.push(...colorFilters(c));
    const aspect = a.width && a.height ? a.width/a.height : W/H;
    const width=c.track==="overlay" ? W : W, height=c.track==="overlay" ? Math.max(2,Math.round(W/aspect/2)*2) : H;
    chain.push(...transformFilters(c,width,height,dur));
    const tr = incomingTransition(tl,c);
    if(tr) { const p=`min(1,max(0,T/${f(tr.duration)}))`, alpha=({dissolve:p,'wipe-left':`lte(X,W*(${p}))`,'wipe-right':`gte(X,W*(1-(${p})))`,'wipe-up':`gte(Y,H*(1-(${p})))`,'wipe-down':`lte(Y,H*(${p}))`,iris:`lte(hypot(X-W/2,Y-H/2),hypot(W/2,H/2)*(${p}))`,'barn-h':`lte(abs(X-W/2),W/2*(${p}))`,'barn-v':`lte(abs(Y-H/2),H/2*(${p}))`,diamond:`lte(abs(X-W/2)/W+abs(Y-H/2)/H,${p})`,'wipe-diagonal':`lte(X/W+Y/H,2*(${p}))`} as Record<string,string>)[tr.type];
      if (tr.type === "dissolve" && gainFilter) chain.push(gainFilter(dur, (t) => Math.min(1, Math.max(0, t / tr.duration))));
      else chain.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${alpha})'`); }

    chain.push(`setpts=PTS+${f(c.start)}/TB`);
    filters.push(`${entry}${chain.length ? "," + chain.join(",") : ""}[cv${layer}]`);
    const next = `base${layer + 1}`;
    const x = `main_w*(${animationExpression(c,"x",`(t-${f(c.start)})`)})-overlay_w/2`;
    const y = `main_h*(${animationExpression(c,"y",`(t-${f(c.start)})`)})-overlay_h/2`;
    filters.push(`[${current}][cv${layer}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start + dur)})':format=auto[${next}]`);
    current = next;
    layer++;
    } });
  }


  // text clips (and captions attached to asset clips) via textfile=, so user text never needs filter escaping
  // Procedural graphics use bounded masks, never arbitrary SVG/JS or external media.
  for (const c of tl.clips.filter(c => c.shape && !tl.tracks?.[c.track]?.hidden)) {
    overlayEmitters.push({ z: c.z ?? 0, start: c.start, emit: () => {
    const s = c.shape!, dur = clipDuration(c);
    const w = Math.max(2, Math.round(W * s.width / 2) * 2), h = Math.max(2, Math.round(H * s.height / 2) * 2);
    const factor = W / tl.resolution.width, radius = Math.min(s.radius * factor, w / 2, h / 2), stroke = Math.min(s.strokeWidth * factor, w / 2, h / 2);
    const mask = (inset: number) => {
      const hw = w / 2 - inset, hh = h / 2 - inset;
      if (hw <= 0 || hh <= 0) return "0";
      if (s.type === "ellipse") return `lte(pow((X-${w/2})/${hw},2)+pow((Y-${h/2})/${hh},2),1)`;
      const r = Math.max(0, radius - inset);
      if (!r) return `between(X,${inset},${w-inset})*between(Y,${inset},${h-inset})`;
      return `lte(pow(max(abs(X-${w/2})-${hw-r},0),2)+pow(max(abs(Y-${h/2})-${hh-r},0),2),${r*r})`;
    };
    const outer = mask(0), inner = mask(stroke), hasStroke = stroke > 0 && s.stroke !== "transparent";
    const channel = (i: number) => {
      const v = (color: string) => color === "transparent" ? 0 : parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
      return hasStroke ? `if(${inner},${v(s.fill)},${v(s.stroke)})` : String(v(s.fill));
    };
    const alpha = `${outer}*(${hasStroke ? `if(${inner},${s.fill === "transparent" ? 0 : 255},255)` : s.fill === "transparent" ? 0 : 255})`;
    const label = `cg${layer}`, next = `base${layer + 1}`;
    // The shape never changes between frames: draw one frame with geq, then repeat it for the clip's length.
    filters.push([`color=c=black@0:s=${w}x${h}:r=${fps}:d=${f(1 / fps)}`, "format=rgba",
      `geq=r='${channel(0)}':g='${channel(1)}':b='${channel(2)}':a='${alpha}'`, "format=yuva420p",
      `loop=loop=${Math.ceil(dur * fps)}:size=1:start=0`, `setpts=N/(${fps}*TB)`, `trim=duration=${f(dur)}`,
      ...colorFilters(c), ...transformFilters(c, w, h, dur, true), `setpts=PTS+${f(c.start)}/TB`].join(",") + `[${label}]`);
    filters.push(`[${current}][${label}]overlay=x='main_w*(${animationExpression(c,"x",`(t-${f(c.start)})`)})-overlay_w/2':y='main_h*(${animationExpression(c,"y",`(t-${f(c.start)})`)})-overlay_h/2':eof_action=pass:enable='gte(t,${f(c.start)})*lt(t,${f(c.start+dur)})':format=auto[${next}]`);
    current = next; layer++;
    } });
  }

  const texts = tl.clips.filter((c) => c.text && c.text.trim() && !tl.tracks?.[c.track]?.hidden);
  const escPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  texts.forEach((c, i) => {
    overlayEmitters.push({ z: c.z ?? 0, start: c.start, emit: () => {
    const lay = textLayout(c, { width: W, height: H });
    // One drawtext per line, aligned without relying on text_align (FFmpeg 6.1+), and no stray newline glyphs.
    const files = lay.lines.map((line, j) => { const file = path.join(tmpDir, `${jobId}_t${i}_${j}.txt`); fs.writeFileSync(file, line.replace(/\r/g, "")); tempFiles.push(file); return file; });
    const dur = clipDuration(c);
    const next = `base${layer + 1}`;
    const size = Math.max(1, Math.round(lay.fontSize));
    const color = (c.textColor ?? "#ffffff").replace("#", "0x");
    const box = c.textBg ? `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(size * 0.35)}` : `:borderw=${Math.max(1, Math.round(size / 18))}:bordercolor=black@0.7`;
    // Per-clip font: the renderer downloads catalog fonts and matches the weight the clip asks for.
    const fontDef = getFont(c.font);
    const weight = fontDef.weights.includes(c.fontWeight ?? 400) ? (c.fontWeight ?? 400) : fontDef.weights[fontDef.weights.length - 1];
    const fontFile = fontFileCached(c.font, weight);
    const font = fontFile ? `:fontfile='${escPath(fontFile)}'` : process.env.VIDEOFORGE_FONT ? `:fontfile='${escPath(process.env.VIDEOFORGE_FONT)}'` : "";
    const tc:Clip=c.assetId ? {...c,assetId:"",x:.5,y:.82,scale:1,rotation:0,keyframes:undefined,expressions:undefined} : c;
    const n = files.length;
    // Text reveal: lines get time windows; typewriter/word modes draw one step per window.
    const reveal = c.textReveal && ["typewriter", "words", "lines"].includes(c.textReveal.mode) ? c.textReveal : undefined;
    const rStart = c.start + (reveal?.delay ?? 0);
    const lineWin = reveal ? (reveal.duration ?? 1.5) / Math.max(1, n) : 0;
    const lineEnable = (j: number) => reveal ? `:enable='between(t,${(rStart + j * lineWin).toFixed(3)},1e5)'` : "";
    const cycle = c.textColorCycle && c.textColorCycle.steps.length >= 2 ? c.textColorCycle : undefined;
    const cycleDur = cycle?.duration ?? 2;
    const cyclePer = cycle ? cycleDur / cycle.steps.length : 0;
    const colorAt = (t: number) => cycle
      ? cycle.steps[Math.max(0, Math.floor(((t - c.start) / cycleDur) * cycle.steps.length)) % cycle.steps.length]
      : (c.textColor ?? "#ffffff");
    const cumulativeChars = (text: string): string[] => {
      const chars = Array.from(text);
      const steps = Math.max(1, Math.min(chars.length, 64));
      const out: string[] = [];
      for (let k = 1; k <= steps; k++) out.push(chars.slice(0, Math.ceil((chars.length * k) / steps)).join(""));
      return out;
    };
    const cumulativeWords = (text: string): string[] => {
      const words = text.split(/\s+/).filter(Boolean);
      const out: string[] = [];
      for (let k = 1; k <= words.length; k++) out.push(words.slice(0, k).join(" "));
      return out.length ? out : [text];
    };
    // Optional line height and alignment, measured with the same metrics as the fit engine.
    const lh = c.lineHeight ? Math.round(size * c.lineHeight * 100) / 100 : undefined;
    const lineY = (j: number) => lh ? `(h-${n}*${lh})/2+${j}*${lh}+(${lh}-${size})/2` : n === 1 ? "(h-text_h)/2" : `(h-${n}*line_h)/2+${j}*line_h`;
    const align = c.textAlign ?? "center";
    const measure = { font: c.font, fontWeight: weight, letterSpacing: c.letterSpacing ?? 0 };
    const lineW = lay.lines.map((l) => textAdvance(l, measure));
    const maxW = Math.max(...lineW);
    const px = (em: number) => Math.round(em * size * 100) / 100;
    const lineX = (j: number) => align === "center" ? "(w-text_w)/2" : `(w-${px(maxW)})/2${align === "right" ? `+${px(maxW - lineW[j])}` : ""}`;
    const draw = (file: string, x: string, j: number, style: string) => `drawtext=expansion=none:textfile='${escPath(file)}'${font}:fontsize=${size}${style}:x=${x}:y=${lineY(j)}`;
    let lineFilters: string[];
    if (Math.abs(c.letterSpacing ?? 0) > 0.005 && Array.from(lay.text).length <= 500) {
      // Letter spacing: draw each character at its estimated advance so the export matches the preview.
      // The 500-character cap is the text limit itself, so spacing is never silently dropped.
      lineFilters = [];
      const ls = c.letterSpacing ?? 0;
      lay.lines.forEach((line, j) => {
        let advance = 0;
        const chars = Array.from(line);
        for (let k = 0; k < chars.length; k++) {
          const ch = chars[k];
          const charX = advance;
          // A single character has no gaps of its own, so the spacing is added between characters.
          advance += textAdvance(ch, measure) + ls;
          if (ch.trim() === "") continue;
          const file = path.join(tmpDir, `${jobId}_t${i}_${j}_${k}.txt`);
          fs.writeFileSync(file, ch);
          tempFiles.push(file);
          const x = align === "center" ? `(w-${px(lineW[j])})/2+${px(charX)}` : align === "left" ? `(w-${px(maxW)})/2+${px(charX)}` : `(w-${px(maxW)})/2+${px(maxW - lineW[j] + charX)}`;
          lineFilters.push(draw(file, x, j, `:fontcolor=${color}:borderw=${Math.max(1, Math.round(size / 18))}:bordercolor=black@0.7${lineEnable(j)}`));
        }
      });
      if (c.textBg) {
        // Background box: each character draws an opaque box (the glyph itself is transparent),
        // the whole layer is made translucent once, then the glyphs are drawn again on top.
        const pad = Math.round(size * 0.35);
        const boxPass: string[] = [];
        lay.lines.forEach((line, j) => {
          let advance = 0;
          const chars = Array.from(line);
          for (let k = 0; k < chars.length; k++) {
            const ch = chars[k];
            const charX = advance;
            advance += textAdvance(ch, measure) + ls;
            if (ch.trim() === "") continue;
            const file = path.join(tmpDir, `${jobId}_b${i}_${j}_${k}.txt`);
            fs.writeFileSync(file, ch);
            tempFiles.push(file);
            const x = align === "center" ? `(w-${px(lineW[j])})/2+${px(charX)}` : align === "left" ? `(w-${px(maxW)})/2+${px(charX)}` : `(w-${px(maxW)})/2+${px(maxW - lineW[j] + charX)}`;
            boxPass.push(draw(file, x, j, `:fontcolor=black@0:box=1:boxcolor=black@1:boxborderw=${pad}`));
          }
        });
        lineFilters = [...boxPass, "format=rgba", "colorchannelmixer=aa=0.55", "format=yuva420p", ...lineFilters];
      }
    } else if (c.textBg) {
      lineFilters = n === 1 ? [draw(files[0], lineX(0), 0, `:fontcolor=${color}${box}${lineEnable(0)}`)]
        // Boxes are drawn opaque first and made translucent together, so overlapping lines do not darken twice.
        : [...files.map((file, j) => draw(file, lineX(j), j, `:fontcolor=black@0:box=1:boxcolor=black@1:boxborderw=${Math.round(size * 0.35)}${lineEnable(j)}`)), "format=rgba", "colorchannelmixer=aa=0.55", "format=yuva420p", ...files.map((file, j) => draw(file, lineX(j), j, `:fontcolor=${color}${lineEnable(j)}`))];
    } else if (reveal && reveal.mode !== "lines") {
      // Typewriter / word-by-word: one drawtext per step, each in its own time window.
      lineFilters = [];
      lay.lines.forEach((line, j) => {
        const parts = reveal.mode === "words" ? cumulativeWords(line) : cumulativeChars(line);
        const step = Math.max(1 / fps, lineWin / Math.max(1, parts.length));
        parts.forEach((part, k) => {
          const file = path.join(tmpDir, `${jobId}_r${i}_${j}_${k}.txt`);
          fs.writeFileSync(file, part);
          tempFiles.push(file);
          const hex = colorAt(rStart + j * lineWin + k * step).replace("#", "");
          lineFilters.push(draw(file, lineX(j), j, `:fontcolor=0x${hex}${box}:enable='between(t,${(rStart + j * lineWin + k * step).toFixed(3)},1e5)'`));
        });
      });
    } else {
      // Plain text: one drawtext per line, plus one per colour step when cycling, each in its time window.
      lineFilters = [];
      const colors = cycle ? cycle.steps : [(c.textColor ?? "#ffffff")];
      files.forEach((file, j) => {
        colors.forEach((hex, k) => {
          const enableParts: string[] = [];
          if (reveal) enableParts.push(`between(t,${(rStart + j * lineWin).toFixed(3)},1e5)`);
          if (cycle) enableParts.push(`between(mod(t-${f(c.start)},${f(cycleDur)}),${f(k * cyclePer)},${f((k + 1) * cyclePer)})`);
          const enable = enableParts.length ? `:enable='${enableParts.join("*")}'` : "";
          lineFilters.push(draw(file, lineX(j), j, `:fontcolor=0x${hex.replace("#", "")}${box}${enable}`));
        });
      });
    }
    const textChain=[`color=c=black@0:s=${W}x${H}:r=${fps}:d=${f(dur)}`,"format=yuva420p",...lineFilters,...transformFilters(tc,W,H,dur,true),`setpts=PTS+${f(c.start)}/TB`];
    filters.push(`${textChain.join(",")}[ct${i}]`);
    const x=`main_w*(${animationExpression(tc,"x",`(t-${f(c.start)})`)})-overlay_w/2`;
    const y=`main_h*(${animationExpression(tc,"y",`(t-${f(c.start)})`)})-overlay_h/2`;
    filters.push(`[${current}][ct${i}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start+dur)})':format=auto[${next}]`);
    current = next;
    layer++;
    } });
  });

  overlayEmitters.sort((p, q) => p.z - q.z || p.start - q.start).forEach((e) => e.emit());;
  filters.push(`[${current}]format=yuv420p[vout]`);

  // audio mix
  const audioLabels: string[] = [];
  audioSources.forEach(({ c, a }, i) => {
    let idx = videoInputIndex.get(c);
    if (idx === undefined) { idx = inputCount++; inputs.push("-i", path.join(mediaDir, a.id)); }
    const chain: string[] = [];
    let entry: string;
    if (c.speedRamp?.length) {
      entry = rampAudioEntry(c, idx);
    } else {
      entry = `[${idx}:a]atrim=start=${f(c.inPoint)}:end=${f(c.outPoint)},asetpts=PTS-STARTPTS`;
      const tempo = atempoChain(clipSpeed(c));
      if (tempo) chain.push(tempo);
    }
    chain.push("aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo");
    chain.push(`volume='${animationExpression(c,"volume")}':eval=frame`);
    const dur = clipDuration(c);
    const tr=incomingTransition(tl,c), outgoing=tl.clips.find(x=>incomingTransition(tl,x)?.fromClipId===c.id);
    if(tr) chain.push(`afade=t=in:st=0:d=${f(tr.duration)}`);
    if(outgoing) chain.push(`afade=t=out:st=${f(dur-outgoing.transitionIn!.duration)}:d=${f(outgoing.transitionIn!.duration)}`);
    if ((c.fadeIn ?? 0) > 0) chain.push(`afade=t=in:st=0:d=${f(Math.min(c.fadeIn!, dur))}`);
    if ((c.fadeOut ?? 0) > 0) chain.push(`afade=t=out:st=${f(Math.max(0, dur - c.fadeOut!))}:d=${f(Math.min(c.fadeOut!, dur))}`);
    const ms = Math.round(c.start * 1000);
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    filters.push(`${entry}${chain.length ? "," + chain.join(",") : ""}[ca${i}]`);
    audioLabels.push(`[ca${i}]`);
  });
  const maps = ["-map", "[vout]"];
  if (audioLabels.length) {
    filters.push(audioLabels.length === 1 ? `${audioLabels[0]}anull[aout]` : `${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest:dropout_transition=0[aout]`);
    maps.push("-map", "[aout]");
  } else maps.push("-an");

  // Encoding settings come from the whitelisted quality preset; the previous
  // behaviour (veryfast, crf 20) is exactly the "standard" preset.
  const quality = RENDER_QUALITIES[options.quality ?? "standard"];

  // A long edit produces a filter graph larger than the operating system allows for one argument
  // (spawn E2BIG), so big graphs are handed to FFmpeg as a script file instead.
  const graph = filters.join(";");
  let graphArgs = ["-filter_complex", graph];
  if (graph.length > 20000) {
    const graphFile = path.join(tmpDir, `${jobId}_graph.txt`);
    fs.writeFileSync(graphFile, graph);
    tempFiles.push(graphFile);
    graphArgs = ["-filter_complex_script", graphFile];
  }
  const args = [
    "-y", "-hide_banner", ...inputs,
    ...graphArgs,
    ...(options.frameAt === undefined ? maps : ["-map","[vout]","-ss",String(options.frameAt),"-frames:v","1"]),
    ...(options.frameAt === undefined ? ["-t", String(f(total)),
    "-c:v", "libx264", "-preset", quality.preset, "-crf", String(quality.crf), "-pix_fmt", "yuv420p",
    ...(audioLabels.length ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-movflags", "+faststart"] : ["-c:v","png","-update","1"]),
    outPath,
  ];
  return { args, total, tempFiles, filter: filters.join(";\n") };
}

export function runFfmpeg(args: string[], total: number, onProgress: (pct: number) => void): Promise<{ code: number | null; stderrTail: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let tail = "";
    p.stderr!.on("data", (d: Buffer) => {
      const s = d.toString();
      tail = (tail + s).slice(-3000);
      const m = s.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g);
      if (m) {
        const last = m[m.length - 1].match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)!;
        const t = parseInt(last[1]) * 3600 + parseInt(last[2]) * 60 + parseFloat(last[3]);
        onProgress(Math.min(0.99, t / total));
      }
    });
    p.on("close", (code) => resolve({ code, stderrTail: tail }));
    p.on("error", reject);
  });
}
