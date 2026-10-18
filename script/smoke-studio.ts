// Browser smoke test for the studio-upgrade changes, run against a dev server.
// Needs the server on :5000 and the owner key (data/OWNER_KEY.txt, or OWNER_KEY=...).
// Usage: npx tsx script/smoke-studio.ts
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:5000";
const OWNER_KEY = process.env.OWNER_KEY ?? (await import("node:fs")).readFileSync("data/OWNER_KEY.txt", "utf-8").trim().split("\n").pop()!.trim();
const results: string[] = [];
const ok = (label: string, cond: boolean) => results.push(`${cond ? "PASS" : "FAIL"} ${label}`);

// Prefer the Playwright-managed browser; fall back to a known cache path.
const launch = async () => { try { return await chromium.launch(); } catch { return await chromium.launch({ executablePath: "/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome" }); } };
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors: string[] = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

/** ffprobe the video dimensions of a downloaded render file. */
const dims = (file: string) => {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf-8" }).trim();
  return out.split(",").map(Number);
};

// ---------------------------------------------------------------- sign in (account + session cookie, like the tutorial recordings)
const creds = { email: "smoke@studio.test", password: "smoke-test-pass-1", name: "Smoke" };
{
  // First run: the first account becomes the workspace admin with the owner key.
  // Later runs just log in.
  let res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
  if (!res.ok) res = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...creds, ownerKey: OWNER_KEY }) });
  if (!res.ok) throw new Error(`account setup failed: ${res.status}`);
}
await page.goto(`${BASE}/#/api-key`);
// Skip the first-run tour and start in Advanced mode, before any reloads.
await page.evaluate(() => { localStorage.setItem("vf:toured", "true"); localStorage.setItem("vf:mode", JSON.stringify("advanced")); });
await page.fill('[data-testid="input-email"]', creds.email);
await page.fill('[data-testid="input-password"]', creds.password);
await page.click('[data-testid="button-sign-in-email"]');
await page.waitForURL((u) => !u.href.includes("api-key"), { timeout: 20000 });
await page.waitForTimeout(1000);

// ---------------------------------------------------------------- editor
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForSelector('[data-testid="studio-clock"]', { timeout: 15000 });
const clockText = await page.textContent('[data-testid="studio-clock"]');
ok("clock shows a time of day", /\d{1,2}:\d{2}:\d{2}/.test(clockText ?? ""));
await page.screenshot({ path: "/tmp/shot-editor.png" });

// ---------------------------------------------------------------- language selector
await page.click('[data-testid="button-lang"]');
await page.waitForSelector('[data-testid="menu-lang"]');
const esVisible = await page.locator('[data-testid="menu-lang"] >> text=Español').count();
ok("language menu lists Español", esVisible > 0);
await page.click('[data-testid="menu-lang"] >> text=Español');
await page.waitForTimeout(600);
const exportLabelEs = await page.textContent('[data-testid="button-export"]');
ok("export button switched to Spanish", (exportLabelEs ?? "").includes("Exportar"));
const importEs = await page.locator("text=Importar medios").count();
ok("media panel switched to Spanish", importEs > 0);
const savedLang = await page.evaluate(() => localStorage.getItem("vf.lang.v1"));
ok("language persisted to vf.lang.v1", savedLang === "es");
// The saved choice must survive a reload (session cookie keeps us signed in).
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.evaluate(() => { location.hash = "#/editor"; });
await page.waitForSelector('[data-testid="studio-clock"]', { timeout: 15000 });
const exportLabelAfterReload = await page.textContent('[data-testid="button-export"]');
ok("language restored from storage after reload", (exportLabelAfterReload ?? "").includes("Exportar"));
await page.screenshot({ path: "/tmp/shot-editor-es.png" });
await page.click('[data-testid="button-lang"]');
await page.click('[data-testid="menu-lang"] >> text=English');
await page.waitForTimeout(600);

// ---------------------------------------------------------------- import media + add to timeline
const fileInput = page.locator('[data-testid="button-upload"] input[type="file"]');
await fileInput.setInputFiles("script/tutorials/assets/demo-footage.mp4");
await page.waitForSelector('[data-testid^="card-asset-"]', { timeout: 30000 });
await page.waitForTimeout(800);
await page.locator('[data-testid^="card-asset-"] [aria-label^="Add"]').first().click();
await page.waitForTimeout(1200);
ok("clip added to timeline", (await page.locator('[data-testid^="clip-"]').count()) > 0);

// ---------------------------------------------------------------- playback
await page.screenshot({ path: "/tmp/shot-timeline.png" });
const before = await page.textContent('[data-testid="text-timecode"]');
await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
await page.press("body", " ");
await page.waitForTimeout(2500);
await page.press("body", " ");
const after = await page.textContent('[data-testid="text-timecode"]');
ok("playhead advanced during playback", before !== after);

// ---------------------------------------------------------------- export menu
// capture the render request the menu sends
let renderBody: any = null;
page.on("request", (req) => { if (req.method() === "POST" && req.url().endsWith("/api/renders")) { try { renderBody = req.postDataJSON(); } catch { /* not json */ } } });
await page.click('[data-testid="button-export"]');
await page.waitForSelector('[data-testid="menu-export"]');
ok("export menu opens with quality options", (await page.locator('[data-testid="export-quality-draft"]').count()) > 0);
await page.click('[data-testid="export-quality-draft"]');
await page.click('[data-testid="export-resolution-720p"]');
ok("draft option is selected (aria-checked)", (await page.getAttribute('[data-testid="export-quality-draft"]', "aria-checked")) === "true");
ok("720p option is selected (aria-checked)", (await page.getAttribute('[data-testid="export-resolution-720p"]', "aria-checked")) === "true");
const resLabel = await page.textContent('[data-testid="export-resolution-720p"]');
ok("720p shows aspect-true dimensions", (resLabel ?? "").includes("1280 × 720"));
await page.screenshot({ path: "/tmp/shot-export-menu.png" });
await page.click('[data-testid="button-start-export"]');
ok("render request carried the chosen options", renderBody?.options?.quality === "draft" && renderBody?.options?.resolution === "720p");

// wait for the render to finish (progress panel → done)
await page.waitForSelector('[data-testid="video-render-result"]', { timeout: 180000 });
await page.screenshot({ path: "/tmp/shot-export-done.png" });
ok("render finished and preview shows", true);

// ---------------------------------------------------------------- download headers (Range + resume) via the page's session
const dlInfo = await page.evaluate(async () => {
  const res = await fetch(location.origin + "/api/renders", { credentials: "include" });
  const jobs = await res.json();
  const id = jobs.jobs?.[0]?.id;
  if (!id) return { id: null };
  // Like the app's own download link: take a short-lived media token for the render.
  const tok = await (await fetch(`${location.origin}/api/auth/media-token/${id}`, { credentials: "include" })).json();
  const head = await fetch(`${location.origin}/api/renders/${id}/download?st=${tok.token}`, { credentials: "include", headers: { Range: "bytes=0-1023" } });
  const full = await fetch(`${location.origin}/api/renders/${id}/download?st=${tok.token}`, { credentials: "include" });
  const buf = await full.arrayBuffer();
  return { id, status: head.status, disposition: head.headers.get("content-disposition"), bytes: buf.byteLength, b64: btoa(String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))) };
});
ok("download answers Range with 206", dlInfo.status === 206);
ok("download sets content-disposition", (dlInfo.disposition ?? "").includes("attachment"));
// the rendered file is a real MP4 of the requested size
const dl = await page.evaluate(async () => {
  const list = await (await fetch("/api/renders", { credentials: "include" })).json();
  const id = list.jobs?.[0]?.id;
  const tok = await (await fetch(`/api/auth/media-token/${id}`, { credentials: "include" })).json();
  const buf = await (await fetch(`/api/renders/${id}/download?st=${tok.token}`, { credentials: "include" })).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return { size: bytes.length, b64: btoa(bin) };
});
writeFileSync("/tmp/render-720p.mp4", Buffer.from(dl.b64, "base64"));
const [w, h] = dims("/tmp/render-720p.mp4");
ok(`render output is 1280 × 720 (got ${w} × ${h})`, w === 1280 && h === 720);
const mp4 = Buffer.from(dl.b64, "base64");
ok("render output is a valid MP4 (ftyp header)", mp4.slice(4, 8).toString("ascii") === "ftyp");

// ---------------------------------------------------------------- freeze segment playback (speed ramp with a 0-speed step)
const freeze = await page.evaluate(async () => {
  // A project whose only clip plays 2s at 1x, freezes 3s, then plays 2s.
  const media = await (await fetch("/api/media", { credentials: "include" })).json();
  const assetId = media.assets.find((a: any) => a.filename.includes("demo-footage"))?.id;
  const timeline = {
    version: 4, background: "#000000", fps: 30, resolution: { width: 1280, height: 720 }, markers: [],
    clips: [{ id: "freezeclip", assetId, track: "video", start: 0, inPoint: 0, outPoint: 4, volume: 1, muted: false, speedRamp: [{ speed: 1, duration: 2 }, { speed: 0, duration: 3 }, { speed: 1, duration: 2 }] }],
  };
  const p = await (await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Freeze test", timeline }) })).json();
  return { projectId: p.project?.id ?? p.id, timeline };
});
ok("freeze-test project created", !!freeze.projectId);
// open it from the Projects panel (loads the server copy, no local draft for it).
// Reload first so the projects list refetches and includes the new project.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="studio-clock"]', { timeout: 15000 });
await page.click('[data-testid="tab-projects"]');
await page.waitForTimeout(1000);
const loadBtn = page.locator(`[data-testid="button-load-project-${freeze.projectId}"]`);
await loadBtn.waitFor({ timeout: 10000 });
await loadBtn.click();
await page.waitForTimeout(2500);
// play from the start; after 3.6s the playhead is inside the freeze (spans t=2..5)
await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
await page.press("body", "Home");
await page.press("body", " ");
await page.waitForTimeout(3600); // now inside the freeze (t≈3.6s of 7s)
const freezeState = await page.evaluate(() => {
  const v = document.querySelector("video.preview-media") as HTMLVideoElement | null;
  const playBtn = document.querySelector('[data-testid="button-play"]');
  return { playing: playBtn?.getAttribute("aria-label") === "Pause", paused: v?.paused, currentTime: v?.currentTime, readyState: v?.readyState };
});
ok("freeze segment: transport still shows playing", freezeState.playing === true);
ok("freeze segment: video element paused", freezeState.paused === true);
ok(`freeze segment: frame pinned at 2.0s source (got ${freezeState.currentTime?.toFixed(2)})`, Math.abs((freezeState.currentTime ?? -1) - 2) < 0.1);
await page.press("body", " ");
await page.waitForTimeout(300);

// ---------------------------------------------------------------- portrait render (aspect preserved on export)
const portrait = await page.evaluate(async () => {
  const timeline = {
    version: 4, background: "#000000", fps: 30, resolution: { width: 720, height: 1280 }, markers: [],
    clips: [{ id: "pclip", assetId: "", track: "overlay", start: 0, inPoint: 0, outPoint: 2, volume: 1, muted: false, text: "Portrait", textColor: "#ffffff", textSize: 8, x: 0.5, y: 0.5 }],
  };
  const p = await (await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Portrait test", timeline }) })).json();
  const pid = p.project?.id ?? p.id;
  const r = await (await fetch("/api/renders", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ projectId: pid, options: { quality: "draft", resolution: "720p" } }) })).json();
  return { pid, jobId: r.jobId };
});
let portraitJob: any = null;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  portraitJob = await page.evaluate(async (id: string) => (await (await fetch(`/api/renders/${id}`, { credentials: "include" })).json()), portrait.jobId);
  if (portraitJob?.status === "done" || portraitJob?.status === "error") break;
}
ok("portrait render finished", portraitJob?.status === "done");
if (portraitJob?.status === "done") {
  const pfile = await page.evaluate(async (id: string) => {
    const tok = await (await fetch(`/api/auth/media-token/${id}`, { credentials: "include" })).json();
    const buf = await (await fetch(`/api/renders/${id}/download?st=${tok.token}`, { credentials: "include" })).arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }, portrait.jobId);
  writeFileSync("/tmp/render-portrait.mp4", Buffer.from(pfile, "base64"));
  const [pw, ph] = dims("/tmp/render-portrait.mp4");
  ok(`portrait 720p render is 720 × 1280 (got ${pw} × ${ph})`, pw === 720 && ph === 1280);
}

// ---------------------------------------------------------------- docs badges
await page.evaluate(() => { location.hash = "#/docs/introduction"; });
await page.waitForSelector('[data-testid="doc-updated"]', { timeout: 15000 });
ok("docs footer still shows an Updated date", true);
const badgeCount = await page.locator('[data-testid="doc-badge"]').count();
ok("introduction page shows no New badge", badgeCount === 0);
const sideBadges = await page.locator(".side-badge").count();
ok(`sidebar badges (${sideBadges}) — none expected`, sideBadges === 0);
await page.screenshot({ path: "/tmp/shot-docs.png" });

// ---------------------------------------------------------------- errors
const relevant = consoleErrors.filter((e) => !/net::|Failed to load resource|ERR_/i.test(e));
ok(`no console/page errors during the run (${relevant.length})`, relevant.length === 0);
if (relevant.length) results.push("  errors: " + relevant.slice(0, 5).join(" | "));

await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
