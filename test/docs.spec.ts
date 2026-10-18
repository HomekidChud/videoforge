import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseDocPage, readDocPages, generateDocs, validatePages } from "../script/generate-docs";
import { DOC_PAGES } from "../client/src/lib/docs-content";
import { applyTimelineOp } from "../shared/editing";
import { normalizeTimeline } from "../shared/timeline";

let checks = 0;
async function check(label: string, fn: () => void | Promise<void>) {
  await fn();
  checks++;
}

// The compiled site pages match the markdown source exactly (run npm run docs after editing docs/*.md).
await check("generated matches source", async () => {
  const pages = await readDocPages();
  assert.equal(pages.length, DOC_PAGES.length);
  // The updated and added stamps come from git history, which changes the moment the regenerated file is committed, so they are compared separately by shape.
  const strip = ({ updated, added, ...rest }: any) => rest;
  for (let i = 0; i < pages.length; i++) assert.deepEqual(strip(pages[i]), strip(DOC_PAGES[i]));
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

// Badges are explicit frontmatter, never git-date guesses.
check("badge frontmatter", () => {
  const page = parseDocPage("badged", "---\ntitle: x\ngroup: g\ndescription: d\nbadge: new\nbadgeUntil: 2099-01-01\n---\n\n## S\n\ntext");
  assert.equal(page.badge, "new");
  assert.equal(page.badgeUntil, "2099-01-01");
});
check("badge expiry date format", () => assert.throws(() => parseDocPage("bad", "---\ntitle: x\ngroup: g\ndescription: d\nbadge: new\nbadgeUntil: soon\n---\n\n## S\n\ntext"), /badgeUntil/));
check("badge value whitelist", () => assert.throws(() => parseDocPage("bad", "---\ntitle: x\ngroup: g\ndescription: d\nbadge: fresh\n---\n\n## S\n\ntext"), /badge must be/));
check("badgeUntil needs a badge", () => assert.throws(() => parseDocPage("bad", "---\ntitle: x\ngroup: g\ndescription: d\nbadgeUntil: 2099-01-01\n---\n\n## S\n\ntext"), /badgeUntil needs a badge/));
check("no badge by default", () => {
  const page = parseDocPage("plain", "---\ntitle: x\ngroup: g\ndescription: d\n---\n\n## S\n\ntext");
  assert.equal(page.badge, undefined);
  assert.equal(page.badgeUntil, undefined);
});

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

// Every {{video}} marker resolves to a real clip, poster and caption track.
await check("video markers resolve to files", () => {
  const videos = DOC_PAGES.flatMap((p) => p.sections.filter((s) => s.video).map((s) => ({ page: p.slug, name: s.video! })));
  const names = new Set(videos.map((v) => v.name));
  for (const id of ["mg", "tour", "animator", "blocks", "fire"]) assert.ok(names.has(id), `a docs page embeds the ${id} video`);
  for (const v of videos) {
    for (const ext of ["mp4", "png", "vtt", "chapters.json"]) {
      const file = path.join("client/public/videos", `${v.name}.${ext}`);
      assert.ok(fs.existsSync(file), `${v.page}: missing ${file}`);
    }
  }
});

// The tutorial's API batch really builds the intro it describes.
await check("tutorial batch applies cleanly", () => {
  const page = DOC_PAGES.find((p) => p.slug === "motion-graphics-tutorial");
  assert.ok(page, "tutorial page exists");
  const code = page!.sections.find((s) => s.code?.includes('"ops"'))?.code;
  assert.ok(code, "tutorial has an ops batch");
  const { ops } = JSON.parse(code!);
  let tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [] });
  for (const op of ops) tl = applyTimelineOp(tl, op, () => undefined);
  const ids = tl.clips.map((c) => c.id);
  for (const id of ["headline", "bar", "tagline", "badge", "lt-0"]) assert.ok(ids.includes(id), `${id} was created`);
  assert.equal(tl.background, "#101826");
  assert.ok(tl.clips.find((c) => c.id === "badge")?.expressions, "badge floats through an expression");
});

// The block coding tutorial's batch adds its title, springs it and fades every clip.
await check("block coding tutorial batch applies cleanly", () => {
  const page = DOC_PAGES.find((p) => p.slug === "tutorial-blocks");
  assert.ok(page, "block coding tutorial exists");
  const code = page!.sections.find((s) => s.code?.includes('"ops"'))?.code;
  assert.ok(code, "block coding tutorial has an ops batch");
  const { ops } = JSON.parse(code!);
  let tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [{ id: "existing", track: "overlay", text: "Existing", start: 0, duration: 4 }] });
  for (const op of ops) tl = applyTimelineOp(tl, op, () => undefined);
  const title = tl.clips.find((c) => c.id === "blocks-title");
  assert.ok(title, "the blocks title was created");
  assert.ok(tl.clips.find((c) => c.id === "existing")?.fadeIn === 0.5, "every clip fades in, like the For each clip block");
});

// The animator tutorial's rig_bake really bakes a parented wave.
await check("animator tutorial batch applies cleanly", () => {
  const page = DOC_PAGES.find((p) => p.slug === "tutorial-animator");
  assert.ok(page, "animator tutorial exists");
  const code = page!.sections.find((s) => s.code?.includes('"ops"'))?.code;
  assert.ok(code, "animator tutorial has an ops batch");
  const { ops } = JSON.parse(code!);
  let tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [] });
  for (const op of ops) tl = applyTimelineOp(tl, op, () => undefined);
  const forearm = tl.clips.find((c) => c.id === "forearm");
  assert.ok(forearm, "the forearm part was created");
  const keys = forearm?.keyframes?.rotation ?? [];
  assert.ok(keys.length >= 5, "the wave is keyed");
  assert.ok(keys.some((k) => k.value === -60), "the first pose swings out");
});

// The fire edit tutorial's batch cuts, warms and dresses one clip.
await check("fire edit tutorial batch applies cleanly", () => {
  const page = DOC_PAGES.find((p) => p.slug === "tutorial-fire-edit");
  assert.ok(page, "fire edit tutorial exists");
  const code = page!.sections.find((s) => s.code?.includes('"ops"'))?.code;
  assert.ok(code, "fire edit tutorial has an ops batch");
  const { ops } = JSON.parse(code!);
  let tl = normalizeTimeline({ fps: 30, resolution: { width: 1280, height: 720 }, clips: [] });
  const asset = { kind: "video", duration: 20, width: 1920, height: 1080 };
  for (const op of ops) tl = applyTimelineOp(tl, op, (id) => (id === "clip-1" ? asset : undefined));
  const cuts = tl.clips.filter((c) => c.id.startsWith("cut-"));
  assert.equal(cuts.length, 2, "two cuts of the same clip");
  assert.ok(cuts.every((c) => c.filter === "warm"), "both cuts are warmed");
  assert.ok(cuts.find((c) => c.id === "cut-2")?.transitionIn, "the cuts are joined by a transition");
  const end = cuts.reduce((t, c) => Math.max(t, c.start + (c.outPoint ?? c.inPoint ?? 0) - (c.inPoint ?? 0)), 0);
  assert.equal(end, 15, "the video ends at 15 seconds, where the overlays end");
  for (const id of ["headline", "badge", "lt-0"]) assert.ok(tl.clips.some((c) => c.id === id), `${id} was created`);
});

console.log(`docs.spec: ${checks} checks passed`);
