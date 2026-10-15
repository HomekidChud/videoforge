---
title: HTTP API reference
group: Agent API
order: 18
description: The HTTP endpoints used by the Studio and external agents.
---

## Request conventions

Use your own server origin as BASE. Private routes require a Bearer key. JSON requests require Content-Type: application/json. Uploads use multipart/form-data with repeated files fields. :id denotes a path parameter; query parameters are shown where useful.

## Endpoints

Project and media restrictions are checked server-side. Read routes require read or higher. Mutation routes normally require write or higher; keys, visibility and live watching require admin.

| Method | Path | Purpose |
|---|---|---|
| {{auto:endpoints}} |

## Response and error conventions

Project responses contain id, name, visibility, timeline, createdAt and updatedAt. Ops responses add applied and createdClipIds. Render creation returns jobId. Errors include message; invalid ops return 422 and failedIndex, stale guarded ops return 409, unknown resources return 404, and denied credentials return 401 or 403.

## Detailed repository reference

The repository's docs/API.md retains the expanded endpoint contracts, key restrictions, security notes and deployment guidance. The motion graphics additions are also documented there.

- [Your first composition](quickstart)
- [Authentication](authentication)
