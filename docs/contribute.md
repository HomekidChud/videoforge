---
title: Contribute
group: Resources
order: 24
description: Set up the project, find your way around the code, and open a pull request that gets merged.
---

## Ways to help

There are two kinds of contributor, and the rules are strict so that pull requests are small, true and easy to review.

- **Community contributors may only change the docs.** Your pull request must touch nothing outside the `docs/` folder, and it needs a description that says which page, what was wrong and how you checked it. Anything else is closed automatically by the contribution rules workflow. See `CONTRIBUTING.md` in the repository root for the full policy.
- **Bugs and ideas:** open an issue with what you did, what you expected and what happened. Add the browser and the project JSON if you can. Do not fix code yourself; a maintainer will pick it up.
- **Maintainers** (the repository owner) may change anything — code, presets, templates and blocks — using the recipes further down this page.

> [!WARNING] Nonsense is rejected. A docs change must describe something you actually tried in a running Studio, written in your own words. AI-pasted filler, drive-by refactors, dependency bumps and mass rewrites of pages are closed without review.

## Set up your machine

Fork the repository on GitHub, clone your fork, and install. You need Node 20 or newer, plus `ffmpeg` and `ffprobe` on your PATH, because rendering, thumbnails and several tests use them.

```shell
git clone https://github.com/<you>/videoforge.git
cd videoforge
npm ci
npm run dev
```

The app opens at `http://localhost:5000`. On first boot the server prints an owner key and writes it to `data/OWNER_KEY.txt`. Use it on the sign-in page to create your account.

> [!TIP] Point `VIDEOFORGE_DB` at a scratch file, for example `VIDEOFORGE_DB=/tmp/vf.db npm run dev`, so experiments never touch a database you care about.

## Find your way around

The browser and the server share the same editing code, so the preview and the export agree. When you change how something animates or evaluates, you usually change `shared/`.

| Folder | What lives there |
|---|---|
| `client/src/pages` | One file per screen: editor, docs, platform, live, share |
| `client/src/components` | Studio panels such as the timeline, inspector, preview, Animator and block studio |
| `client/src/lib` | Client helpers, docs search and the generated docs content |
| `server` | Express routes, accounts and keys, rendering with FFmpeg, storage |
| `shared` | Timeline schema, editing operations, presets, templates, expressions, rigs, blocks |
| `docs` | Every docs page, as markdown |
| `test` | Specs, run with `tsx` |
| `script` | Docs generator, example renderer, restore and check tools |

## Make a change

Work on a branch, keep each change focused, and run the checks before you push.

```shell
git switch -c fix-lower-third-spacing
# make your change
npm run check   # regenerates the docs and runs the type checker
npm test        # the whole suite
npm run build   # confirms the client and server still bundle
```

Open a pull request against `main`. Describe what changed and why, and mention how you tested it. Pushes to `main` run `npm run check` and `npm run build` again before the site deploys.

> [!NOTE] `client/src/lib/docs-generated.ts` is generated from `docs/*.md` and is committed on purpose. Run `npm run docs` after editing any docs page and commit the result with it.

## Run the tests

Each spec is a plain script, so you can run one on its own while you work. Add or update a test with every behaviour change.

| Command | What it covers |
|---|---|
| `npx tsx test/graphics.spec.ts` | Shapes, templates, every motion preset, sequencing and real FFmpeg output |
| `npx tsx test/api.spec.ts` | Keys, restrictions, uploads, batches, discovery and validation |
| `npx tsx test/rig.spec.ts` | The Animator rig engine |
| `npx tsx test/custom-tools.spec.ts` | Blocks and scripts |
| `npx tsx test/docs.spec.ts` | Docs source, links and generated output |
| `npx tsx test/docs-search.spec.ts` | Docs search ranking |
| `npx tsx test/accounts.spec.ts` | Sign-in, sessions and accounts |

The rest of the suite covers durability, deployment, text fitting and block translations. `npm test` runs all of it.

## Recipe: add a motion preset

Presets are timed, strength-scaled keyframes. Add the entry to the `MOTION_PRESETS` list in `shared/presets.ts` with an `id`, `label` and `description`, then add a matching case to `motionPreset` in the same file. Entrance, emphasis and exit groups are decided by which list the id belongs to.

The Studio buttons, the API discovery list and the docs table all read from `MOTION_PRESETS`, so nothing else needs editing. Add the preset to `test/graphics.spec.ts`, which already checks every preset.

## Recipe: add a template or an operation

A template is a list of clips. Add it to `MOTION_TEMPLATES` in `shared/graphics.ts` and build its clips in the same file, then check it renders in `test/graphics.spec.ts`.

An operation is one case in `applyTimelineOp` in `shared/editing.ts`. Describe it in `shared/capabilities.ts` so agents can discover it, and add its arguments to `OP_PARAMS` in `shared/custom-tools.ts` if it should be usable from blocks. The operations table in the docs fills itself from this description.

## Recipe: add a block

Blocks live in `BLOCK_LIBRARY` in `shared/custom-tools.ts`. Give each block a plain name, a one line description and the fields it exposes, and put it in one of the groups in `BLOCK_GROUPS`. Add its Spanish text in `shared/block-i18n.ts`; `test/block-i18n.spec.ts` fails if a visible block is not translated.

## Write docs that read well

Say what a thing does, then show how. Keep sentences short, name the exact button or field, and use callouts for the few things that matter: a note for context, a tip for a shortcut, a warning for something that can lose work. The full page format is in `docs/README.md`.

Tables that list operations, presets, templates or endpoints are generated from the code with `{{auto:...}}` markers, so they cannot drift. Use a marker instead of copying a list by hand.

## Open the pull request

A good pull request is small, tested and explained. Before you open it, check that:

- `npm run check`, `npm test` and `npm run build` all pass
- new behaviour has a test, and new options appear in the docs
- you did not commit `data/`, `data.db`, `.env` or `data/OWNER_KEY.txt`
- the title says what changed, in the same style as recent commits such as `Docs: ...` or `Blocks: ...`

By contributing you agree that your work is released under the MIT license that covers the project.

## Report a security problem

Please do not post security problems in a public issue. Use private vulnerability reporting under the Security tab of the repository if it is switched on, or open an issue that only asks for a private way to reach the maintainer, with no details of the problem. Keys, session cookies and anything in `data/` are private, so never paste them into an issue or a pull request.

- [Introduction](introduction)
- [Self-hosting](self-hosting)
- [Storage & durability](storage-and-durability)
- [Roadmap and TODO](TODO)
