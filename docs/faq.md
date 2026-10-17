---
title: FAQ
group: Resources
order: 26
description: Short answers to the questions that come up most.
---

## General

**Is my footage uploaded anywhere?** No. Your self-hosted server stores uploads in `data/media` on your own disk. The hosted deployment is for trying the API; self-host to control the data.

**Can I use it without an account?** Yes. The Studio, docs and share pages never require a sign-in. An account is only needed to keep projects and keys; the first account requires the owner key from first boot.

**What formats can I import?** Anything FFmpeg can decode: MP4, MOV, WebM for video, MP3, WAV, AAC, M4A for audio, plus images. If the browser can play it but the export cannot, re-encode to H.264 + AAC.

**What do I need to run it?** Node 20 or newer and `ffmpeg`/`ffprobe` on PATH. That is the whole list; SQLite is bundled, no other database is required.

## Studio

**Where does my project go?** Autosave writes it to the server as you work; the timeline is the single source of truth for Studio, API and renders alike.

**What is the difference between the three tracks?** Video is full-frame footage and images, overlay is picture-in-picture clips, titles and shapes stacked by z-order, audio is music and voice-over.

**Can I undo everything?** Yes, undo and redo cover drops, deletes, pastes, drags and quick typing, in Studio and in the block studio.

**How do I export?** Export renders an MP4 with FFmpeg server-side. Queue it from Export, watch progress, then download the finished file.

## Motion graphics

**What is a motion preset?** A ready-made entrance, exit, attention or camera move applied to a clip, animate one thing or stagger many.

**What are keyframes and formulas?** Keyframes set a property at moments in time with easing between them; formulas (expressions) drive a property with code of time. Both preview live and both render in FFmpeg.

**What does the Animator do?** It poses clips together as a rig and bakes the result into ordinary keyframes, so preview and export need nothing new.

## API and agents

**How do agents authenticate?** With scoped API keys: `Authorization: Bearer <key>`. Scopes are read, write or admin, with per-key restrictions for expiry, projects, rate, uploads, rendering and deletion.

**How do I make several edits safely?** Send them as one atomic batch to `/api/projects/:id/timeline/ops` with `dryRun: true` first, then for real with `expectedUpdatedAt` so a stale write fails with 409 instead of clobbering.

**Can I see what I built before rendering?** Yes: `GET /frame?t=1.5` returns a composed PNG, `GET /state?t=1.5` returns the animated values, and `GET /storyboard` returns a contact sheet.

**Is there an OpenAPI file?** Yes. An OpenAPI description generated from the operation list is served at [the OpenAPI description](https://homekidchud.github.io/videoforge/openapi.json) and linked from the HTTP API reference.

## Self-hosting

**Can I host the frontend separately from the API?** Yes. Build the frontend with `VITE_API_BASE`, set `CORS_ORIGIN` on the backend, and keep FFmpeg with the API. The frontend cannot render video on its own.

**How do I back up?** Back up the `data` directory (SQLite, `data/media`, `data/renders`) together. The Storage & durability page covers the backup recipes and the optional MongoDB store.

- [Troubleshooting](troubleshooting)
- [Authentication & scopes](authentication)
- [Batch operations](batch-operations)
- [Self-hosting](self-hosting)
