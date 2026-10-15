---
title: Examples gallery
group: Examples
order: 12
description: 17 asset-free compositions you can play, copy and render.
---

## How the examples work

Each example is a plain list of timeline ops. The gallery below plays them live with the Studio engine, the repository renders them to GIFs with the real FFmpeg pipeline, and the test suite builds every one, so an example that stops working fails CI. None of them needs uploaded media.

## Run one against your server

Create a project, then POST the ops from the gallery. Replace PROJECT with the id from the first response.

```shell
curl -X POST "$BASE/api/projects" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Beat drop","timeline":{"fps":30,"resolution":{"width":1280,"height":720},"background":"#0f1020","clips":[]}}'

curl -X POST "$BASE/api/projects/$PROJECT/timeline/ops" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d @ops.json   # paste the JSON from the gallery into ops.json

curl "$BASE/api/projects/$PROJECT/frame?t=1.5&width=640" -H "Authorization: Bearer $KEY" -o frame.png
```

## What each one shows

Pick the example closest to what you want to build and change the text, colors and timing.

| Example | Shows |
|---|---|
| {{auto:examples}} |

## Render the GIFs yourself

npm run examples renders every composition plus a transitions reel from generated footage into docs/examples. Pass one or more ids to render only those.

```shell
npm run examples
npm run examples -- beat-drop quote-card
```

- [Motion presets](motion-presets)
- [Transitions](transitions)
