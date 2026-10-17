// Records the motion graphics tutorial in the Studio with Playwright, then
// writes a manifest of section timings used by build-tutorial-videos.ts.
//
//   npx playwright install chromium   (once)
//   node script/record-tutorials.mjs  →  client/public/videos/raw/ (gitignored)
//
// The recording is one continuous capture so the project state carries over
// from section to section, exactly like a real user following the tutorial.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5302;
const H = `http://127.0.0.1:${PORT}`;
const DB = "/tmp/vf-record.db";
const OUT_DIR = path.join(ROOT, "client/public/videos/raw");

let server = null;
process.on("exit", () => { if (server && server.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch (e) { server.kill("SIGKILL"); } } });

for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch (e) {} }
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, f));

server = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: ROOT, detached: true,
  env: { ...process.env, VIDEOFORGE_DB: DB, PORT: String(PORT), NODE_ENV: "development" },
  stdio: ["ignore", fs.openSync("/tmp/vf-record.log", "w"), fs.openSync("/tmp/vf-record.log", "w")],
});
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try { if ((await fetch(`${H}/api/health`)).ok) break; } catch (e) {}
  await new Promise((r) => setTimeout(r, 250));
}
const adminKey = fs.readFileSync(path.join(ROOT, "data/OWNER_KEY.txt"), "utf8").match(/vf_admin_[a-f0-9]+/)[0];
let reg = await fetch(`${H}/api/auth/register`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "demo@videoforge.test", password: "demodemo1", name: "Demo", ownerKey: adminKey }),
});
if (!reg.ok) {
  reg = await fetch(`${H}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@videoforge.test", password: "demodemo1" }),
  });
}
const cookie = (reg.headers.get("set-cookie") || "").split(";")[0];
const AUTH = { Authorization: `Bearer ${adminKey}` };

// A cursor the recording can see: a dot that follows the pointer and grows on click.
const CURSOR = `
(() => {
  const install = () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:999999;width:14px;height:14px;border-radius:50%;background:#f6a447;box-shadow:0 0 0 3px #f6a44755;pointer-events:none;left:-40px;top:-40px;transition:width .12s,height .12s";
    const ring = document.createElement("div");
    ring.style.cssText = "position:fixed;z-index:999998;width:34px;height:34px;border-radius:50%;border:2px solid #f6a447;pointer-events:none;left:-40px;top:-40px;opacity:.7";
    document.documentElement.appendChild(ring); document.documentElement.appendChild(dot);
    addEventListener("pointermove", (e) => {
      dot.style.left = (e.clientX - 7) + "px"; dot.style.top = (e.clientY - 7) + "px";
      ring.style.left = (e.clientX - 17) + "px"; ring.style.top = (e.clientY - 17) + "px";
    }, true);
    addEventListener("pointerdown", () => { dot.style.width = "22px"; dot.style.height = "22px"; ring.style.opacity = "1"; }, true);
    addEventListener("pointerup", () => { dot.style.width = "14px"; dot.style.height = "14px"; ring.style.opacity = ".7"; }, true);
  };
  if (document.documentElement) install();
  else addEventListener("DOMContentLoaded", install, { once: true });
})();`

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: OUT_DIR, size: { width: 1600, height: 900 } },
});
await context.addInitScript(CURSOR);
await context.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=")[1], url: H }]);
const page = await context.newPage();
const t0 = Date.now();

// ---- helpers -------------------------------------------------------------
const wait = (ms) => page.waitForTimeout(ms);
const sections = [];
const problems = [];
async function section(id, title, fn) {
  const start = (Date.now() - t0) / 1000;
  try {
    await fn();
    sections.push({ id, title, start, end: (Date.now() - t0) / 1000 });
  } catch (e) {
    problems.push(`${id}: ${e && e.message ? e.message.split("\n")[0] : e}`);
    if (e && e.stack) console.log(`STACK ${id}:`, e.stack.split("\n").slice(0, 4).join(" | "));
    sections.push({ id, title, start, end: (Date.now() - t0) / 1000, failed: true });
  }
}
async function setRange(label, value) {
  const el = page.locator(`input[type=range][aria-label="${label}"]`).first();
  await el.scrollIntoViewIfNeeded();
  await el.evaluate((node, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(node, String(val));
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await wait(500);
}
async function setColor(label, value) {
  const el = page.locator(`input[type=color][aria-label="${label}"]`).first();
  await el.evaluate((node, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(node, val);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await wait(400);
}
async function setNumber(labelText, value) {
  const field = page.locator("label.number-field").filter({ hasText: labelText }).first();
  const el = field.locator("input");
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await el.fill(String(value));
  await el.press("Enter");
  await wait(400);
}
async function setNumberAria(label, value) {
  const el = page.locator(`input[type=number][aria-label="${label}"]`).first();
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await el.fill(String(value));
  await el.press("Enter");
  await wait(400);
}
async function pickOption(selectLabel, startsWith) {
  await page.locator(`select[aria-label="${selectLabel}"]`).first().evaluate((node, want) => {
    const opt = [...node.options].find((o) => o.textContent.trim().toLowerCase().startsWith(want.toLowerCase()));
    if (!opt) throw new Error(`no option starting with ${want}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(node, opt.value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, startsWith);
  await wait(400);
}
async function typeInto(selector, text) {
  const el = page.locator(selector).first();
  await el.click();
  await el.press("Control+a");
  await el.pressSequentially(text, { delay: 35 });
  await wait(300);
}
async function expand(summaryText) {
  const sum = page.locator("summary").filter({ hasText: summaryText }).first();
  await sum.scrollIntoViewIfNeeded();
  const open = await sum.evaluate((node) => node.parentElement.open);
  if (!open) await sum.click();
  await wait(500);
}
async function selectLane(name) {
  const lane = page.locator('[data-testid^="layer-select-"]').filter({ hasText: name }).first();
  await lane.click();
  await wait(600);
}

// ---- the tutorial ---------------------------------------------------------
await page.goto(`${H}/#/editor`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="button-add-title"]', { timeout: 30000 });
await wait(2500);

await section("start", "Start the project", async () => {
  const name = page.locator('[data-testid="input-project-title"]');
  await name.click();
  await name.press("Control+a");
  await name.pressSequentially("Animated intro", { delay: 40 });
  await wait(700);
  await setColor("Background color", "#101826");
  await wait(1200);
});

await section("headline", "Add a headline", async () => {
  await page.click('[data-testid="button-add-title"]');
  await page.waitForSelector('[data-testid="input-title-text"]');
  await wait(600);
  await typeInto('[data-testid="input-title-text"]', "Make your move");
  await setRange("Size", 10);
  await pickOption("Font", "Poppins");
  await page.locator("button").filter({ hasText: /^Bold$/ }).first().click();
  await wait(400);
  await setRange("Vertical", 0.44);
  await setNumber("Duration", 5);
  await wait(800);
});

await section("spring", "Make it spring in", async () => {
  await page.click('[data-testid="tab-motion"]');
  await wait(700);
  await expand("Motion presets");
  await setNumberAria("Preset duration", 0.9);
  await page.click('[data-testid="motion-spring"]');
  await wait(600);
  await page.click('[data-testid="button-play"]');
  await wait(1800);
  await page.click('[data-testid="button-play"]');
  await wait(500);
});

await section("bar", "Add an accent bar", async () => {
  await page.click('[data-testid="tab-graphics"]');
  await wait(600);
  await page.click('[data-testid="add-shape-rectangle"]');
  await page.waitForSelector('input[type=range][aria-label="Shape width"]');
  await wait(700);
  await setRange("Shape width", 0.22);
  await setRange("Shape height", 0.012);
  await setColor("Shape fill", "#f6a447");
  await setNumber("Start", 0.3);
  await setNumber("Duration", 4.7);
  await setRange("Vertical", 0.56);
  await wait(500);
  await page.click('[data-testid="tab-motion"]');
  await wait(500);
  await expand("Motion presets");
  await setNumberAria("Preset duration", 0.7);
  await page.click('[data-testid="motion-reveal"]');
  await wait(900);
});

await section("tagline", "Add a tagline", async () => {
  await page.click('[data-testid="button-add-title"]');
  await page.waitForSelector('[data-testid="input-title-text"]');
  await wait(500);
  await typeInto('[data-testid="input-title-text"]', "Motion graphics, made in the Studio");
  await setRange("Size", 3.5);
  await pickOption("Font", "Poppins");
  await setColor("Text color", "#9fb3c8");
  await setRange("Vertical", 0.62);
  await setNumber("Start", 0.5);
  await setNumber("Duration", 4.5);
  await wait(400);
  await page.click('[data-testid="tab-motion"]');
  await wait(400);
  await expand("Motion presets");
  await setNumberAria("Preset duration", 0.6);
  await page.click('[data-testid="motion-rise"]');
  await wait(900);
});

await section("badge", "Add a badge that keeps moving", async () => {
  await page.click('[data-testid="tab-graphics"]');
  await wait(600);
  await page.click('[data-testid="add-shape-ellipse"]');
  await page.waitForSelector('input[type=range][aria-label="Shape width"]');
  await wait(700);
  await setRange("Shape width", 0.07);
  await setRange("Shape height", 0.124);
  await setColor("Shape fill", "#f6a447");
  await setRange("Vertical", 0.22);
  await setNumber("Duration", 5);
  await wait(400);
  await page.click('[data-testid="tab-motion"]');
  await wait(500);
  await expand("Animate with code");
  await pickOption("Code recipe", "Float");
  await page.click('[data-testid="code-recipe"]');
  await wait(900);
});

await section("lower-third", "Drop in a lower third", async () => {
  const ruler = page.locator('[data-testid="ruler"]');
  const box = await ruler.boundingBox();
  const res = await fetch(`${H}/api/projects`, { headers: AUTH });
  const list = await res.json();
  const all = Array.isArray(list.projects) ? list.projects : [];
  console.log("ruler fetch:", res.status, "projects:", all.length, "keys:", Object.keys(list).join(","));
  const dur = Math.max(1, ...all.flatMap((p) => (p.timeline?.clips ?? []).map((c) => c.start + (c.outPoint ?? c.duration ?? 0))));
  await page.mouse.click(box.x + (box.width * 2) / dur, box.y + box.height / 2);
  await wait(600);
  await page.click('[data-testid="tab-graphics"]');
  await wait(500);
  await page.click('[data-testid="template-lower-third"]');
  await wait(600);
  await typeInto('[data-testid="graphics-title"]', "Ada Lovelace");
  const supporting = page.locator("label.field").filter({ hasText: "Supporting text" }).locator("input");
  await supporting.click();
  await supporting.press("Control+a");
  await supporting.pressSequentially("Pioneer of computing", { delay: 30 });
  await wait(300);
  const duration = page.locator("label.field").filter({ hasText: "Duration (s)" }).locator("input").first();
  await duration.click();
  await duration.press("Control+a");
  await duration.pressSequentially("3", { delay: 40 });
  await duration.press("Enter");
  await wait(400);
  await page.click('[data-testid="button-insert-template"]');
  await wait(1200);
});

await section("graph", "Tune the motion on a graph", async () => {
  await page.click('[data-testid="workspace-animate"]');
  await wait(1200);
  await selectLane("Make your move");
  await wait(900);
  await page.click('[data-testid="add-keyframe"]');
  await wait(900);
  await page.click('[data-testid="workspace-edit"]');
  await wait(700);
});

await section("fade", "Fade everything out", async () => {
  await selectLane("Make your move");
  await page.click('[data-testid="tab-edit"]');
  await wait(600);
  await setRange("Fade out", 0.6);
  await selectLane("Motion graphics, made in the Studio");
  await setRange("Fade out", 0.6);
  await wait(700);
});

await section("playback", "Check it fits and play it back", async () => {
  await page.click('[data-testid="button-project-settings"]');
  await wait(500);
  const fit = page.locator('[data-testid="fit-all"]');
  const fitDisabled = await fit.evaluate((n) => n.disabled).catch(() => true);
  if (!fitDisabled) await fit.click();
  await wait(700);
  await page.getByRole("button", { name: "Jump to start" }).click();
  await wait(400);
  await page.click('[data-testid="button-play"]');
  await wait(5200);
  await page.click('[data-testid="button-play"]');
  await wait(500);
});

await section("export", "Export your video", async () => {
  await page.click('[data-testid="button-export"]');
  await wait(4200);
  await page.getByRole("button", { name: "Close export panel" }).click();
  await wait(700);
});

// ---- save -----------------------------------------------------------------
const video = page.video();
await context.close();
const raw = await video.path();
fs.renameSync(raw, path.join(OUT_DIR, "tutorial.webm"));
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify({ startedAt: t0, sections }, null, 2));
console.log(JSON.stringify({ raw: path.join(OUT_DIR, "tutorial.webm"), sections, problems }, null, 2));
await browser.close();
process.exit(0);
