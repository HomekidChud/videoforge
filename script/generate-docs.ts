// Generates client/src/lib/docs-generated.ts from the markdown files in docs/.
// Docs content lives in docs/*.md so contributors can edit it without touching app code.
// Run with: npm run docs  (also runs as part of npm run check and npm run build)
import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { capabilities } from "../shared/capabilities";
import { MOTION_TEMPLATES } from "../shared/graphics";
import { MOTION_PRESETS, presetGroup } from "../shared/presets";
import { CODE_RECIPES, EXPRESSION_FUNCTIONS } from "../shared/expr";
import { EXAMPLES } from "../shared/examples";
import { TRANSITIONS, TRANSITION_LABELS } from "../shared/transitions";
import { SHORTCUTS } from "../shared/shortcuts";
export const DOC_ENDPOINTS = [
  ["GET","/api/health","Public health check."],["GET","/api/auth/me","Check your key and scope."],
  ["GET","/api/capabilities","Operation, property and preset discovery."],
  ["GET","/api/graphics/schema","JSON Schema for shape primitives."],["GET","/api/motion/templates","List motion graphics templates."],
  ["GET / POST","/api/keys","Admin: list or generate scoped keys."],["DELETE","/api/keys/:id","Admin: revoke a key."],
  ["POST","/api/media/upload","Multipart upload; repeat the files field."],["GET","/api/media","List accessible assets."],
  ["GET / DELETE","/api/media/:id","Read metadata or delete an asset."],["GET","/api/media/:id/raw","Stream original media."],["GET","/api/media/:id/thumb","JPEG thumbnail."],["GET","/api/media/:id/waveform","Peak-envelope data."],
  ["GET / POST","/api/projects","List projects or create with {name,timeline}."],["GET / PUT / DELETE","/api/projects/:id","Read, replace/rename, or delete a project."],
  ["POST","/api/projects/:id/duplicate","Duplicate a project."],["POST","/api/projects/:id/timeline/ops","Atomic operations; dryRun and expectedUpdatedAt supported."],
  ["POST","/api/projects/:id/timeline/validate","Check and normalize {timeline}, without saving."],["GET","/api/projects/:id/state?t=1.5","Animated state at timeline time t."],
  ["GET","/api/projects/:id/frame?t=1.5&width=640","PNG composed frame."],["GET","/api/projects/:id/storyboard?count=6","PNG contact sheet."],
  ["POST","/api/projects/:id/presence","Live playhead, cursor and selection."],["GET","/api/projects/:id/activity","Recent project edits."],
  ["GET / POST","/api/renders","List render jobs or enqueue with {projectId}."],["GET","/api/renders/:id","Poll render status and progress."],["GET","/api/renders/:id/download","Download a finished MP4."],
  ["GET","/api/live","Admin: view live projects."],["GET","/api/live/:id","Admin: watch an unsaved edit."],
];


export type DocTask = { text: string; status: "todo" | "doing" | "done"; priority?: "High" | "Medium" | "Low" };
export type DocSection = { title: string; text: string; callouts?: { kind: "note" | "tip" | "warning"; text: string }[]; code?: string; language?: string; rows?: string[][]; links?: { label: string; slug: string }[]; tasks?: DocTask[]; taskStats?: { done: number; doing: number; todo: number }; video?: string };
export type DocPage = { slug: string; group: string; title: string; description: string; sections: DocSection[]; updated?: string; added?: string; gitUpdated?: string; taskStats?: { done: number; doing: number; todo: number } };

/** Tables that must always match the code: generated from the shared catalogs. */
const AUTO_ROWS: Record<string, () => string[][]> = {
  endpoints: () => DOC_ENDPOINTS.map((r) => [...r]),
  ops: () => Object.entries(capabilities().ops).map(([k, v]) => [k, v]),
  templates: () => MOTION_TEMPLATES.map((t) => [t.id, t.description]),
  animatable: () => Object.entries(capabilities().animatableProperties).map(([k, v]) => [k, `${v.min}..${v.max}`]),
  presets: () => MOTION_PRESETS.map((p) => [p.id, presetGroup(p.id), p.description]),
  functions: () => [...Object.entries(EXPRESSION_FUNCTIONS).map(([k, v]) => [k, v.doc]), ["wiggle", "wiggle(frequency, amount) is smooth noise over time"]],
  recipes: () => CODE_RECIPES.map((r) => [r.id, r.description]),
  transitions: () => TRANSITIONS.map((t) => [t, TRANSITION_LABELS[t]]),
  shortcuts: () => SHORTCUTS.map((k) => [k.keys.join(" + "), `${k.label} (${k.group.toLowerCase()})`]),
  examples: () => EXAMPLES.map((e) => [e.id, `${e.summary} (${e.features.join(", ")})`]),
};

const cell = (raw: string) => raw.replace(/^ | $/g, "");

function splitRow(line: string): string[] {
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map(cell);
}

/** A task line: `- [ ] to do`, `- [~] in progress`, `- [x] done`, with an optional `**High.**` priority prefix. */
const taskOf = (line: string): { status: "todo" | "doing" | "done"; text: string } | null => {
  const m = line.match(/^- \[( |x|~)\]\s+(.*)$/);
  if (!m) return null;
  return { status: m[1] === "x" ? "done" : m[1] === "~" ? "doing" : "todo", text: m[2].trim() };
};
const parseTask = (raw: string): DocTask => {
  const p = raw.match(/^\*\*(High|Medium|Low)\.\*\*\s*/);
  return { status: "todo", text: p ? raw.slice(p[0].length) : raw, ...(p ? { priority: p[1] as DocTask["priority"] } : {}) };
};
const statsOf = (tasks: DocTask[]) => ({ done: tasks.filter((t) => t.status === "done").length, doing: tasks.filter((t) => t.status === "doing").length, todo: tasks.filter((t) => t.status === "todo").length });
const sectionStats = (page: DocPage) => statsOf(page.sections.flatMap((s) => s.tasks ?? []));

/** Parse one markdown document into a DocPage. Throws readable errors for malformed input. */
export function parseDocPage(slug: string, md: string): DocPage {
  const lines = md.replace(/\r/g, "").split("\n");
  if (lines[0]?.trim() !== "---") throw new Error(`${slug}.md: expected frontmatter to start with ---`);
  const fmEnd = lines.indexOf("---", 1);
  if (fmEnd < 0) throw new Error(`${slug}.md: unterminated frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of lines.slice(1, fmEnd)) {
    const m = line.match(/^([a-z]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  for (const key of ["title", "group", "description"]) if (!fm[key]) throw new Error(`${slug}.md: frontmatter is missing ${key}`);

  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (current && paragraph.length) {
      // Prose lines join into one paragraph; "- item" lines stay one per line. Pieces are split by a blank line.
      const pieces: string[] = []; let prose: string[] = [], items: string[] = [], tasks: { status: "todo" | "doing" | "done"; text: string }[] = [];
      const endProse = () => { if (prose.length) pieces.push(prose.join(" ")); prose = []; };
      const endItems = () => { if (items.length) pieces.push(items.join("\n")); items = []; };
      const endTasks = () => { if (tasks.length) { current!.tasks = [...(current!.tasks ?? []), ...tasks.map((t) => ({ ...parseTask(t.text), status: t.status }))]; tasks = []; } };
      for (const l of paragraph) {
        const t = taskOf(l);
        if (t) { endProse(); endItems(); tasks.push(t); }
        else if (tasks.length && !/^- /.test(l)) { tasks[tasks.length - 1].text += ` ${l}`; }
        else if (/^- /.test(l)) { endProse(); items.push(l); }
        else if (items.length && !/^- /.test(l)) { items[items.length - 1] += ` ${l}`; }
        else prose.push(l);
      }
      endProse(); endItems(); endTasks();
      const text = pieces.join("\n\n").trim();
      if (text) current.text = current.text ? `${current.text}\n\n${text}` : text;
      paragraph = [];
    }
  };
  const newSection = (title: string) => {
    flushParagraph();
    if (current) sections.push(current);
    current = { title: title.trim(), text: "" };
  };

  let i = fmEnd + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      newSection(line.slice(3));
      i++;
    } else if (line.startsWith("```")) {
      flushParagraph();
      const language = line.slice(3).trim();
      const close = lines.indexOf("```", i + 1);
      if (close < 0) throw new Error(`${slug}.md: unterminated code block in section "${current?.title}"`);
      const code = lines.slice(i + 1, close).join("\n");
      if (!current) throw new Error(`${slug}.md: code block before any section heading`);
      // "json" is the docs UI default label, so omit it; keep upper-case labels otherwise.
      if (language && language.toLowerCase() !== "json") current.language = language.toUpperCase();
      current.code = code;
      i = close + 1;
    } else if (line.startsWith("|")) {
      flushParagraph();
      if (!current) throw new Error(`${slug}.md: table before any section heading`);
      const table: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) table.push(lines[i++]);
      const rows = table.map(splitRow);
      if (rows.length < 2 || !rows[1].every((c) => /^:?-{3,}:?$/.test(c))) throw new Error(`${slug}.md: table in "${current.title}" needs a header row and a --- separator`);
      const header = rows[0], body: string[][] = [];
      for (const r of rows.slice(2)) {
        if (r.length === 1 && /^\{\{auto:[a-z]+\}\}$/.test(r[0])) {
          const name = r[0].slice(7, -2);
          const make = AUTO_ROWS[name];
          if (!make) throw new Error(`${slug}.md: unknown marker {{auto:${name}}}`);
          for (const auto of make()) body.push(auto);
        } else {
          // Cells may contain literal pipes; rejoin the overflow instead of failing.
          if (r.length > header.length) {
            const extras = r.splice(header.length);
            r[header.length - 1] += extras.map((e) => ` | ${e}`).join("");
          }
          while (r.length < header.length) r.push("");
          body.push(r);
        }
      }
      current.rows = [header, ...body];
    } else if (line.startsWith(">")) {
      // Callouts: "> [!NOTE] text", "> [!TIP] text" or "> [!WARNING] text"; later quote lines continue the text.
      flushParagraph();
      if (!current) throw new Error(`${slug}.md: callout before any section heading`);
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, "").trim());
      const m = quote[0].match(/^\[!(NOTE|TIP|WARNING)\]\s*(.*)$/);
      if (!m) throw new Error(`${slug}.md: a callout in "${current.title}" must start with [!NOTE], [!TIP] or [!WARNING]`);
      const text = [m[2], ...quote.slice(1)].join(" ").trim();
      if (!text) throw new Error(`${slug}.md: empty callout in "${current.title}"`);
      current.callouts = [...(current.callouts ?? []), { kind: m[1].toLowerCase() as "note" | "tip" | "warning", text }];
    } else if (/^\{\{video:([a-z0-9-]+)\}\}$/.test(line.trim())) {
      // A recorded clip beside the steps: {{video:name}} plays videos/name.mp4 with a poster and captions.
      flushParagraph();
      if (!current) throw new Error(`${slug}.md: video marker before any section heading`);
      current.video = line.trim().slice(8, -2);
      i++;
    } else if (/^- \[(.+?)\]\(([a-z0-9-]+)\)$/.test(line.trim())) {
      flushParagraph();
      if (!current) throw new Error(`${slug}.md: link before any section heading`);
      const m = line.trim().match(/^- \[(.+?)\]\(([a-z0-9-]+)\)$/)!;
      current.links = [...(current.links ?? []), { label: m[1], slug: m[2] }];
      i++;
    } else if (line.trim() === "") {
      flushParagraph();
      i++;
    } else {
      if (!current) throw new Error(`${slug}.md: content before any section heading`);
      paragraph.push(line.trim());
      i++;
    }
  }
  flushParagraph();
  if (current) sections.push(current);
  if (!sections.length) throw new Error(`${slug}.md: no sections`);
  return { slug, group: fm.group, title: fm.title, description: fm.description, sections, added: badgeDate(slug, fm.added, "added"), updated: badgeDate(slug, fm.updated, "updated") };
}

/** New/Updated badges are opt-in: frontmatter `added:` / `updated:` (YYYY-MM-DD).
 *  Git history no longer decides them — a migrated page would otherwise look brand
 *  new. Declared dates are validated: a malformed or future date fails the build
 *  rather than silently mislabeling the page. */
export function badgeDate(slug: string, value: string | undefined, key: "added" | "updated"): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${slug}.md: ${key} must be a plain ISO date like 2026-10-20, got "${value}"`);
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`${slug}.md: ${key} is not a real date: "${value}"`);
  // JS rolls out-of-range days over (Feb 30 becomes Mar 2), so compare the round trip.
  if (new Date(ms).toISOString().slice(0, 10) !== value) throw new Error(`${slug}.md: ${key} is not a real date: "${value}"`);
  if (ms > Date.now() + 86400000) throw new Error(`${slug}.md: ${key} is in the future: "${value}"`);
  return new Date(ms).toISOString();
}

/** The footer's "Updated" fact, from the file's last commit; absent in shallow
 *  checkouts, so every failure is tolerated. Badges never read this — only the
 *  declared frontmatter above decides whether a page looks New or Updated. */
const gitUpdated = (file: string): string | undefined => {
  try { return execSync(`git log -1 --format=%cI -- ${file}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; } catch { return undefined; }
};

/** Checksums of the hand-written numbers on a task page: fail the build when they disagree with the checkboxes. */
export function validateTaskPage(slug: string, md: string, stats: { done: number; doing: number; todo: number }): void {
  const total = stats.done + stats.doing + stats.todo;
  const pct = total ? Math.round((100 * stats.done) / total) : 0;
  for (const m of md.matchAll(/(\d+)\s+of\s+(\d+)\s+(?:items?|done)/gi)) {
    if (Number(m[1]) !== stats.done || Number(m[2]) !== total) throw new Error(`${slug}.md: says ${m[1]} of ${m[2]}, but the checkboxes say ${stats.done} of ${total}, remove the hand-written number or fix the checkboxes`);
  }
  for (const m of md.matchAll(/(\d+)%/g)) {
    if (Number(m[1]) !== pct) throw new Error(`${slug}.md: says ${m[1]}%, but the checkboxes say ${pct}%, remove the hand-written number or fix the checkboxes`);
  }
  for (const bar of md.matchAll(/[█░]{8,}/g)) {
    const filled = [...bar[0]].filter((c) => c === "█").length;
    const want = Math.round((bar[0].length * stats.done) / Math.max(1, total));
    if (filled !== want) throw new Error(`${slug}.md: a progress bar has ${filled} filled blocks, but ${want} is correct, remove the hand-written bar or fix the checkboxes`);
  }
  const seen = new Set<string>();
  const tasks = [...md.matchAll(/^- \[( |x|~)\]\s+(.*)$/gm)].map((m) => m[2].replace(/\*\*(High|Medium|Low)\.\*\*\s*/, "").toLowerCase().replace(/\s+/g, " ").trim());
  for (const t of tasks) {
    if (!t) throw new Error(`${slug}.md: a task has no text`);
    if (seen.has(t)) throw new Error(`${slug}.md: the item "${t.slice(0, 60)}" appears twice, each item must be listed once so the counts stay honest`);
    seen.add(t);
  }
}

/** Read every docs/*.md page, in frontmatter order, and return the page list. */
export async function readDocPages(): Promise<DocPage[]> {
  const entries = await readdir("docs", { withFileTypes: true });
  const pages: { order: number; page: DocPage }[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const slug = entry.name.replace(/\.md$/, "");
    const md = await readFile(path.join("docs", entry.name), "utf-8");
    // Reference documents (API.md, UPGRADE.md) live alongside the pages without frontmatter.
    if (!md.startsWith("---")) continue;
    const page = parseDocPage(slug, md);
    const orderMatch = md.match(/^order:\s*(\d+)\s*$/m);
    const hasTasks = page.sections.some((s) => s.tasks?.length);
    if (hasTasks) {
      page.taskStats = sectionStats(page);
      validateTaskPage(slug, md, page.taskStats);
      for (const s of page.sections) if (s.tasks?.length) s.taskStats = statsOf(s.tasks);
    }
    // Badges come only from the frontmatter the author declared (see badgeDate);
    // the footer keeps the file's last-commit date as a plain fact.
    const last = gitUpdated(path.join("docs", entry.name));
    if (last) page.gitUpdated = last;
    pages.push({ order: orderMatch ? Number(orderMatch[1]) : 999, page });
  }
  pages.sort((a, b) => a.order - b.order || a.page.slug.localeCompare(b.page.slug));
  validatePages(pages.map((p) => p.page));
  return pages.map((p) => p.page);
}

/** Cross-page checks: unique slugs and links that resolve. */
export function validatePages(pages: DocPage[]) {
  const slugs = new Set(pages.map((p) => p.slug));
  if (slugs.size !== pages.length) throw new Error("duplicate doc slugs");
  for (const p of pages) for (const s of p.sections) for (const l of s.links ?? []) if (!slugs.has(l.slug)) throw new Error(`${p.slug}.md links to unknown page "${l.slug}"`);
}

/** Everyone who has landed a commit, from the git history. Empty in shallow checkouts. */
const gitContributors = (): { name: string; commits: number }[] => {
  try {
    const out = execSync("git shortlog -sn --no-merges HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").map((l) => l.match(/^\s*(\d+)\s+(.+)$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => ({ commits: Number(m[1]), name: m[2].trim() }));
  } catch { return []; }
};

/** Write the generated module. Returns the pages that were baked. */
export async function generateDocs(): Promise<DocPage[]> {
  const pages = await readDocPages();
  const body = `// AUTO-GENERATED from docs/*.md, edit the markdown, not this file.
// Regenerate with: npm run docs
import type { DocPage } from "./docs-content";

export const DOC_PAGES: DocPage[] = ${JSON.stringify(pages, null, 2)};

export const CONTRIBUTORS: { name: string; commits: number }[] = ${JSON.stringify(gitContributors(), null, 2)};
`;
  await mkdir(path.dirname("client/src/lib/docs-generated.ts"), { recursive: true });
  await writeFile("client/src/lib/docs-generated.ts", body, "utf-8");
  // llms.txt: the same pages as a plain index, so agents can read the docs without a browser.
  // The rest of the file (discovery, creative loop) is hand-written and preserved.
  const pageList = [
    ...pages.map((p) => `- [${p.title}](./#/docs/${p.slug}): ${p.description}, [markdown](https://github.com/HomekidChud/videoforge/blob/main/docs/${p.slug}.md)`),
    "- [Repository reference](https://github.com/HomekidChud/videoforge/blob/main/docs/API.md)",
    "- Markdown source for every page: https://github.com/HomekidChud/videoforge/tree/main/docs",
  ];
  let llms = await readFile("client/public/llms.txt", "utf-8").catch(() => "");
  const heading = "## Documentation\n\n";
  const list = `${heading}${pageList.join("\n")}\n`;
  const start = llms.indexOf(heading), next = llms.indexOf("\n## ", start + heading.length);
  if (start >= 0) llms = next >= 0 ? llms.slice(0, start) + list + llms.slice(next + 1) : llms.slice(0, start) + list;
  else llms = `${list}\n## Discovery\n\nUse Authorization: Bearer <scoped-key>. BASE is the user's API server.\n`;
  await writeFile("client/public/llms.txt", llms, "utf-8");
  return pages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("script/generate-docs.ts")) {
  generateDocs()
    .then((pages) => console.log(`docs: generated ${pages.length} pages from docs/*.md`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
