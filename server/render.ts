import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Asset } from "@shared/schema";
import { clipDuration, clipScale, clipSpeed, clipX, clipY, normalizeTimeline, timelineDuration, type Clip, type Timeline } from "@shared/timeline";

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
  if ((c.brightness ?? 0) !== 0 || (c.contrast ?? 1) !== 1 || (c.saturation ?? 1) !== 1) {
    out.push(`eq=brightness=${f(c.brightness ?? 0)}:contrast=${f(c.contrast ?? 1)}:saturation=${f(c.saturation ?? 1)}`);
  }
  return out;
}

export type RenderPlan = { args: string[]; total: number; tempFiles: string[]; filter: string };

/**
 * Compose every clip onto a black canvas at its timeline position.
 * video/overlay tracks are layered (overlay above video), audio from every
 * unmuted clip is delayed to its start and mixed, text clips are drawn last.
 */
export function buildRenderPlan(rawTimeline: Timeline, assets: Map<string, Asset>, mediaDir: string, tmpDir: string, jobId: string, outPath: string): RenderPlan {
  const tl = normalizeTimeline(rawTimeline);
  const W = tl.resolution.width, H = tl.resolution.height, fps = tl.fps;
  const total = Math.max(0.1, timelineDuration(tl));
  if (!tl.clips.length || timelineDuration(tl) <= 0) throw new Error("Timeline is empty — add at least one clip before rendering.");

  const inputs: string[] = [];
  const filters: string[] = [];
  const tempFiles: string[] = [];
  let inputCount = 0;

  const visual = tl.clips
    .filter((c) => c.assetId && c.track !== "audio")
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && (x.a.kind === "video" || x.a.kind === "image"))
    .sort((p, q) => (p.c.track === q.c.track ? p.c.start - q.c.start : p.c.track === "video" ? -1 : 1));

  const audioSources: { c: Clip; a: Asset }[] = tl.clips
    .filter((c) => c.assetId && !c.muted && c.volume > 0)
    .map((c) => ({ c, a: assets.get(c.assetId) }))
    .filter((x): x is { c: Clip; a: Asset } => !!x.a && x.a.hasAudio === 1 && x.a.kind !== "image")
    .filter((x) => x.c.track === "audio" || x.a.kind === "video");

  // Missing assets should fail loudly instead of silently dropping footage.
  const missing = tl.clips.filter((c) => c.assetId && !assets.get(c.assetId)).map((c) => c.assetId);
  if (missing.length) throw new Error(`Missing media for clip(s): ${Array.from(new Set(missing)).join(", ")}`);

  filters.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f(total)}[base0]`);
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
    if (c.track === "overlay") chain.push(`scale=${Math.max(2, Math.round((W * clipScale(c)) / 2) * 2)}:-2`);
    else chain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    chain.push(...colorFilters(c));
    chain.push("format=yuva420p");
    if ((c.fadeIn ?? 0) > 0) chain.push(`fade=t=in:st=0:d=${f(Math.min(c.fadeIn!, dur))}:alpha=1`);
    if ((c.fadeOut ?? 0) > 0) chain.push(`fade=t=out:st=${f(Math.max(0, dur - c.fadeOut!))}:d=${f(Math.min(c.fadeOut!, dur))}:alpha=1`);
    if ((c.opacity ?? 1) < 1) chain.push(`colorchannelmixer=aa=${f(c.opacity!)}`);
    chain.push(`setpts=PTS+${f(c.start)}/TB`);
    filters.push(`[${idx}:v]${chain.join(",")}[cv${layer}]`);
    const next = `base${layer + 1}`;
    const x = c.track === "overlay" ? `main_w*${f(clipX(c))}-overlay_w/2` : "(main_w-overlay_w)/2";
    const y = c.track === "overlay" ? `main_h*${f(clipY(c))}-overlay_h/2` : "(main_h-overlay_h)/2";
    filters.push(`[${current}][cv${layer}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f(c.start)},${f(c.start + dur)})':format=auto[${next}]`);
    current = next;
    layer++;
  }

  // text clips (and captions attached to asset clips) via textfile=, so user text never needs filter escaping
  const texts = tl.clips.filter((c) => c.text && c.text.trim());
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
    const alpha = (c.fadeIn ?? 0) > 0 || (c.fadeOut ?? 0) > 0
      ? `:alpha='min(1,min((t-${f(c.start)})/${Math.max(0.01, c.fadeIn ?? 0.01)},(${f(c.start + dur)}-t)/${Math.max(0.01, c.fadeOut ?? 0.01)}))'`
      : "";
    // captions attached to footage clips sit bottom-centre; standalone text clips use their own position
    const x = `w*${f(c.assetId ? 0.5 : clipX(c))}-text_w/2`;
    const y = `h*${f(c.assetId ? 0.82 : clipY(c))}-text_h/2`;
    const font = process.env.VIDEOFORGE_FONT ? `:fontfile='${escPath(process.env.VIDEOFORGE_FONT)}'` : "";
    filters.push(`[${current}]drawtext=expansion=none:textfile='${escPath(file)}'${font}:fontsize=${size}:fontcolor=${color}${box}:x='${x}':y='${y}'${alpha}:enable='between(t,${f(c.start)},${f(c.start + dur)})'[${next}]`);
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
    chain.push(`volume=${f(c.volume)}`);
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
    ...maps,
    "-t", String(f(total)),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    ...(audioLabels.length ? ["-c:a", "aac", "-b:a", "192k"] : []),
    "-movflags", "+faststart",
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
