import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Asset } from "@shared/schema";
import { clipDuration, clipScale, clipSpeed, clipX, clipY, normalizeTimeline, timelineDuration, type Clip, type Timeline } from "@shared/timeline";

import { animationExpression, baseValue, type AnimationProperty } from "@shared/animation";

const f = (n: number) => Number(n.toFixed(3));

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
  if (c.keyframes?.brightness || c.keyframes?.contrast || c.keyframes?.saturation || (c.brightness ?? 0) !== 0 || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1) {
    out.push(`eq=brightness='${animationExpression(c,"brightness")}':contrast='${animationExpression(c,"contrast")}':saturation='${animationExpression(c,"saturation")}':eval=frame`);
  }
  if(c.blur) out.push(`gblur=sigma=${c.blur}`);
  return out;
}


function transformFilters(c:Clip, width:number, height:number, dur:number, text=false):string[] {
  const chain:string[]=[];
  const dynamicScale=!!c.keyframes?.scale, rotation=!!c.rotation || !!c.keyframes?.rotation;
  // Keep a constant transparent bounding box when scaling. This avoids downstream
  // filters caching old dimensions and clipping a growing/rotating layer.
  const scale=animationExpression(c,"scale"), maxScale=Math.min(2,Math.max(baseValue(c,"scale"),...(c.keyframes?.scale??[]).map(k=>k.value))*1.5);
  if(!text) {
    chain.push(`scale=${width}:${height}:force_original_aspect_ratio=${c.fit==="cover"?"increase":"decrease"}`);
    if(c.fit==="cover") chain.push(`crop=${width}:${height}`);
    chain.push("format=yuva420p",`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
  }
  if((c.scale??(c.track==="overlay"&&!text? .35:1))!==1||dynamicScale) {
    chain.push(`scale=w='max(2,trunc(${width}*(${scale})/2)*2)':h='max(2,trunc(${height}*(${scale})/2)*2)':eval=frame`);
  }
  if(dynamicScale) { const w=Math.ceil(width*maxScale/2)*2,h=Math.ceil(height*maxScale/2)*2; chain.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0:eval=frame`); }
  if(c.flipX) chain.push("hflip"); if(c.flipY) chain.push("vflip");
  if(rotation) chain.push(`rotate=a='(${animationExpression(c,"rotation")})*PI/180':ow='ceil(hypot(iw,ih)/2)*2':oh=ow:c=black@0`);
  if(c.keyframes?.opacity) chain.push(`geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(${animationExpression(c,"opacity","T")})'`);
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
export function buildRenderPlan(rawTimeline: Timeline, assets: Map<string, Asset>, mediaDir: string, tmpDir: string, jobId: string, outPath: string, options: {frameAt?:number;width?:number} = {}): RenderPlan {
  const tl = normalizeTimeline(rawTimeline);
  const W = options.width ? Math.round(options.width/2)*2 : tl.resolution.width, H = options.width ? Math.round(tl.resolution.height*W/tl.resolution.width/2)*2 : tl.resolution.height, fps = tl.fps;
  const total = Math.max(0.1, timelineDuration(tl));
  if (!tl.clips.length || timelineDuration(tl) <= 0) throw new Error("Timeline is empty — add at least one clip before rendering.");

  const inputs: string[] = [];
  const filters: string[] = [];
  const tempFiles: string[] = [];
  let inputCount = 0;

  const visual = tl.clips
    .filter((c) => c.assetId && c.track !== "audio" && !tl.tracks?.[c.track]?.hidden)
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && (x.a.kind === "video" || x.a.kind === "image"))
    .sort((p, q) => (p.c.track === q.c.track ? p.c.start - q.c.start : p.c.track === "video" ? -1 : 1));

  const audioSources: { c: Clip; a: Asset }[] = tl.clips
    .filter((c) => c.assetId && !c.muted && !tl.tracks?.[c.track]?.muted && (c.volume > 0 || c.keyframes?.volume))
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && x.a.hasAudio === 1 && x.a.kind !== "image")
    .filter((x) => x.c.track === "audio" || x.a.kind === "video");

  if (options.frameAt !== undefined) audioSources.length = 0; // stills never need audio

  // Missing assets should fail loudly instead of silently dropping footage.
  const missing = tl.clips.filter((c) => c.assetId && !assets.get(c.assetId)).map((c) => c.assetId);
  if (missing.length) throw new Error(`Missing media for clip(s): ${Array.from(new Set(missing)).join(", ")}`);

  filters.push(`color=c=${tl.background ?? "#000000"}:s=${W}x${H}:r=${fps}:d=${f(total)}[base0]`);
  let current = "base0";
  let layer = 0;
  const videoInputIndex = new Map<Clip, number>();

  for (const { c, a } of visual) {
    const idx = inputCount++;
    videoInputIndex.set(c, idx);
    const dur = clipDuration(c);
    if (a.kind === "image") inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(f(dur)), "-i", path.join(mediaDir, a.id));
    else inputs.push("-i", path.join(mediaDir, a.id));
    const chain: string[] = [];
    if (a.kind === "video") {
      chain.push(`trim=start=${f(c.inPoint)}:end=${f(c.outPoint)}`);
      chain.push(`setpts=(PTS-STARTPTS)/${f(clipSpeed(c))}`);
    } else {
      chain.push(`trim=duration=${f(dur)}`, "setpts=PTS-STARTPTS");
    }
    chain.push(`fps=${fps}`);
    chain.push(...colorFilters(c));
    const aspect = a.width && a.height ? a.width/a.height : W/H;
    const width=c.track==="overlay" ? W : W, height=c.track==="overlay" ? Math.max(2,Math.round(W/aspect/2)*2) : H;
    chain.push(...transformFilters(c,width,height,dur));
    chain.push(`setpts=PTS+${f(c.start)}/TB`);
    filters.push(`[${idx}:v]${chain.join(",")}[cv${layer}]`);
    const next = `base${layer + 1}`;
    const x = `main_w*(${animationExpression(c,"x",`(t-${f(c.start)})`)})-overlay_w/2`;
    const y = `main_h*(${animationExpression(c,"y",`(t-${f(c.start)})`)})-overlay_h/2`;
    filters.push(`[${current}][cv${layer}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start + dur)})':format=auto[${next}]`);
    current = next;
    layer++;
  }

  // text clips (and captions attached to asset clips) via textfile=, so user text never needs filter escaping
  const texts = tl.clips.filter((c) => c.text && c.text.trim() && !tl.tracks?.[c.track]?.hidden);
  const escPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  texts.forEach((c, i) => {
    const file = path.join(tmpDir, `${jobId}_t${i}.txt`);
    fs.writeFileSync(file, c.text!.replace(/\r/g, ""));
    tempFiles.push(file);
    const dur = clipDuration(c);
    const next = `base${layer + 1}`;
    const size = Math.round((H * (c.textSize ?? 6)) / 100);
    const color = (c.textColor ?? "#ffffff").replace("#", "0x");
    const box = c.textBg ? `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(size * 0.35)}` : `:borderw=${Math.max(1, Math.round(size / 18))}:bordercolor=black@0.7`;
    const font = process.env.VIDEOFORGE_FONT ? `:fontfile='${escPath(process.env.VIDEOFORGE_FONT)}'` : "";
    const tc:Clip=c.assetId ? {...c,assetId:"",x:.5,y:.82,scale:1,rotation:0,keyframes:undefined} : c;
    const textChain=[`color=c=black@0:s=${W}x${H}:r=${fps}:d=${f(dur)}`,"format=yuva420p",`drawtext=expansion=none:textfile='${escPath(file)}'${font}:fontsize=${size}:fontcolor=${color}${box}:x=(w-text_w)/2:y=(h-text_h)/2`,...transformFilters(tc,W,H,dur,true),`setpts=PTS+${f(c.start)}/TB`];
    filters.push(`${textChain.join(",")}[ct${i}]`);
    const x=`main_w*(${animationExpression(tc,"x",`(t-${f(c.start)})`)})-overlay_w/2`;
    const y=`main_h*(${animationExpression(tc,"y",`(t-${f(c.start)})`)})-overlay_h/2`;
    filters.push(`[${current}][ct${i}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start+dur)})':format=auto[${next}]`);
    current = next;
    layer++;
  });
  filters.push(`[${current}]format=yuv420p[vout]`);

  // audio mix
  const audioLabels: string[] = [];
  audioSources.forEach(({ c, a }, i) => {
    let idx = videoInputIndex.get(c);
    if (idx === undefined) { idx = inputCount++; inputs.push("-i", path.join(mediaDir, a.id)); }
    const chain = [`atrim=start=${f(c.inPoint)}:end=${f(c.outPoint)}`, "asetpts=PTS-STARTPTS"];
    const tempo = atempoChain(clipSpeed(c));
    if (tempo) chain.push(tempo);
    chain.push("aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo");
    chain.push(`volume='${animationExpression(c,"volume")}':eval=frame`);
    const dur = clipDuration(c);
    if ((c.fadeIn ?? 0) > 0) chain.push(`afade=t=in:st=0:d=${f(Math.min(c.fadeIn!, dur))}`);
    if ((c.fadeOut ?? 0) > 0) chain.push(`afade=t=out:st=${f(Math.max(0, dur - c.fadeOut!))}:d=${f(Math.min(c.fadeOut!, dur))}`);
    const ms = Math.round(c.start * 1000);
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    filters.push(`[${idx}:a]${chain.join(",")}[ca${i}]`);
    audioLabels.push(`[ca${i}]`);
  });
  const maps = ["-map", "[vout]"];
  if (audioLabels.length) {
    filters.push(audioLabels.length === 1 ? `${audioLabels[0]}anull[aout]` : `${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0:duration=longest:dropout_transition=0[aout]`);
    maps.push("-map", "[aout]");
  } else maps.push("-an");

  const args = [
    "-y", "-hide_banner", ...inputs,
    "-filter_complex", filters.join(";"),
    ...(options.frameAt === undefined ? maps : ["-map","[vout]","-ss",String(options.frameAt),"-frames:v","1"]),
    ...(options.frameAt === undefined ? ["-t", String(f(total)),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
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
