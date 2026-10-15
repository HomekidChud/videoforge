/** Server-side font files for the FFmpeg renderer: downloaded from Google Fonts and cached on disk. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getFont } from "@shared/fonts";
import type { Timeline } from "@shared/timeline";

const CACHE_DIR = process.env.VIDEOFORGE_FONTS_DIR || "data/fonts";

/** Weight actually available for a font id (falls back to the heaviest cut). */
export function effectiveWeight(id: string | undefined, weight: number | undefined): number {
  const font = getFont(id);
  const w = weight ?? 400;
  return font.weights.includes(w) ? w : font.weights[font.weights.length - 1];
}

/** Cached font file for a clip's font, or undefined when it has not been downloaded (or is offline). */
export function fontFileCached(id: string | undefined, weight: number): string | undefined {
  const file = path.join(CACHE_DIR, `${getFont(id).id}-${effectiveWeight(id, weight)}.ttf`);
  return existsSync(file) ? file : undefined;
}

/**
 * Download one font cut from Google Fonts into the cache. The css2 endpoint
 * serves TTF URLs to user agents without woff2 support. Returns undefined
 * (never throws) when the network or the file is unavailable, so rendering
 * falls back to the server default font.
 */
export async function ensureFontFile(id: string | undefined, weight: number | undefined): Promise<string | undefined> {
  const font = getFont(id);
  const w = effectiveWeight(id, weight);
  const file = path.join(CACHE_DIR, `${font.id}-${w}.ttf`);
  if (existsSync(file)) return file;
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${font.google}`, { headers: { "User-Agent": "" } })).text();
    const blocks = css.match(/@font-face\s*\{[^}]+\}/g) ?? [];
    const block = blocks.find((b) => b.includes(`font-weight: ${w}`) && b.includes("font-style: normal")) ?? blocks.find((b) => b.includes("font-style: normal")) ?? blocks[0];
    const url = block?.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) return undefined;
    const ttf = Buffer.from(await (await fetch(url)).arrayBuffer());
    if (!ttf.length) return undefined;
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, ttf);
    return file;
  } catch {
    return undefined;
  }
}

/** Download every font a timeline's text clips use, so buildRenderPlan finds them in the cache. */
export async function ensureTimelineFonts(tl: Timeline): Promise<void> {
  const pairs = new Set<string>();
  for (const c of tl.clips) {
    if (c.shape || c.assetId || c.text === undefined) continue;
    const font = getFont(c.font);
    pairs.add(`${font.id}:${effectiveWeight(c.font, c.fontWeight)}`);
  }
  await Promise.all(Array.from(pairs).map((p) => { const [id, w] = p.split(":"); return ensureFontFile(id, Number(w)); }));
}
