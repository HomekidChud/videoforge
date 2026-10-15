---
title: Authentication & scopes
group: Get started
order: 3
description: Give agents only the access they need.
---

## Bearer authentication

Send Authorization: Bearer <key> on every private API request. The health endpoint is public. Documentation and the homepage never require a key. Browser sign-in holds your key only in memory for the current page session.

```shell
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
