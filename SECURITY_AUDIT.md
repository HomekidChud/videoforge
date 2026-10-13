# VideoForge Security Audit

Date: 2026-10-13
Branch baseline: commit `63490af` (before any changes in this workstream).

## Methodology

Read every server route, the auth layer, the client rendering paths, and the whole
git history (all commits, all diffs) for hardcoded credentials. Findings are
rated Critical / High / Medium / Low and ordered by remediation priority.
"Fixed" means the fix is on this branch and verified by a test.

## 0. Entry points inventory

### HTTP routes (server)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET | none | Liveness probe |
| `/api/keys`, `/api/keys/:id`, `/api/keys/owner` | GET/POST/DELETE | Bearer (admin) | Key management |
| `/api/auth/me`, `/api/auth/media-token/:resourceId` | GET | Bearer (read) | Key metadata, media-token mint |
| `/api/media/upload` | POST (multipart) | Bearer (write) | Media upload (streamed, ≤ 2 GB default) |
| `/api/media`, `/api/media/:id`, `/:id/raw`, `/:id/thumb`, `/:id/waveform`, `DELETE /:id` | GET/DELETE | Bearer or `?st=` media token | Media list/detail/binary |
| `/api/projects`, `/api/projects/:id`, `/:id/timeline/ops`, `/:id/state`, `/:id/frame`, `/:id/storyboard`, `/:id/duplicate`, `/:id/presence`, `/:id/activity` | GET/POST/PUT/DELETE | Bearer (read/write per scope) | Projects & timeline ops |
| `/api/public/projects/:id`, `/api/public/projects/:id/renders/:jobId` | GET | none (visibility gate) | Public share |
| `/api/renders`, `/api/renders/:id`, `/:id/download` | GET/POST | Bearer (read/write) | Render jobs |
| `/api/capabilities` | GET | Bearer (read) | Feature metadata |
| `/api/live`, `/api/live/:id`, `/api/live/:id/publish` | GET/POST | Bearer (admin for read; write for publish) | Live watch/presence |

### Webhooks
- **None** exist yet. Nothing to audit.

### AI command endpoint
- The closest is `POST /api/projects/:id/timeline/ops` — but there is **no** LLM/AI
  endpoint; agents construct the JSON themselves. No prompt-injection surface yet,
  but one is planned (see Milestone 3 of the task) and must be built with
  schema validation and an untrusted-content boundary from day one.

### File uploads
- `POST /api/media/upload` (multipart, streamed via busboy, ≤ `MAX_UPLOAD_BYTES`
  default 2 GB, ≤ 20 files per request). **Stored under `data/media/<id>` with the
  original filename recorded in the DB but never used as the on-disk name** (good).

### Client-side render of user content

| Source | Where | Escape strategy |
|---|---|---|
| Project name | `editor.tsx:369` `<input value={projectName}>` | React text-only render — safe |
| Clip `text` (titles) | `forge-preview.tsx:98` `{c.text}` inside a `<div>` | React text-only — safe |
| `textColor` / `background` | passed into inline `style` | Regex-validated `#rrggbb` in `normalizeClip` — safe |
| Filename | `editor.tsx:397` `title={a.filename}` attribute | React escapes attributes — safe |
| `docs/API.md` | `pages/api-docs.tsx` | Need to inspect (see below) |
| `marker.label` | tooltip `title` attribute | React — safe |
| `activity.summary` | live page | React text — safe |

No `dangerouslySetInnerHTML` is used on user-controlled data anywhere in the
client. The single `dangerouslySetInnerHTML` is in
`client/src/components/ui/chart.tsx:81` — a shadcn/Radix boilerplate component
that is **not imported by any page** (dead code). Risk is theoretical, not
exploitable in this app's current state.

## 1. Secrets

Scanned `rg` over the tree (excluding `node_modules`, `package-lock.json`) and
`git log --all -p` for common credential patterns (`sk-…`, `AIza…`, `ghp_…`,
`AKIA…`). **Zero hits in code and zero in history.** No rotation required.

Sources that might hold secrets:

| Source | Risk | Notes |
|---|---|---|
| `process.env.VIDEOFORGE_BOOTSTRAP_KEY` | n/a | Read at boot; never logged; only the sha256 hash is persisted. OK. |
| `data/OWNER_KEY.txt` | Medium | Written with mode `0o600`, gitignored, printed to console. Acceptable dev pattern, documented in README as a "delete after saving" step. |
| `CORS_ORIGIN` default `"*"` | High | See §3. |
| `VITE_API_BASE` baked into the bundle | Low | Only the API base URL — not a secret. |

## 2. Findings

### H-1 — `CORS_ORIGIN` defaults to `*` (High, fixed)
`server/index.ts:44-56` (pre-fix). If unset, the server responded to any Origin
with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`.
A malicious page could make unauthenticated preflight-friendly calls (though
with Bearer-only auth and no cookies, the blast radius was limited to
unauthenticated endpoints). **Fixed** by the typed env module — see §4.

### H-2 — `vf_ui=1` cookie bypass (Historical; removed upstream in commit `81e744f`)
The cookie bypass was **removed** upstream in commit `81e744f` (verified via
`git log -S "vf_ui"`). What remained on this branch was **stale documentation**
(`docs/API.md` still described it) and a stale test env var. **Fixed on this
branch** by removing the env var from the test; the `docs/API.md` section
removal is tracked in `DOCS_AUDIT.md` D-1.

### H-3 — No CSP / security headers (High, partially fixed — CSP deferred)
The Express app set **no** `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, or `Cross-Origin-Embedder-Policy`. Vite HMR in
dev injects inline scripts; the production bundle is served as static files so
a strict CSP is achievable.

**Partial fix on this branch**: all the non-CSP headers are set on every
response (verified by tests). **CSP is shipped as `Content-Security-Policy-Report-Only`**
deliberately — enforcing it before exercising the React client in a real
browser risks silently breaking the editor (Vite dev preamble, split-origin
Pages deployment, cross-origin media). Enforcing a verified CSP is the
web-hardening milestone. **Status: partial (non-CSP headers enforced +
tested; CSP Report-Only).**

### H-4 — CSRF: no surface today, but dead dependencies invite one (Low, documentation)
Bearer-token-only auth means CSRF is **not** a live vulnerability for `/api/*` —
there are no cookies to ride. **However**, `express-session`, `passport`,
`passport-local`, `memorystore`, `@supabase/supabase-js` are installed in
`package.json` while no session code exists in `server/`. If cookie sessions
are ever added, CSRF becomes live. **Action**: remove the dead dependencies
(next milestone) or document why they're retained. If session auth is
introduced, CSRF protection must come with it.

### H-5 — XSS surface in `api-docs.tsx` (verified safe, no action)
Read the file: it renders a hardcoded `endpoints` array through plain React
`<pre>` / `<code>` / text nodes. No Markdown parser, no `innerHTML`. Not a
vector. **Status: closed.**

### H-6 — Upload trust boundary (Medium)
- **MIME sniffing**: `kindFromMime` (`server/routes.ts:29-38`) trusts the
  client-provided `Content-Type` first, then falls back to extension. **The
  file is NOT rejected if ffprobe fails** — a `console.warn` is logged and
  the asset is created with `duration: 0` (`routes.ts:214-219`). So ffprobe
  does not gate acceptance; malformed files are accepted with bogus metadata.
- **No magic-byte check before ffprobe**. A `.png`-labeled `.exe` is **not
  rejected** — it is probed, the probe fails, and the file is stored with
  `duration: 0`. Content stored on the app's origin is a
  **stored-XSS-via-content-type risk**: the upload endpoint sets
  `Content-Type` from the DB `mime` column, which is the client-supplied
  MIME, so an attacker could upload `text/html`-labeled content and get it
  served from the same origin as the app. Mitigations today: `nosniff` (set
  on this branch) prevents script execution from a mislabeled file, and the
  media route serves with the recorded `mime`. A real fix needs
  magic-byte validation + a hard MIME allowlist + serving uploads from a
  separate origin. **Next milestone (H-6 fix).**
- **No per-user quota**, no file-count quota, no upload rate limit (only
  `requestsPerMinute` per key, which is optional).
- **Filenames are not sanitized for on-disk use** (but the on-disk name is a random
  `uid()`, so path traversal via the stored filename is not possible — good).
- **No EXIF stripping**. Media retains its metadata; if the file is later served
  publicly (public share page serves the rendered MP4 only — raw assets never go
  public), EXIF could leak. Low real risk today.
- **No ClamAV / virus scan**.
**Fix**: add magic-byte allowlist (mp4/webm/mov/mkv/avi/mp3/wav/ogg/m4a/aac/flac/png/jpg/jpeg/gif/webp),
add `ffprobe` timeout, add per-key storage quota. **Status: planned (Milestone 3 of security).**

### H-7 — No SSRF surface (Low)
No endpoint fetches a user-supplied URL server-side. Nothing to audit.

### H-8 — No authentication rate limit on key-minting (Medium)
`POST /api/keys` requires `admin` scope; the per-key `requestsPerMinute`
restriction is opt-in per key, not global. A compromised admin key can mint
unlimited keys. **Fix**: server-wide global rate limit on key creation + audit
log entry. **Status: planned.**

### H-9 — `Access-Control-Allow-Headers` includes `Range` (Low)
Used for `<video>` seeking. Acceptable, documented.

### H-10 — No audit log of admin key operations (Medium)
`apiKeys` table has no `lastUsedBy`, no `createdBy`, no operation log. Revoking
and minting keys is un-logged. **Fix**: append to an `audit_log` table on
`POST/DELETE /api/keys`. **Status: planned.**

### H-11 — `crypto.timingSafeEqual` misuse in media token verify (Medium)
`auth.ts:200`: `a.length === b.length && crypto.timingSafeEqual(a, b)`. If lengths
differ, the `&&` short-circuits before `timingSafeEqual` runs — this is actually
safe (no timing leak from the length check itself). **Verified correct**, but the
pattern is fragile if refactored. Leave as-is, add a comment.

### H-12 — `requireMediaAccess` allows `Bearer` OR `?st=` token (Low, by design)
Media-token path binds to the exact resource ID and the issuing key. Revocation
works (key check in `verifyMediaToken`). Tokens are 6 h TTL, HMAC-SHA256,
read-only. **Well-designed.** No action.

### H-13 — `GET /api/keys/owner` returns the plaintext key if still in memory (Low)
`auth.ts:364-370`. Only before `OWNER_KEY.txt` is deleted, requires `admin`
scope. Acceptable bootstrap flow; documented. No action.

### H-14 — `kindFromMime` falls back to `"video"` for unknown types (Low)
A `.exe` labeled `application/octet-stream` would be classified `video` and then
ffprobe'd. Add an explicit allowlist to reject unknown MIME types early.
**Status: planned with H-6.**

### H-15 — `express.json` had no explicit body size limit (Medium)
`express.json()` without a `limit` option defaults to 100 KB in Express 5, so
this was **not** an unbounded-parser bug — but a 100 KB default is too small
for a real timeline JSON (200 clips with keyframes can exceed it), so the
bound had to be raised deliberately and documented. **Fix**: explicit
`express.json({ limit: "4mb" })` (larger than the default, still bounded).
**Status: fixed — see §4.**

### H-16 — Same default-limit consideration applies to `/api/live/:id/publish` (Medium)
The live publish body carries a full timeline JSON. With the explicit 4 MB
limit, this is bounded. **Status: fixed with H-15.**

## 3. Third-party dependencies

Full dependency tree from `package-lock.json` is large. Key risks:

| Package | Risk |
|---|---|
| `express@5.0.1` | Express 5 is new; check for CVEs. No known 2025-2026 criticals at time of writing. |
| `better-sqlite3@11.7` | Native module; build-time risk only. |
| `@supabase/supabase-js@2.49` | Installed but **never imported** anywhere in the code. Dead dependency. Remove. |
| `passport`, `passport-local`, `express-session`, `memorystore` | Installed but **never imported** in server code. Dead dependencies. Remove or document the intent. |
| `framer-motion`, `recharts`, `react-day-picker`, `input-otp`, `embla-carousel-react`, `vaul`, `@radix-ui/*` (most) | Many unused Radix primitives installed by the shadcn scaffold. Bundle-size risk, not security. |
| `zod@4.4.3` | Latest major; fine. |

**Action**: remove dead server deps (`@supabase/supabase-js`, `passport*`,
`express-session`, `memorystore`) or document why they're retained. **Status: planned.**

## 4. Fixes applied on this branch

Every item below has a test that demonstrates the fix (see
`test/security.spec.ts`, 28 assertions, all green). No claim without a test.

### Fixed
- **H-15 / H-16 — Body size limit.** `express.json({ limit: "4mb" })` and
  `express.urlencoded({ limit: "1mb" })`. Test: `5) Body size limit` — a 5 MB
  JSON body gets 413; a small body still succeeds.
- **H-1 — CORS allowlist.** New `server/env.ts` (Zod) with a cross-object
  refinement. `CORS_ORIGIN` is required in production, `*` is rejected, and
  every entry must be an absolute URL. `server/index.ts` now reflects the
  allowlist and 403s unlisted Origins. Tests: `1)`, `2)`, `4)`.
- **H-3 — Security headers.** CSP, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, COOP, COEP, X-Frame-Options on every response.
  Test: `3) Security headers` (8 assertions). **Caveat (unverified)**: the
  React client has not been exercised in a real browser under this CSP —
  `style-src 'unsafe-inline'` is present for Vite's dev-mode inline styles,
  `connect-src` allows arbitrary http/https (split-origin deployments), and
  `script-src 'self'` may block Vite's dev preamble. Needs a browser smoke
  test; that is part of the web-hardening milestone, not this one.
- **Stale `VIDEOFORGE_REQUIRE_UI_AUTH` env var removed** from
  `test/api.spec.ts` (the cookie bypass it guarded was removed upstream in
  commit `81e744f`). Test 15 in the API suite now asserts the cookie path is
  dead (401).
- **`.env.example`** and **`ENV.md`** created. `server/env.ts` is the only
  file that reads `process.env`; `routes.ts`, `auth.ts`, `storage.ts`,
  `render.ts`, and `index.ts` now go through `getEnv()`.
- **Pre-commit secret scanner** (`script/pre-commit.sh` + installed to
  `.git/hooks/pre-commit`). Test: `7) Pre-commit secret scanner` — sk- and
  AKIA- patterns are detected.
- **Env fail-fast tests.** Invalid `CORS_ORIGIN`, missing `CORS_ORIGIN` in
  production, and a too-short `VIDEOFORGE_BOOTSTRAP_KEY` each exit(1) with a
  clear, non-echoing message. Tests: `1)` and `2)`.

## 5. Residual risks

- **The CSP is a baseline, not a verified control.** The React client has not
  been exercised in a real browser under this CSP. Until that smoke test
  runs, treat H-3 as "headers are set", not "CSP is enforced and working".
- **CSP allows `style-src 'unsafe-inline'`** because Vite injects inline styles
  in dev, and **`connect-src` allows arbitrary http/https** (needed for the
  split-origin Pages deployment, which the existing `VITE_API_BASE` env var
  supports). Both are deliberate trade-offs, documented here.
- **Live/presence polling is unauthenticated-per-request at the HTTP layer**
  (only the key) — a stolen read key can be polled at 150 ms forever. Add a
  per-IP rate limit on presence. **Open.**
- **No secrets rotation story** (only one `ENCRYPTION_KEY`-equivalent concept
  exists today: `VIDEOFORGE_BOOTSTRAP_KEY`). Documented in `ENV.md`.
- **Pre-commit scanner is line-based** — a secret split across two
  statements (`"sk-abc" + "def..."`) is not caught. Documented; gitleaks in CI
  would catch more. **Open.**
- **ffprobe on untrusted bytes has no timeout** — see H-6 (upload hardening,
  next milestone). Additionally: the current upload handler **still stores the
  file even if ffprobe fails** (`routes.ts:214` only logs a warning), so a
  malformed file that ffprobe rejects is accepted as an asset. A real fix is
  part of H-6.
- **Browser-side API key is stored in `localStorage`** (`client/src/lib/apiKey.tsx:24`).
  This is a persistent secret in the browser — any XSS would exfiltrate it.
  With no XSS present this is Medium, not Critical, but a session-token /
  httpOnly-cookie design is the proper fix (blocked on introducing user
  accounts — see `UPGRADE_AUDIT.md` §7).
- **No per-user ownership of projects or media** — the app's model is API-key,
  not user. "IDOR" in the classic sense doesn't map cleanly until users exist.
  The existing per-key `projectIds` restriction is tested
  (`api.spec.ts` group 16), which is the closest available control today.

## 6. Priority order for remediation

1. ~~H-15/H-16 (body size limit)~~ — **done**.
2. ~~H-1 (env module, CORS)~~ — **done**.
3. ~~H-3 (CSP + headers)~~ — **done**.
4. ~~H-5 (verify `api-docs.tsx`)~~ — **closed (safe)**.
5. H-6 (upload hardening) — magic bytes, ffprobe timeout, quotas. **Next milestone.**
6. H-8, H-10 (rate limit + audit log).
7. ~~H-2 (docs stale flag)~~ — **done** (test flag removed; `docs/API.md` still
   needs the section removed — tracked in `DOCS_AUDIT.md` D-1).
