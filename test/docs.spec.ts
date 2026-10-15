import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocPage, readDocPages, generateDocs, validatePages } from "../script/generate-docs";
import { DOC_PAGES } from "../client/src/lib/docs-content";

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) {
  await fn();
  checks++;
}

// The compiled site pages match the markdown source exactly (run npm run docs after editing docs/*.md).
await check("generated matches source", async () => {
  const pages = await readDocPages();
  assert.equal(pages.length, DOC_PAGES.length);
  for (let i = 0; i < pages.length; i++) assert.deepEqual(pages[i], DOC_PAGES[i]);
});

// Pages are ordered, unique, and every link resolves.
await check("pages well formed", async () => {
  const pages = await readDocPages();
  const slugs = pages.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs[0], "introduction");
  const known = new Set(slugs);
  for (const p of pages) {
    assert.ok(p.title && p.group && p.description, `${p.slug}: frontmatter incomplete`);
    assert.ok(p.sections.length, `${p.slug}: no sections`);
    for (const s of p.sections) {
      assert.ok(s.title && s.text, `${p.slug}/${s.title}: section needs title and text`);
      for (const l of s.links ?? []) assert.ok(known.has(l.slug), `${p.slug}: link to unknown page ${l.slug}`);
      if (s.rows) assert.ok(s.rows.length >= 2, `${p.slug}/${s.title}: table needs a header and a row`);
    }
  }
});

// The committed generated file is what the current markdown produces.
await check("committed file in sync", async () => {
  const before = await readFile("client/src/lib/docs-generated.ts", "utf-8");
  await generateDocs();
  const after = await readFile("client/src/lib/docs-generated.ts", "utf-8");
  assert.equal(before, after);
});

// Malformed documents fail with readable errors.
check("bad frontmatter", () => assert.throws(() => parseDocPage("bad", "no frontmatter\n"), /frontmatter/));
check("unterminated code", () => assert.throws(() => parseDocPage("bad", "---\ntitle: x\ngroup: g\ndescription: d\n---\n\n```json\ncode"), /unterminated/));
check("unknown marker", () => assert.throws(() => parseDocPage("bad", '---\ntitle: x\ngroup: g\ndescription: d\n---\n\n## S\n\n| a |\n|---|\n| {{auto:nope}} |'), /unknown marker/));
check("unknown link", () => assert.throws(() => validatePages([parseDocPage("bad", "---\ntitle: x\ngroup: g\ndescription: d\n---\n\n## S\n\n- [Link](missing-page)\n")]), /unknown page/));
check("missing title", () => assert.throws(() => parseDocPage("bad", "---\n---\n\n## S\n\ntext"), /missing title/));

// Tables with pipes inside cells survive the round trip.
check("pipes in cells", () => {
  const page = parseDocPage("pipes", "---\ntitle: t\ngroup: g\ndescription: d\n---\n\n## S\n\n| Field | Values |\n|---|---|\n| type | rectangle | ellipse | line |\n");
  assert.deepEqual(page.sections[0].rows, [["Field", "Values"], ["type", "rectangle | ellipse | line"]]);
});

// Auto markers expand to real catalog rows.
await check("auto tables", async () => {
  const pages = await readDocPages();
  const ops = pages.find((p) => p.slug === "batch-operations")!.sections.find((s) => s.rows?.[0][0] === "Operation")!;
  assert.ok((ops.rows!.length ?? 0) > 10);
  const endpoints = pages.find((p) => p.slug === "api-reference")!.sections.find((s) => s.rows?.[0][0] === "Method")!;
  assert.ok(endpoints.rows!.some((r) => r[1] === "/api/health"));
});

console.log(`docs.spec: ${checks} checks passed`);
