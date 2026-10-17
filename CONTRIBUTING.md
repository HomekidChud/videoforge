# Contributing to VideoForge

These rules exist to keep the repository clean and trustworthy. Read them before opening a pull request. A pull request that ignores them will be closed without review.

## Who may change what

| You are | You may submit |
|---|---|
| A community contributor (anyone who is not a maintainer) | **Documentation only** — changes to files inside `docs/` |
| A maintainer (listed in `.github/workflows/contribution-rules.yml`) | Anything |

Community pull requests that change anything outside `docs/` — source code, dependencies, config, CI, generated files — fail the contribution rules check and are closed by a maintainer. If you have found a bug or want a feature, open an issue instead and let a maintainer decide how it is fixed. Do not submit drive-by refactors, dependency bumps, "cleanup" commits or mass reformatting; they will be closed.

The generated file `client/src/lib/docs-generated.ts` is never touched by community pull requests. It is regenerated from `docs/*.md` with `npm run docs`, and a maintainer commits the result when your docs change is merged. If your change needs it, say so in the pull request.

## Documentation quality bar

A docs pull request is accepted only when it meets all of these:

1. **It has a reason.** The description states what is wrong or missing on the page, and how the change fixes it. "Improved docs", "fixed typo" with no page named, and empty descriptions are closed.
2. **It is true.** Every claim matches how VideoForge actually behaves. If you have not tried the thing you are documenting in a running Studio, do not document it.
3. **It is yours.** Do not paste output from an AI assistant, other projects, or other products without reading, checking and rewriting it in your own words. Generated filler, restating the obvious, and pages that repeat other pages add nothing and will be rejected.
4. **It is in the page's voice.** Short sentences, plain words, steps the reader can follow. British spelling is used throughout ("colour", "organise").
5. **It stays inside `docs/*.md`.** No new files, no images, no symlinks, no changes to frontmatter keys the generator depends on (`title`, `group`, `order`, `description`).

## How to submit a docs change

```shell
git clone https://github.com/<you>/videoforge.git   # fork first
cd videoforge
# edit one or more docs/*.md files
```

Then open a pull request against `main` that contains:

- **What and why:** which page, which section, what was wrong or missing.
- **How you checked it:** what you did in the Studio or API to confirm the new text is correct.

Keep each pull request to one page or one topic. A pull request that rewrites several unrelated pages at once is hard to review and will be closed with a request to split it.

## What happens next

1. The contribution rules workflow checks that the pull request only touches `docs/*.md` and that its description is not empty. It runs from the copy of the workflow on `main`, so editing it in a fork has no effect. Community PRs that fail the check are closed by a maintainer. For hard enforcement, the repository owner can also make the check required in branch protection before merging.
2. A maintainer reads the change, tries what it describes where practical, and either merges it or explains what is missing.
3. The docs tests (`npm run docs` and the docs specs) run on every change. A docs edit that breaks the generated pages cannot be merged.

## Reporting bugs and ideas

Bugs and feature ideas are welcome as issues, not as code. Include:

- What you did, what you expected, and what happened.
- The browser and, if relevant, the project JSON or a share code.

Issues without reproduction steps may be closed without an answer.
