import type { DocPage, DocSection } from "./docs-content";

/**
 * Ranked search over the documentation. It looks at every section (not just page titles), needs every
 * word to match somewhere, forgives small typos, weighs titles above body text, and returns a short
 * snippet around the best match so people can see why a result came up.
 */

export type DocHit = {
  /** A page-level hit has no section. */
  slug: string;
  group: string;
  pageTitle: string;
  sectionId: string | null;
  sectionTitle: string | null;
  snippet: string;
  score: number;
};

export type DocResultPage = {
  slug: string;
  group: string;
  title: string;
  description: string;
  score: number;
  /** The best few sections of this page that matched. */
  hits: DocHit[];
};

export const sectionAnchor = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Strip the light markdown the docs use, so snippets and matching see plain words. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^- /gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const STOP = new Set(["to", "the", "a", "an", "of", "and", "or", "in", "on", "for", "is", "it", "how", "do", "i", "with", "my", "as", "at", "by"]);

/** The words a query is made of; a one-letter word is too noisy to count. */
export function queryTokens(query: string): string[] {
  const t = Array.from(new Set(words(query).filter((w) => w.length > 1 || /^\d$/.test(w))));
  // "apply to edit" is about apply and edit; filler words only count when nothing else was typed.
  const meaningful = t.filter((w) => !STOP.has(w));
  return meaningful.length ? meaningful : t;
}

/** Edit distance with an early exit, so fuzzy matching stays cheap across the whole docs. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** How well one query word matches a field's words: exact 1, starts-with .8, inside .5, typo .4, else 0. */
function wordMatch(token: string, fieldWords: string[], fieldText: string): number {
  let best = 0;
  for (const w of fieldWords) {
    if (w === token) return 1;
    if (w.startsWith(token)) best = Math.max(best, 0.8);
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 0.5);
    else if (best < 0.4 && token.length >= 4 && within(token, w, token.length >= 7 ? 2 : 1)) best = 0.4;
  }
  if (best === 0 && token.length >= 3 && fieldText.includes(token)) best = 0.5;
  return best;
}

type Field = { text: string; words: string[]; weight: number };
const field = (text: string, weight: number): Field => {
  const lower = text.toLowerCase();
  return { text: lower, words: words(lower), weight };
};

type Entry = {
  page: DocPage;
  section: DocSection | null;
  fields: Field[];
  /** Plain text the snippet is cut from, best candidates first. */
  sources: string[];
};

const entryCache = new WeakMap<readonly DocPage[], Entry[]>();

function buildEntries(pages: readonly DocPage[]): Entry[] {
  const cached = entryCache.get(pages);
  if (cached) return cached;
  const out: Entry[] = [];
  for (const page of pages) {
    out.push({
      page,
      section: null,
      fields: [field(page.title, 12), field(page.slug.replace(/-/g, " "), 11), field(page.description, 5), field(page.group, 2)],
      sources: [plain(page.description)],
    });
    for (const section of page.sections) {
      const body = plain(`${section.text} ${section.callouts?.map((c) => c.text).join(" ") ?? ""}`);
      const rows = (section.rows ?? []).map((r) => plain(r.join(" · ")));
      out.push({
        page,
        section,
        fields: [
          field(section.title, 8),
          field(page.title, 3),
          field(page.slug.replace(/-/g, " "), 3),
          field(body, 2),
          field(rows.join(" "), 2),
          field(section.code ?? "", 1.5),
        ],
        sources: [body, ...rows, section.code ?? ""],
      });
    }
  }
  entryCache.set(pages, out);
  return out;
}

/** A short run of text around the first place any query word shows up. */
export function snippetFor(sources: string[], tokens: string[], width = 150): string {
  for (const src of sources) {
    if (!src) continue;
    const lower = src.toLowerCase();
    let at = -1;
    for (const t of tokens) {
      const i = lower.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0) continue;
    const start = Math.max(0, at - 50);
    const cut = src.slice(start, start + width).trim();
    return `${start > 0 ? "…" : ""}${cut}${start + width < src.length ? "…" : ""}`;
  }
  const first = sources.find(Boolean) ?? "";
  return first.length > width ? `${first.slice(0, width).trim()}…` : first;
}

function scoreEntry(entry: Entry, tokens: string[], phrase: string): number {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const f of entry.fields) best = Math.max(best, wordMatch(token, f.words, f.text) * f.weight);
    if (best === 0) return 0;
    total += best;
  }
  // The whole phrase appearing together is a strong sign this is the right place.
  if (tokens.length > 1) {
    const joined = tokens.join(" ");
    for (const f of entry.fields) if (f.text.replace(/[^a-z0-9]+/g, " ").includes(joined)) { total += f.weight * 1.5; break; }
  } else if (phrase) {
    const t = tokens[0];
    const head = entry.fields[0];
    if (head.words.includes(t)) total += head.weight * 0.5;
  }
  return total;
}

export type SearchOptions = { group?: string | null; maxPages?: number; maxHitsPerPage?: number };

export function searchDocs(pages: readonly DocPage[], query: string, opts: SearchOptions = {}): DocResultPage[] {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const maxPages = opts.maxPages ?? 12, maxHits = opts.maxHitsPerPage ?? 3;
  const phrase = query.trim().toLowerCase();
  const byPage = new Map<string, DocResultPage>();
  for (const entry of buildEntries(pages)) {
    if (opts.group && entry.page.group !== opts.group) continue;
    const score = scoreEntry(entry, tokens, phrase);
    if (score <= 0) continue;
    const hit: DocHit = {
      slug: entry.page.slug,
      group: entry.page.group,
      pageTitle: entry.page.title,
      sectionId: entry.section ? sectionAnchor(entry.section.title) : null,
      sectionTitle: entry.section?.title ?? null,
      snippet: snippetFor(entry.sources, tokens),
      score,
    };
    let page = byPage.get(entry.page.slug);
    if (!page) {
      page = { slug: entry.page.slug, group: entry.page.group, title: entry.page.title, description: entry.page.description, score: 0, hits: [] };
      byPage.set(entry.page.slug, page);
    }
    page.hits.push(hit);
  }
  const results = Array.from(byPage.values());
  for (const p of results) {
    p.hits.sort((a, b) => b.score - a.score);
    // A page ranks by its best hit, with a small lift for several sections matching.
    p.score = p.hits[0].score + Math.min(p.hits.length - 1, 4) * 0.4;
    p.hits = p.hits.filter((h) => h.sectionId !== null).slice(0, maxHits);
  }
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, maxPages);
}

/** How many matching pages each group has, for the filter chips. */
export function countByGroup(pages: readonly DocPage[], query: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of searchDocs(pages, query, { maxPages: 1000 })) out[p.group] = (out[p.group] ?? 0) + 1;
  return out;
}

/** Split text into plain and highlighted runs for the words in the query. */
export function highlightRuns(text: string, tokens: string[]): Array<{ text: string; hit: boolean }> {
  const usable = tokens.filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!usable.length) return [{ text, hit: false }];
  // Splitting on a capturing group puts every match at an odd index.
  const parts = text.split(new RegExp(`\\b(${usable.join("|")})`, "gi"));
  return parts.map((t, i) => ({ text: t, hit: i % 2 === 1 })).filter((r) => r.text !== "");
}
