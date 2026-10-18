---
title: Storage & durability
group: Resources
order: 23
description: Where VideoForge keeps your data, how it is backed up, and how it behaves when a disk is missing.
---

## Where your data lives

Projects, media records, render jobs, accounts and API key hashes live in one SQLite database. Uploads are files in `data/media`, finished exports are files in `data/renders`, and temporary render files use `data/tmp`. Keys are stored as SHA-256 hashes, never as plaintext.

| Variable | What it sets | Default |
|---|---|---|
| `VIDEOFORGE_DB` | The SQLite database file | `data.db` |
| `VIDEOFORGE_MEDIA_DIR` | Uploaded media | `data/media` |
| `VIDEOFORGE_RENDER_DIR` | Rendered MP4 files | `data/renders` |
| `VIDEOFORGE_SYNC_DIR` | Save manifest backup (optional) | off |
| `VIDEOFORGE_MAX_UPLOAD_MB` | Largest single upload | `2048` |

> [!WARNING] On a host with a temporary disk, such as a free Render instance, media and the database reset on every restart. Mount a persistent disk and point the variables above inside it.

## Three layers of saving

The database is the source of truth. Two more layers exist so a mistake or an outage does not cost you work.

- **Database:** every project, asset and render job is written here as you work.
- **Save manifest:** when `VIDEOFORGE_SYNC_DIR` is set, the server writes a JSON backup of every row, with key hashes only. It is a point-in-time backup and is deliberately not merged back on boot, because an old manifest could bring back a project you deleted or a key you revoked.
- **Browser drafts:** the Studio keeps a snapshot of the working copy in the browser every 300 ms, including the unsaved timeline, selection, playhead and zoom. After a closed tab, a refresh or a network drop, the draft is restored and saved on the next autosave.

Open Tools and choose Local drafts to see every draft on the device, delete one or clear them all.

## Sign-in sessions and agent keys

Sessions and agent keys are signed tokens, so they do not live in the database and a reset does not sign anyone out. They do need a signing secret that survives the restart: set `VIDEOFORGE_SESSION_SECRET`, or rely on `VIDEOFORGE_BOOTSTRAP_KEY`, which the secret is derived from. Without either, the secret is a file beside the database, and on a temporary disk that file resets too. `GET /api/health` reports `sessions` as `"durable"` (explicit secret or bootstrap key), `"disk"` (a file that a temporary disk loses) or `"lost-on-restart"` (with a warning).

The database still holds projects, media records and account passwords. A temporary disk loses those on a reset, which is why the Studio keeps a browser draft of the open project and saves it back to the server on the next autosave.

- [Agent keys](agent-keys)

## Restore after a lost database

If a rebuild loses the database, restore by hand with the explicit command. It merges only rows that are missing from the live database and never overwrites a row that already exists.

```shell
npm run durable:restore
```

## Example for a persistent disk

Point every path inside the mounted disk. On Render, with a disk mounted at `/var/lib/videoforge/data`, use:

```shell
VIDEOFORGE_DB=/var/lib/videoforge/data/data.db
VIDEOFORGE_SYNC_DIR=/var/lib/videoforge/data/restore
VIDEOFORGE_MEDIA_DIR=/var/lib/videoforge/data/media
VIDEOFORGE_RENDER_DIR=/var/lib/videoforge/data/renders
```

## When a path cannot be written

Durable directories are created at boot with graceful fallback, so a missing or misplaced disk never crashes the server with a permission error. It starts and degrades in a clear, visible way.

| Part | What happens |
|---|---|
| Save manifest | Turns itself off with a warning. The database and everything else keep working. |
| Database | The server runs on an in-memory database. `GET /api/health` returns `ok: false` with a `warnings` list, and every write to `/api` is refused with a `503` that names the fix. |
| Media, renders and temp files | Uploads and renders that need the unwritable folder fail with a clear message. Reads and everything else keep working. |

Writes are refused instead of accepted into a database that would be lost on the next deploy. Fix `VIDEOFORGE_DB` and redeploy to return to normal. The manifest never mirrors a degraded database, and a bootstrap owner key is discarded, with guidance to set `VIDEOFORGE_BOOTSTRAP_KEY`, rather than printed into deployment logs.

## MongoDB integration (optional)

MongoDB is an optional store for integrations. It does not replace SQLite, and enabling it does not move projects, media or API keys out of the database.

```shell
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/?retryWrites=true
MONGODB_DB=videoforge
```

- **No `MONGODB_URI`:** nothing connects and the app is unchanged.
- **`MONGODB_URI` set:** the connection is created on first use, with a 5 second server selection timeout and a 10 second socket timeout, so a dead cluster cannot hang the server.
- **Health:** `GET /api/health` only reports `mongo: "configured"`. It never contacts the cluster, so an unreachable integration cannot make the app look down.
- **Checking it:** run `npm run mongo:check`. It exits 0 when MongoDB is reachable or not configured, and 1 on an error, so it works in deploy hooks.
- **Safety:** a failed connection never falls back to another store and never crashes the process. Errors never include credentials or driver messages.

Server code can import `getMongoDb` from `./mongo` to use the handle. The pool closes on SIGTERM and SIGINT. All variables are listed in `.env.example`.

- [Self-hosting](self-hosting)
- [Authentication & scopes](authentication)
