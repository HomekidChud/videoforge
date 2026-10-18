// ----------------------------------------------------------------------------
// Export settings shared by the Studio export dialog, the HTTP API and the
// render worker. Values are whitelisted here so the server never trusts raw
// client input, and the defaults keep the previous encoding exactly.
// ----------------------------------------------------------------------------

export type RenderQuality = "high" | "standard" | "draft";

export type RenderOptions = {
  /** Encoder tuning. Derived server-side; clients never pass raw ffmpeg values. */
  quality?: RenderQuality;
  /** Even output width in pixels. Portrait projects should scale via the short side. */
  width?: number;
  /** Output frame rate; the project's own fps when omitted. */
  fps?: number;
  /** false drops audio processing entirely, not just the audio stream. */
  audio?: boolean;
};

export const RENDER_QUALITIES: Record<RenderQuality, { label: string; crf: number; preset: string }> = {
  high: { label: "High", crf: 18, preset: "faster" },
  standard: { label: "Standard", crf: 20, preset: "veryfast" },
  draft: { label: "Draft", crf: 27, preset: "ultrafast" },
};

/** Resolution presets by short side, so portrait projects stay portrait. */
export const RESOLUTION_PRESETS: Array<{ id: string; label: string; shortSide: number | null }> = [
  { id: "project", label: "Project", shortSide: null },
  { id: "1080p", label: "1080p", shortSide: 1080 },
  { id: "720p", label: "720p", shortSide: 720 },
  { id: "480p", label: "480p", shortSide: 480 },
];

/** The output width a short-side preset maps to for a given frame, kept even. */
export function presetWidth(width: number, height: number, shortSide: number): number {
  const factor = shortSide / Math.max(1, Math.min(width, height));
  return Math.max(2, Math.round((width * factor) / 2) * 2);
}

/** Whitelist and clamp anything a client may send. Unknown values fall back to defaults. */
export function sanitizeRenderOptions(raw: unknown): RenderOptions {
  const out: RenderOptions = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  // Own-property check: "constructor"/"toString" must not pass as a quality name.
  if (typeof r.quality === "string" && Object.hasOwn(RENDER_QUALITIES, r.quality)) out.quality = r.quality as RenderQuality;
  if (typeof r.width === "number" && Number.isFinite(r.width)) {
    const w = Math.round(r.width);
    if (w >= 256 && w <= 4096) out.width = Math.floor(w / 2) * 2; // even, never above the request
  }
  if (typeof r.fps === "number" && Number.isFinite(r.fps)) {
    const fps = Math.round(r.fps);
    if (fps >= 12 && fps <= 60) out.fps = fps;
  }
  if (typeof r.audio === "boolean") out.audio = r.audio;
  return out;
}
