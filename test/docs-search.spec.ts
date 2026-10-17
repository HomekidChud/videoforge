import assert from "node:assert/strict";
import { DOC_PAGES } from "../client/src/lib/docs-content";
import { searchDocs, queryTokens, highlightRuns, snippetFor, countByGroup, sectionAnchor, plain } from "../client/src/lib/docs-search";

let checks = 0;
const check = (label: string, fn: () => void) => { fn(); checks++; };
const top = (q: string, n = 1) => searchDocs(DOC_PAGES, q).slice(0, n).map((r) => r.slug);

check("empty and noise queries return nothing", () => {
  assert.deepEqual(searchDocs(DOC_PAGES, ""), []);
  assert.deepEqual(searchDocs(DOC_PAGES, "  ?? "), []);
  assert.deepEqual(searchDocs(DOC_PAGES, "zzzzqqqq"), []);
});

check("page titles rank first", () => {
  assert.equal(top("animator")[0], "animator");
  assert.equal(top("quickstart")[0], "quickstart");
  assert.equal(top("keyframes")[0], "keyframes");
});

check("it finds a section, not just a page", () => {
  const r = searchDocs(DOC_PAGES, "apply to edit");
  assert.ok(r.length > 0);
  assert.ok(r.some((p) => p.hits.some((h) => h.sectionId && /apply/i.test(h.sectionTitle ?? ""))));
  for (const p of r) for (const h of p.hits) {
    const page = DOC_PAGES.find((d) => d.slug === p.slug)!;
    assert.ok(page.sections.some((s) => sectionAnchor(s.title) === h.sectionId), `${p.slug}#${h.sectionId} exists`);
  }
});

check("every word has to match", () => {
  assert.ok(searchDocs(DOC_PAGES, "animator zzzzqqqq").length === 0);
  assert.ok(searchDocs(DOC_PAGES, "rig clips").length > 0);
});

check("small typos still find the page", () => {
  assert.equal(top("keyfames")[0], "keyframes");
  assert.equal(top("quikstart")[0], "quickstart");
});

check("prefixes work while typing", () => {
  assert.ok(top("quicks")[0] === "quickstart");
  assert.ok(searchDocs(DOC_PAGES, "ren").some((p) => p.slug === "rendering"));
});

check("operation names are searchable", () => {
  const r = searchDocs(DOC_PAGES, "rig_bake");
  assert.ok(r.length > 0, "rig_bake is documented somewhere");
});

check("group filter and counts", () => {
  const all = searchDocs(DOC_PAGES, "clip", { maxPages: 1000 });
  const counts = countByGroup(DOC_PAGES, "clip");
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), all.length);
  const onlyStudio = searchDocs(DOC_PAGES, "clip", { group: "Studio" });
  assert.ok(onlyStudio.length > 0 && onlyStudio.every((p) => p.group === "Studio"));
});

check("results are capped and hits per page limited", () => {
  const r = searchDocs(DOC_PAGES, "the", { maxPages: 4, maxHitsPerPage: 2 });
  assert.ok(r.length <= 4);
  for (const p of r) assert.ok(p.hits.length <= 2);
});

check("snippets and highlights", () => {
  assert.equal(snippetFor(["alpha beta gamma"], ["beta"]), "alpha beta gamma");
  const long = "x ".repeat(100) + "needle " + "y ".repeat(100);
  const s = snippetFor([long], ["needle"]);
  assert.ok(s.includes("needle") && s.startsWith("…") && s.endsWith("…") && s.length < 170);
  const runs = highlightRuns("Pose a Clip now", queryTokens("clip pose"));
  assert.deepEqual(runs.filter((r) => r.hit).map((r) => r.text), ["Pose", "Clip"]);
  assert.equal(runs.map((r) => r.text).join(""), "Pose a Clip now");
  assert.equal(plain("**bold** `code` [link](x)"), "bold code link");
});

check("filler words are ignored unless alone", () => {
  assert.deepEqual(queryTokens("apply to the edit"), ["apply", "edit"]);
  assert.deepEqual(queryTokens("the"), ["the"]);
  const runs = highlightRuns("Animator edit", ["to", "edit"]);
  assert.deepEqual(runs.filter((r) => r.hit).map((r) => r.text), ["edit"], "no highlight inside a word");
});

console.log(`docs-search.spec: ${checks} checks passed`);
