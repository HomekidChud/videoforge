// ============================================================================
// End-to-end tests for the VideoForge API.
//
// Run:
//   npx tsx test/api.spec.ts
//
// Starts a fresh server on an ephemeral port, exercises the API, then exits.
// ============================================================================

import { spawn, ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const TEST_PORT = 5199; // separate from the dev port so we don't clash

// Clean slate for tests
const DB = path.join(ROOT, "data.db");
for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) {
  try { fs.unlinkSync(f); } catch {}
}

let server: ChildProcess | null = null;
const OUT = fs.openSync("/tmp/vf_test_server.log", "w");

function killServer() {
  if (server) {
    try { process.kill(-server.pid!, "SIGKILL"); } catch { server.kill("SIGKILL"); }
    server = null;
  }
}
process.on("exit", killServer);
process.on("SIGINT", () => { killServer(); process.exit(1); });

async function startServer(): Promise<void> {
  server = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: "development", VIDEOFORGE_REQUIRE_UI_AUTH: "1" },
    stdio: ["ignore", OUT, OUT],
    detached: true, // own process group, so the whole tsx → node tree is killed on exit
  });
  // wait until /api/health responds
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start in 30s");
}

// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function jsonFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as any) },
  });
  let body: any = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

async function main() {
  console.log("Starting server…");
  await startServer();
  const H = `http://127.0.0.1:${TEST_PORT}`;

  // --- 1. Health is open
  console.log("1) /api/health is open");
  {
    const r = await jsonFetch("/api/health");
    assert(r.status === 200 && r.body?.ok === true, "health returned ok");
  }

  // --- 2. No auth header → 401
  console.log("2) Missing auth header → 401");
  {
    const r = await jsonFetch("/api/projects");
    assert(r.status === 401, `expected 401, got ${r.status}`);
    assert(String(r.body?.message || "").includes("missing Authorization"), "message mentions Authorization");
  }

  // --- 3. Get the admin key from the file
  console.log("3) Owner key exists at data/OWNER_KEY.txt");
  const OWNER_FILE = path.join(ROOT, "data/OWNER_KEY.txt");
  assert(fs.existsSync(OWNER_FILE), "OWNER_KEY.txt exists");
  const adminKey = fs.readFileSync(OWNER_FILE, "utf8").match(/^(vf_admin_[a-f0-9]+)$/m)?.[1];
  assert(!!adminKey, "parsed admin key from OWNER_KEY.txt");

  const AUTH_ADMIN = { "Authorization": `Bearer ${adminKey}` } as any;

  // --- 4. /api/keys requires admin
  console.log("4) /api/keys without key → 401");
  {
    const r = await jsonFetch("/api/keys");
    assert(r.status === 401, `expected 401, got ${r.status}`);
  }

  // --- 5. List keys with admin key
  console.log("5) List keys with admin key");
  {
    const r = await jsonFetch("/api/keys", { headers: AUTH_ADMIN });
    assert(r.status === 200 && Array.isArray(r.body?.keys), "keys list returned");
    const owner = (r.body.keys as any[]).find((k) => k.scope === "admin");
    assert(owner, "owner key appears in list");
  }

  // --- 6. Create a write-scoped key
  console.log("6) Create a write-scoped key");
  let writeKey: string, writeKeyId: string;
  {
    const r = await jsonFetch("/api/keys", {
      method: "POST",
      headers: AUTH_ADMIN,
      body: JSON.stringify({ label: "test-agent", scope: "write" }),
    });
    assert(r.status === 201, `expected 201, got ${r.status}`);
    assert(String(r.body?.key).startsWith("vf_live_"), "plaintext key starts with vf_live_");
    assert(r.body?.record?.scope === "write", "record has scope write");
    writeKey = r.body.key;
    writeKeyId = r.body.record.id;
  }
  const AUTH_WRITE = { "Authorization": `Bearer ${writeKey}` } as any;

  // --- 7. Create a read-scoped key
  console.log("7) Create a read-scoped key");
  let readKey: string;
  {
    const r = await jsonFetch("/api/keys", {
      method: "POST",
      headers: AUTH_ADMIN,
      body: JSON.stringify({ label: "test-read", scope: "read" }),
    });
    assert(r.status === 201, `expected 201, got ${r.status}`);
    readKey = r.body.key;
  }
  const AUTH_READ = { "Authorization": `Bearer ${readKey}` } as any;

  // --- 8. read scope can GET but not POST
  console.log("8) Read scope enforcement");
  {
    const r1 = await jsonFetch("/api/projects", { headers: AUTH_READ });
    assert(r1.status === 200, "GET /api/projects with read → 200");
    const r2 = await jsonFetch("/api/projects", {
      method: "POST",
      headers: AUTH_READ,
      body: JSON.stringify({ name: "x", timeline: { clips: [] } }),
    });
    assert(r2.status === 403, `POST with read → 403, got ${r2.status}`);
    assert(String(r2.body?.message).includes("requires 'write'"), "message says scope mismatch");
  }

  // --- 9. write key cannot access /api/keys
  console.log("9) Write key cannot manage keys");
  {
    const r = await jsonFetch("/api/keys", { headers: AUTH_WRITE });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    assert(String(r.body?.message).includes("admin"), "message mentions admin");
  }

  // --- 10. Upload a test video via multipart
  console.log("10) Upload a generated test video");
  // create a tiny mp4 with ffmpeg so we have a real file
  const tmp = path.join(ROOT, "data", "test_clip.mp4");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  await new Promise<void>((res, rej) => {
    const p = spawn("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=6:size=640x480:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      tmp,
    ], { stdio: "ignore" });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg make failed"))));
  });
  let assetId: string;
  {
    const fd = new FormData();
    fd.append("files", new File([fs.readFileSync(tmp)], "test_clip.mp4", { type: "video/mp4" }));
    const res = await fetch(`${H}/api/media/upload`, { method: "POST", headers: AUTH_WRITE, body: fd });
    const body = await res.json();
    assert(res.status === 201, `upload returned 201, got ${res.status}`);
    assert(body.assets?.length === 1, "one asset returned");
    const a = body.assets[0];
    assetId = a.id;
    assert(a.duration > 5 && a.duration < 7, `duration ~6s, got ${a.duration}`);
    assert(a.width === 640 && a.height === 480, "dimensions 640x480");
    assert(a.thumbnailUrl?.includes(assetId), "thumbnailUrl present");
  }

  // --- 11. Create a project + add a clip
  console.log("11) Create project + add clip");
  let projectId: string, clipId: string;
  {
    const r = await jsonFetch("/api/projects", {
      method: "POST",
      headers: AUTH_WRITE,
      body: JSON.stringify({
        name: "e2e test",
        timeline: { fps: 30, resolution: { width: 640, height: 480 }, clips: [] },
      }),
    });
    assert(r.status === 201, "project created");
    projectId = r.body.id;
  }
  {
    const r = await jsonFetch(`/api/projects/${projectId}/timeline/ops`, {
      method: "POST",
      headers: AUTH_WRITE,
      body: JSON.stringify({
        op: "add_clip",
        args: { assetId, track: "video", start: 0, inPoint: 1, outPoint: 4, volume: 1, muted: false },
      }),
    });
    assert(r.status === 200, `add_clip 200, got ${r.status}`);
    clipId = r.body.timeline.clips[0]?.id;
    assert(clipId, "clip id present");
  }

  // --- 12. trim + add_text
  console.log("12) Trim + add_text");
  {
    const r1 = await jsonFetch(`/api/projects/${projectId}/timeline/ops`, {
      method: "POST",
      headers: AUTH_WRITE,
      body: JSON.stringify({ op: "trim_clip", args: { clipId, inPoint: 1, outPoint: 3 } }),
    });
    assert(r1.status === 200 && r1.body.timeline.clips[0].outPoint === 3, "trim_clip set outPoint");
    const r2 = await jsonFetch(`/api/projects/${projectId}/timeline/ops`, {
      method: "POST",
      headers: AUTH_WRITE,
      body: JSON.stringify({ op: "add_text", args: { clipId, text: "hello world" } }),
    });
    assert(r2.status === 200 && r2.body.timeline.clips[0].text === "hello world", "add_text worked");
  }

  // --- 13. Render and download
  console.log("13) Render + download");
  let jobId: string;
  {
    const r = await jsonFetch("/api/renders", {
      method: "POST",
      headers: AUTH_WRITE,
      body: JSON.stringify({ projectId }),
    });
    assert(r.status === 201, `render queued, got ${r.status}`);
    jobId = r.body.jobId;
    assert(!!jobId, "jobId returned");
  }
  {
    const deadline = Date.now() + 60000;
    let status = "queued";
    while (Date.now() < deadline) {
      const r = await jsonFetch(`/api/renders/${jobId}`, { headers: AUTH_WRITE });
      status = r.body?.status ?? "unknown";
      if (status === "done" || status === "error") break;
      await new Promise((res) => setTimeout(res, 1000));
    }
    assert(status === "done", `render finished, status=${status}`);
  }
  {
    const res = await fetch(`${H}/api/renders/${jobId}/download`, { headers: AUTH_WRITE });
    assert(res.status === 200, "download 200");
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf.length > 1000, `download size > 1KB, got ${buf.length}`);
    const outPath = path.join(ROOT, "data", "test_render_out.mp4");
    fs.writeFileSync(outPath, buf);
    // verify the downloaded file plays (has a valid moov atom) via ffprobe
    const ok = await new Promise<boolean>((res) => {
      const p = spawn("ffprobe", ["-v", "error", outPath], { stdio: "ignore" });
      p.on("close", (c) => res(c === 0));
    });
    assert(ok, "ffprobe confirms rendered file is valid");
    // verify duration is roughly 2s (in=1, out=3 → 2s clip)
    const dur = await new Promise<number>((res) => {
      const p = spawn("ffprobe", [
        "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", outPath,
      ]);
      let out = "";
      p.stdout.on("data", (d: Buffer) => (out += d));
      p.on("close", () => res(parseFloat(out)));
    });
    assert(Math.abs(dur - 2) < 0.3, `render duration ~2s, got ${dur}`);
  }

  // --- 14. Revoked key → 403
  console.log("14) Revoked key → 403");
  {
    const del = await jsonFetch(`/api/keys/${writeKeyId}`, { method: "DELETE", headers: AUTH_ADMIN });
    assert(del.status === 200 && del.body?.revoked === true, "revoke returned ok");
    const r = await jsonFetch("/api/projects", { headers: AUTH_WRITE });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    assert(String(r.body?.message).includes("revoked"), "message says revoked");
  }

  // --- 15. UI cookie bypass works when VIDEOFORGE_REQUIRE_UI_AUTH != 1
  console.log("15) UI cookie bypass");
  {
    // note: the running server has REQUIRE_UI_AUTH=1, so this should be 401.
    // We test the negative here and document the positive in the docs.
    const r = await fetch(`${H}/api/projects`, {
      headers: { "Cookie": "vf_ui=1" },
    });
    assert(r.status === 401, "UI cookie blocked when REQUIRE_UI_AUTH=1");
  }

  // --- 16. Key restrictions, visibility, public sharing
  console.log("16) Restrictions + public/private projects");
  {
    const mk = async (body: any) => (await jsonFetch("/api/keys", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify(body) }));
    const scoped = await mk({ label: "scoped", scope: "write", restrictions: { projectIds: [projectId], allowDelete: false, allowUpload: false } });
    assert(scoped.status === 201, `scoped key created, got ${scoped.status}`);
    const SC = { Authorization: `Bearer ${scoped.body.key}` } as any;
    const other = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "other", timeline: { clips: [] } }) });
    assert((await jsonFetch(`/api/projects/${projectId}`, { headers: SC })).status === 200, "restricted key reads allowed project");
    assert((await jsonFetch(`/api/projects/${other.body.id}`, { headers: SC })).status === 403, "restricted key cannot read other project");
    assert((await jsonFetch(`/api/projects/${projectId}`, { method: "DELETE", headers: SC })).status === 403, "delete-disabled key cannot delete");
    assert((await jsonFetch(`/api/projects/${projectId}`, { method: "PUT", headers: SC, body: JSON.stringify({ visibility: "public" }) })).status === 403, "non-admin cannot publish");
    const list = await jsonFetch("/api/projects", { headers: SC });
    assert(list.body.projects.length === 1, "restricted key only lists allowed projects");

    assert((await mk({ label: "past", scope: "read", restrictions: { expiresAt: Date.now() - 1000 } })).status === 400, "past expiry rejected");
    assert((await mk({ label: "bad", scope: "read", restrictions: { allowedOrigins: ["https://x.test/path"] } })).status === 400, "origin with path rejected");
    const adminRestricted = await mk({ label: "admin restricted", scope: "admin", restrictions: { allowDelete: false } });
    assert(adminRestricted.status === 400, "admin keys cannot be restricted");

    const limited = await mk({ label: "limited", scope: "read", restrictions: { requestsPerMinute: 2, allowedOrigins: ["https://app.example"] } });
    const LH = { Authorization: `Bearer ${limited.body.key}` } as any;
    assert((await jsonFetch("/api/projects", { headers: LH })).status === 403, "origin allowlist blocks missing origin");
    const ok1 = await jsonFetch("/api/projects", { headers: { ...LH, Origin: "https://app.example" } });
    const ok2 = await jsonFetch("/api/projects", { headers: { ...LH, Origin: "https://app.example" } });
    const blocked = await jsonFetch("/api/projects", { headers: { ...LH, Origin: "https://app.example" } });
    assert(ok1.status === 200 && ok2.status === 200 && blocked.status === 429, `rate limit applies, got ${ok1.status}/${ok2.status}/${blocked.status}`);

    assert((await jsonFetch(`/api/public/projects/${projectId}`)).status === 404, "private project is not public");
    const pub = await jsonFetch(`/api/projects/${projectId}`, { method: "PUT", headers: AUTH_ADMIN, body: JSON.stringify({ visibility: "public" }) });
    assert(pub.status === 200 && pub.body.visibility === "public", "admin can publish project");
    const shared = await jsonFetch(`/api/public/projects/${projectId}`);
    assert(shared.status === 200 && shared.body.renderUrl?.includes(jobId), "public endpoint returns latest render");
    assert(!JSON.stringify(shared.body).includes("assetId"), "public endpoint does not expose timeline");
    const video = await fetch(`${H}${shared.body.renderUrl}`);
    assert(video.status === 200 && video.headers.get("content-type")?.includes("video/mp4"), "public render streams without a key");
    await jsonFetch(`/api/projects/${projectId}`, { method: "PUT", headers: AUTH_ADMIN, body: JSON.stringify({ visibility: "private" }) });
    assert((await fetch(`${H}${shared.body.renderUrl}`)).status === 404, "making private revokes public render");

    const revokeSelf = await jsonFetch(`/api/keys/${scoped.body.record.id}`, { method: "DELETE", headers: AUTH_ADMIN });
    assert(revokeSelf.status === 200, "scoped key can be revoked");
    assert((await jsonFetch(`/api/projects/${projectId}`, { headers: SC })).status === 403, "revoked scoped key blocked");
  }

  // --- 17. Multi-track composition: image, picture-in-picture, speed, text clip, audio track, split
  console.log("17) Multi-track render");
  {
    const png = path.join(ROOT, "data", "test_img.png"), wav = path.join(ROOT, "data", "test_tone.wav");
    const run = (args: string[]) => new Promise<void>((res, rej) => spawn("ffmpeg", ["-y", ...args], { stdio: "ignore" }).on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg fixture failed")))));
    await run(["-f", "lavfi", "-i", "color=c=red:s=320x240:d=1", "-frames:v", "1", png]);
    await run(["-f", "lavfi", "-i", "sine=frequency=880:duration=4", wav]);
    const up = async (file: string, name: string, type: string) => {
      const fd = new FormData(); fd.append("files", new File([fs.readFileSync(file)], name, { type }));
      return (await (await fetch(`${H}/api/media/upload`, { method: "POST", headers: AUTH_ADMIN, body: fd })).json()).assets[0];
    };
    const img = await up(png, "red.png", "image/png"), tone = await up(wav, "tone.wav", "audio/wav");
    assert(img.kind === "image" && tone.kind === "audio" && tone.duration > 3.5, "image and audio assets uploaded");
    const created = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "multi", timeline: { fps: 24, resolution: { width: 640, height: 360 }, clips: [
      { id: "v1", assetId, track: "video", start: 0, inPoint: 0, outPoint: 4, volume: 1, muted: false, speed: 2, fadeIn: 0.3, filter: "sepia" },
      { id: "img", assetId: img.id, track: "video", start: 2, inPoint: 0, outPoint: 2, volume: 1, muted: false },
      { id: "pip", assetId, track: "overlay", start: 1, inPoint: 0, outPoint: 2, volume: 1, muted: true, scale: 0.3, x: 0.8, y: 0.2 },
      { id: "txt", assetId: "", track: "overlay", start: 0.5, inPoint: 0, outPoint: 2, volume: 1, muted: false, text: "It's 100%: \\ quoted", textBg: true },
      { id: "aud", assetId: tone.id, track: "audio", start: 1, inPoint: 0, outPoint: 3, volume: 0.5, muted: false },
    ] } }) });
    assert(created.status === 201, `multi project created, got ${created.status}`);
    const pid = created.body.id;
    const split = await jsonFetch(`/api/projects/${pid}/timeline/ops`, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ op: "split_clip", args: { clipId: "v1", at: 1 } }) });
    assert(split.status === 200 && split.body.timeline.clips.length === 6, `split added a clip, got ${split.status}`);
    const left = split.body.timeline.clips.find((c: any) => c.id === "v1"), right = split.body.timeline.clips.find((c: any) => c.start === 1 && c.id !== "v1" && c.assetId === assetId && c.track === "video");
    assert(left && right && Math.abs(left.outPoint - 2) < 0.01 && Math.abs(right.inPoint - 2) < 0.01, "split respects 2x speed in source time");
    assert((await jsonFetch(`/api/projects/${pid}/timeline/ops`, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ op: "split_clip", args: { clipId: "v1", at: 50 } }) })).status === 422, "split outside clip rejected");
    const bad = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "bad", timeline: { clips: [{ assetId: "x".repeat(10), start: "nope" }] } }) });
    assert(bad.status === 201 && bad.body.timeline.clips[0].start === 0, "invalid numbers are sanitized");
    const render = await jsonFetch("/api/renders", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ projectId: pid }) });
    let status = "queued", err = "";
    for (const end = Date.now() + 90000; Date.now() < end && !["done", "error"].includes(status);) {
      await new Promise((r) => setTimeout(r, 700));
      const j = await jsonFetch(`/api/renders/${render.body.jobId}`, { headers: AUTH_ADMIN });
      status = j.body.status; err = j.body.error || "";
    }
    assert(status === "done", `multi-track render finished, status=${status} ${err}`);
    const out = path.join(ROOT, "data", "test_multi.mp4");
    fs.writeFileSync(out, Buffer.from(await (await fetch(`${H}/api/renders/${render.body.jobId}/download`, { headers: AUTH_ADMIN })).arrayBuffer()));
    const probeOut = await new Promise<string>((res) => { const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", out]); let o = ""; p.stdout.on("data", (d: Buffer) => (o += d)); p.on("close", () => res(o)); });
    const info = JSON.parse(probeOut);
    assert(info.streams.some((s: any) => s.codec_type === "audio"), "render has mixed audio");
    assert(info.streams.some((s: any) => s.width === 640 && s.height === 360), "render uses 640x360 canvas");
    assert(Math.abs(parseFloat(info.format.duration) - 4) < 0.4, `render duration ~4s (2x speed, image to 4s), got ${info.format.duration}`);
    const wf = await jsonFetch(`/api/media/${tone.id}/waveform`, { headers: AUTH_ADMIN });
    assert(wf.status === 200 && wf.body.peaks.length > 50, "waveform peaks returned");
    const empty = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "empty", timeline: { clips: [] } }) });
    const er = await jsonFetch("/api/renders", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ projectId: empty.body.id }) });
    await new Promise((r) => setTimeout(r, 800));
    const ej = await jsonFetch(`/api/renders/${er.body.jobId}`, { headers: AUTH_ADMIN });
    assert(ej.body.status === "error" && /empty/i.test(ej.body.error), "empty timeline gives a clear render error");
  }

  // --- 18. Keyframes, easing, batch ops, state, frame preview, capabilities
  console.log("18) Keyframes and agent tooling");
  {
    const caps = await jsonFetch("/api/capabilities", { headers: AUTH_ADMIN });
    assert(caps.status === 200 && caps.body.animatableProperties.rotation && caps.body.ops.upsert_keyframe, "capabilities describe animatable properties and ops");
    const proj = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "anim", timeline: { resolution: { width: 640, height: 360 }, clips: [] } }) });
    const pid = proj.body.id, ops = `/api/projects/${pid}/timeline/ops`;
    const batch = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ ops: [
      { op: "add_clip", args: { id: "a1", assetId, track: "video", start: 0, inPoint: 0, outPoint: 4 } },
      { op: "add_text_clip", args: { text: "100% ready", start: 0, duration: 4, textSize: 8 } },
      { op: "set_keyframes", args: { clipId: "a1", property: "scale", keyframes: [{ time: 0, value: 1, easing: "ease-in-out" }, { time: 4, value: 1.4 }] } },
      { op: "upsert_keyframe", args: { clipId: "a1", property: "opacity", time: 0, value: 0, easing: [0.2, 0, 0.1, 1.4] } },
      { op: "upsert_keyframe", args: { clipId: "a1", property: "opacity", time: 1, value: 1 } },
    ] }) });
    assert(batch.status === 200 && batch.body.applied === 5, `batch applied atomically, got ${batch.status} ${batch.body.message || ""}`);
    const a1 = batch.body.timeline.clips.find((c: any) => c.id === "a1");
    assert(a1.keyframes.scale.length === 2 && a1.keyframes.opacity[0].easing.length === 4, "keyframes and custom bezier persist");
    const failed = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ ops: [{ op: "move_clip", args: { clipId: "a1", start: 9 } }, { op: "set_keyframes", args: { clipId: "a1", property: "volume", keyframes: [{ time: 99, value: 1 }] } }] }) });
    assert(failed.status === 422 && failed.body.failedIndex === 1, "failing batch reports index");
    assert((await jsonFetch(`/api/projects/${pid}`, { headers: AUTH_ADMIN })).body.timeline.clips.find((c: any) => c.id === "a1").start === 0, "failed batch is rolled back");
    assert((await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ op: "set_keyframes", args: { clipId: "a1", property: "bogus", keyframes: [] } }) })).status === 422, "unknown property rejected");
    const mid = await jsonFetch(`/api/projects/${pid}/state?t=2`, { headers: AUTH_ADMIN });
    const v = mid.body.clips.find((c: any) => c.id === "a1").values;
    assert(Math.abs(v.scale - 1.2) < 0.02 && v.opacity === 1, `state evaluates ease-in-out midpoint, got ${v.scale}`);
    const early = (await jsonFetch(`/api/projects/${pid}/state?t=0.5`, { headers: AUTH_ADMIN })).body.clips.find((c: any) => c.id === "a1").values.opacity;
    assert(early > 0 && early <= 1.5, `bezier overshoot can be sampled, got ${early}`);
    const split = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ op: "split_clip", args: { clipId: "a1", at: 2 } }) });
    const right = split.body.timeline.clips.find((c: any) => c.id !== "a1" && c.track === "video");
    assert(right.keyframes.scale[0].time === 0 && Math.abs(right.keyframes.scale[0].value - 1.2) < 0.03, "split keeps animation continuous");
    const motion = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ op: "apply_motion", args: { clipId: "a1", preset: "pop" } }) });
    assert(motion.status === 200 && motion.body.timeline.clips.find((c: any) => c.id === "a1").keyframes.scale.length >= 2, "motion preset writes keyframes");
    const frame = await fetch(`${H}/api/projects/${pid}/frame?t=1&width=320`, { headers: AUTH_ADMIN });
    const bytes = Buffer.from(await frame.arrayBuffer());
    assert(frame.status === 200 && bytes.subarray(1, 4).toString() === "PNG", "frame endpoint returns a PNG");
    const render = await jsonFetch("/api/renders", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ projectId: pid }) });
    let status = "queued", err = "";
    for (const end = Date.now() + 90000; Date.now() < end && !["done", "error"].includes(status);) {
      await new Promise((r) => setTimeout(r, 700));
      const j = await jsonFetch(`/api/renders/${render.body.jobId}`, { headers: AUTH_ADMIN }); status = j.body.status; err = j.body.error || "";
    }
    assert(status === "done", `animated render finished: ${status} ${err}`);
  }

  // --- 19. Live sessions (view-only admin watching), new ops, storyboard
  console.log("19) Live watch and extra ops");
  {
    const mk = async (label: string, scope: string) => ({ Authorization: `Bearer ${(await jsonFetch("/api/keys", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ label, scope }) })).body.key}` }) as any;
    const AUTH_WRITE = await mk("live editor", "write"), AUTH_READ = await mk("live reader", "read");
    const proj = await jsonFetch("/api/projects", { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ name: "live one", timeline: { resolution: { width: 640, height: 360 }, clips: [] } }) });
    const pid = proj.body.id, ops = `/api/projects/${pid}/timeline/ops`;
    assert((await jsonFetch("/api/live", { headers: AUTH_WRITE })).status === 403, "write keys cannot list live sessions");
    assert((await jsonFetch(`/api/live/${pid}`, { headers: AUTH_READ })).status === 403, "read keys cannot watch");
    const list = await jsonFetch("/api/live", { headers: AUTH_ADMIN });
    assert(list.status === 200 && list.body.refreshMs === 100 && list.body.sessions.some((x: any) => x.projectId === pid), "admin lists every project as a session");
    const first = await jsonFetch(`/api/live/${pid}`, { headers: AUTH_ADMIN });
    const rev = first.body.rev;
    assert(first.body.changed && first.body.timeline, "first watch poll returns the timeline");
    const idle = await jsonFetch(`/api/live/${pid}?since=${rev}&tsince=${first.body.timelineRev}`, { headers: AUTH_ADMIN });
    assert(idle.body.changed === false && !idle.body.timeline, "unchanged polls are tiny");
    // an editor publishes unsaved work: clip, playhead, selection
    const pub = await jsonFetch(`/api/live/${pid}/publish`, { method: "POST", headers: AUTH_WRITE, body: JSON.stringify({ time: 1.234, selectedId: "t1", playing: true, name: "live one", timeline: { resolution: { width: 640, height: 360 }, clips: [{ id: "t1", assetId: "", track: "overlay", start: 0, inPoint: 0, outPoint: 2, text: "Hello" }] } }) });
    assert(pub.status === 200 && pub.body.watchers >= 1, `publish reports watchers, got ${pub.status} ${pub.body.message || ""}`);
    const seen = await jsonFetch(`/api/live/${pid}?since=${rev}&tsince=${first.body.timelineRev}`, { headers: AUTH_ADMIN });
    assert(seen.body.changed && seen.body.live && seen.body.time === 1.23 && seen.body.selectedId === "t1" && seen.body.playing && seen.body.timeline.clips.length === 1, "watcher sees unsaved edit, playhead and selection");
    assert(seen.body.activity.some((a: any) => /Added title/.test(a.summary)), "activity records the new clip");
    const stored = await jsonFetch(`/api/projects/${pid}`, { headers: AUTH_ADMIN });
    assert(stored.body.timeline.clips.length === 0, "publishing never writes to the saved project");
    // watching cannot write
    const poke = await jsonFetch(`/api/live/${pid}`, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ timeline: { clips: [] } }) });
    assert(!poke.body?.timeline && (await jsonFetch(`/api/live/${pid}`, { headers: AUTH_ADMIN })).body.timeline.clips.length === 1, "watch endpoint has no write verbs");
    // API ops show up in the feed
    const batch = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ ops: [
      { op: "add_text_clip", args: { text: "A", start: 0, duration: 2, id: "x" } }, { op: "add_text_clip", args: { text: "B", start: 5, duration: 2 } },
      { op: "shift_clips", args: { delta: 1 } }, { op: "close_gaps", args: { track: "overlay" } }, { op: "update_clips", args: { track: "overlay", patch: { textSize: 9 } } },
    ] }) });
    assert(batch.status === 200, `new ops apply, got ${batch.status} ${batch.body.message || ""}`);
    const starts = batch.body.timeline.clips.map((c: any) => c.start).sort((a: number, b: number) => a - b);
    assert(starts[0] === 0 && starts[1] === 2 && batch.body.timeline.clips.every((c: any) => c.textSize === 9), "close_gaps packs and update_clips patches a track");
    const feed = await jsonFetch(`/api/projects/${pid}/activity`, { headers: AUTH_READ });
    assert(feed.body.activity.some((a: any) => /API batch of 5/.test(a.summary)), "read keys can read the activity feed");
    const ids = batch.body.timeline.clips.map((c: any) => c.id);
    const style = await jsonFetch(ops, { method: "POST", headers: AUTH_ADMIN, body: JSON.stringify({ ops: [
      { op: "set_keyframes", args: { clipId: ids[0], property: "scale", keyframes: [{ time: 0, value: 1 }, { time: 2, value: 1.5 }] } },
      { op: "copy_style", args: { fromClipId: ids[0], toClipIds: [ids[1]] } }, { op: "add_marker", args: { id: "m1", time: 3 } }, { op: "set_marker", args: { id: "m1", time: 4, label: "Beat" } },
    ] }) });
    const copied = style.body.timeline?.clips.find((c: any) => c.id === ids[1]);
    assert(style.status === 200 && copied.keyframes.scale[1].value === 1.5 && style.body.timeline.markers[0].time === 4, `copy_style and set_marker work, got ${style.status} ${style.body.message || ""}`);
    const dup = await jsonFetch(`/api/projects/${pid}/duplicate`, { method: "POST", headers: AUTH_ADMIN, body: "{}" });
    assert(dup.status === 201 && dup.body.timeline.clips.length === ids.length, "projects can be duplicated");
    const caps = await jsonFetch("/api/capabilities", { headers: AUTH_ADMIN });
    assert(caps.body.ops.shift_clips && caps.body.ops.copy_style, "capabilities list the new ops");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  killServer();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  killServer();
  process.exit(1);
});
