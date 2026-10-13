# VideoForge Environment Variables

Every variable the server and client read, its type, whether it's required,
an example, and which environment it applies to. Validated at boot by
[`server/env.ts`](server/env.ts) (Zod); a missing or invalid variable fails
startup with a clear list.

Never log env values. The server redacts `token` / `key` fields from its
own JSON response logs (see `server/index.ts`).

## Server

| Variable | Type | Required | Default | Example | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | enum `development\|test\|production` | yes | `development` | `production` | Controls Vite middleware vs static build. |
| `APP_ENV` | enum `development\|test\|staging\|production` | no | `development` | `staging` | Reserved for future per-env config. |
| `APP_URL` | URL | no | — | `https://app.example.com` | Public app URL. |
| `PORT` | int 1–65535 | no | `5000` | `5000` | HTTP listen port. |
| `CORS_ORIGIN` | CSV of origins, or `none` | **yes in production** | unset (dev: allow all) | `https://app.example.com` | Allowlist. `*` rejected. Unset is a boot error in production. |
| `VIDEOFORGE_DB` | path | no | `data.db` | `data.db` | SQLite file. |
| `VIDEOFORGE_MAX_UPLOAD_MB` | int 1–16384 | no | `2048` | `2048` | Per-file upload cap. |
| `VIDEOFORGE_FONT` | path | no | — | `/usr/share/fonts/DejaVuSans.ttf` | Optional font for drawtext. |
| `VIDEOFORGE_BOOTSTRAP_KEY` | string ≥ 32 chars | no | — | `openssl rand -hex 32` | Seeded admin key on first boot. Preferred over `OWNER_KEY.txt`. |

## Client (Vite, baked into the bundle — never secret)

| Variable | Type | Required | Default | Example | Notes |
|---|---|---|---|---|---|
| `VITE_API_BASE` | URL or empty | no | `""` (same-origin) | `https://api.example.com` | Only set when client and API are on different origins. |

## Environments

| Env | NODE_ENV | Notes |
|---|---|---|
| development | `development` | Permissive CORS (if `CORS_ORIGIN` unset), Vite HMR, owner key written to `data/OWNER_KEY.txt`. |
| test | `development` | Uses `data.test.db` (never touches real data). |
| staging | `production` | Same validation as production; typically a narrower `CORS_ORIGIN`. |
| production | `production` | `CORS_ORIGIN` is **required**; static build served from `dist/public`. |

## Secret rotation

- `VIDEOFORGE_BOOTSTRAP_KEY` — changing the value adds a **new** admin key
  on next boot. It does **not** revoke the old admin key or previously-issued
  media tokens. To rotate, change the value, restart, then revoke the old
  admin key via `DELETE /api/keys/:id`.
- Media tokens (6 h TTL) are HMAC'd with a secret derived from the admin key
  hash — revoking the issuing API key invalidates them immediately.
- The generated `data/OWNER_KEY.txt` path is gitignored; delete it after
  copying the key into your password manager / env.

## What is NOT configurable (yet)

These are planned in the upgrade milestones and intentionally absent from
`.env.example` until they ship:

- `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_MAX_TOKENS`, `AI_TIMEOUT_MS`,
  `AI_REQUESTS_PER_MINUTE`, `AI_DAILY_TOKEN_QUOTA` — no AI endpoint exists.
- `DATABASE_URL`, `REDIS_URL`, `STORAGE_*`, `ENCRYPTION_KEY`,
  `JWT_*`, `OAUTH_*`, `SESSION_*`, `CSRF_SECRET`, `TURNSTILE_*`,
  `EMAIL_*`, `SENTRY_DSN`, `WEBHOOK_*`, `API_KEY_HASH_PEPPER` — the
  corresponding features do not exist yet (no OAuth, no sessions, no email,
  no observability sink, no webhooks, no separate encryption at rest).
