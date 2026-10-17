// Shared harness for the tutorial recordings.
//
// A recording is one continuous, real-time capture of a headed Chromium window
// at 1920x1080 (X display + ffmpeg x11grab), driven like a person would: smooth
// pointer paths, typed text, dragged sliders. While it runs, the harness writes a
// manifest of sections, clicks and zoom targets that the edit step turns into
// zooms, highlights, chapter labels and cuts.
//
//   xvfb-run -a -s "-screen 0 1920x1080x24" node script/tutorials/record.mjs mg
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DPR = 1920 / 1440;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer({ port, db }) {
  for (const f of [db, `${db}-journal`, `${db}-wal`, `${db}-shm`]) { try { fs.unlinkSync(f); } catch {} }
  const log = fs.openSync(`/tmp/vf-tut-${port}.log`, "w");
  const server = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT, detached: true, stdio: ["ignore", log, log],
    env: { ...process.env, VIDEOFORGE_DB: db, PORT: String(port), NODE_ENV: "development" },
  });
  const H = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) { try { if ((await fetch(`${H}/api/health`)).ok) break; } catch {} await sleep(300); }
  const adminKey = fs.readFileSync(path.join(ROOT, "data/OWNER_KEY.txt"), "utf8").match(/vf_admin_[a-f0-9]+/)[0];
  const creds = { email: "presenter@videoforge.test", password: "presenter-pass-1", name: "Presenter" };
  let res = await fetch(`${H}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...creds, ownerKey: adminKey }) });
  if (!res.ok) res = await fetch(`${H}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  const stop = () => { try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch {} } };
  process.on("exit", stop);
  return { H, adminKey, cookie, AUTH: { Authorization: `Bearer ${adminKey}` }, stop };
}

// A visible pointer for the capture: an arrow that eases between positions and a ring on every click.
const CURSOR = `(() => {
  const install = () => {
    const arrow = document.createElement("div");
    arrow.style.cssText = "position:fixed;z-index:2147483647;width:26px;height:26px;pointer-events:none;left:-60px;top:-60px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));will-change:left,top";
    arrow.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 20 L8 15.5 L11.6 23 L14.6 21.7 L11.1 14.4 L18 14.2 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const style = document.createElement("style");
    style.textContent = "@keyframes vfr{from{transform:translate(-50%,-50%) scale(.3);opacity:.9}to{transform:translate(-50%,-50%) scale(1.5);opacity:0}}.vf-ripple{position:fixed;z-index:2147483646;width:46px;height:46px;border-radius:50%;border:3px solid #f6a447;background:rgba(246,164,71,.22);pointer-events:none;animation:vfr .55s ease-out forwards}";
    document.head.appendChild(style); document.documentElement.appendChild(arrow);
    const move = (x, y) => { arrow.style.left = (x - 3) + "px"; arrow.style.top = (y - 2) + "px"; };
    const ripple = (x, y) => { const r = document.createElement("div"); r.className = "vf-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); };
    addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
    addEventListener("mousedown", (e) => ripple(e.clientX, e.clientY), true);
    window.__vfMove = move; window.__vfRipple = ripple;
  };
  if (document.documentElement) install(); else addEventListener("DOMContentLoaded", install, { once: true });
})();`;

export async function openStudio({ H, cookie }, { advanced = true, start = "#/editor" } = {}) {
  const profile = fs.mkdtempSync("/tmp/vf-prof-");
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false, viewport: null,
    args: [`--app=${H}/${start}`, "--window-size=1440,810", "--window-position=0,0", `--force-device-scale-factor=${DPR}`, "--no-first-run", "--disable-infobars", "--hide-scrollbars", "--disable-features=TranslateUI"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  await ctx.addCookies([{ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: H }]);
  await ctx.addInitScript(({ advanced }) => {
    try { localStorage.setItem("vf:toured", "true"); localStorage.setItem("vf:mode", JSON.stringify(advanced ? "advanced" : "simple")); } catch {}
  }, { advanced });
  await ctx.addInitScript(CURSOR);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.evaluate(({ advanced }) => { localStorage.setItem("vf:toured", "true"); localStorage.setItem("vf:mode", JSON.stringify(advanced ? "advanced" : "simple")); }, { advanced });
  await page.goto(`${H}/?session=${Date.now()}${start}`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

export function audioDuration(file) {
  try { return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()); } catch { return 0; }
}

export class Recorder {
  constructor({ page, tutorial, outDir, audioDir }) {
    this.page = page; this.tutorial = tutorial; this.outDir = outDir; this.audioDir = audioDir;
    this.sections = []; this.events = []; this.problems = []; this.mouse = { x: 720, y: 405 }; this.t0 = 0;
  }
  async start() {
    fs.mkdirSync(this.outDir, { recursive: true });
    this.file = path.join(this.outDir, "capture.mkv");
    try { fs.unlinkSync(this.file); } catch {}
    this.ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", "30", "-video_size", "1920x1080", "-i", process.env.DISPLAY,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "30", this.file], { stdio: ["pipe", "inherit", "inherit"] });
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { try { if (fs.statSync(this.file).size > 0) break; } catch {} await sleep(20); }
    this.t0 = Date.now();
  }
  T() { return Math.round(((Date.now() - this.t0) / 1000) * 100) / 100; }
  async stop() {
    this.ff.stdin.write("q");
    await new Promise((r) => this.ff.once("exit", r));
    this.duration = this.T();
  }
  ev(kind, data = {}) { this.events.push({ t: this.T(), kind, ...data }); }

  // ---------------------------------------------------------------- pointer
  async rectOf(target) {
    const loc = typeof target === "string" ? this.page.locator(target).first() : target.first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error(`not visible: ${target}`);
    return b;
  }
  async moveTo(x, y, ms) {
    const { x: x0, y: y0 } = this.mouse;
    const dist = Math.hypot(x - x0, y - y0);
    const dur = ms ?? Math.min(1000, 260 + dist * 0.6);
    const steps = Math.max(8, Math.round(dur / 16));
    // A slight arc, then ease in and out, so the pointer travels like a hand rather than a laser.
    const nx = -(y - y0) / (dist || 1), ny = (x - x0) / (dist || 1), bend = Math.min(40, dist * 0.06);
    for (let i = 1; i <= steps; i++) {
      const p = i / steps, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const arc = Math.sin(Math.PI * e) * bend;
      await this.page.mouse.move(x0 + (x - x0) * e + nx * arc, y0 + (y - y0) * e + ny * arc);
      await sleep(dur / steps);
    }
    this.mouse = { x, y };
  }
  async hover(target, { dx = 0.5, dy = 0.5 } = {}) {
    const b = await this.rectOf(target);
    await this.moveTo(b.x + b.width * dx, b.y + b.height * dy);
    return b;
  }
  async click(target, { dx = 0.5, dy = 0.5, wait = 450 } = {}) {
    const b = await this.hover(target, { dx, dy });
    await sleep(160);
    const x = b.x + b.width * dx, y = b.y + b.height * dy;
    this.ev("click", { x: x * DPR, y: y * DPR });
    await this.page.mouse.down(); await sleep(70); await this.page.mouse.up();
    await sleep(wait);
    return b;
  }
  /** Show a click on a control that cannot be clicked for real (native colour and select popups). */
  async fakeClick(target) {
    const b = await this.hover(target);
    await sleep(160);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    this.ev("click", { x: x * DPR, y: y * DPR });
    await this.page.evaluate(([x, y]) => window.__vfRipple?.(x, y), [x, y]);
    await sleep(400);
  }
  async type(target, text, { clear = true, delay = 55 } = {}) {
    await this.click(target, { wait: 200 });
    if (clear) await this.page.keyboard.press("Control+a");
    await this.page.keyboard.type(text, { delay });
    await sleep(350);
  }
  async key(k, wait = 300) { await this.page.keyboard.press(k); await sleep(wait); }

  // ---------------------------------------------------------------- controls
  /** Drag a range slider's thumb to a value, then trim with arrow keys so the number is exact. */
  async range(label, value, { nth = 0 } = {}) {
    const loc = this.page.locator(`input[type=range][aria-label="${label}"]`).nth(nth);
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    const { min, max, step, cur } = await loc.evaluate((n) => ({ min: +n.min || 0, max: +n.max || 100, step: +n.step || 1, cur: +n.value }));
    const posOf = (v) => b.x + 9 + ((v - min) / (max - min)) * (b.width - 18);
    const y = b.y + b.height / 2;
    await this.moveTo(posOf(cur), y); await sleep(120);
    this.ev("click", { x: posOf(cur) * DPR, y: y * DPR });
    await this.page.mouse.down(); await sleep(60);
    await this.moveTo(posOf(value), y, 520);
    await this.page.mouse.up(); await sleep(150);
    for (let i = 0; i < 80; i++) {
      const now = await loc.evaluate((n) => +n.value);
      const diff = value - now;
      if (Math.abs(diff) < step / 2) break;
      await loc.press(diff > 0 ? "ArrowRight" : "ArrowLeft");
    }
    await sleep(350);
  }
  async color(label, value) {
    const loc = this.page.locator(`input[type=color][aria-label="${label}"]`).first();
    await loc.scrollIntoViewIfNeeded();
    await this.fakeClick(loc);
    await loc.evaluate((n, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(n, v); n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    await sleep(450);
  }
  async select(label, startsWith) {
    const loc = this.page.locator(`select[aria-label="${label}"]`).first();
    await loc.scrollIntoViewIfNeeded();
    await this.fakeClick(loc);
    await loc.evaluate((n, want) => { const o = [...n.options].find((x) => x.textContent.trim().toLowerCase().startsWith(want.toLowerCase())); if (!o) throw new Error("no option " + want); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(n, o.value); n.dispatchEvent(new Event("change", { bubbles: true })); }, startsWith);
    await sleep(450);
  }
  async number(label, value, { aria = false } = {}) {
    const loc = aria ? this.page.locator(`input[type=number][aria-label="${label}"]`).first() : this.page.locator("label.number-field").filter({ hasText: label }).first().locator("input");
    await loc.scrollIntoViewIfNeeded();
    await this.click(loc, { wait: 150 });
    await this.page.keyboard.press("Control+a");
    await this.page.keyboard.type(String(value), { delay: 70 });
    await this.page.keyboard.press("Enter");
    await sleep(450);
  }
  async expand(summaryText) {
    const sum = this.page.locator("summary").filter({ hasText: summaryText }).first();
    await sum.scrollIntoViewIfNeeded();
    if (!(await sum.evaluate((n) => n.parentElement.open))) await this.click(sum, { wait: 450 });
  }

  // ---------------------------------------------------------------- edit hints
  /** Ask the edit to push in on an element (or an explicit rect, in CSS pixels). */
  async zoom(target, scale = 1.6) {
    const b = target.x !== undefined ? target : await this.rectOf(target);
    this.ev("zoom", { cx: ((b.x + b.width / 2) * DPR) / 1920, cy: ((b.y + b.height / 2) * DPR) / 1080, scale });
  }
  zoomOut() { this.ev("zoom", { scale: 1 }); }
  /** Mark a span the edit may play faster (waiting on a render, for example). */
  fast(from, to, speed = 3) { this.events.push({ t: from, kind: "fast", to, speed }); }

  // ---------------------------------------------------------------- sections
  /**
   * Run a section. Its narration plays from the start of the section, so the steps are
   * spread across the narration: step i begins no earlier than its share of the audio.
   */
  async section(id, title, steps, { lead = 0.5, tail = 0.9 } = {}) {
    const audioFile = path.join(this.audioDir, `${this.tutorial}-${id}.mp3`);
    const audio = audioDuration(audioFile);
    const start = this.T();
    this.sections.push({ id, title, start, audio });
    const begin = Date.now();
    await sleep(lead * 1000);
    const list = Array.isArray(steps) ? steps : [steps];
    const span = Math.max(0, audio - lead - 1.5);
    try {
      for (let i = 0; i < list.length; i++) {
        const due = begin + (lead + (span * i) / list.length) * 1000;
        if (Date.now() < due) await sleep(due - Date.now());
        await list[i]();
      }
    } catch (e) {
      this.problems.push(`${id}: ${String(e.message).split("\n")[0]}`);
      console.log(`PROBLEM ${id}:`, String(e.stack).split("\n").slice(0, 3).join(" | "));
      try { await this.page.screenshot({ path: path.join(this.outDir, `problem-${id}.png`) }); } catch {}
    }
    const minEnd = begin + (audio + tail) * 1000;
    if (Date.now() < minEnd) await sleep(minEnd - Date.now());
    this.zoomOut();
    const s = this.sections[this.sections.length - 1];
    s.end = this.T();
  }
  async finish(extra = {}) {
    await this.stop();
    const manifest = { tutorial: this.tutorial, width: 1920, height: 1080, duration: this.duration, sections: this.sections, events: this.events, problems: this.problems, ...extra };
    fs.writeFileSync(path.join(this.outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  }
}
