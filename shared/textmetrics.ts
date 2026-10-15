/** Approximate text widths in em, shared by the layout engine and the template builders. */
import { BOLD_WIDTH_FACTOR, getFont } from "./fonts";
// Conservative advances based on Noto Sans regular; a little extra room covers font substitution.
const ascii = [0.26,0.269,0.408,0.646,0.572,0.831,0.732,0.225,0.3,0.3,0.551,0.572,0.268,0.322,0.268,0.372,0.572,0.572,0.572,0.572,0.572,0.572,0.572,0.572,0.572,0.572,0.268,0.268,0.572,0.572,0.572,0.434,0.899,0.639,0.65,0.632,0.73,0.556,0.519,0.728,0.741,0.339,0.273,0.619,0.524,0.907,0.76,0.781,0.605,0.781,0.622,0.549,0.556,0.731,0.6,0.93,0.586,0.566,0.572,0.329,0.372,0.329,0.572,0.444,0.281,0.561,0.615,0.48,0.615,0.564,0.344,0.615,0.618,0.258,0.258,0.534,0.258,0.935,0.618,0.605,0.615,0.615,0.413,0.479,0.361,0.618,0.508,0.786,0.529,0.51,0.47,0.38,0.551,0.38,0.572];

/** Text style that changes how wide a run of text is. */
export type TextStyle = { font?: string; fontWeight?: number; letterSpacing?: number };

/**
 * Width of `text` in em for the given style. Each catalog font scales the base
 * Noto Sans table by its measured average; bold runs a little wider; letter
 * spacing adds one gap per character pair.
 */
export function textAdvance(text: string, style: TextStyle = {}): number {
  const font = getFont(style.font);
  const width = (style.fontWeight ?? 400) === 700 ? font.width * BOLD_WIDTH_FACTOR : font.width;
  const spacing = Math.min(0.25, Math.max(-0.05, style.letterSpacing ?? 0));
  const chars = Array.from(text);
  let sum = 0, gaps = 0;
  for (const c of chars) {
    const n = c.codePointAt(0)!;
    sum += (n >= 32 && n <= 126 ? ascii[n - 32] * 1.12 : n >= 0x300 && n <= 0x36f ? 0 : 1.15) * width;
    gaps++;
  }
  return sum + Math.max(0, gaps - 1) * spacing;
}
