// ============================================================================
// Rasterise a motion-graphics shape into a transparent PNG, in pure Node
// (zlib + a minimal PNG writer). No canvas dependency.
//
// This is the export-path twin of the browser preview's canvas traceShape:
// both use the same `traceShape` geometry from shared/graphics.ts, so
// preview and export agree by construction.
// ============================================================================

import zlib from "node:zlib";
import fs from "node:fs";
import type { Clip } from "@shared/timeline";
import { isInsideShape, type Graphic } from "@shared/graphics";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** hex `#rrggbb` → [r,g,b] */
const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Rasterise a clip's graphic onto a transparent WxH RGBA buffer, write PNG.
 * `clip` should be the *evaluated* clip (evaluateClip at the target time).
 */
export function rasterizeShape(clip: Clip, g: Graphic, W: number, H: number, outPath: string): void {
  // The clip's x/y/scale/rotation/opacity are applied by ffmpeg's overlay +
  // existing transform machinery; here we only draw the shape centred at
  // (W/2, H/2) sized by width/height (as a fraction of frame).
  const w = Math.max(1, Math.round(g.width * W));
  const h = Math.max(1, Math.round(g.height * H));
  const cx = Math.round(W / 2), cy = Math.round(H / 2);
  const x0 = cx - Math.floor(w / 2), y0 = cy - Math.floor(h / 2);

  const rgba = new Uint8Array(W * H * 4);
  const [r, gr, b] = hexRgb(g.color);
  const a = Math.round((clip.opacity ?? 1) * 255);

  const put = (px: number, py: number) => {
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    const i = (py * W + px) * 4;
    rgba[i] = r; rgba[i + 1] = gr; rgba[i + 2] = b; rgba[i + 3] = a;
  };

  if (g.kind === "rect" && !(g.radius ?? 0)) {
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) put(x0 + px, y0 + py);
  } else if (g.kind === "bar") {
    // Track (full width, trackColour), then fill progress.
    const [tr, tg, tb] = hexRgb(g.trackColor ?? "#1a1a1a");
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = ((y0 + py) * W + x0 + px) * 4;
      rgba[i] = tr; rgba[i + 1] = tg; rgba[i + 2] = tb; rgba[i + 3] = a;
    }
    const filled = Math.round(w * Math.min(1, Math.max(0, g.progress ?? 0)));
    for (let py = 0; py < h; py++) for (let px = 0; px < filled; px++) put(x0 + px, y0 + py);
  } else if (g.kind === "line") {
    // A line is a filled rect of height max(2, h).
    const lineH = Math.max(2, h);
    for (let py = 0; py < lineH; py++) for (let px = 0; px < w; px++) put(x0 + px, y0 + py);
  } else {
    // ellipse / rounded rect: point-in-shape test
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        if (isInsideShape(g, px, py, w, h)) put(x0 + px, y0 + py);
      }
    }
  }

  // Stroke (outline) — draw a 1px border if requested.
  if (g.stroke && (g.strokeWidth ?? 0) > 0) {
    const [sr, sg, sb] = hexRgb(g.stroke);
    const sw = Math.max(1, Math.round((g.strokeWidth! / 100) * H));
    const paintStroke = (px: number, py: number) => {
      if (px < 0 || px >= W || py < 0 || py >= H) return;
      const i = (py * W + px) * 4;
      rgba[i] = sr; rgba[i + 1] = sg; rgba[i + 2] = sb; rgba[i + 3] = a;
    };
    for (let t = 0; t < sw; t++) {
      // Outline: pixels just inside the shape boundary.
      for (let px = 0; px < w; px++) {
        for (const py of [t, h - 1 - t]) paintStroke(x0 + px, y0 + py);
      }
      for (let py = 0; py < h; py++) {
        for (const px of [t, w - 1 - t]) paintStroke(x0 + px, y0 + py);
      }
    }
  }

  // Encode PNG (color type 6 = RGBA, 8-bit).
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // no filter
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 4, dst = y * (W * 4 + 1) + 1 + x * 4;
      raw[dst] = rgba[src]; raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2]; raw[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(outPath, png);
}
