# Your first timeline

This page walks through the shortest path from nothing to a rendered video:
upload an asset, place a clip, add a title, export.

## 1. Get an API key

Create a key from the Studio's **API key** page. Keys have scopes:
`read`, `write`, and `admin`. For editing you need at least `write`.

```bash
export VF_KEY="vf_live_..."
export VF_BASE="http://localhost:5000"   # or your deployed URL
```

## 2. Create a project

```bash
curl -X POST "$VF_BASE/api/v1/projects" \
  -H "Authorization: Bearer $VF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"My first project"}'
```

The response includes the project `id`. Every subsequent call is scoped to it.

## 3. Upload an asset

```bash
curl -X POST "$VF_BASE/api/v1/assets" \
  -H "Authorization: Bearer $VF_KEY" \
  -F "file=@input.mp4"
```

The server probes the file with `ffprobe` and returns an asset record with
`kind` (`video`, `audio`, `image`), `duration`, and dimensions.

## 4. Place a clip on the timeline

```bash
curl -X POST "$VF_BASE/api/v1/projects/$PID/timeline" \
  -H "Authorization: Bearer $VF_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ops": [
      { "op": "add_clip", "args": { "assetId": "a1", "start": 0, "duration": 10, "track": "video" } }
    ]
  }'
```

## 5. Add a title

```json
{ "op": "add_text_clip", "args": { "text": "Hello, world", "start": 0.5, "duration": 3, "x": 0.5, "y": 0.82 } }
```

## 6. Export

```bash
curl -X POST "$VF_BASE/api/v1/projects/$PID/render" \
  -H "Authorization: Bearer $VF_KEY"
```

Rendering runs FFmpeg on the server. Poll the job or subscribe to the
project's live channel to know when the file is ready.

## Next steps

- [Editing operations](/docs/guides/ops/) — the full set of timeline ops.
- [Motion graphics](/docs/guides/motion-graphics/) — shapes, presets, animation.
