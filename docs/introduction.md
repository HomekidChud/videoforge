---
title: Introduction
group: Get started
order: 1
description: One timeline. A browser studio. An API your agents can actually use.
---

## Welcome to VideoForge

VideoForge is a self-hosted video editor and programmable composition engine. Use the Studio to cut footage and animate graphics, or use the same HTTP API to let scripts and AI agents build the edit. Your media stays on your server.

A hosted deployment runs at [videoforge-api-s54w.onrender.com](https://videoforge-api-s54w.onrender.com) — set BASE to it and use an API key issued by that deployment. GET /api/health reports status. To run your own, see Self-hosting.

## Choose your starting point

New to the API? Create a composition in the quickstart. Prefer working visually? Open Studio with a scoped API key. No footage required: the motion toolkit creates shapes, titles and reusable animated layouts.

- [Your first composition](quickstart)
- [Motion graphics tutorial](motion-graphics-tutorial)
- [Motion graphics](motion-graphics)
- [Using the editor](editor)

## The creative loop

Discover capabilities, compose with JSON, inspect the evaluated state or a rendered frame, then export an MP4. Timeline edits are atomic. Preview changes with dryRun before committing them.

```workflow
Discover → Compose → Validate → Inspect → Render
```
