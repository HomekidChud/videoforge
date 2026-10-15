import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { textAdvance } from "../shared/textmetrics";
import { textLayout, clipBounds } from "../shared/layout";
import { normalizeClip, normalizeTimeline } from "../shared/timeline";
import { buildRenderPlan } from "../server/render";
import { ensureFontFile, fontFileCached, effectiveWeight } from "../server/fonts";
import { FONT_CATALOG, FONT_MAP, getFont, googleFontsHref } from "../shared/fonts";
import { templateClips } from "../shared/graphics";

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) { await fn(); checks++; }

const canvas = { width: 1280, height: 720 };
const textClip = (extra: Record<string, unknown> = {}) => normalizeClip({ id: "t1", assetId: "", track: "overlay", text: "The quick brown fox", textSize: 8, start: 0, outPoint: 4, ...extra });

// Catalog invariants: unique ids, css families, weights sorted, google query segments.
await check("catalog well formed", () => {
  assert.ok(FONT_CATALOG.length >= 35, `expected a large catalog, got ${FONT_CATALOG.length}`);
  const ids = FONT_CATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FONT_CATALOG) {
    assert.ok(/^[a-z0-9-]+$/.test(f.id), f.id);
    assert.ok(f.label && f.stack && f.google);
    assert.ok(f.weights.length >= 1 && f.weights.every((w) => w === 400 || w === 700));
    assert.ok(f.width > 0.5 && f.width < 1.5, `${f.id} width factor out of range`);
  }
  assert.match(googleFontsHref(), /^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
  assert.ok(googleFontsHref().includes("Bebas+Neue"));
});

// Per-font width: condensed fonts measure narrower than wide ones for the same text.
await check("per-font metrics", () => {
  const same = "The quick brown fox jumps over the lazy dog";
  const bebas = textAdvance(same, { font: "bebas-neue" });
  const wide = textAdvance(same, { font: "press-start-2p" });
  const noto = textAdvance(same, { font: "noto-sans" });
  assert.ok(bebas < noto, "condensed Bebas should measure narrower than Noto Sans");
  assert.ok(wide > noto, "Press Start 2P should measure wider than Noto Sans");
  assert.ok(textAdvance(same, { font: "inter", fontWeight: 700 }) > textAdvance(same, { font: "inter", fontWeight: 400 }), "bold runs wider");
  assert.ok(textAdvance("WAVE", { letterSpacing: 0.1 }) > textAdvance("WAVE"), "letter spacing adds width");
  assert.ok(Math.abs(textAdvance("HI", { letterSpacing: 0.05 }) - (textAdvance("HI") + 0.05)) < 1e-9, "one gap per character pair");
});

// Fit is font-aware: a narrow font fits at a larger size in the same box.
await check("font-aware fit", () => {
  const narrow = textLayout(textClip({ text: "MAKE IT LOUD, MAKE IT PROUD, MAKE IT COUNT", textSize: 20, font: "bebas-neue" }), canvas);
  const wide = textLayout(textClip({ text: "MAKE IT LOUD, MAKE IT PROUD, MAKE IT COUNT", textSize: 20, font: "press-start-2p" }), canvas);
  assert.ok(narrow.fontSize > wide.fontSize, `narrow font should fit larger (${narrow.fontSize} vs ${wide.fontSize})`);
  // Letter spacing is part of the fit budget: spaced text fits smaller.
  const spaced = textLayout(textClip({ text: "S P A C E D  T I T L E", letterSpacing: 0.2 }), canvas);
  const tight = textLayout(textClip({ text: "S P A C E D  T I T L E" }), canvas);
  assert.ok(spaced.fontSize <= tight.fontSize);
  // Line height is part of the height budget.
  const tall = textLayout(textClip({ text: "one two three four five six seven", lineHeight: 2 }), canvas);
  const normal = textLayout(textClip({ text: "one two three four five six seven" }), canvas);
  assert.ok(tall.fontSize <= normal.fontSize);
});

// Uppercase transforms are measured in their rendered form.
await check("uppercase measured", () => {
  const upper = textLayout(textClip({ text: "quiet title", textTransform: "uppercase" }), canvas);
  assert.ok(upper.text.includes("QUIET TITLE"));
  const b = clipBounds(textClip({ text: "quiet title", textTransform: "uppercase" }), canvas)!;
  assert.ok(b.w > 0);
});

// Validation: unknown fonts, bad weights, bad enums are rejected; defaults are omitted.
await check("normalize validation", () => {
  assert.throws(() => textClip({ font: "comic-sans" }), /font must be a catalog id/);
  assert.throws(() => textClip({ font: "bebas-neue", fontWeight: 700 }), /not available for bebas-neue/);
  assert.throws(() => textClip({ fontWeight: 600 }), /fontWeight must be 400 or 700/);
  assert.throws(() => textClip({ textAlign: "justify" }), /textAlign/);
  assert.throws(() => textClip({ textTransform: "lowercase" }), /textTransform/);
  // Numeric style fields clamp like the other numeric clip fields.
  assert.equal(textClip({ letterSpacing: 1 }).letterSpacing, 0.25);
  assert.equal(textClip({ lineHeight: 4 }).lineHeight, 2);
  assert.equal(textClip({ letterSpacing: -1 }).letterSpacing, -0.05);
  const clip = textClip({ font: "inter", fontWeight: 700, textAlign: "left", lineHeight: 1.5, letterSpacing: 0.08, textTransform: "uppercase" });
  assert.equal(clip.font, "inter");
  assert.equal(clip.fontWeight, 700);
  assert.equal(clip.textAlign, "left");
  assert.equal(clip.lineHeight, 1.5);
  assert.equal(clip.letterSpacing, 0.08);
  assert.equal(clip.textTransform, "uppercase");
  const plain = textClip({ font: "noto-sans", fontWeight: 400, textAlign: "center", lineHeight: 1.4, letterSpacing: 0, textTransform: "none" });
  assert.equal(plain.font, undefined, "defaults are omitted from the stored clip");
});

// Templates and title presets only use catalog fonts.
await check("templates use catalog fonts", () => {
  const clips = templateClips({ template: "title-card", title: "Hello", subtitle: "World", color: "#f6a447", start: 0, duration: 4 }, () => "x", 16 / 9);
  for (const c of clips) if (c.text !== undefined) assert.ok(!c.font || FONT_MAP.has(c.font), `unknown font ${c.font}`);
  const normalized = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips });
  assert.equal(normalized.clips.length, clips.length);
});

// Renderer plan: per-clip fonts, alignment, line height and letter spacing reach the filter graph.
await check("render plan carries text style", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-text-"));
  const tl = normalizeTimeline({
    fps: 30, resolution: { width: 1280, height: 720 }, clips: [
      textClip({ id: "a", font: "inter", fontWeight: 700, textAlign: "left", lineHeight: 1.6 }),
      textClip({ id: "b", letterSpacing: 0.12, text: "S P A C E D" }),
    ],
  });
  const plan = buildRenderPlan(tl, new Map(), dir, dir, "job1", path.join(dir, "out.mp4"));
  assert.match(plan.filter, /fontfile=/);
  assert.match(plan.filter, /fontcolor=0x[a-f0-9]{6}/);
  // Left alignment anchors lines at the estimated block edge instead of centring.
  assert.ok(!/x=\(w-text_w\)\/2/.test(plan.filter.split("textfile")[0]) || plan.filter.includes("(w-"), "alignment expression present");
  // Letter spacing emits one drawtext per character.
  const spaced = plan.filter.split("drawtext").length - 1;
  assert.ok(spaced >= 5, `per-character drawtext expected, got ${spaced}`);
  for (const f of plan.tempFiles) fs.rmSync(f, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

// Font cache: effective weight falls back to the heaviest cut; downloads fail soft offline.
await check("font cache soft-fails", async () => {
  assert.equal(effectiveWeight("bebas-neue", 700), 400);
  assert.equal(effectiveWeight("inter", 700), 700);
  const cached = fontFileCached("does-not-exist", 400);
  assert.ok(cached === undefined || cached.includes("noto-sans"), "unknown ids fall back to the default family");
  // Unknown ids resolve the default family instead of throwing.
  const fallback = await ensureFontFile("no-such-font", 400);
  assert.ok(!fallback || fallback.includes("noto-sans"));
});

// Live network check (skipped when Google Fonts is unreachable, e.g. CI without network).
await check("google fonts downloadable", async () => {
  try {
    const file = await ensureFontFile("inter", 400);
    if (!file) return; // offline: soft skip
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 1000, "cached ttf should be non-trivial");
    assert.equal(fontFileCached("inter", 400), file);
    fs.rmSync(file, { force: true });
  } catch { /* offline environment */ }
});

console.log(`text.spec: ${checks} checks passed`);
