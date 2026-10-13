# Introduction

VideoForge is a browser-based video editor with a strict HTTP API. Everything
you can do by clicking in the Studio you can also do by sending an HTTP request
— the same validation, the same undo history, the same rendered result.

It is designed to be driven by both humans and AI agents. The API surface is
small, every operation is validated and revertible, and nothing changes your
timeline silently.

## What's in the box

- **Studio** — the browser editor: timeline, preview, inspector, effects.
- **Developer platform** — HTTP API, API keys with read/write/admin scopes.
- **Live** — real-time collaboration with cursors and presence.
- **Motion graphics** — rectangles, ellipses, lines and progress bars that
  compose with your existing text and media, driven by the same keyframe system.

## How the docs are organised

- **Get Started** — build your first timeline, learn the operations, animations
  and motion graphics.
- **Concepts** — the model behind the editor: clips, tracks, assets,
  transitions, presets and collaboration.
- **API Reference** — the exact contract of every endpoint and operation.

> These pages describe the code as it exists. If you find a page describing
> something that isn't there,
> [open an issue](https://github.com/HomekidChud/videoforge/issues).
