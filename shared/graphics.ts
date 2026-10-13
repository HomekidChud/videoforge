/** Asset-free primitives. Dimensions are canvas fractions; stroke/radius are output pixels. */
export const SHAPE_TYPES = ["rectangle", "ellipse", "line"] as const;
export type Shape = { type: typeof SHAPE_TYPES[number]; width: number; height: number; fill: string; stroke: string; strokeWidth: number; radius: number };
export function normalizeShape(raw: unknown): Shape | undefined {
  if (raw == null) return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s !== "object" || Array.isArray(s) || !SHAPE_TYPES.includes(s.type as Shape["type"])) throw new Error("shape.type must be rectangle, ellipse, or line");
  const fields = ["type","width","height","fill","stroke","strokeWidth","radius"];
  if (Object.keys(s).some(k=>!fields.includes(k))) throw new Error("unknown shape field");
  const n = (key: string, fallback: number, min: number, max: number) => {
    if (s[key] === undefined) return fallback;
    if (typeof s[key] !== "number" || !Number.isFinite(s[key]) || (s[key] as number) < min || (s[key] as number) > max) throw new Error(`shape.${key} must be ${min}..${max}`);
    return s[key] as number;
  };
  const color = (key: string, fallback: string) => {
    const v = s[key] ?? fallback;
    if (v !== "transparent" && (typeof v !== "string" || !/^#[a-f0-9]{6}$/i.test(v))) throw new Error(`shape.${key} must be #rrggbb or transparent`);
    return String(v).toLowerCase();
  };
  return { type: s.type as Shape["type"], width: n("width", .35, .01, 1), height: n("height", s.type === "line" ? .01 : .2, .002, 1), fill: color("fill", "#f6a447"), stroke: color("stroke", "transparent"), strokeWidth: n("strokeWidth", 0, 0, 40), radius: n("radius", 0, 0, 200) };
}
export const MOTION_TEMPLATES = [
  { id: "lower-third", label: "Lower third", description: "Animated nameplate with a supporting subtitle." },
  { id: "title-card", label: "Title card", description: "A centered headline, accent rule and supporting copy." },
  { id: "callout", label: "Callout", description: "An animated badge with a short message." },
  { id: "kinetic-type", label: "Kinetic type", description: "Words arrive in sequence with staggered motion." },
  { id: "countdown", label: "Countdown", description: "A sequence of numbered beats with a final message." },
] as const;
/** Templates compile to normal, independently editable clips, never arbitrary code. */
export function templateClips(args: Record<string, any>, id: () => string, aspect = 16/9): Record<string, any>[] {
  if (!MOTION_TEMPLATES.some(t => t.id === args.template)) throw new Error("unknown motion template");
  const duration = args.duration ?? 4, start = args.start ?? 0;
  if (!Number.isFinite(duration) || duration < .5 || duration > 60) throw new Error("template duration must be 0.5..60 seconds");
  if (!Number.isFinite(start) || start < 0 || start > 86400) throw new Error("template start must be 0..86400");
  const color = args.color ?? "#f6a447";
  normalizeShape({ type: "rectangle", fill: color });
  const title = String(args.title ?? "Make your next move").trim().slice(0, 120);
  const subtitle = String(args.subtitle ?? "Created with VideoForge").trim().slice(0, 120);
  if (!title) throw new Error("template title must not be empty");
  if (args.template === "kinetic-type" && title.split(/\s+/).length > 8) throw new Error("kinetic-type accepts up to 8 words");
  const intro = Math.min(.5, duration / 4), outro = Math.min(.3, duration / 5);
  const base = (label: string, at = start, length = duration) => ({ id: id(), assetId: "", track: "overlay", start: at, inPoint: 0, outPoint: length, volume: 0, muted: true, label, fadeIn: Math.min(intro, length / 4), fadeOut: Math.min(outro, length / 4) });
  const text = (value: string, y: number, size: number, at = start, length = duration) => ({
    ...base(value, at, length), text: value, x: .5, y, textSize: Math.max(1,Math.min(size,.65*aspect*100/Math.max(1,Array.from(value).length*.75))),
    keyframes: { y: [{ time: 0, value: Math.min(1, y + .08), easing: "ease-out" }, { time: Math.min(intro, length / 3), value: y }] },
  });
  const plate = (y: number, width: number, height: number) => ({
    ...base(`${args.template} plate`), x: .5, y,
    shape: { type: "rectangle", width, height, fill: color, radius: args.template === "callout" ? 32 : 8 },
    keyframes: { scale: [{ time: 0, value: .8, easing: "back-out" }, { time: intro, value: 1 }] },
  });
  switch (args.template) {
    case "lower-third": return [plate(.79, .7, .2), { ...text(title, .76, 6), textColor: "#111112" }, ...(subtitle ? [{ ...text(subtitle, .83, 3), textColor: "#111112" }] : [])];
    case "title-card": return [plate(.59, .28, .009), text(title, .45, 10), ...(subtitle ? [text(subtitle, .69, 4)] : [])];
    case "callout": return [plate(.5, .65, .24), { ...text(title, .5, 6), textColor: "#111112" }];
    case "kinetic-type": {
      const words = title.split(/\s+/), step = duration * .45 / words.length;
      const lengths=words.map(w=>Array.from(w).length),total=lengths.reduce((a,b)=>a+b+1,0);
      return words.map((word, i) => ({ ...text(word, .5, 8, start + i * step, duration - i * step),
        x: .1 + .8*(lengths.slice(0,i).reduce((a,b)=>a+b+1,0)+lengths[i]/2)/total,
        textColor: color, textSize: Math.max(1, Math.min(8, .8*aspect*100/(total*.75))) }));
    }
    case "countdown": {
      const step = duration / 4;
      return ["3", "2", "1", title].map((word, i) => ({ ...text(word, .5, i === 3 ? 7 : 18, start + i * step, step), textColor: color }));
    }
  }
  return [];
}
export const GRAPHICS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema", title: "VideoForge motion graphics", type: "object", required: ["type"], additionalProperties: false,
  properties: {
    type: { enum: SHAPE_TYPES },
    width: { type: "number", minimum: .01, maximum: 1, default: .35 },
    height: { type: "number", minimum: .002, maximum: 1, default: .2 },
    fill: { type: "string", pattern: "^(#[a-fA-F0-9]{6}|transparent)$", default: "#f6a447" },
    stroke: { type: "string", pattern: "^(#[a-fA-F0-9]{6}|transparent)$", default: "transparent" },
    strokeWidth: { type: "number", minimum: 0, maximum: 40, default: 0 },
    radius: { type: "number", minimum: 0, maximum: 200, default: 0 },
  },
};
