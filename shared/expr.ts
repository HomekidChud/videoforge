/**
 * Animation expressions: a tiny, safe expression language for animating with code.
 *
 *   x: "0.5 + 0.2 * sin(t * 3)"        orbit, bounce, wiggle, anything that is a function of time
 *
 * The same parsed tree is evaluated in the browser preview and compiled to an FFmpeg
 * expression, so both always agree. There are no statements, loops, strings, property
 * access or user functions, so an expression cannot touch anything outside its numbers.
 *
 * Variables: t (seconds since the clip started), d (clip duration), p (t / d, 0..1),
 * base (the property's static value), pi. Operators: + - * / % ^ and parentheses.
 */
export const EXPRESSION_LIMITS = { maxLength: 300, maxNodes: 160, maxDepth: 16 } as const;

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

export const EXPRESSION_VARIABLES = { t: "seconds since the clip started", d: "clip duration in seconds", p: "progress through the clip, 0..1", base: "the property's static value", pi: "3.14159…" } as const;
type Fn = { arity: number | [number, number]; eval: (a: number[]) => number; ff: (a: string[]) => string; doc: string };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const noiseJs = (x: number) => (Math.sin(x * 1.7) + Math.sin(x * 2.9 + 1.3) + Math.sin(x * 4.3 + 2.1)) / 3;
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);
/** Every function maps to plain FFmpeg expression functions, so previews and renders match. */
export const EXPRESSION_FUNCTIONS: Record<string, Fn> = {
  sin: { arity: 1, eval: ([a]) => Math.sin(a), ff: ([a]) => `sin(${a})`, doc: "sine, radians" },
  cos: { arity: 1, eval: ([a]) => Math.cos(a), ff: ([a]) => `cos(${a})`, doc: "cosine, radians" },
  tan: { arity: 1, eval: ([a]) => Math.tan(a), ff: ([a]) => `tan(${a})`, doc: "tangent" },
  atan: { arity: 1, eval: ([a]) => Math.atan(a), ff: ([a]) => `atan(${a})`, doc: "arctangent" },
  atan2: { arity: 2, eval: ([a, b]) => Math.atan2(a, b), ff: ([a, b]) => `atan2(${a},${b})`, doc: "two-argument arctangent" },
  abs: { arity: 1, eval: ([a]) => Math.abs(a), ff: ([a]) => `abs(${a})`, doc: "absolute value" },
  sqrt: { arity: 1, eval: ([a]) => Math.sqrt(a), ff: ([a]) => `sqrt(${a})`, doc: "square root" },
  pow: { arity: 2, eval: ([a, b]) => Math.pow(a, b), ff: ([a, b]) => `pow(${a},${b})`, doc: "a to the power b" },
  exp: { arity: 1, eval: ([a]) => Math.exp(a), ff: ([a]) => `exp(${a})`, doc: "e to the power a" },
  log: { arity: 1, eval: ([a]) => Math.log(a), ff: ([a]) => `log(${a})`, doc: "natural logarithm" },
  min: { arity: 2, eval: ([a, b]) => Math.min(a, b), ff: ([a, b]) => `min(${a},${b})`, doc: "smaller of two" },
  max: { arity: 2, eval: ([a, b]) => Math.max(a, b), ff: ([a, b]) => `max(${a},${b})`, doc: "larger of two" },
  clamp: { arity: 3, eval: ([a, lo, hi]) => Math.min(hi, Math.max(lo, a)), ff: ([a, lo, hi]) => `clip(${a},${lo},${hi})`, doc: "clamp(value, low, high)" },
  floor: { arity: 1, eval: ([a]) => Math.floor(a), ff: ([a]) => `floor(${a})`, doc: "round down" },
  ceil: { arity: 1, eval: ([a]) => Math.ceil(a), ff: ([a]) => `ceil(${a})`, doc: "round up" },
  round: { arity: 1, eval: ([a]) => Math.round(a), ff: ([a]) => `round(${a})`, doc: "round to nearest" },
  fract: { arity: 1, eval: ([a]) => a - Math.floor(a), ff: ([a]) => `(${a}-floor(${a}))`, doc: "fractional part, a sawtooth when fed time" },
  mod: { arity: 2, eval: ([a, b]) => a - b * Math.floor(a / b), ff: ([a, b]) => `mod(${a},${b})`, doc: "positive modulo, a sawtooth when fed time" },
  sign: { arity: 1, eval: ([a]) => sign(a), ff: ([a]) => `sgn(${a})`, doc: "-1, 0 or 1" },
  mix: { arity: 3, eval: ([a, b, k]) => a + (b - a) * k, ff: ([a, b, k]) => `((${a})+((${b})-(${a}))*(${k}))`, doc: "mix(a, b, k) blends from a to b" },
  step: { arity: 2, eval: ([edge, x]) => (x >= edge ? 1 : 0), ff: ([edge, x]) => `gte(${x},${edge})`, doc: "step(edge, x) is 0 before the edge and 1 after" },
  smoothstep: { arity: 3, eval: ([a, b, x]) => { const k = clamp01((x - a) / (b - a || 1)); return k * k * (3 - 2 * k); }, ff: ([a, b, x]) => { const k = `clip(((${x})-(${a}))/((${b})-(${a})),0,1)`; return `(${k}*${k}*(3-2*${k}))`; }, doc: "smoothstep(a, b, x) eases 0..1 between a and b" },
  easeIn: { arity: 1, eval: ([a]) => clamp01(a) ** 3, ff: ([a]) => `pow(clip(${a},0,1),3)`, doc: "cubic ease-in of a 0..1 value" },
  easeOut: { arity: 1, eval: ([a]) => 1 - (1 - clamp01(a)) ** 3, ff: ([a]) => `(1-pow(1-clip(${a},0,1),3))`, doc: "cubic ease-out of a 0..1 value" },
  easeInOut: { arity: 1, eval: ([a]) => { const k = clamp01(a); return k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; }, ff: ([a]) => { const k = `clip(${a},0,1)`; return `if(lt(${k},0.5),4*pow(${k},3),1-pow(-2*${k}+2,3)/2)`; }, doc: "cubic ease-in-out of a 0..1 value" },
  noise: { arity: 1, eval: ([a]) => noiseJs(a), ff: ([a]) => `((sin((${a})*1.7)+sin((${a})*2.9+1.3)+sin((${a})*4.3+2.1))/3)`, doc: "smooth deterministic noise, about -1..1" },
  tri: { arity: 1, eval: ([a]) => 1 - 4 * Math.abs((a - Math.floor(a)) - .5), ff: ([a]) => `(1-4*abs(((${a})-floor(${a}))-0.5))`, doc: "triangle wave, -1..1, period 1" },
  lt: { arity: 2, eval: ([a, b]) => (a < b ? 1 : 0), ff: ([a, b]) => `lt(${a},${b})`, doc: "1 when a < b" },
  lte: { arity: 2, eval: ([a, b]) => (a <= b ? 1 : 0), ff: ([a, b]) => `lte(${a},${b})`, doc: "1 when a <= b" },
  gt: { arity: 2, eval: ([a, b]) => (a > b ? 1 : 0), ff: ([a, b]) => `gt(${a},${b})`, doc: "1 when a > b" },
  gte: { arity: 2, eval: ([a, b]) => (a >= b ? 1 : 0), ff: ([a, b]) => `gte(${a},${b})`, doc: "1 when a >= b" },
  between: { arity: 3, eval: ([x, lo, hi]) => (x >= lo && x <= hi ? 1 : 0), ff: ([x, lo, hi]) => `between(${x},${lo},${hi})`, doc: "between(x, low, high) is 1 inside the range" },
  if: { arity: 3, eval: ([c, a, b]) => (c !== 0 ? a : b), ff: ([c, a, b]) => `if(${c},${a},${b})`, doc: "if(condition, then, else)" },
};
// wiggle(frequency, amount) is parser sugar for noise(t * frequency) * amount, so there is one implementation.

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
class Parser {
  i = 0; nodes = 0;
  constructor(private src: string) {}
  fail(msg: string): never { throw new Error(`expression: ${msg} (at character ${this.i + 1})`); }
  ws() { while (/\s/.test(this.src[this.i] ?? "")) this.i++; }
  peek() { this.ws(); return this.src[this.i]; }
  node<T extends Node>(n: T): T { if (++this.nodes > EXPRESSION_LIMITS.maxNodes) this.fail("too long, simplify it"); return n; }
  parse(): Node { const n = this.add(0); if (this.peek() !== undefined) this.fail(`unexpected "${this.src[this.i]}"`); return n; }
  add(depth: number): Node {
    if (depth > EXPRESSION_LIMITS.maxDepth) this.fail("nested too deeply");
    let a = this.mul(depth);
    for (let c = this.peek(); c === "+" || c === "-"; c = this.peek()) { this.i++; a = this.node({ k: "bin", op: c, a, b: this.mul(depth) }); }
    return a;
  }
  mul(depth: number): Node {
    let a = this.unary(depth);
    for (let c = this.peek(); c === "*" || c === "/" || c === "%"; c = this.peek()) { this.i++; a = this.node({ k: "bin", op: c, a, b: this.unary(depth) }); }
    return a;
  }
  unary(depth: number): Node {
    const c = this.peek();
    if (c === "-") { this.i++; return this.node({ k: "neg", a: this.unary(depth + 1) }); }
    if (c === "+") { this.i++; return this.unary(depth + 1); }
    return this.pow(depth);
  }
  pow(depth: number): Node {
    const a = this.atom(depth);
    if (this.peek() === "^") { this.i++; return this.node({ k: "bin", op: "^", a, b: this.unary(depth + 1) }); }
    return a;
  }
  atom(depth: number): Node {
    const c = this.peek();
    if (c === undefined) this.fail("unexpected end");
    if (c === "(") { this.i++; const n = this.add(depth + 1); if (this.peek() !== ")") this.fail("missing )"); this.i++; return n; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(this.src.slice(this.i));
    if (num) { this.i += num[0].length; return this.node({ k: "num", v: Number(num[0]) }); }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.i));
    if (!id) this.fail(`unexpected "${c}"`);
    const name = id[0]; this.i += name.length;
    if (this.peek() === "(") {
      this.i++; const args: Node[] = [];
      if (this.peek() !== ")") for (;;) { args.push(this.add(depth + 1)); if (this.peek() === ",") { this.i++; continue; } break; }
      if (this.peek() !== ")") this.fail("missing )");
      this.i++;
      if (name === "wiggle") {
        if (args.length !== 2) this.fail("wiggle takes (frequency, amount)");
        return this.node({ k: "bin", op: "*", a: this.node({ k: "call", name: "noise", args: [this.node({ k: "bin", op: "*", a: this.node({ k: "var", name: "t" }), b: args[0] })] }), b: args[1] });
      }
      const fn = own(EXPRESSION_FUNCTIONS, name) ? EXPRESSION_FUNCTIONS[name] : undefined;
      if (!fn) this.fail(`unknown function "${name}"`);
      if (args.length !== fn.arity) this.fail(`${name} takes ${fn.arity} argument${fn.arity === 1 ? "" : "s"}`);
      return this.node({ k: "call", name, args });
    }
    if (!own(EXPRESSION_VARIABLES, name)) this.fail(`unknown name "${name}" (variables: ${Object.keys(EXPRESSION_VARIABLES).join(", ")})`);
    return this.node({ k: "var", name });
  }
}
const cache = new Map<string, Node>();
export function parseExpression(src: string): Node {
  if (typeof src !== "string" || !src.trim()) throw new Error("expression must not be empty");
  if (src.length > EXPRESSION_LIMITS.maxLength) throw new Error(`expression is limited to ${EXPRESSION_LIMITS.maxLength} characters`);
  const hit = cache.get(src); if (hit) return hit;
  const node = new Parser(src).parse();
  if (cache.size > 500) cache.clear();
  cache.set(src, node); return node;
}
/** Throws a readable message for invalid code; returns the trimmed text for valid code. */
export function validateExpression(src: unknown): string {
  if (typeof src !== "string") throw new Error("expression must be a string");
  parseExpression(src);
  // Some helpers repeat their arguments in FFmpeg, so deeply nested ones can grow quickly.
  if (expressionToFfmpeg(src, { clock: "t", duration: 1, base: 0 }).length > 4000) throw new Error("expression is too complex, simplify it");
  return src.trim();
}

export type ExprScope = { t: number; d: number; base: number };
const run = (n: Node, s: ExprScope): number => {
  switch (n.k) {
    case "num": return n.v;
    case "var": return n.name === "t" ? s.t : n.name === "d" ? s.d : n.name === "p" ? (s.d > 0 ? s.t / s.d : 0) : n.name === "base" ? s.base : Math.PI;
    case "neg": return -run(n.a, s);
    case "bin": { const a = run(n.a, s), b = run(n.b, s); return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : n.op === "%" ? EXPRESSION_FUNCTIONS.mod.eval([a, b]) : Math.pow(a, b); }
    case "call": return EXPRESSION_FUNCTIONS[n.name].eval(n.args.map(a => run(a, s)));
  }
};
/** Evaluates at a time. Non-finite results (division by zero, log of a negative) fall back to base; FFmpeg gets the same guard. */
export function evaluateExpression(src: string, scope: ExprScope): number {
  const v = run(parseExpression(src), scope); return Number.isFinite(v) ? v : scope.base;
}
const fmt = (n: number) => String(Number(n.toFixed(6)));
/** FFmpeg expression text. `clock` is the local clip time expression, e.g. (t-1.5). */
export function expressionToFfmpeg(src: string, scope: { clock: string; duration: number; base: number }): string {
  const go = (n: Node): string => {
    switch (n.k) {
      case "num": return fmt(n.v);
      case "var": return n.name === "t" ? `(${scope.clock})` : n.name === "d" ? fmt(scope.duration) : n.name === "p" ? `((${scope.clock})/${fmt(Math.max(.001, scope.duration))})` : n.name === "base" ? fmt(scope.base) : "PI";
      case "neg": return `(-${go(n.a)})`;
      case "bin": return n.op === "^" ? `pow(${go(n.a)},${go(n.b)})` : n.op === "%" ? EXPRESSION_FUNCTIONS.mod.ff([go(n.a), go(n.b)]) : `(${go(n.a)}${n.op}${go(n.b)})`;
      case "call": return EXPRESSION_FUNCTIONS[n.name].ff(n.args.map(go));
    }
  };
  return go(parseExpression(src));
}

/** Named looping behaviours. Each returns expressions that read `base`, so they work from any position. */
export const CODE_RECIPES = [
  { id: "float", label: "Float", description: "Gentle vertical bob", build: (s: number, k: number) => ({ y: `base + ${0.015 * k} * sin(t * ${2 * s})` }) },
  { id: "sway", label: "Sway", description: "Slow side-to-side drift", build: (s: number, k: number) => ({ x: `base + ${0.02 * k} * sin(t * ${1.5 * s})`, rotation: `base + ${3 * k} * sin(t * ${1.5 * s})` }) },
  { id: "breathe", label: "Breathe", description: "Soft scale in and out", build: (s: number, k: number) => ({ scale: `base * (1 + ${0.04 * k} * sin(t * ${2 * s}))` }) },
  { id: "heartbeat", label: "Heartbeat", description: "Double-thump pulse", build: (s: number, k: number) => ({ scale: `base * (1 + ${0.08 * k} * (pow(max(0, sin(t * ${6 * s})), 8) + 0.6 * pow(max(0, sin(t * ${6 * s} - 1.1)), 8)))` }) },
  { id: "wiggle", label: "Wiggle", description: "Organic random-feeling jitter", build: (s: number, k: number) => ({ x: `base + wiggle(${3 * s}, ${0.012 * k})`, y: `base + wiggle(${3.7 * s}, ${0.012 * k})`, rotation: `base + wiggle(${2.3 * s}, ${2 * k})` }) },
  { id: "orbit", label: "Orbit", description: "Circle around its position", build: (s: number, k: number) => ({ x: `base + ${0.05 * k} * cos(t * ${2.2 * s})`, y: `base + ${0.08 * k} * sin(t * ${2.2 * s})` }) },
  { id: "spin", label: "Spin", description: "Continuous rotation", build: (s: number, k: number) => ({ rotation: `clamp(base + t * ${60 * s * k}, -360, 360)` }) },
  { id: "pendulum", label: "Pendulum", description: "Swing back and forth", build: (s: number, k: number) => ({ rotation: `base + ${18 * k} * sin(t * ${3 * s}) * exp(-t * 0.35)` }) },
  { id: "bounce", label: "Bounce", description: "Repeated hops that never sink below the start", build: (s: number, k: number) => ({ y: `base - ${0.09 * k} * abs(sin(t * ${3.2 * s}))` }) },
  { id: "flicker", label: "Flicker", description: "Neon-sign opacity flicker", build: (s: number, k: number) => ({ opacity: `clamp(base * (0.8 + ${0.2 * k} * noise(t * ${14 * s}) + 0.1 * gt(noise(t * ${31 * s}), 0.6)), 0, 1)` }) },
  { id: "pulse-glow", label: "Pulse glow", description: "Opacity breathes between soft and full", build: (s: number, k: number) => ({ opacity: `clamp(base * (1 - ${0.3 * Math.min(1, k)} * (0.5 - 0.5 * sin(t * ${3 * s}))), 0, 1)` }) },
  { id: "drift-loop", label: "Drift", description: "Slow ping-pong pan", build: (s: number, k: number) => ({ x: `base + ${0.08 * k} * tri(t * ${0.25 * s})` }) },
  { id: "glitch", label: "Glitch", description: "Brief horizontal jumps with flicker", build: (s: number, k: number) => ({ x: `base + ${0.03 * k} * gt(noise(t * ${18 * s}), 0.55) * sign(noise(t * ${7 * s}))`, opacity: `base * (1 - 0.35 * gt(noise(t * ${23 * s} + 4), 0.6))` }) },
] as const;
export function codeRecipe(id: string, speed = 1, strength = 1): Record<string, string> {
  const r = CODE_RECIPES.find(x => x.id === id); if (!r) throw new Error(`unknown code recipe ${id}`);
  if (!Number.isFinite(speed) || speed < .1 || speed > 5) throw new Error("recipe speed must be 0.1..5");
  if (!Number.isFinite(strength) || strength < .1 || strength > 3) throw new Error("recipe strength must be 0.1..3");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.build(speed, strength))) out[k] = String(v).replace(/\s+/g, " ").trim();
  return out;
}
