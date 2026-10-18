---
title: Agent keys
group: Agent API
order: 17
description: Let an AI agent create its own API key in one request, with no sign-in, no email and no human in the loop.
badge: new
badgeUntil: 2027-01-31
---

## Why agents get their own keys

Many AI agents cannot sign in. They have no inbox for a confirmation email, cannot solve a CAPTCHA and cannot follow an OAuth redirect. One request gives the agent a working key instead. No account and no password are involved.

The key is a signed token, not a database row. It keeps working after the server restarts, redeploys or loses its disk, as long as the server keeps its signing secret (see Keep keys across restarts below).

## Create a key

Send POST /api/agent/keys with no Authorization header. Both fields are optional.

```shell
BASE=https://videoforge-api-s54w.onrender.com
curl -s -X POST "$BASE/api/agent/keys" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Motion graphics agent","days":7}'
```

The response contains the key. It is shown once, so store it at once in `VF_API_KEY`.

```json
{
  "key": "vf_agent.eyJhIjoi...",
  "agentId": "9f2c41d07a3b5e68",
  "scope": "write",
  "expiresAt": 1792000000000,
  "sandbox": "This key sees only the projects and media it creates."
}
```

Send it on every request as `Authorization: Bearer <key>`. Confirm it with GET /api/auth/me, which reports `kind: "agent"`.

| Field | Meaning | Default |
|---|---|---|
| name | A label of up to 80 characters, shown in key metadata | agent |
| days | How long the key lasts, from 1 to 30 | 7 |

## Sign up from a page or a plain link

Not every tool can send a POST request. Two other ways get the same key, with the same limits and the same throttle.

- The sign-up page. Open `/#/signup` in the app, or the plain HTML version at `/signup.html`, which needs no app bundle and reads cleanly for tools that browse. Pick a name and a length, press the button and copy the key. It is shown once.
- A link. A tool that can only fetch a URL can use GET /api/agent/signup, with optional `name` and `days` query parameters. The reply is the same JSON as the POST request, and it is never cached.

```shell
curl -s "$BASE/api/agent/signup?name=my-agent&days=7"
```

People who want a permanent account with an email and password use the sign-in page instead, when the server has open sign-ups.

## Stay signed in after a refresh

In a browser, the Studio trades the key for an HttpOnly cookie as soon as you open it from the sign-up page or the sign-in page. Refreshing the tab, or coming back later, keeps you signed in until the key expires, with no key stored where page scripts can read it.

The cookie carries the same signed key, so nothing about it is looser. It expires with the key, it sees only what that agent created, and revoking the agent stops the cookie as well. Signing out clears it.

Scripts and agents that send the Authorization header do not need this. A tool that wants the same behaviour sends POST /api/agent/session with the key, keeps the cookie it gets back, and can then call the API without the header. DELETE /api/agent/session clears it.

If your browser blocks third party cookies and the app and the API are on different sites, the cookie is dropped and the Studio falls back to keeping the key in memory for that page session.

## What an agent key can do

An agent key has write scope, so it can upload media, build and edit projects and render them. It is deliberately boxed in.

- **Sandboxed.** It sees only the projects, media and renders it created. Other projects in the workspace return 403, and a timeline that references media the agent did not upload is refused.
- **Rate limited.** 120 requests a minute by default. Exceeding it returns 429 with a Retry-After header.
- **Short lived.** Keys expire after 7 days unless a different length up to 30 days is requested.
- **No administration.** It cannot create other keys, manage accounts or watch live editing.

Keys made by an admin through POST /api/keys are not sandboxed, and neither are the owner key or signed-in accounts. They see the whole workspace.

## Renew and revoke

Renew before the key expires. The new key belongs to the same agent, so it keeps access to everything the agent made. The old key keeps working until its own expiry.

```shell
curl -s -X POST "$BASE/api/agent/keys/renew" \
  -H "Authorization: Bearer $VF_API_KEY" -H 'Content-Type: application/json' \
  -d '{"days":14}'
```

An agent that is finished can revoke itself with DELETE /api/agent/keys/self. That ends every key for the agent, including renewed ones. An admin can do the same for any agent with DELETE /api/agent/keys/:agentId, using the agentId from the create response.

## Check whether it is available

GET /api/agent needs no key and describes the endpoint, the limits and whether it is enabled on this server. GET /api/auth/config also reports `agentKeys: true` or `false`.

If creation returns 403 the owner has turned it off. Ask the user for a key instead, as described in the editing skill. If it returns 429, wait for the number of seconds in Retry-After. Each address can create 20 keys an hour.

## Keep keys across restarts

Agent keys and browser sign-in sessions are signed with one server secret. The server looks for it in this order:

1. `VIDEOFORGE_SESSION_SECRET`, an explicit long random value. Best choice.
2. `VIDEOFORGE_BOOTSTRAP_KEY`, which hosted servers already set. The secret is derived from it, so nothing else is needed.
3. A `session-secret` file next to the database. It lasts as long as the disk does.
4. A random secret held in memory. Keys and sessions stop working at every restart.

GET /api/health reports `sessions`: `"durable"` for the first two, `"disk"` for the file, which a temporary disk loses, and `"lost-on-restart"` for the last, which also adds a warning. Changing the secret signs everyone out and invalidates every agent key.

## For server owners

| Variable | Effect | Default |
|---|---|---|
| `VIDEOFORGE_AGENT_KEYS` | Set to `off` to refuse self-serve keys. | on |
| `VIDEOFORGE_AGENT_RPM` | Requests a minute for each agent key. | 120 |
| `VIDEOFORGE_AGENT_KEYS_PER_IP` | Keys one address may create in an hour. | 20 |

A revoked agent is remembered in the database. If the database is wiped, revocations are forgotten and the key works again until it expires. Keep keys short lived, and rotate the secret if you need to cancel every key at once.

- [Authentication & scopes](authentication)
- [Agent workflow](agent-workflow)
- [Storage & durability](storage-and-durability)
