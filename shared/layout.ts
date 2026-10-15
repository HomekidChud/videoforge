import { clipDuration, clipScale, clipX, clipY, timelineDuration, type Clip, type Timeline } from "./timeline";
import { valueAt } from "./animation";
import { textAdvance } from "./textmetrics";
export { textAdvance };

export type CanvasSize = { width: number; height: number };
export type FitMode = "contain" | "cover" | "fill" | "safe";
export type Bounds = { x: number; y: number; w: number; h: number };
export type MediaSize = { width?: number | null; height?: number | null };
const rad = (deg: number) => deg * Math.PI / 180;
const rotated = (w: number, h: number, deg: number) => { const a = rad(deg); return { w: Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h, h: Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * h }; };
/** Largest scale and every rotation a clip reaches, so fitting holds for the whole animation. */
function extremes(c: Clip) {
  const base = clipScale(c);
  const keyTimes = Object.values(c.keyframes ?? {}).flat().map(k => k.time), last = Math.max(0, ...keyTimes, c.expressions ? clipDuration(c) : 0), times = new Set<number>([0].concat(keyTimes));
  for (let i = 0; i <= 48; i++) times.add(last * i / 48);
  let scale = base, angles = [c.rotation ?? 0];
  for (const t of Array.from(times)) { scale = Math.max(scale, valueAt(c, "scale", t)); angles.push(valueAt(c, "rotation", t)); }
  return { scale, angles };
}
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!word) continue;
      if (line && textAdvance(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of Array.from(word)) {
        if (line && textAdvance(line + char) > width) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
/** Text box room in canvas pixels around the clip's centre, before scale. Text is centred on x/y, so each side is limited by the nearer frame edge. */
function textRoom(c: Clip, canvas: CanvasSize, maxScale: number) {
  const x = c.assetId ? .5 : clipX(c), y = c.assetId ? .82 : clipY(c);
  return { w: canvas.width * Math.min(c.textMaxWidth ?? .9, 2 * Math.min(x, 1 - x)) / maxScale, h: canvas.height * Math.min(c.textMaxHeight ?? .5, 2 * Math.min(y, 1 - y)) / maxScale };
}
/** Shared deterministic wrapping and shrink-to-fit used by the preview and the FFmpeg renderer. Text is never truncated. */
export function textLayout(c: Clip, canvas: CanvasSize) {
  const text = c.text ?? "", requested = canvas.height * (c.textSize ?? 6) / 100;
  const pad = (size: number) => c.textBg ? size * .35 : size * .08;
  if (c.textFit === "none") return { text, lines: text.split("\n"), fontSize: requested, width: 0, height: 0, padding: pad(requested) };
  const { scale, angles } = c.assetId ? { scale: 1, angles: [0] } : extremes(c);
  const room = textRoom(c, canvas, scale);
  const measure = (size: number) => {
    const p = pad(size), lines = wrap(text, Math.max(.01, (room.w - 2 * p) / size));
    const width = Math.max(.01, ...lines.map(textAdvance)) * size + 2 * p, height = lines.length * size * 1.4 + 2 * p;
    const fits = angles.every(a => { const r = rotated(width, height, a); return r.w <= room.w + .01 && r.h <= room.h + .01; });
    return { lines, width, height, fits, p };
  };
  let lo = 1, hi = Math.max(1, requested);
  if (measure(hi).fits) lo = hi; else for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (measure(mid).fits) lo = mid; else hi = mid; }
  const size = Math.floor(lo * 100) / 100, r = measure(size);
  return { text: r.lines.join("\n"), lines: r.lines, fontSize: size, width: r.width, height: r.height, padding: r.p };
}
/** Axis-aligned frame bounds (canvas fractions) at the clip's base position. */
export function clipBounds(c: Clip, canvas: CanvasSize, media: MediaSize = {}): Bounds | undefined {
  if (c.track === "audio") return undefined;
  const { scale, angles } = extremes(c), x = clipX(c), y = clipY(c), ca = canvas.width / canvas.height;
  let w: number, h: number;
  if (c.shape) { w = c.shape.width * canvas.width * scale; h = c.shape.height * canvas.height * scale; }
  else if (c.assetId) {
    const a = media.width && media.height ? media.width / media.height : ca;
    if (c.track === "overlay") { w = scale * canvas.width; h = w / a; }
    else if (c.fit === "cover" || c.fit === "fill") { w = scale * canvas.width; h = scale * canvas.height; }
    else { const fw = a >= ca ? 1 : a / ca, fh = a >= ca ? ca / a : 1; w = fw * scale * canvas.width; h = fh * scale * canvas.height; }
  } else {
    const lines = (c.text ?? "").split("\n"), size = canvas.height * (c.textSize ?? 6) / 100, p = c.textBg ? size * .35 : size * .08;
    w = (Math.max(...lines.map(textAdvance)) * size + 2 * p) * scale; h = (lines.length * size * 1.4 + 2 * p) * scale;
    if (c.textFit !== "none") { const l = textLayout(c, canvas); w = l.width * scale; h = l.height * scale; }
  }
  const box = angles.map(a => rotated(w, h, a)).reduce((m, r) => ({ w: Math.max(m.w, r.w), h: Math.max(m.h, r.h) }), { w: 0, h: 0 });
  return { x, y, w: box.w / canvas.width, h: box.h / canvas.height };
}
export type FitIssue = { clipId: string; label: string; problem: string; overflow: { left: number; right: number; top: number; bottom: number }; suggestion: string };
const EDGE = .002;
/** Lists clips whose visible bounds cross the frame (or the safe margin). Intentional cover and full-bleed video are not reported. */
export function fitReport(t: Timeline, media: (assetId: string) => MediaSize | undefined = () => undefined, margin = 0): FitIssue[] {
  if (!Number.isFinite(margin) || margin < 0 || margin > .3) throw new Error("margin must be 0..0.3");
  const issues: FitIssue[] = [];
  for (const c of t.clips) {
    if (c.track === "audio" || (c.assetId && c.track === "video" && (c.fit === "cover" || c.fit === "fill"))) continue;
    const b = clipBounds(c, t.resolution, media(c.assetId));
    if (!b) continue;
    const o = { left: Math.max(0, margin - (b.x - b.w / 2)), right: Math.max(0, b.x + b.w / 2 - (1 - margin)), top: Math.max(0, margin - (b.y - b.h / 2)), bottom: Math.max(0, b.y + b.h / 2 - (1 - margin)) };
    const r = (n: number) => Math.round(n * 1000) / 1000;
    if (Math.max(o.left, o.right, o.top, o.bottom) <= EDGE) continue;
    issues.push({ clipId: c.id, label: c.label ?? c.text?.slice(0, 40) ?? c.shape?.type ?? "media", problem: b.w > 1 + EDGE || b.h > 1 + EDGE ? "larger than the frame" : "crosses the frame edge", overflow: { left: r(o.left), right: r(o.right), top: r(o.top), bottom: r(o.bottom) }, suggestion: `fit_clip { clipId: "${c.id}" }` });
  }
  return issues;
}
/**
 * Shrinks and nudges a clip so its animated bounds sit inside the frame (minus margin).
 * mode safe: keep position, scale only when needed. contain / cover: full-frame media fit.
 */
export function fitClip(c: Clip, canvas: CanvasSize, media: MediaSize = {}, mode: FitMode = "safe", margin = .04): Partial<Clip> {
  if (c.track === "audio") throw new Error("audio clips have no visual fit");
  if (!["safe", "contain", "cover", "fill"].includes(mode)) throw new Error("fit mode must be safe, contain, cover or fill");
  if (!Number.isFinite(margin) || margin < 0 || margin > .3) throw new Error("margin must be 0..0.3");
  const text = !c.assetId && !c.shape;
  if (mode !== "safe") {
    if (!c.assetId) throw new Error("contain, cover and fill apply to media clips; use safe for text and shapes");
    return { fit: mode, scale: c.track === "overlay" ? Math.min(1, clipScale(c)) : 1, x: .5, y: .5 };
  }
  const room = 1 - 2 * margin, textMaxWidth = Math.min(.98, c.textMaxWidth ?? .9, room), textMaxHeight = Math.min(.98, c.textMaxHeight ?? .5, room);
  // Text is measured as it will be once auto-fit is on, so the position is clamped around the fitted box.
  let b = clipBounds(text ? { ...c, textFit: undefined, textMaxWidth, textMaxHeight } : c, canvas, media)!;
  const inside = (q: Bounds) => q.x - q.w / 2 >= margin - EDGE && q.x + q.w / 2 <= 1 - margin + EDGE && q.y - q.h / 2 >= margin - EDGE && q.y + q.h / 2 <= 1 - margin + EDGE;
  // A text box squeezed against an edge is measured from the middle of the frame, where it has room, then moved in.
  if (text && !inside(b)) { const mid = clipBounds({ ...c, x: .5, y: .5, textFit: undefined, textMaxWidth, textMaxHeight }, canvas, media)!; b = { ...mid, x: b.x, y: b.y }; }
  const shrink = Math.min(1, room / Math.max(.001, b.w), room / Math.max(.001, b.h));
  const w = b.w * shrink, h = b.h * shrink;
  const x = Math.min(1 - margin - w / 2, Math.max(margin + w / 2, b.x)), y = Math.min(1 - margin - h / 2, Math.max(margin + h / 2, b.y));
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const patch: Partial<Clip> = { x: r(x), y: r(y) };
  if (text) { patch.textFit = undefined; patch.textMaxWidth = r(textMaxWidth); patch.textMaxHeight = r(textMaxHeight); }
  else if (shrink < 1) {
    patch.scale = r(Math.max(.01, clipScale(c) * shrink));
    if (c.keyframes?.scale) patch.keyframes = { ...c.keyframes, scale: c.keyframes.scale.map(k => ({ ...k, value: r(Math.max(.1, k.value * shrink)) })) };
  }
  return patch;
}
export const fitSummary = (t: Timeline, media?: (assetId: string) => MediaSize | undefined, margin = 0) => { const issues = fitReport(t, media, margin); return { ok: !issues.length, checked: t.clips.length, duration: timelineDuration(t), issues }; };
