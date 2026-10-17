---
title: Authentication & scopes
group: Get started
order: 4
description: Sign in with email, Google or an API key, and give agents only the access they need.
---

## Three ways to sign in

- **Email and password**: the everyday way for people. The first account is created with the workspace owner key (printed to `data/OWNER_KEY.txt` on first boot, or set `VIDEOFORGE_BOOTSTRAP_KEY`); it becomes the workspace admin. After that, new accounts come from an admin (Developer platform → Accounts) unless `VIDEOFORGE_ACCOUNTS=open` allows self-signup.
- **Google**: a “Continue with Google” button appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (standard OAuth, verified id-token claims).
- **API keys**: for AI agents, scripts and the standalone tool exports. No password, no cookie: `Authorization: Bearer <key>`.

Sessions are random tokens stored in SQLite behind an HttpOnly `vf_session` cookie (30 days), so **sign-ins survive server restarts and browser refreshes**. Logout destroys the session. The health endpoint, documentation, share pages and the homepage never require a sign-in.

```shell
# Account sign-in (sets the cookie)
curl -c jar -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
curl -b jar "$BASE/api/auth/me"

# Agent key
curl "$BASE/api/auth/me" -H "Authorization: Bearer $KEY"
```

## Permission scopes

Scopes are cumulative. Additional key restrictions can constrain expiry, project access, allowed origins, request rate, uploads, rendering and deletion.

| Scope | Permission |
|---|---|
| read | Read projects/media, inspect state and frames. |
| write | Read plus upload, edit projects and render. |
| admin | Write plus key management, visibility and live watching. |

## Create an agent key

POST this JSON to /api/keys with an admin Bearer key. Newly created keys are returned once; the server stores their hashes. Keep credentials in environment variables or a secret manager.

```json
{
  "label": "Motion graphics agent",
  "scope": "write",
  "restrictions": {
    "allowDelete": false
  }
}
```

## Handle denied requests

401 means the key is missing or invalid. 403 means its scope or restrictions disallow the request. A revoked or expired key cannot be recovered by retrying. Ask the workspace administrator for an appropriate replacement.

- [API reference](api-reference)
