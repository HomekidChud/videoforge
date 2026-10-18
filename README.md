# VideoForge

A browser video editor with motion graphics, and an HTTP API that lets scripts and AI agents build the same edits. One timeline, two ways in: the Studio for people, scoped API keys for agents.

[Read the docs](https://homekidchud.github.io/videoforge/#/docs/introduction) · [Motion graphics tutorial](https://homekidchud.github.io/videoforge/#/docs/motion-graphics-tutorial) · [Contribute](docs/contribute.md)

A hosted deployment runs at <https://videoforge-api-s54w.onrender.com> (health at `GET /api/health`). Keys are issued per deployment, so a local key does not work there.

![Entrance presets](docs/examples/preset-sampler.gif)

## What it does

- **Studio editor:** live preview, a three-lane timeline, trim, split, snapping, undo, autosave and an MP4 export rendered with FFmpeg
- **Motion graphics:** shapes, titles, 13 editable templates, 33 motion presets, keyframes with easing and formulas that animate any property
- **Animator:** pose clips, text and shapes as a rig and bake the result into keyframes
- **Blocks and scripts:** build repeatable edits from blocks, preview them, then apply in one undoable step
- **Agent API:** upload, edit timelines in safe atomic batches, inspect frames and queue renders
- **Accounts and keys:** sign in with email or Google, or use `read`, `write` and `admin` API keys with restrictions

## Quick start

You need Node 20 or newer, plus `ffmpeg` and `ffprobe` on your PATH.

```bash
npm ci
npm run dev
```

The app runs at <http://localhost:5000>. On first boot the server prints an owner key and writes it to `data/OWNER_KEY.txt`. Use it to create your account, then delete the file.

For production, run `npm run build` and then `npm start`.

## Documentation

Everything else lives in [docs/](docs/). Each page is a markdown file that also powers the docs site.

| Start here | |
|---|---|
| [Introduction](docs/introduction.md) | What VideoForge is and how the pieces fit |
| [Your first composition](docs/quickstart.md) | Create and export a lower third with the API |
| [Motion graphics tutorial](docs/motion-graphics-tutorial.md) | Build an animated intro in the Studio |
| [Using the editor](docs/editor.md) | Panels, shortcuts, collaboration and export |
| [Authentication & scopes](docs/authentication.md) | Accounts, API keys and restrictions |
| [Agent keys](docs/agent-keys.md) | An AI agent creates its own API key in one request |
| [Agent workflow](docs/agent-workflow.md) | Discover, compose, validate, inspect, render |
| [Self-hosting](docs/self-hosting.md) | Run it on your own infrastructure |
| [Storage & durability](docs/storage-and-durability.md) | Disks, backups and the optional MongoDB store |
| [Full HTTP reference](docs/API.md) | Every endpoint and scope |

## Contributing

Issues and pull requests are welcome. [docs/contribute.md](docs/contribute.md) covers setup, the code layout, tests and how to add a preset, template or block.

```bash
npm run check   # regenerate docs and type check
npm test        # the whole suite (needs ffmpeg)
npm run build
```

## License

MIT
