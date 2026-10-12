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
    server.kill("SIGKILL");
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

  console.log(`\n${passed} passed, ${failed} failed`);
  killServer();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  killServer();
  process.exit(1);
});
