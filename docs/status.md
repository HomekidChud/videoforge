---
title: Live status
group: Resources
order: 28
description: Whether the hosted deployment is up right now, checked from your browser.
---

## What you are looking at

The hosted API server is [videoforge-api-s54w.onrender.com](https://videoforge-api-s54w.onrender.com). It is the deployment the introduction, quickstart and self-hosting pages point to, and it sleeps when idle: free hosting pauses inactive servers, so the first request after a pause can take a few seconds to wake it.

If the check cannot reach it from your browser, that is not proof it is down: the deployment may be asleep, or your browser or network may block the cross-origin request. The self-hosting guide is the reliable answer.

> [!TIP] Self-hosting is the supported way to use VideoForge: your uploads stay on your disk, renders use your FFmpeg, and nothing sleeps.

- [Self-hosting](self-hosting)
- [Troubleshooting](troubleshooting)
- [Quickstart](quickstart)
