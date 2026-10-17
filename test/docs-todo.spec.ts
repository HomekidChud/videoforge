import assert from "node:assert/strict";
import { DOC_PAGES } from "../client/src/lib/docs-content";
import { parseDocPage, validateTaskPage, readDocPages, type DocTask } from "../script/generate-docs";

let checks = 0;
const check = async (label: string, fn: () => void | Promise<void>) => { await fn(); checks++; };

const FIXTURE = `---
title: Fixture
group: Test
order: 1
description: A fixture.
---

## Open things

Intro prose.

- [ ] **High.** First open item.
- [~] **Medium.** An item in progress.
- [x] A finished item.

## Nothing to do

Just prose.
`;

check("task syntax parses: status, priority and text", () => {
  const page = parseDocPage("fixture", FIXTURE);
  const s = page.sections[0];
  assert.equal(s.text, "Intro prose.", "prose stays out of the task list");
  const tasks = s.tasks as DocTask[];
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((t) => t.status), ["todo", "doing", "done"]);
  assert.equal(tasks[0].priority, "High");
  assert.equal(tasks[1].priority, "Medium");
  assert.equal(tasks[0].text, "First open item.");
  assert.equal(tasks[2].priority, undefined, "priority is optional");
});

check("a section without tasks has no task list", () => {
  const page = parseDocPage("fixture", FIXTURE);
  assert.equal(page.sections[1].tasks, undefined);
  assert.equal(page.taskStats, undefined);
});

await check("the real bucket list parses and its counts add up", async () => {
  const pages = await readDocPages();
  const todo = pages.find((p) => p.slug === "TODO");
  assert.ok(todo, "docs/TODO.md is a page");
  assert.ok(todo.taskStats, "the bucket list has calculated stats");
  const all = todo.sections.flatMap((s) => s.tasks ?? []);
  const done = all.filter((t) => t.status === "done").length;
  const doing = all.filter((t) => t.status === "doing").length;
  assert.equal(done, todo.taskStats.done);
  assert.equal(doing, todo.taskStats.doing);
  assert.equal(all.length, done + doing + todo.taskStats.todo);
  assert.ok(all.length > 50, "the list is substantial");
  for (const t of all) assert.ok(["todo", "doing", "done"].includes(t.status));
  for (const t of all) assert.ok(t.text.length > 5, "every item has text");
});

check("hand-written numbers that disagree fail the build", () => {
  const stats = { done: 2, doing: 1, todo: 1 };
  const good = parseDocPage("fixture", FIXTURE);
  void good;
  const cases: [string, string][] = [
    ["wrong count", "Overall: 3 of 5 done, 50%."],
    ["wrong percentage", "Progress: 99%."],
    ["wrong bar", "████████░░░░░░░░░░░░ done"],
  ];
  for (const [label, md] of cases) {
    assert.throws(() => validateTaskPage("fixture", md, stats), undefined, label);
  }
});

check("honest hand-written numbers pass, duplicates and empty items fail", () => {
  const stats = { done: 2, doing: 1, todo: 1 };
  validateTaskPage("fixture", "Overall: 2 of 4 done, 50%. █████░░░░░", stats);
  const dup = "- [ ] First open item.\n- [x] First open item.\n";
  assert.throws(() => validateTaskPage("fixture", dup, { done: 1, doing: 0, todo: 1 }), /appears twice/);
  assert.throws(() => validateTaskPage("fixture", "- [ ]\n", { done: 0, doing: 0, todo: 1 }), /no text/);
});

await check("the filters can count by priority on the real page", async () => {
  const pages = await readDocPages();
  const todo = pages.find((p) => p.slug === "TODO")!;
  const all = todo.sections.flatMap((s) => s.tasks ?? []);
  for (const pri of ["High", "Medium", "Low"] as const) {
    const n = all.filter((t) => t.priority === pri).length;
    assert.ok(n > 0, `some items are ${pri}`);
  }
  assert.ok(all.some((t) => !t.priority), "some items have no priority");
});

console.log("docs-todo.spec:", checks, "checks passed");
