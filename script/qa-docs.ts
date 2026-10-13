// QA the generated docs with Playwright (headless Chromium).
// Usage:  npx tsx script/qa-docs.ts
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:4173";
const OUT = "dist/qa";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  "/home",
  "/docs/",
  "/docs/guides/intro",
  "/docs/guides/motion-graphics",
  "/docs/guides/quickstart",
  "/docs/api/motion-graphics",
  "/docs/concepts/collab",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let failures = 0;
for (const path of PAGES) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  const title = await page.title();
  // Take screenshot, save to disk, report status.
  const name = path.replace(/\//g, "_").replace(/^_/, "") || "home";
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const ok = status === 200 && title.includes("VideoForge");
  console.log(`${ok ? "PASS" : "FAIL"} ${path} (status ${status}) — ${title}`);
  if (!ok) failures++;
}

// Check for 404s / broken links across all docs pages.
const docLinks = await page.evaluate(() => Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href")));
const internal = docLinks.filter((h) => h?.startsWith("/")) as string[];
const seen = new Set<string>();
for (const href of internal) {
  if (seen.has(href)) continue;
  seen.add(href);
  const r = await page.goto(BASE + href, { waitUntil: "domcontentloaded" }).catch(() => null);
  const st = r?.status() ?? 0;
  if (st >= 400) {
    console.log(`FAIL link ${href} -> ${st}`);
    failures++;
  }
}
console.log(`checked ${seen.size} unique internal links`);

await browser.close();
if (failures) {
  console.error(`${failures} QA failures`);
  process.exit(1);
}
console.log("docs QA: all green");
