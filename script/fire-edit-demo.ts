// End-to-end check of the fire edit tutorial: boots a real server, uploads a
// real clip, applies the tutorial's own ops batch through the real API, renders
// it with FFmpeg and downloads the MP4. Run with: npx tsx script/fire-edit-demo.ts
import { spawn, ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5299;
const H = `http://127.0.0.1:${PORT}`;
const DB = "/tmp/vf-fireedit.db";
const CLIP = "/tmp/vf-clip.mp4";
const OUT = path.join(ROOT, "fire-edit-demo.mp4");

let server: ChildProcess | null = null;
process.on("exit", () => { if (server) { try { process.kill(-server.pid!, "SIGKILL"); } catch { server.kill("SIGKILL"); } } });

// 1. A real 20 second clip: a slow warm gradient, as footage for the edit.
execSync(`ffmpeg -y -loglevel error -f lavfi -i "gradients=s=1280x720:d=20:speed=0.04:c0=#241011:c1=#7a3018:c2=#f6a447:c3=#2c5364" -f lavfi -i "sine=frequency=220:duration=20" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -shortest ${CLIP}`);
console.log(`clip: ${fs.statSync(CLIP).size} bytes`);

// 2. Boot the server on a scratch database.
server = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: ROOT, detached: true,
  env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT), NODE_ENV: "development" },
  stdio: ["ignore", fs.openSync("/tmp/vf-fireedit.log", "w"), fs.openSync("/tmp/vf-fireedit.log", "w")],
});
const deadline = Date.now() + 45000;
while (Date.now() < deadline) {
  try { if ((await fetch(`${H}/api/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
const adminKey = fs.readFileSync(path.join(ROOT, "data/OWNER_KEY.txt"), "utf8").match(/vf_admin_[a-f0-9]+/)![0];
const AUTH = { Authorization: `Bearer ${adminKey}` };
console.log("server: up");

// 3. Upload the clip.
const form = new FormData();
form.append("files", new Blob([fs.readFileSync(CLIP)], { type: "video/mp4" }), "clip.mp4");
const up = await (await fetch(`${H}/api/media/upload`, { method: "POST", headers: AUTH, body: form })).json();
const assetId = up.assets?.[0]?.id ?? up.assets?.[0]?.assetId;
console.log(`upload: ${assetId}`);

// 4. The tutorial's own batch, straight from docs/tutorial-fire-edit.md.
const md = fs.readFileSync(path.join(ROOT, "docs/tutorial-fire-edit.md"), "utf8");
const batch = JSON.parse(md.match(/```json\n([\s\S]*?)```/)![1]);
batch.ops = batch.ops.map((o: any) => (o.op === "add_clip" ? { ...o, args: { ...o.args, assetId } } : o));
const project = await (await fetch(`${H}/api/projects`, {
  method: "POST", headers: { ...AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Fire edit (tutorial batch)", timeline: { fps: 30, resolution: { width: 1280, height: 720 }, clips: [] } }),
})).json();
const applied = await (await fetch(`${H}/api/projects/${project.id}/timeline/ops`, {
  method: "POST", headers: { ...AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(batch),
})).json();
if (applied.applied !== batch.ops.length) throw new Error(`batch failed: ${JSON.stringify(applied).slice(0, 400)}`);
console.log(`batch: ${applied.applied} ops applied to ${project.id}`);

// 5. Render and download.
const render = await (await fetch(`${H}/api/renders`, {
  method: "POST", headers: { ...AUTH, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id }),
})).json();
let job = { id: render.jobId };
for (let i = 0; i < 240; i++) {
  job = await (await fetch(`${H}/api/renders/${job.id}`, { headers: AUTH })).json();
  if (job.status === "done" || job.status === "failed") break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (job.status !== "done") throw new Error(`render ${job.status}: ${JSON.stringify(job).slice(0, 400)}`);
const mp4 = Buffer.from(await (await fetch(`${H}/api/renders/${job.id}/download`, { headers: AUTH })).arrayBuffer());
fs.writeFileSync(OUT, mp4);
const probe = JSON.parse(execSync(`ffprobe -v error -show_entries format=duration -of json ${OUT}`).toString());
console.log(`render: ${mp4.length} bytes, ${Number(probe.format.duration).toFixed(1)}s -> ${OUT}`);
