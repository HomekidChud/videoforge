---
title: Self-hosting
group: Resources
order: 18
description: Run the Studio and rendering API on infrastructure you control.
---

## Requirements

Use Node 20 or newer with ffmpeg and ffprobe on PATH. SQLite stores project data, data/media holds uploads and data/renders holds exports. These contain private data; back them up and never commit them.

## Development and production

The default port is 5000. Production serves the compiled frontend from dist/public and runs the API from the bundled server.

```shell
npm ci
npm run dev

# Production
npm run check
npm run build
npm start
```

## Frontend hosting

If you host the frontend separately, set VITE_API_BASE to your HTTPS API origin at build time and configure CORS_ORIGIN on the backend. The frontend alone cannot render video; FFmpeg and the API must remain running. Hash routes support GitHub Pages without rewrite rules.

## Secure your deployment

Use HTTPS, secure the owner key, restrict agent keys and configure your frontend origin. Do not expose data directories directly. Keep dependency security updates current. See docs/API.md in the repository for the detailed security and deployment notes.
