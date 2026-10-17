---
title: Troubleshooting
group: Resources
order: 25
description: Fixes for the errors people actually hit: uploads, renders, keys and self-hosting.
---

## Setup and first boot

The server needs Node 20 or newer, plus `ffmpeg` and `ffprobe` on PATH. If either binary is missing, uploads fail with a probe error and renders never start.

> [!NOTE] `ffmpeg -version` and `ffprobe -version` should both print a version. On Ubuntu, `apt install ffmpeg` installs both. On macOS, `brew install ffmpeg`.

The first boot prints an owner key and writes it to `data/OWNER_KEY.txt`. The first account must be created with it; after that, delete the file and keep the key in a password manager. If the file is gone and no account exists, set `VIDEOFORGE_BOOTSTRAP_KEY` and restart to print a fresh one.

## Uploads and media

**Upload fails with "probe" or "unsupported".** Every file is probed once on upload. Video and audio need a codec FFmpeg can decode: MP4/H.264, MOV, WebM and MP3/WAV/AAC/M4A are the safe choices. A zero-byte or partially uploaded file also fails here. Check the file plays locally first.

**The thumbnail or waveform never appears.** Thumbnails are made straight after upload; if the file is still uploading elsewhere or the disk is full, they are skipped. Re-upload the file once the underlying problem is fixed.

**Media plays in the browser but not in the export.** The browser plays many codecs FFmpeg's default build cannot decode. Re-encode the source with `ffmpeg -i input -c:v libx264 -c:a aac output.mp4` and swap the asset.

## Renders

**A render stays queued.** Renders run one at a time by default and need disk space in `data/renders`. Check the server logs for the FFmpeg error line; the most common causes are a full disk, a missing binary and a clip whose asset was deleted.

**The render looks different from the preview.** Report it with the project ID. Preview and export share the same engine, so a mismatch is a bug, not a tuning knob. Before reporting, check the project still validates with `POST /api/projects/:id/timeline/validate`.

**Renders are slow.** Render time scales with clip count, effects and resolution. Render at 720p while composing, and switch the project resolution up for the final pass. `GET /api/renders/:id` reports progress so you can poll instead of guessing.

## Keys and sign-in

**401 from the hosted deployment.** Keys are issued per deployment: a key from your local server never works on the hosted one, and the reverse. Create a key on the deployment you are calling.

**403 with a scope error.** The key's scope is too small: read keys cannot upload or edit, write keys cannot manage other keys. The error names the missing scope; recreate the key with it or use an admin key.

**Sessions signed out after a restart.** Sessions live in SQLite, so restarts keep them. If everyone is signed out, the SQLite file changed or was restored from a different backup. Sign in again.

**First account: "owner key required".** That is by design. Use the key from `data/OWNER_KEY.txt` (or `VIDEOFORGE_BOOTSTRAP_KEY`) for the first account only.

## API and agents

**409 on a timeline edit.** The batch carried `expectedUpdatedAt` and another edit landed first. The write is refused so nothing is clobbered. GET the project, read the fresh `updatedAt`, and send it with the next batch. The atomic batches page explains the pattern.

**An operation name is rejected.** Operation names come from `GET /api/capabilities`; never invent one. The validation error names the closest known operation if there is a typo.

**dryRun says OK but the real batch fails.** dryRun validates the timeline shape; it cannot catch a missing asset or a key restriction such as `allowUpload: false`. Run the real batch and read the error body.

## Self-hosting

**The frontend cannot reach the API.** If the frontend is hosted separately, `VITE_API_BASE` must be set at build time to the API origin, and `CORS_ORIGIN` on the backend must allow the frontend origin. The frontend alone cannot render video, FFmpeg must stay with the API.

**Data directories.** `data/` (SQLite), `data/media` (uploads) and `data/renders` (exports) hold everything. Back them up together, restore them together, and never serve them statically. The Storage & durability page covers backups and the optional MongoDB store.

- [Storage & durability](storage-and-durability)
- [Authentication & scopes](authentication)
- [Rendering & inspection](rendering)
- [Self-hosting](self-hosting)
