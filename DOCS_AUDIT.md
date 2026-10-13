# VideoForge Docs Audit

Date: 2026-10-13
Branch baseline: commit `63490af`.

## Existing docs inventory

| Source | Lines | Where it lives | Format |
|---|---|---|---|
| `README.md` | 174 | repo root | Markdown, human-readable |
| `docs/API.md` | ~700 | `docs/API.md` | Markdown, single-file reference |
| `client/src/pages/api-docs.tsx` | 151 | in-app page (`#/api-docs`) | Hardcoded React endpoints array, no MD parser |
| `client/src/pages/api-key.tsx` | 46 | in-app sign-in (`#/api-key`) | Minimal UI |
| `client/src/pages/platform.tsx` | 78 | in-app developer platform | UI, not docs |
| `shared/capabilities.ts` | 59 | source | **Not a doc** — runtime `GET /api/capabilities` |

**There is no docs site.** No routes, no search, no sitemap, no `llms.txt`,
no `openapi.json`, no `commands.schema.json`. The task's routes
(`/docs`, `/docs/getting-started`, `/docs/concepts`, …) do not exist.

## What exists vs. what the task asks for

| Task route | Status | Gap |
|---|---|---|
| `/docs` | Missing | No docs index page |
| `/docs/getting-started` | Partially covered by `docs/API.md` §"Quick start" | Not a standalone, crawlable page |
| `/docs/concepts` | Scattered in `docs/API.md` | Not split out |
| `/docs/guides` | Missing | No task-based guides |
| `/docs/api` | Partially — `docs/API.md` is close to an API reference | Single file, no per-resource pages |
| `/docs/commands` | Missing | Every timeline op needs its own page with JSON schema |
| `/docs/ai` | Missing | No AI endpoint exists yet |
| `/docs/webhooks` | Missing | **No webhooks exist in the product** — documenting them would violate "never document a feature that doesn't exist" |
| `/docs/auth` | Partially in `docs/API.md` | Not a standalone page |
| `/docs/errors` | Partially — error semantics scattered in `docs/API.md` | No stable error-code table with doc_url |
| `/docs/rate-limits` | Partially — per-key restrictions documented, but no global story | Missing global limits |
| `/docs/security` | Missing | Needs to match `SECURITY_AUDIT.md` findings |
| `/docs/environment` | Missing | `.env.example` doesn't exist either |
| `/docs/sdks` | Missing | No SDK exists |
| `/docs/changelog` | Missing | No release process |
| `/docs/status` | Missing | No status page |
| `/docs/faq` | Missing | |
| `/docs/glossary` | Missing | |

## Where docs disagree with reality

### D-1 — `vf_ui=1` cookie bypass is documented but was removed in commit `81e744f`
Confirmed by `git log -S "vf_ui"`: the cookie bypass and
`VIDEOFORGE_REQUIRE_UI_AUTH` were removed in commit
`81e744f` ("Fix auth: remove cookie bypass, add short-lived media tokens").
The `docs/API.md` section and the `test/api.spec.ts:15` env var are stale
remnants. **Action**: remove the docs section and the test flag.

### D-2 — `docs/API.md` scopes table may be out of date
The README's scopes table matches `shared/policy.ts` (verified). But `docs/API.md`
is 700+ lines; a full cross-check against every endpoint signature is needed.

### D-3 — README claims things the code doesn't do
README says "Live watching" follows the editor's unsaved timeline "refreshed ten
times a second" — but `server/live.ts` is client-pull: the editor publishes on
every state change (throttled to ≥100 ms) plus a 4 s heartbeat, and master
admins poll `GET /api/live/:id` every 100 ms. The wording implies server-push.
**Action**: rewrite to "the admin client polls at 10 Hz; the editor publishes on
change (throttled to ≥100 ms) plus a 4 s heartbeat."

### D-4 — In-app `api-docs.tsx` is a duplicate of `docs/API.md`
Two sources of truth will drift. `api-docs.tsx` is a hardcoded subset (26
endpoints vs. the full set in `docs/API.md`). **Action**: single source — generate
the in-app page from a shared JSON spec, or remove the in-app page and link to
`/docs/api`. This also feeds the "generate reference from OpenAPI" milestone.

### D-5 — `GET /api/capabilities` exists but isn't documented in `docs/API.md`
`shared/capabilities.ts` returns an ops/properties/easing/filters/presets index.
`docs/API.md` mentions it once but doesn't enumerate the response shape.
**Action**: generate a `/docs/commands` page from `capabilities()` so the two
can never drift.

### D-6 — No OpenAPI / JSON Schema artifacts
The task explicitly requires `/openapi.json`, `/commands.schema.json`,
`/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, per-page `.md` mirrors.
None exist.

### D-7 — `.env.example` does not exist
Env vars are read inline (`VIDEOFORGE_DB`, `PORT`, `CORS_ORIGIN`,
`VIDEOFORGE_MAX_UPLOAD_MB`, `VIDEOFORGE_BOOTSTRAP_KEY`, `VIDEOFORGE_FONT`,
`VIDEOFORGE_REQUIRE_UI_AUTH`, `VITE_API_BASE`) with no central module and no
example file. Blocks the docs and the security milestones.

## Gap-fix order

1. **D-1** — verify `vf_ui` / `VIDEOFORGE_REQUIRE_UI_AUTH` in git history.
2. **D-7** — write `.env.example` (feeds `ENV.md` and the docs milestone).
3. **D-6** — generate `openapi.json` and `commands.schema.json` from
   `shared/capabilities.ts` + `shared/editing.ts`. Single source of truth.
4. **D-4** — replace in-app `api-docs.tsx` duplicate with a generated page.
5. **D-3** — README wording fix for "Live".
6. Then build the `/docs` site routes.

## Docs standards for the rebuild

Follow the task spec exactly: plain Markdown source, static generation,
near-zero JS, black/grey/white design tokens, no external fonts, `Pagefind`
or `MiniSearch` for client-side search, `llms.txt` and per-page `.md` mirrors,
and a CI check that all artifacts are regenerated on each build.

Never document a feature that doesn't exist (webhooks, SDK, status page, AI
endpoint) — mark them "Planned" with no code samples until they ship.
