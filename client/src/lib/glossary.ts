/** Glossary terms with hover definitions, shown as dotted-underlined words across the docs. */
export const GLOSSARY: Record<string, string> = {
  clip: "One building block of the timeline: media, text or a shape, with its own timing, transform and effects.",
  track: "A layer of the timeline: video, overlay or audio. Clips sit on tracks and stack by z-order.",
  keyframe: "A value for a property at one moment in time. The engine eases from one keyframe to the next.",
  scope: "What a key may do: read, write or admin. API keys are scoped; accounts have roles.",
  rig: "A poseable group of clips in the Animator: each part has a joint, an optional parent and its own keys.",
  easing: "The curve a property follows between two keyframes: linear, springy, bouncy and more.",
  expression: "A formula of time that drives a property live in the preview and compiles to FFmpeg.",
  "dope sheet": "The Animator's key list: one row per part, one column per moment in time.",
};

const RE = new RegExp(`\\b(${Object.keys(GLOSSARY).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");

/** Split text into plain and glossary-term runs; matched terms come back in the array. */
export function glossaryRuns(text: string): (string | { term: string })[] {
  const out: (string | { term: string })[] = [];
  let last = 0, m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ term: m[0] });
    last = m.index + m[0].length;
    if (m.index === RE.lastIndex) RE.lastIndex++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
