// Turns a raw capture into one finished tutorial video, edited in VideoForge itself.
//
//   npx tsx script/tutorials/edit.ts <id>
//
// Reads  work/<id>/capture.mkv + manifest.json, narration/<id>.json and audio/<id>-*.mp3.
// Builds one timeline (title card, section clips with push-ins, chapter labels, dissolves,
// narration, end card), renders it with VideoForge's FFmpeg renderer, then masters the audio
// and writes the MP4, a poster, WebVTT captions and a chapter list to client/public/videos.
import { spawn, execFileSync, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const id = process.argv[2];
if (!id) { console.error("usage: edit.ts <tutorial id>"); process.exit(1); }
const WORK = path.join(ROOT, "script/tutorials/work", id);
const AUDIO = path.join(ROOT, "script/tutorials/audio");
const OUT = path.join(ROOT, "client/public/videos");
const narration = JSON.parse(fs.readFileSync(path.join(ROOT, "script/tutorials/narration", `${id}.json`), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(WORK, "manifest.json"), "utf8"));
// ONLY=intro,start renders a short test cut: quick to check the edit without waiting for the whole video.
const ONLY = process.env.ONLY?.split(",");
if (ONLY) { manifest.sections = manifest.sections.filter((x: any) => ONLY.includes(x.id)); narration.sections = narration.sections.filter((x: any) => ONLY.includes(x.id)); }
const num = (v: number) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ brand
const BG = "#0b0f14", ACCENT = "#f6a447", INK = "#f4f1eb", MUTED = "#9fb3c8";
const FPS = 30, W = 1920, H = 1080;
const DISSOLVE = 0.45;       // seconds of overlap between two sections
const ZOOM_TIME = 0.85;      // seconds a push-in takes
const CARD = 4.6;            // title card length
const END_CARD = 5.2;

// ------------------------------------------------------------------ server
const PORT = 5330 + Math.floor(Math.random() * 40), HOST = `http://127.0.0.1:${PORT}`, DB = `/tmp/vf-edit-${id}.db`;
for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
const server: ChildProcess = spawn("npx", ["tsx", "server/index.ts"], { cwd: ROOT, detached: true, env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT), NODE_ENV: "development" }, stdio: ["ignore", fs.openSync(`/tmp/vf-edit-${id}.log`, "w"), fs.openSync(`/tmp/vf-edit-${id}.log`, "w")] });
const stop = () => { try { process.kill(-server.pid!, "SIGKILL"); } catch {} };
process.on("exit", stop);
for (let i = 0; i < 300; i++) { try { if ((await fetch(`${HOST}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
const adminKey = fs.readFileSync(path.join(ROOT, "data/OWNER_KEY.txt"), "utf8").match(/vf_admin_[a-f0-9]+/)![0];
const AUTH = { Authorization: `Bearer ${adminKey}` };
const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(`${HOST}${p}`, { method, headers: { ...AUTH, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
};
async function upload(file: string, type: string, name: string) {
  const form = new FormData();
  form.append("files", new Blob([fs.readFileSync(file)], { type }), name);
  const r = await fetch(`${HOST}/api/media/upload`, { method: "POST", headers: AUTH, body: form });
  const j: any = await r.json();
  const a = j.assets?.[0];
  if (!a) throw new Error(`upload failed: ${JSON.stringify(j).slice(0, 300)}`);
  return a.id ?? a.assetId;
}

// ------------------------------------------------------------------ source media
// Each section gets its own file. One long asset reused for every clip makes FFmpeg fan a single decoder out
// to many trims, which buffers gigabytes of frames and renders at a crawl.
console.log("cutting the capture into sections");
const sectionAssets: Record<string, string> = {};
for (const sec of manifest.sections as { id: string; start: number; end: number }[]) {
  const file = path.join(WORK, `section-${sec.id}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(sec.start), "-i", path.join(WORK, "capture.mkv"), "-t", String(num(sec.end - sec.start)), "-vf", `fps=${FPS},scale=1920:1080${zoomFilter(sec)},format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "30", "-an", file], { stdio: "inherit" });
}
for (const sec of manifest.sections as { id: string }[]) sectionAssets[sec.id] = await upload(path.join(WORK, `section-${sec.id}.mp4`), "video/mp4", `${id}-${sec.id}.mp4`);
const audioAssets: Record<string, string> = {};
for (const s of narration.sections) audioAssets[s.id] = await upload(path.join(AUDIO, `${id}-${s.id}.mp3`), "audio/mpeg", `${id}-${s.id}.mp3`);
console.log("uploaded", Object.keys(audioAssets).length, "narration clips");

// ------------------------------------------------------------------ timeline
type Op = { op: string; args: Record<string, unknown> };
const ops: Op[] = [];
const sections = manifest.sections as { id: string; title: string; start: number; end: number; audio: number }[];
const LEAD = 0.5;

/** The push-in plan for one section: where the frame sits, in clip scale and centre, after each recorded zoom. */
function zoomStates(sec: { start: number; end: number }) {
  const len = sec.end - sec.start;
  const evs = (manifest.events as any[]).filter((e) => e.kind === "zoom" && e.t >= sec.start - 0.01 && e.t <= sec.end + 0.01).sort((a, b) => a.t - b.t);
  const states: { t: number; s: number; x: number; y: number }[] = [{ t: 0, s: 1, x: 0.5, y: 0.5 }];
  for (const e of evs) {
    const rel = Math.min(len - ZOOM_TIME - 0.6, Math.max(0.2, e.t - sec.start));
    const s = e.scale ?? 1;
    if (s <= 1.001) { if (states[states.length - 1].s > 1) states.push({ t: rel, s: 1, x: 0.5, y: 0.5 }); continue; }
    // Keep the zoomed frame inside the footage: the clip centre may move at most (s - 1) / 2 from the middle.
    const lim = (s - 1) / 2;
    const x = Math.min(0.5 + lim, Math.max(0.5 - lim, 0.5 - (e.cx - 0.5) * s));
    const y = Math.min(0.5 + lim, Math.max(0.5 - lim, 0.5 - (e.cy - 0.5) * s));
    states.push({ t: rel, s, x, y });
  }
  const last = states[states.length - 1];
  if (last.s > 1) states.push({ t: Math.max(last.t + ZOOM_TIME + 0.4, len - ZOOM_TIME - DISSOLVE - 0.2), s: 1, x: 0.5, y: 0.5 });
  // Drop states too close to the previous one for the move to read as a move.
  return states.filter((st, i) => i === 0 || st.t - states[i - 1].t > ZOOM_TIME + 0.15);
}

/**
 * FFmpeg filters that bake the push-ins into a section. Scaling a frame up inside the final render is slow at
 * 1080p, so the zoom is applied here, once, to the cut itself with a smooth ease between each state.
 */
function zoomFilter(sec: { start: number; end: number }) {
  const st = zoomStates(sec);
  if (st.length < 2) return "";
  const ease = (T: number) => { const u = `clip((t-${num(T)})/${ZOOM_TIME},0,1)`; return `(${u}*${u}*(3-2*${u}))`; };
  const track = (pick: (s: (typeof st)[number]) => number) => `${num(pick(st[0]))}` + st.slice(1).map((s, i) => `+(${num(pick(s) - pick(st[i]))})*${ease(s.t)}`).join("");
  const z = track((s) => s.s), x = track((s) => s.x), y = track((s) => s.y);
  return `,scale=w='2*trunc(960*(${z}))':h='2*trunc(540*(${z}))':eval=frame:flags=bilinear,crop=1920:1080:x='max(0,min(iw-1920,iw/2-1920*(${x})))':y='max(0,min(ih-1080,ih/2-1080*(${y})))'`;
}

let cursor = 0;
const placed: { id: string; title: string; start: number; len: number; audioStart: number; clipId: string }[] = [];
sections.forEach((sec, i) => {
  const len = num(sec.end - sec.start);
  const clipId = `sec-${sec.id}`;
  const start = num(cursor);
  ops.push({ op: "add_clip", args: { assetId: sectionAssets[sec.id], id: clipId, start, inPoint: 0, outPoint: len, track: "video" } });
  if (i > 0) ops.push({ op: "set_transition", args: { clipId, type: "dissolve", duration: DISSOLVE } });
  placed.push({ id: sec.id, title: sec.title, start, len, audioStart: num(start + LEAD), clipId });
  cursor += len - (i < sections.length - 1 ? DISSOLVE : 0);
});
const total = num(cursor);

// Narration, one clip per section, starting where the narrator started during the recording.
for (const p of placed) ops.push({ op: "add_clip", args: { assetId: audioAssets[p.id], id: `vo-${p.id}`, start: p.audioStart, track: "audio", volume: 1 } });

// Chapter label: a small step marker that arrives with each section and leaves again.
const body = placed.filter((p) => p.id !== "intro" && p.id !== "outro");
body.forEach((p, i) => {
  const at = num(p.start + 0.7);
  ops.push({ op: "add_text_clip", args: { id: `step-${p.id}`, text: `STEP ${String(i + 1).padStart(2, "0")} OF ${String(body.length).padStart(2, "0")}`, start: at, duration: 3.6, x: 0.5, y: 0.885, textSize: 1.9, textColor: ACCENT, font: "poppins", fontWeight: 700, fadeIn: 0.35, fadeOut: 0.5, textBg: false } });
  ops.push({ op: "add_text_clip", args: { id: `label-${p.id}`, text: p.title, start: at, duration: 3.6, x: 0.5, y: 0.93, textSize: 3.4, textColor: INK, font: "poppins", fontWeight: 700, fadeIn: 0.35, fadeOut: 0.5, textBg: true } });
});

// Title card: a cover that opens onto the first footage, with a headline, rule and subtitle.
const cardTitle = narration.title, cardSub = narration.subtitle;
ops.push({ op: "add_shape_clip", args: { id: "card-cover", start: 0, duration: CARD, x: 0.5, y: 0.5, scale: 1, shape: { type: "rectangle", width: 1, height: 1, fill: BG }, keyframes: { opacity: [{ time: 0, value: 1 }, { time: CARD - 1.0, value: 1, easing: "ease-in-out" }, { time: CARD, value: 0 }] } } });
ops.push({ op: "add_text_clip", args: { id: "card-eyebrow", text: "VIDEOFORGE STUDIO", start: 0.3, duration: CARD - 0.8, x: 0.5, y: 0.36, textSize: 2.6, textColor: ACCENT, font: "poppins", fontWeight: 700, fadeIn: 0.5, fadeOut: 0.5 } });
ops.push({ op: "add_text_clip", args: { id: "card-title", text: cardTitle, start: 0.5, duration: CARD - 1.0, x: 0.5, y: 0.47, textSize: 9, textColor: INK, font: "poppins", fontWeight: 700, fadeOut: 0.5, textMaxWidth: 0.9 } });
ops.push({ op: "apply_motion", args: { clipId: "card-title", preset: "rise", duration: 0.8 } });
ops.push({ op: "add_shape_clip", args: { id: "card-rule", start: 0.8, duration: CARD - 1.3, x: 0.5, y: 0.575, shape: { type: "rectangle", width: 0.16, height: 0.006, fill: ACCENT }, fadeOut: 0.4 } });
ops.push({ op: "apply_motion", args: { clipId: "card-rule", preset: "reveal", duration: 0.7 } });
ops.push({ op: "add_text_clip", args: { id: "card-sub", text: cardSub, start: 1.1, duration: CARD - 1.6, x: 0.5, y: 0.64, textSize: 3.4, textColor: MUTED, font: "poppins", fadeOut: 0.4, textMaxWidth: 0.8 } });
ops.push({ op: "apply_motion", args: { clipId: "card-sub", preset: "rise", duration: 0.7 } });

// End card over the closing section.
const outro = placed[placed.length - 1];
const endAt = num(Math.max(outro.start + 4, total - END_CARD));
const endLen = num(total - endAt);
ops.push({ op: "add_shape_clip", args: { id: "end-cover", start: endAt, duration: endLen, x: 0.5, y: 0.5, shape: { type: "rectangle", width: 1, height: 1, fill: BG }, keyframes: { opacity: [{ time: 0, value: 0 }, { time: 1.0, value: 1, easing: "ease-in-out" }] } } });
ops.push({ op: "add_text_clip", args: { id: "end-title", text: "Tutorial complete", start: endAt + 0.9, duration: endLen - 0.9, x: 0.5, y: 0.44, textSize: 8, textColor: INK, font: "poppins", fontWeight: 700, fadeOut: 0.6 } });
ops.push({ op: "apply_motion", args: { clipId: "end-title", preset: "rise", duration: 0.7 } });
ops.push({ op: "add_shape_clip", args: { id: "end-rule", start: endAt + 1.2, duration: endLen - 1.2, x: 0.5, y: 0.53, shape: { type: "rectangle", width: 0.12, height: 0.006, fill: ACCENT }, fadeOut: 0.5 } });
ops.push({ op: "apply_motion", args: { clipId: "end-rule", preset: "reveal", duration: 0.6 } });
ops.push({ op: "add_text_clip", args: { id: "end-next", text: narration.next, start: endAt + 1.5, duration: endLen - 1.5, x: 0.5, y: 0.6, textSize: 3.6, textColor: MUTED, font: "poppins", fadeOut: 0.6, textMaxWidth: 0.8 } });
ops.push({ op: "apply_motion", args: { clipId: "end-next", preset: "rise", duration: 0.6 } });

// ------------------------------------------------------------------ build and render
const project = await api("POST", "/api/projects", { name: narration.title, timeline: { fps: FPS, resolution: { width: W, height: H }, background: BG, clips: [] } });
const pid = project.id;
for (let i = 0; i < ops.length; i += 40) {
  try { await api("POST", `/api/projects/${pid}/timeline/ops`, { ops: ops.slice(i, i + 40) }); }
  catch (e: any) { console.error("batch failed at", i, e.message); throw e; }
}
await api("POST", `/api/projects/${pid}/timeline/ops`, { ops: [{ op: "set_project", args: { background: BG } }] }).catch(() => {});
console.log(`timeline built: ${ops.length} operations, ${total.toFixed(1)}s`);
fs.writeFileSync(path.join(WORK, "edit-ops.json"), JSON.stringify({ projectId: pid, total, placed, ops }, null, 1));

const t0 = Date.now();
const render = await api("POST", "/api/renders", { projectId: pid });
let job: any = { id: render.jobId };
for (let i = 0; i < 7200; i++) {
  job = await (await fetch(`${HOST}/api/renders/${job.id}`, { headers: AUTH })).json();
  if (i % 15 === 0) console.log(`render ${job.status} ${Math.round((job.progress ?? 0) * 100)}%`);
  if (job.status === "done" || job.status === "error") break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (job.status !== "done") { console.error("render failed", JSON.stringify(job).slice(0, 600)); process.exit(1); }
const rendered = path.join(WORK, "rendered.mp4");
fs.writeFileSync(rendered, Buffer.from(await (await fetch(`${HOST}/api/renders/${job.id}/download`, { headers: AUTH })).arrayBuffer()));
console.log(`rendered in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
if (ONLY) { fs.copyFileSync(rendered, path.join(WORK, "test-cut.mp4")); process.exit(0); }

// ------------------------------------------------------------------ mastering and sidecar files
fs.mkdirSync(OUT, { recursive: true });
const secs = (s: number) => new Date(s * 1000).toISOString().slice(11, 23);
// Captions: each narration clip split into short, sentence-sized cues.
let vtt = "WEBVTT\n\n"; let n = 1;
for (const p of placed) {
  const text = narration.sections.find((s: any) => s.id === p.id).say as string;
  const sentences = text.match(/[^.]+\./g)?.map((s) => s.trim()) ?? [text];
  const dur = manifest.sections.find((s: any) => s.id === p.id).audio as number;
  const totalChars = sentences.reduce((t, s) => t + s.length, 0);
  let at = p.audioStart;
  for (const s of sentences) {
    const d = (s.length / totalChars) * (dur - 0.3);
    vtt += `${n++}\n${secs(at)} --> ${secs(at + d)}\n${s}\n\n`;
    at += d;
  }
}
fs.writeFileSync(path.join(OUT, `${id}.vtt`), vtt);
const chapters = placed.map((p, i) => ({ id: p.id, title: p.title, start: p.start, end: i < placed.length - 1 ? placed[i + 1].start : total }));
fs.writeFileSync(path.join(OUT, `${id}.chapters.json`), JSON.stringify(chapters, null, 1));
let meta = ";FFMETADATA1\n";
for (const c of chapters) meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${c.title}\n\n`;
fs.writeFileSync(path.join(WORK, "chapters.ffmeta"), meta);
const final = path.join(OUT, `${id}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", rendered, "-i", path.join(WORK, "chapters.ffmeta"), "-i", path.join(OUT, `${id}.vtt`),
  "-map", "0:v", "-map", "0:a?", "-map", "2:0", "-map_metadata", "1", "-map_chapters", "1",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000", "-c:a", "aac", "-b:a", "160k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata", `title=${narration.title}`, final], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "2.6", "-i", final, "-frames:v", "1", "-update", "1", "-vf", "scale=1280:-1", path.join(OUT, `${id}.png`)]);
console.log(`wrote ${path.relative(ROOT, final)} (${(fs.statSync(final).size / 1048576).toFixed(1)} MB, ${total.toFixed(0)}s)`);
process.exit(0);
