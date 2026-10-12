# VideoForge Agent API — Complete Reference

VideoForge is a browser video editor with a first-class REST API for **AI agents**. Every endpoint the editor UI uses is the same JSON API exposed to external agents, so you can build, edit, and render video entirely programmatically.

This document explains **how to get an API key, what each permission (scope) does, and how to use every endpoint**.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Authentication (API keys)](#authentication-api-keys)
3. [Permissions (scopes)](#permissions-scopes)
4. [Managing keys](#managing-keys)
5. [Deployment](#deployment)
6. [REST endpoints](#rest-endpoints)
7. [Using this from another AI agent (connector pattern)](#using-this-from-another-ai-agent-connector-pattern)
8. [Errors](#errors)
9. [Limits and best practices](#limits-and-best-practices)

---

## Quick start

```bash
git clone git@github.com:HomekidChud/videoforge.git
cd videoforge
npm ci
npm run dev        # starts on http://localhost:5000
```

On first boot, the server prints a banner with your **admin (owner) key** and writes it to `data/OWNER_KEY.txt`. Copy that key somewhere safe, then delete the file.

```bash
curl http://localhost:5000/api/health
# → {"ok":true,"service":"videoforge-api","version":1}
```

With your admin key you can then mint **scoped keys** for other AI agents (e.g. a "read" key for an agent that only needs to inspect timelines, or a "write" key for an agent that uploads and edits video).

---

## Authentication (API keys)

### How keys look

| Prefix | Purpose |
|---|---|
| `vf_admin_...` | Owner/admin key. Can create & revoke other keys. |
| `vf_live_...` | Normal agent key. Scoped (read / write / admin). |

Keys are **only shown once** when they are created. The server stores only `sha256(key)`, never the plaintext.

### Sending the key

```
Authorization: Bearer vf_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Example:

```bash
curl -H "Authorization: Bearer vf_live_abc123" \
     http://localhost:5000/api/projects
```

### The UI cookie bypass

The browser editor sets a `vf_ui=1` cookie so it can call the API without a key. This is **not** a backdoor — it is only enabled when `VIDEOFORGE_REQUIRE_UI_AUTH` is not set to `1`. To force even the UI to use a key, set that env var.

> ⚠️ For any production deployment, set `VIDEOFORGE_REQUIRE_UI_AUTH=1` so the UI must also present a key.

---

## Permissions (scopes)

Three scopes exist. Each grants everything the previous one does.

| Scope | What it can do | Who should hold it |
|---|---|---|
| `read` | GET requests: list media, projects, renders, download finished renders | an agent that just inspects or summarizes timelines |
| `write` | `read` + upload media, create/edit/delete projects, queue renders, download | the standard "do work" agent |
| `admin` | `write` + create / list / revoke other API keys | **you only** — this is the owner key |

### Scope enforcement table

| Endpoint | `read` | `write` | `admin` |
|---|---|---|---|
| `GET /api/health` | ✅ (open, no key needed) | ✅ | ✅ |
| `GET /api/media`, `/api/media/:id` | ✅ | ✅ | ✅ |
| `GET /api/media/:id/raw`, `/api/media/:id/thumb` | ✅ | ✅ | ✅ |
| `GET /api/projects`, `/api/projects/:id` | ✅ | ✅ | ✅ |
| `GET /api/renders`, `/api/renders/:id` | ✅ | ✅ | ✅ |
| `GET /api/renders/:id/download` | ✅ | ✅ | ✅ |
| `POST /api/media/upload` | ❌ | ✅ | ✅ |
| `POST /api/projects` | ❌ | ✅ | ✅ |
| `PUT /api/projects/:id` | ❌ | ✅ | ✅ |
| `DELETE /api/media/:id` | ❌ | ✅ | ✅ |
| `DELETE /api/projects/:id` | ❌ | ✅ | ✅ |
| `POST /api/projects/:id/timeline/ops` | ❌ | ✅ | ✅ |
| `POST /api/renders` | ❌ | ✅ | ✅ |
| `GET /api/keys` | ❌ | ❌ | ✅ |
| `POST /api/keys` | ❌ | ❌ | ✅ |
| `DELETE /api/keys/:id` | ❌ | ❌ | ✅ |
| `GET /api/keys/owner` | ❌ | ❌ | ✅ |

---

## Managing keys

### Creating a key

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer vf_admin_YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"Claude agent (edit only)","scope":"write"}'
```

Response (the plaintext key is shown **once**):

```json
{
  "message": "Save this key now — it is shown only once.",
  "key": "vf_live_9f8e7d6c5b4a3210fedcba9876543210fedcba9876543210",
  "record": {
    "id": "b2f2...",
    "label": "Claude agent (edit only)",
    "scope": "write",
    "revoked": false,
    "createdAt": 1760000000000
  }
}
```

Store that `key` value in your AI agent's credential manager / env var immediately.

### Listing keys

```bash
curl -H "Authorization: Bearer vf_admin_..." \
     http://localhost:5000/api/keys
```

Returns metadata only — no key plaintext.

### Revoking a key

```bash
curl -X DELETE -H "Authorization: Bearer vf_admin_..." \
     http://localhost:5000/api/keys/<key-id>
# → {"revoked":true}
```

Any subsequent request with that key now returns `403 Forbidden: this key has been revoked.`

### Recovering the owner key

`GET /api/keys/owner` (admin only) returns the owner key plaintext **only while it is still held in memory from the boot process**. If the server has restarted and `data/OWNER_KEY.txt` has been deleted, this returns 404 — create a new admin key instead. Because only one admin key exists at a time, the recommended flow is:

1. On first boot, save the owner key from `data/OWNER_KEY.txt` somewhere safe.
2. `rm data/OWNER_KEY.txt`
3. To rotate: create a fresh admin key with the existing admin key, then revoke the old one.

---

## Deployment

### Running locally

```bash
npm ci
npm run dev      # dev server on :5000
```

### Running in production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Requirements:
- Node 20+
- `ffmpeg` and `ffprobe` on `PATH`
- A writable `data/` directory

### Environment variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port to bind. |
| `NODE_ENV` | `development` | Set to `production` for the built bundle. |
| `VIDEOFORGE_REQUIRE_UI_AUTH` | unset | Set to `1` to force even the UI to present an API key. |

### Security notes

- `data.db` (SQLite) and `data/media/` are where user uploads and metadata live. **Never** commit these to git — `.gitignore` already excludes them.
- Only key plaintexts are shown once, at creation time. They are never logged by the server, never returned by any other endpoint, and never stored in the database in plaintext.
- To rotate a key: mint a new one, update your agent's credentials, then revoke the old key.
- The `/api/keys/owner` endpoint is only useful immediately after the first boot; after a restart, use the existing admin key to mint new ones.

---

## REST endpoints

All endpoints expect and return JSON unless noted (multipart for upload). A successful response has HTTP status in the 2xx range. Errors are documented in the [Errors](#errors) section.

### `GET /api/health`

Health check. **No key required.**

```json
{"ok":true,"service":"videoforge-api","version":1}
```

---

### `POST /api/media/upload`

Upload one or more media files (video / audio / image). **Scope: `write`.**

Multipart/form-data, field name `files` (can be repeated).

```bash
curl -X POST http://localhost:5000/api/media/upload \
  -H "Authorization: Bearer vf_live_..." \
  -F "files=@clip.mp4"
```

Response (HTTP 201):

```json
{
  "assets": [
    {
      "id": "abc123",
      "filename": "clip.mp4",
      "kind": "video",
      "mime": "video/mp4",
      "duration": 12.34,
      "width": 1920,
      "height": 1080,
      "sizeBytes": 4096000,
      "uploadUrl": "/api/media/abc123/raw",
      "thumbnailUrl": "/api/media/abc123/thumb",
      "createdAt": 1760000000000
    }
  ]
}
```

Notes:
- Server probes duration, dimensions, and audio-stream presence with `ffprobe`.
- If `ffprobe` fails (corrupt file), the asset is still created with `duration: 0`. Delete it or ignore it.
- Accepted types: `video/*`, `audio/*`, `image/*` (mp4, webm, mov, mkv, avi, mp3, wav, ogg, m4a, aac, flac, png, jpg, jpeg, gif, webp).

### `GET /api/media`

List all uploaded assets. **Scope: `read`.**

### `GET /api/media/:id`

Get one asset's metadata. **Scope: `read`.**

### `DELETE /api/media/:id`

Delete an asset and its underlying file. **Scope: `write`.**

### `GET /api/media/:id/raw`

Stream the raw media file. **Scope: `read`.** Range requests are supported (`Accept-Ranges: bytes`).

### `GET /api/media/:id/thumb`

Get a JPEG thumbnail (first video frame, or scaled-down image). Generated on-demand and cached. **Scope: `read`.**

---

### `POST /api/projects`

Create a project with an initial timeline. **Scope: `write`.**

```json
{
  "name": "Agent edit",
  "timeline": {
    "fps": 30,
    "resolution": { "width": 1280, "height": 720 },
    "clips": []
  }
}
```

Response (HTTP 201) returns the full project with its `id`.

### `GET /api/projects`

List all projects, including their current timelines. **Scope: `read`.**

### `GET /api/projects/:id`

Get one project. **Scope: `read`.**

### `PUT /api/projects/:id`

Rename a project and/or replace its timeline (full overwrite). **Scope: `write`.**

```json
{
  "name": "Renamed edit",
  "timeline": {
    "fps": 30,
    "resolution": { "width": 1280, "height": 720 },
    "clips": [
      { "id": "c1", "assetId": "abc", "track": "video", "start": 0,
        "inPoint": 0, "outPoint": 5.2, "volume": 1, "muted": false }
    ]
  }
}
```

### `DELETE /api/projects/:id`

Delete a project (does **not** delete the underlying media). **Scope: `write`.**

---

### `POST /api/projects/:id/timeline/ops`

Apply a single atomic timeline edit. **Scope: `write`.** Returns the updated project.

Body shape: `{"op": "<op-name>", "args": { ... }}`.

Supported `op` values:

| Op | Args | Description |
|---|---|---|
| `add_clip` | `assetId` (required), `track` (`"video"\|"audio"\|"overlay"`), `start`, `inPoint`, `outPoint`, `volume`, `muted`, `text` | Append a clip from an existing asset. `outPoint` defaults to `inPoint + 5`. |
| `remove_clip` | `clipId` | Remove a clip from the timeline. |
| `trim_clip` | `clipId`, `inPoint`?, `outPoint`? | Change the in/out trim points. |
| `move_clip` | `clipId`, `start` | Reposition the clip on the timeline. |
| `set_audio` | `clipId`, `volume` (0..1), `muted` (bool) | Adjust per-clip audio. |
| `add_text` | `clipId`, `text` | Attach a burned-in text caption to a clip. |
| `reorder` | `order: [clipId, clipId, ...]` | Reorder clips on the timeline. Must include every clip id exactly once. Video clips get re-spaced sequentially. |

Example — append a clip:

```json
{ "op": "add_clip",
  "args": { "assetId": "abc123", "track": "video", "start": 0,
            "inPoint": 0, "outPoint": 5.2, "volume": 1, "muted": false } }
```

Example — trim:

```json
{ "op": "trim_clip", "args": { "clipId": "c1", "inPoint": 1.0, "outPoint": 4.5 } }
```

---

### `POST /api/renders`

Queue a render job for a project. **Scope: `write`.** Fire-and-forget; poll the job.

```json
{ "projectId": "prj_abc" }
```

Response (HTTP 201):

```json
{ "jobId": "j_abc", "status": "queued", "statusUrl": "/api/renders/j_abc" }
```

### `GET /api/renders`

List render jobs (optionally `?projectId=`). **Scope: `read`.**

### `GET /api/renders/:id`

Get one job's status. **Scope: `read`.**

```json
{
  "id": "j_abc",
  "projectId": "prj_abc",
  "status": "rendering",     // queued | rendering | done | error
  "progress": 0.42,          // 0..1
  "outputPath": null,
  "error": null,
  "createdAt": 1760000000000,
  "updatedAt": 1760000010000
}
```

### `GET /api/renders/:id/download`

Download the rendered MP4. **Scope: `read`.** Returns 404 until `status == "done"`.

---

## Using this from another AI agent (connector pattern)

This is the pattern that makes the API most useful: **give an AI agent your `vf_live_...` key as a credential, and they can edit video on your behalf**.

### 1. Mint a scoped key

For an agent that should be able to upload and edit video but not create more keys:

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer vf_admin_..." \
  -d '{"label":"Claude","scope":"write"}'
```

### 2. Give the agent two things

- **Base URL** (e.g. `https://your-videoforge.example.com`)
- **The key** (e.g. `vf_live_...`)

Store them in the agent's secret store. The agent then makes standard REST calls:

```
POST /api/media/upload       Authorization: Bearer <key>
POST /api/projects
POST /api/projects/<id>/timeline/ops
POST /api/renders
GET  /api/renders/<jobId>
GET  /api/renders/<jobId>/download
```

### 3. Sample agent workflow

```bash
# upload a video
curl -X POST $BASE/api/media/upload -H "Authorization: Bearer $KEY" \
     -F "files=@input.mp4"

# create a project
curl -X POST $BASE/api/projects -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"auto-edit","timeline":{"fps":30,"resolution":{"width":1280,"height":720},"clips":[]}}'

# add a clip from that asset, trim to 5s
curl -X POST $BASE/api/projects/$PROJECT_ID/timeline/ops \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"op":"add_clip","args":{"assetId":"'"$ASSET_ID"'","track":"video","start":0,"inPoint":0,"outPoint":5}}'

# render
curl -X POST $BASE/api/renders -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" \
     -d '{"projectId":"'"$PROJECT_ID"'"}'

# poll
while true; do
  s=$(curl -s $BASE/api/renders/$JOB_ID -H "Authorization: Bearer $KEY" | jq -r '.status')
  [ "$s" == "done" ] && break
  [ "$s" == "error" ] && echo "render failed" && exit 1
  sleep 2
done

# download
curl -o output.mp4 $BASE/api/renders/$JOB_ID/download -H "Authorization: Bearer $KEY"
```

### 4. Revoke access when done

```bash
curl -X DELETE $BASE/api/keys/$KEY_ID -H "Authorization: Bearer $KEY"
```

### MCP-style connector

If your AI platform supports "connectors" that let an agent call an arbitrary REST API with a stored credential, configure it as:

| Field | Value |
|---|---|
| Base URL | `https://your-videoforge.example.com` |
| Auth header | `Authorization: Bearer <vf_live_...>` |
| Content type | JSON (multipart for `/api/media/upload`) |
| Scopes required | `write` for full edit; `read` for read-only |

The server is intentionally plain REST (no OAuth dance) because API keys are simpler and more compatible with AI-agent credential stores.

---

## Errors

All errors return JSON with an HTTP status code and a `message` field.

| Status | Meaning |
|---|---|
| `400` | Malformed request body (e.g. missing required field). |
| `401` | Missing or malformed `Authorization` header, or unknown/revoked key. |
| `403` | Key exists but doesn't have the required scope, or has been revoked. |
| `404` | Resource not found (asset / project / render / download). |
| `413` | Request body too large (upload size limit). |
| `422` | Semantic validation failed (e.g. `timeline/ops` op failed because the clip doesn't exist). |
| `500` | Internal server error. |

Example 403 response:

```json
{ "message": "Forbidden: this key has scope 'read' but this action requires 'write'." }
```

---

## Limits and best practices

- **Upload size**: no built-in limit in Express; front your server with Nginx or a reverse proxy with a sane `client_max_body_size`.
- **Render duration**: render progress is tracked as a fraction of the timeline's total video duration. Very long timelines can take a while; poll at 2s+ intervals.
- **Storage**: SQLite stores metadata; raw media lives under `data/media/`; renders under `data/renders/`. Keep both on a disk with capacity.
- **Concurrency**: multiple simultaneous renders are supported (each is an independent ffmpeg process). Keep an eye on CPU for large files.
- **Security**: always serve over HTTPS in production. Never log or commit API keys. Revoke keys when an agent stops needing them.

---

## Contributing / further reading

- The editor UI lives in `client/`.
- The API + render worker live in `server/`.
- Shared TypeScript types live in `shared/schema.ts`.
- The in-app API reference is rendered at `#/api-docs`.
- The full permission model lives in `server/auth.ts`.
