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

- `title` — heading and search result title
- `group` — sidebar section (pages with the same group are grouped together)
- `order` — position in the sidebar and previous/next navigation
- `description` — lede paragraph and search description

The body is a light markdown dialect:

- `## Section title` starts a section shown with an anchor link
- paragraphs are plain text (single newlines are joined)
- fenced code blocks render as copyable blocks; the fence word becomes the
  label (` ```shell ` shows a SHELL label)
- pipe tables render as tables; cells may contain literal `|`
- `- [Label](slug)` list items render as link cards to another docs page

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

## Building

`npm run docs` (also part of `npm run check` and `npm run build`) compiles
`docs/*.md` into `client/src/lib/docs-generated.ts`, which the site imports.
The generated file is committed so contributors can edit markdown and open a
PR without running the build. Malformed frontmatter, broken links, bad tables
or unknown markers fail the build with a readable error.

`API.md` and `UPGRADE.md` are long-form reference documents without
frontmatter; they are linked from the docs sidebar and are not compiled into
site pages.
