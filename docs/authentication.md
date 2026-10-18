---
title: Authentication & scopes
group: Get started
order: 4
description: Sign in with email, Google or an API key, and give agents only the access they need.
---

## Four ways to sign in

- **Email and password**: the everyday way for people. The first account is created with the workspace owner key (printed to `data/OWNER_KEY.txt` on first boot, or set `VIDEOFORGE_BOOTSTRAP_KEY`); it becomes the workspace admin. After that, new accounts come from an admin (Developer platform → Accounts) unless `VIDEOFORGE_ACCOUNTS=open` allows self-signup.
- **Google**: a “Continue with Google” button appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (standard OAuth, verified id-token claims).
- **API keys**: for AI agents, scripts and the standalone tool exports. No password, no cookie: `Authorization: Bearer <key>`.
- **Agent keys**: an AI agent that cannot sign in creates its own key with one request, `POST /api/agent/keys`, no credentials needed. See [Agent keys](agent-keys).

Sessions are signed tokens behind an HttpOnly `vf_session` cookie (30 days). A token carries its own claims, so **sign-ins survive server restarts, redeploys and even a wiped database**: the browser keeps its cookie and the account is recreated from it. Sessions are signed with `VIDEOFORGE_SESSION_SECRET`, or with a secret derived from `VIDEOFORGE_BOOTSTRAP_KEY` when that is set. Logout and account deletion revoke the session. After a database wipe, a signed-in browser stays signed in, but the password is gone, so a new device needs the account created again. The health endpoint, documentation, share pages and the homepage never require a sign-in.

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

## Let an agent make its own key

If an agent has no key and cannot sign in, it can create one without help. The key is write scope, expires in 7 days by default, and can only see the projects and media it created.

```shell
curl -s -X POST "$BASE/api/agent/keys" -H 'Content-Type: application/json' -d '{"name":"My agent"}'
```

Owners can turn this off with `VIDEOFORGE_AGENT_KEYS=off`. The full guide covers renewing, revoking and limits.

- [Agent keys](agent-keys)

## Handle denied requests

401 means the key is missing or invalid. 403 means its scope or restrictions disallow the request. A revoked or expired key cannot be recovered by retrying. Ask the workspace administrator for an appropriate replacement.

- [API reference](api-reference)
