// Builds the tutorial videos from the raw Playwright capture: each manifest
// section becomes a clip cut with VideoForge's own trim (add_clip in/out),
// captioned with a VideoForge text clip, rendered by the FFmpeg renderer and
// downloaded into client/public/videos/ with a poster frame and a VTT track.
//
//   node script/record-tutorials.mjs    (raw capture + manifest)
//   npx tsx script/build-tutorial-videos.ts
import { spawn, ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5306;
const H = `http://127.0.0.1:${PORT}`;
const DB = "/tmp/vf-build.db";
const RAW = path.join(ROOT, "client/public/videos/raw");
const OUT = path.join(ROOT, "client/public/videos");

const CAPTIONS: Record<string, string> = {
  start: "Name the project and set the background colour",
  headline: "Add a title, type the headline, set size and position",
  spring: "Motion tab: expand presets and click Spring",
  bar: "Graphics tab: add a rectangle, then Wipe reveal",
  tagline: "Add a tagline and apply Rise",
  badge: "Add an ellipse and apply the Float recipe",
  "lower-third": "Playhead to 2 seconds, then add the Lower third",
  graph: "Animate tab: tune the keyframes on a graph",
  fade: "Set Fade out on the headline and tagline",
  playback: "Fit all layers, jump to start, play",
  export: "Press Export and watch the progress",
};

let server: ChildProcess | null = null;
process.on("exit", () => { if (server && server.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch (e) { server.kill("SIGKILL"); } } });
for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch {} }
fs.mkdirSync(OUT, { recursive: true });

server = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: ROOT, detached: true,
  env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT), NODE_ENV: "development" },
  stdio: ["ignore", fs.openSync("/tmp/vf-build.log", "w"), fs.openSync("/tmp/vf-build.log", "w")],
});
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try { if ((await fetch(`${H}/api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const adminKey = fs.readFileSync(path.join(ROOT, "data/OWNER_KEY.txt"), "utf8").match(/vf_admin_[a-f0-9]+/)![0];
const AUTH = { Authorization: `Bearer ${adminKey}` };
const json = (method: string, p: string, body?: unknown) => fetch(`${H}${p}`, {
  method, headers: { ...AUTH, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// 1. Upload the raw capture once.
const raw = fs.readFileSync(path.join(RAW, "tutorial.webm"));
const form = new FormData();
form.append("files", new Blob([raw], { type: "video/webm" }), "tutorial.webm");
const up = await (await fetch(`${H}/api/media/upload`, { method: "POST", headers: AUTH, body: form })).json();
const assetId = up.assets?.[0]?.id ?? up.assets?.[0]?.assetId;
console.log("upload:", assetId, `${(raw.length / 1048576).toFixed(1)} MB`);

const manifest = JSON.parse(fs.readFileSync(path.join(RAW, "manifest.json"), "utf8"));
const built: { id: string; file: string; bytes: number; seconds: number }[] = [];

for (const s of manifest.sections) {
  const len = Math.max(1, s.end - s.start);
  // 2. A VideoForge project per section: the capture trimmed by add_clip, plus a caption text clip.
  const project = await json("POST", "/api/projects", {
    name: `Tutorial clip: ${s.title}`,
    timeline: { fps: 30, resolution: { width: 1600, height: 900 }, clips: [] },
  });
  const applied = await json("POST", `/api/projects/${project.body.id}/timeline/ops`, {
    ops: [
      { op: "add_clip", args: { assetId, id: "step", start: 0, inPoint: s.start, outPoint: s.end, track: "video" } },
      { op: "add_text_clip", args: { id: "caption", text: CAPTIONS[s.id] ?? s.title, start: 0, duration: len, x: 0.5, y: 0.93, textSize: 3.2, textColor: "#ffffff", fadeIn: 0.4 } },
    ],
  });
  if (applied.status !== 200) throw new Error(`${s.id}: batch failed ${applied.status} ${JSON.stringify(applied.body).slice(0, 200)}`);
  // 3. Render and download.
  const render = await json("POST", "/api/renders", { projectId: project.body.id });
  let job = { id: render.body.jobId };
  for (let i = 0; i < 300; i++) {
    job = (await (await fetch(`${H}/api/renders/${job.id}`, { headers: AUTH })).json()) as any;
    if (job.status === "done" || job.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (job.status !== "done") throw new Error(`${s.id}: render ${job.status}`);
  const mp4 = Buffer.from(await (await fetch(`${H}/api/renders/${job.id}/download`, { headers: AUTH })).arrayBuffer());
  // 4. Encode small, extract a poster, write a caption track.
  const base = `mg-${s.id}`;
  fs.writeFileSync(`/tmp/${base}.mp4`, mp4);
  execSync(`ffmpeg -y -loglevel error -i /tmp/${base}.mp4 -c:v libx264 -crf 28 -preset medium -an -vf scale=1280:720 ${OUT}/${base}.mp4`);
  execSync(`ffmpeg -y -loglevel error -ss ${Math.max(0.5, len * 0.3)} -i ${OUT}/${base}.mp4 -frames:v 1 -update 1 -vf scale=640:-1 ${OUT}/${base}.png`);
  const vtt = `WEBVTT\n\n1\n00:00:00.000 --> ${new Date(len * 1000).toISOString().slice(11, 23)}\n${s.title} — ${CAPTIONS[s.id] ?? s.title}\n`;
  fs.writeFileSync(`${OUT}/${base}.vtt`, vtt);
  const bytes = fs.statSync(`${OUT}/${base}.mp4`).size;
  built.push({ id: s.id, file: `${base}.mp4`, bytes, seconds: Math.round(len * 10) / 10 });
  console.log(`${base}: ${len.toFixed(1)}s, ${(bytes / 1024).toFixed(0)} KB`);
}

const total = built.reduce((t, b) => t + b.bytes, 0);
console.log(`\nbuilt ${built.length} clips, ${(total / 1048576).toFixed(1)} MB total`);
fs.writeFileSync(path.join(RAW, "build-report.json"), JSON.stringify(built, null, 2));
process.exit(0);
