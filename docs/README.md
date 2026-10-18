# VideoForge documentation

Every page at `https://homekidchud.github.io/videoforge/#/docs/<slug>` is a
markdown file in this folder. `introduction.md` serves `#/docs/introduction`,
and so on. Edit the markdown, and the site picks it up on the next deploy.

## Writing a page

Each file starts with frontmatter:

```markdown
---
title: Introduction
group: Get started
order: 1
description: One timeline. A browser studio. An API your agents can actually use.
---
```

- `title`: heading and search result title
- `group`: sidebar section (pages with the same group are grouped together)
- `order`: position in the sidebar and previous/next navigation
- `description`: lede paragraph and search description
- `added`, `updated`: optional `YYYY-MM-DD` dates that show a New or Updated badge on the page and its sidebar entry for 30 days. They are opt-in: a page shows no badge unless you declare one, so a migrated page does not look brand new. A malformed or future date fails the build.

The body is a light markdown dialect:

- `## Section title` starts a section. Readers can open and close it with the arrow, and copy a link to it
- paragraphs are plain text (single newlines are joined)
- fenced code blocks render as copyable blocks; the fence word becomes the
  label (` ```shell ` shows a SHELL label)
- pipe tables render as tables; cells may contain literal `|`
- `- [Label](slug)` list items render as link cards to another docs page
- other `- item` lines render as a bullet list; `**bold**`, `` `code` `` and
  `[links](https://example.com)` work inside paragraphs, lists and callouts
- callouts: start a line with `> [!NOTE]`, `> [!TIP]` or `> [!WARNING]` followed
  by the text. Follow-on `>` lines continue it

## Task lists that calculate their own progress

Any page can carry checklist items: `- [ ]` to do, `- [~]` in progress,
`- [x]` done, each with an optional `**High.**`, `**Medium.**` or `**Low.**`
priority prefix. The docs site renders them as read-only checkboxes and works
out every count, bar and percentage from them; the build fails if a page also
hand-writes a number that disagrees with its checkboxes.

Two paragraph markers render calculated controls: `{{progress-overall}}` on
its own line draws the page's overall bar and counts, and `{{progress-table}}`
draws the Progress by area table from the page's own sections. A page with
tasks gets All / Open / In progress / Done filters plus priority and area,
remembered per browser, and its overall percentage shows next to its sidebar
entry.

The bucket list (docs/TODO.md) is the live example. Keep each item listed
once. The build fails on duplicates, so counts stay honest.

## Tables that stay in sync with the code

Some tables are generated from the code so they can never drift. Put a marker
row inside the table body:

```markdown
| Operation | Arguments |
|---|---|
| {{auto:ops}} |
```

Available markers: `endpoints`, `ops`, `templates`, `animatable`, `presets`,
`functions`, `recipes`, `transitions`, `examples`.

## Search and navigation

The sidebar starts with only Get started open; every other group opens when you
click it or visit one of its pages. Press `/` or Ctrl+K to search. Search reads
every section of every page, not just titles, so write section titles that say
what the section is for:

- It ranks titles above body text, and needs every word you type to match.
- It forgives small typos and matches the start of a word while you type.
- Results are grouped by page with the matching sections underneath, each with a snippet and highlighted words. Enter opens the selected result and jumps to that section.
- Chips filter by group, and your recent searches are kept in your browser.

## Building

`npm run docs` (also part of `npm run check` and `npm run build`) compiles
`docs/*.md` into `client/src/lib/docs-generated.ts`, which the site imports.
The generated file is committed so contributors can edit markdown and open a
PR without running the build. Malformed frontmatter, broken links, bad tables
or unknown markers fail the build with a readable error.

`API.md` and `UPGRADE.md` are long-form reference documents without
frontmatter; they are linked from the docs sidebar and are not compiled into
site pages.
