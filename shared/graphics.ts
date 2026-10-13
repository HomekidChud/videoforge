// ============================================================================
// Motion-graphics primitives shared by the editor preview, the HTTP API and
// the FFmpeg renderer.
//
// A "graphic" is an asset-less overlay clip that draws a shape: rectangle,
// ellipse, line or progress bar. Graphics compose with existing text clips,
// reuse the same keyframe/animation system (position, scale, rotation,
// opacity, width, height, progress) and render on the overlay track.
//
// Everything coming from a client passes through normalizeGraphic() so the
// renderer only ever sees bounded, well-typed values.
// ============================================================================

import type { Clip } from "./timeline";

export type ShapeKind = "rect" | "ellipse" | "line" | "bar";

export const SHAPE_KINDS: ShapeKind[] = ["rect", "ellipse", "line", "bar"];

export type Graphic = {
  /** Which primitive to draw. */
  kind: ShapeKind;
  /** Fill colour, #rrggbb. Static (validated) — no animated colour in v1. */
  color: string;
  /** Optional stroke colour. */
  stroke?: string;
  /** Stroke width in % of frame height, 0..4. */
  strokeWidth?: number;
  /** Corner radius for rect, % of frame height, 0..10 (rounded rectangle). */
  radius?: number;
  /**
   * Width as a fraction of frame width (0.01..1). Keyframeable via the
   * existing animation system (property "width").
   */
  width: number;
  /** Height as a fraction of frame height (0.01..1). Keyframeable ("height"). */
  height: number;
  /**
   * Progress 0..1 — for `bar`, the filled fraction. Keyframeable ("progress").
   */
  progress?: number;
  /** Progress bar track colour (the unfilled part), #rrggbb. */
  trackColor?: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const round = (n: number) => Math.round(n * 1000) / 1000;
/** Validate a colour, throwing if supplied but malformed. Omitted → default. */
const color = (v: unknown, fallback: string) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" || !HEX.test(v)) throw new Error(`colour must be #rrggbb (got ${JSON.stringify(v)})`);
  return v.toLowerCase();
};

export const DEFAULT_GRAPHIC: Graphic = {
  kind: "rect",
  color: "#3d50f5",
  width: 0.3,
  height: 0.08,
};

export function normalizeGraphic(raw: any): Graphic {
  if (!raw || typeof raw !== "object") throw new Error("graphic must be an object");
  const kind = SHAPE_KINDS.includes(raw.kind) ? raw.kind as ShapeKind : null;
  if (!kind) throw new Error(`graphic.kind must be one of: ${SHAPE_KINDS.join(", ")}`);
  const g: Graphic = {
    kind,
    color: color(raw.color, "#3d50f5"),
    width: round(num(raw.width, 0.01, 1, 0.3)),
    height: round(num(raw.height, 0.01, 1, 0.08)),
  };
  if (raw.stroke !== undefined) {
    const s = color(raw.stroke, "");
    if (s) g.stroke = s;
    const w = round(num(raw.strokeWidth, 0, 4, 0));
    if (w > 0) g.strokeWidth = w;
  }
  if (kind === "rect" && raw.radius !== undefined) {
    const r = round(num(raw.radius, 0, 10, 0));
    if (r > 0) g.radius = r;
  }
  if (kind === "bar") {
    const p = round(num(raw.progress, 0, 1, 0));
    if (p > 0) g.progress = p;
    g.trackColor = color(raw.trackColor, "#1a1a1a");
  }
  return g;
}

/** True when this clip is a motion-graphics shape (asset-less, has a graphic). */
export const isGraphicClip = (c: Clip): boolean =>
  !c.assetId && !!c.graphic;

/**
 * Point-in-shape test — shared by the FFmpeg rasteriser (Node, no canvas)
 * and semantically equivalent to the browser's canvas `traceShape` + `fill()`.
 * Coordinates are relative to the shape's top-left, sized w x h.
 *
 * This is the single source of truth for shape geometry. The browser preview
 * uses `traceShape` (canvas paths); the export rasteriser uses this — they
 * describe the same region.
 */
export function isInsideShape(g: Graphic, px: number, py: number, w: number, h: number): boolean {
  if (px < 0 || py < 0 || px >= w || py >= h) return false;
  if (g.kind === "ellipse") {
    const dx = (px + 0.5 - w / 2) / (w / 2), dy = (py + 0.5 - h / 2) / (h / 2);
    return dx * dx + dy * dy <= 1;
  }
  if (g.kind === "line") return true; // the whole bounding box is the line
  // rect (with optional rounded corners)
  const cornerR = Math.min((g.radius ?? 0) / 100 * Math.min(w, h), w / 2, h / 2);
  if (cornerR <= 0) return true;
  const inX = px >= cornerR && px <= w - cornerR;
  const inY = py >= cornerR && py <= h - cornerR;
  if (inX || inY) return true;
  for (const ccx of [cornerR, w - cornerR]) for (const ccy of [cornerR, h - cornerR]) {
    if ((px + 0.5 - ccx) ** 2 + (py + 0.5 - ccy) ** 2 <= cornerR * cornerR) return true;
  }
  return false;
}

/** Draw a rounded-rect path on a 2D context, used by the editor preview. */
export function traceShape(
  ctx: CanvasRenderingContext2D,
  g: Graphic,
  x: number, y: number, w: number, h: number,
) {
  ctx.beginPath();
  if (g.kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (g.kind === "line") {
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
  } else {
    const r = Math.min((g.radius ?? 0) / 100, w / 2, h / 2) * Math.min(w, h);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/**
 * Static presets agents can reference by name. Each is a partial Graphic plus
 * default clip placement — a lower third, a title card background, a badge
 * and a progress bar.
 */
export const GRAPHIC_PRESETS: {
  id: string;
  label: string;
  graphic: Partial<Graphic>;
  placement: Partial<Clip>;
  description: string;
}[] = [
  {
    id: "lower-third",
    label: "Lower third bar",
    description: "Classic broadcast lower-third: accent bar bottom-left with room for a title on top.",
    graphic: { kind: "rect", color: "#3d50f5", width: 0.44, height: 0.11, radius: 0.4 },
    placement: { track: "overlay", x: 0.28, y: 0.86 },
  },
  {
    id: "title-card",
    label: "Title card backdrop",
    description: "Full-width dark panel behind a centred title.",
    graphic: { kind: "rect", color: "#0a0a0a", width: 0.92, height: 0.3, radius: 0.8 },
    placement: { track: "overlay", x: 0.5, y: 0.5 },
  },
  {
    id: "badge",
    label: "Corner badge",
    description: "Small pill for a logo or 'NEW' tag in the top-right corner.",
    graphic: { kind: "rect", color: "#ff6b6b", width: 0.16, height: 0.06, radius: 3 },
    placement: { track: "overlay", x: 0.86, y: 0.12 },
  },
  {
    id: "progress-bar",
    label: "Progress bar",
    description: "Horizontal progress bar; animate `progress` 0→1 with keyframes.",
    graphic: { kind: "bar", color: "#3d50f5", trackColor: "#2a2a2a", width: 0.7, height: 0.03, progress: 0 },
    placement: { track: "overlay", x: 0.5, y: 0.94 },
  },
  {
    id: "line",
    label: "Accent underline",
    description: "Thin horizontal rule, e.g. under a title.",
    graphic: { kind: "line", color: "#fafafa", width: 0.4, height: 0.008 },
    placement: { track: "overlay", x: 0.5, y: 0.7 },
  },
];
