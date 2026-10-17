// Browser smoke test for the studio-upgrade changes, run against a dev server.
// Needs the server on :5000 and the owner key (data/OWNER_KEY.txt, or OWNER_KEY=...).
// Usage: npx tsx script/smoke-studio.ts
import { chromium } from "playwright";

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
await page.click('[data-testid="button-export"]');
await page.waitForSelector('[data-testid="menu-export"]');
ok("export menu opens with quality options", (await page.locator('[data-testid="export-quality-draft"]').count()) > 0);
await page.click('[data-testid="export-quality-draft"]');
await page.click('[data-testid="export-resolution-720p"]');
const resLabel = await page.textContent('[data-testid="export-resolution-720p"]');
ok("720p shows aspect-true dimensions", (resLabel ?? "").includes("1280 × 720"));
await page.screenshot({ path: "/tmp/shot-export-menu.png" });
await page.click('[data-testid="button-start-export"]');

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
  return { id, status: head.status, acceptRanges: head.headers.get("accept-ranges"), len: head.headers.get("content-length"), disposition: head.headers.get("content-disposition") };
});
ok("download answers Range with 206", dlInfo.status === 206);
ok("download sets content-disposition", (dlInfo.disposition ?? "").includes("attachment"));

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
