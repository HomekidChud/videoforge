import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { DOC_PAGES, CONTRIBUTORS } from "../client/src/lib/docs-content";
import { DOC_ENDPOINTS } from "../script/generate-docs";

let checks = 0;
const check = async (label: string, fn: () => void | Promise<void>) => { await fn(); checks++; };
const sectionId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const files = (await readdir("docs")).filter((f) => f.endsWith(".md")).sort();
const raw = new Map<string, string>();
for (const f of files) raw.set(f, (await readFile(`docs/${f}`, "utf-8")).replace(/```[\s\S]*?```/g, ""));
const slugs = new Set(DOC_PAGES.map((p) => p.slug));

/** Every [label](target) link in the markdown, with fenced code blocks removed. */
const mdLinks = (md: string) => [...md.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => m[2]);

check("every markdown file is a generated page or a reference document", () => {
  for (const f of files) {
    const slug = f.replace(/\.md$/, "");
    if (raw.get(f)!.startsWith("---")) assert.ok(slugs.has(slug), `${f} is generated`);
  }
});

check("internal links resolve to pages and section anchors exist", () => {
  const problems: string[] = [];
  for (const [f, md] of raw) {
    const ownSlug = f.replace(/\.md$/, "");
    for (const target of mdLinks(md)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (target.startsWith("#")) {
        // A same-page anchor link: #section must exist on this page.
        const anchor = target.slice(1);
        const page = DOC_PAGES.find((p) => p.slug === ownSlug);
        if (!page) continue; // reference documents have no sections
        if (!page.sections.some((s) => sectionId(s.title) === anchor)) problems.push(`${f} links to missing section "${target}"`);
        continue;
      }
      const [slug, anchor] = target.split("#");
      if (!slugs.has(slug)) { problems.push(`${f} links to unknown page "${target}"`); continue; }
      if (anchor) {
        const page = DOC_PAGES.find((p) => p.slug === slug)!;
        if (!page.sections.some((s) => sectionId(s.title) === anchor)) problems.push(`${f} links to missing section "${target}"`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

check("external links are well-formed", () => {
  for (const [f, md] of raw) for (const target of mdLinks(md)) {
    if (/^https?:/.test(target)) {
      try { new URL(target); } catch { assert.fail(`${f} has a malformed URL: ${target}`); }
      assert.ok(/^https:\/\//.test(target), `${f} uses plain http: ${target}`);
    }
  }
});

await check("external links are reachable (404 fails, network trouble is skipped)", async () => {
  const seen = new Map<string, number>();
  for (const md of raw.values()) for (const target of mdLinks(md)) if (/^https:/.test(target)) {
    // The deployed site lags the repo and the hosted API may sleep; check those from the tree instead.
    if (/homekidchud\.github\.io\/videoforge|videoforge-api-s54w\.onrender\.com/.test(target)) continue;
    const blob = target.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/main\/(.+)$/);
    if (blob) { assert.ok((await stat(`./${blob[1]}`)).isFile(), `${target} exists in the repo`); continue; }
    seen.set(target, 0);
  }
  let broken: string[] = [];
  for (const url of seen.keys()) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (res.status === 404 || res.status === 410) broken.push(`${url} (${res.status})`);
    } catch { /* offline or blocked: not a docs problem */ }
  }
  assert.deepEqual(broken, []);
});

await check("llms.txt lists every page", async () => {
  const llms = await readFile("client/public/llms.txt", "utf-8");
  for (const p of DOC_PAGES) assert.ok(llms.includes(`#/docs/${p.slug})`), `llms.txt lists ${p.slug}`);
});

await check("openapi.json matches the endpoint list and the operation catalog", async () => {
  const spec = JSON.parse(await readFile("client/public/openapi.json", "utf-8"));
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.info.description.includes("update_clip"), "operations are documented");
  assert.ok(spec.components.securitySchemes.bearerAuth, "auth is described");
  const paths = Object.keys(spec.paths);
  assert.ok(DOC_ENDPOINTS.length > 10);
  for (const [, route] of DOC_ENDPOINTS) assert.ok(paths.includes(route.replace(/:(\w+)/g, "{$1}")), `openapi.json has ${route}`);
});

check("contributors come from the git history", () => {
  assert.ok(CONTRIBUTORS.length >= 1);
  for (const c of CONTRIBUTORS) { assert.ok(c.name); assert.ok(c.commits >= 1); }
});

check("the todo markers render from real sections", () => {
  const todo = DOC_PAGES.find((p) => p.slug === "TODO")!;
  assert.ok(todo.sections[0].text.includes("{{progress-overall}}"));
  assert.ok(todo.sections[1].text.includes("{{progress-table}}"));
  assert.ok(todo.taskStats);
});

console.log("docs-site.spec:", checks, "checks passed");
