import { textAdvance } from "./textmetrics";
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
  { id: "quote-card", label: "Quote card", description: "A large quotation mark, the quote and an attribution rule." },
  { id: "split-reveal", label: "Split reveal", description: "Two accent rules wipe open around a rising headline." },
  { id: "progress-bar", label: "Progress bar", description: "A rounded track fills with a headline above and caption below." },
  { id: "stat-highlight", label: "Stat highlight", description: "A big number inside a springing accent ring with a caption." },
  { id: "bullet-list", label: "Bullet list", description: "A headline with up to six points that slide in one by one." },
  { id: "social-handle", label: "Social handle", description: "A rounded pill with a handle and a short call to action." },
  { id: "chapter-number", label: "Chapter number", description: "A huge chapter number, a rule and the chapter title." },
  { id: "starburst", label: "Starburst badge", description: "A rocking two-square burst with a short label, driven by code." },
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
    case "lower-third": return [plate(.79, .7, .2), { ...text(title, .76, 6), font: "inter", fontWeight: 700, textColor: "#111112" }, ...(subtitle ? [{ ...text(subtitle, .83, 3), font: "inter", textColor: "#111112" }] : [])];
    case "title-card": return [plate(.59, .28, .009), { ...text(title, .45, 10), font: "playfair-display", fontWeight: 700 }, ...(subtitle ? [{ ...text(subtitle, .69, 4), font: "playfair-display" }] : [])];
    case "callout": return [plate(.5, .65, .24), { ...text(title, .5, 6), font: "poppins", fontWeight: 700, textColor: "#111112" }];
    case "kinetic-type": {
      const words = title.split(/\s+/), step = duration * .45 / words.length;
      const lengths=words.map(w=>Array.from(w).length),total=lengths.reduce((a,b)=>a+b+1,0);
      return words.map((word, i) => ({ ...text(word, .5, 8, start + i * step, duration - i * step),
        x: .1 + .8*(lengths.slice(0,i).reduce((a,b)=>a+b+1,0)+lengths[i]/2)/total,
        textColor: color, textSize: Math.max(1, Math.min(8, .8*aspect*100/(total*.75))) }));
    }
    case "quote-card": {
      const mark = { ...text("\u201C", .3, 20), font: "playfair-display", textColor: color, keyframes: { scale: [{ time: 0, value: .4, easing: "back-out" }, { time: intro, value: 1 }], opacity: [{ time: 0, value: 0 }, { time: intro, value: 1 }] }, y: .3 };
      return [mark, { ...text(title, .5, 6), font: "lora", lineHeight: 1.5 }, plate(.6, .12, .006), ...(subtitle ? [{ ...text(subtitle, .68, 3.5), font: "lora", textColor: color }] : [])];
    }
    case "split-reveal": {
      const rule = (y: number) => ({ ...base(`split rule ${y}`), x: .5, y, shape: { type: "rectangle", width: .64, height: .008, fill: color },
        keyframes: { reveal: [{ time: 0, value: 0, easing: "snappy" }, { time: Math.min(.7, duration / 2), value: 1 }] } });
      return [rule(.36), rule(.64), { ...text(title, .5, 9, start + Math.min(.25, duration / 8), duration - Math.min(.25, duration / 8)), font: "fjalla-one" }, ...(subtitle ? [{ ...text(subtitle, .72, 3.5, start + Math.min(.45, duration / 5), duration - Math.min(.45, duration / 5)), font: "fjalla-one" }] : [])];
    }
    case "progress-bar": {
      const fill = Math.min(duration * .8, duration - .1);
      const track = { ...base("progress track"), x: .5, y: .5, shape: { type: "rectangle", width: .6, height: .035, fill: "#2a2a2e", radius: 100 } };
      const bar = { ...base("progress fill"), x: .5, y: .5, shape: { type: "rectangle", width: .6, height: .035, fill: color, radius: 100 },
        keyframes: { reveal: [{ time: 0, value: 0, easing: "ease-in-out" }, { time: fill, value: 1 }] } };
      return [track, bar, { ...text(title, .4, 7), font: "montserrat", fontWeight: 700 }, ...(subtitle ? [{ ...text(subtitle, .6, 3.5), font: "montserrat" }] : [])];
    }
    case "stat-highlight": {
      let width = .56 / aspect, tall = .56;
      if (width > .8) { width = .8; tall = .8 * aspect; }
      const ring = { ...base("stat ring"), x: .5, y: .46, shape: { type: "ellipse", width, height: tall, fill: "transparent", stroke: color, strokeWidth: 10 },
        keyframes: { scale: [{ time: 0, value: .5, easing: "back-out" }, { time: Math.min(.7, duration / 2), value: 1 }] } };
      return [ring, { ...text(title, .46, 12), textColor: color, keyframes: { scale: [{ time: 0, value: .6, easing: "back-out" }, { time: intro, value: 1 }], opacity: [{ time: 0, value: 0 }, { time: intro, value: 1 }] }, y: .46 }, ...(subtitle ? [{ ...text(subtitle, .86, 4), font: "oswald" }] : [])];
    }
    case "bullet-list": {
      const items: string[] = Array.isArray(args.items) ? args.items.map((x: unknown) => String(x).trim().slice(0, 80)).filter(Boolean) : ["Fast", "Flexible", "Free"];
      if (!items.length || items.length > 6) throw new Error("bullet-list takes 1..6 items");
      const size = 5, gap = Math.min(.1, .52 / items.length), top = .5 - gap * (items.length - 1) / 2 + .08;
      const rows = items.flatMap((item, i) => {
        const at = start + Math.min(.3 + i * .25, duration / 2), length = duration - (at - start), y = top + i * gap;
        const widthFraction = Math.min(.55, textAdvance(item) / 1.12 * size / 100 / aspect);
        const dotW = .016;
        return [
          { ...base(`bullet ${i + 1}`, at, length), x: .31, y, shape: { type: "ellipse", width: dotW, height: dotW * aspect, fill: color }, keyframes: { scale: [{ time: 0, value: .1, easing: "back-out" }, { time: Math.min(.35, length), value: 1 }] } },
          { ...text(item, y, size, at, length), x: .34 + widthFraction / 2, keyframes: { x: [{ time: 0, value: .31, easing: "ease-out" }, { time: Math.min(.4, length), value: .34 + widthFraction / 2 }], opacity: [{ time: 0, value: 0 }, { time: Math.min(.3, length), value: 1 }] } },
        ];
      });
      return [{ ...text(title, top - .2, 7), font: "work-sans", fontWeight: 700, textColor: color }, plate(top - .13, .22, .007), ...rows];
    }
    case "social-handle": {
      const widthFraction = Math.min(.8, Math.max(.2, textAdvance(title) * 5 / 100 / aspect + .1));
      return [
        { ...base("handle pill"), x: .5, y: .5, shape: { type: "rectangle", width: widthFraction, height: .13, fill: color, radius: 80 }, keyframes: { reveal: [{ time: 0, value: 0, easing: "snappy" }, { time: Math.min(.6, duration / 3), value: 1 }] } },
        { ...text(title, .5, 5), font: "poppins", fontWeight: 700, textColor: "#111112", keyframes: { opacity: [{ time: 0, value: 0 }, { time: Math.min(.5, duration / 3), value: 0 }, { time: Math.min(.8, duration / 2), value: 1 }] } },
        ...(subtitle ? [{ ...text(subtitle, .66, 3.5, start + Math.min(.5, duration / 4), duration - Math.min(.5, duration / 4)), font: "poppins" }] : []),
      ];
    }
    case "chapter-number": {
      const number = String(args.number ?? "01").trim().slice(0, 4) || "01";
      return [
        { ...text(number, .38, 24), font: "anton", textColor: color, keyframes: { scale: [{ time: 0, value: .7, easing: "snappy" }, { time: Math.min(.7, duration / 2), value: 1 }], opacity: [{ time: 0, value: 0 }, { time: intro, value: 1 }] }, y: .38 },
        plate(.56, .1, .006),
        { ...text(title, .66, 7, start + Math.min(.3, duration / 6), duration - Math.min(.3, duration / 6)), font: "cinzel" },
        ...(subtitle ? [{ ...text(subtitle, .76, 3.5, start + Math.min(.5, duration / 4), duration - Math.min(.5, duration / 4)), font: "cinzel" }] : []),
      ];
    }
    case "starburst": {
      const sq = (rot: number, fill: string, id: string) => ({ ...base(id), x: .5, y: .5, rotation: rot, shape: { type: "rectangle", width: Math.min(.3, .3 / aspect), height: .3, fill, radius: 6 },
        keyframes: { scale: [{ time: 0, value: .2, easing: "back-out" }, { time: Math.min(.6, duration / 3), value: 1 }] }, expressions: { rotation: `clamp(base + 10 * sin(t * 1.8), -360, 360)` } });
      return [sq(0, color, "burst back"), sq(45, "#ffffff", "burst front"), { ...text(title, .5, 7), font: "bungee", textColor: "#111112", keyframes: { scale: [{ time: 0, value: .3, easing: "back-out" }, { time: Math.min(.6, duration / 3), value: 1 }] } }];
    }
    case "countdown": {
      const step = duration / 4;
      return ["3", "2", "1", title].map((word, i) => ({ ...text(word, .5, i === 3 ? 7 : 18, start + i * step, step), font: "bebas-neue", textColor: color }));
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
