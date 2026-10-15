---
title: Your first composition
group: Get started
order: 2
description: Create an animated lower third and export it without uploading a single asset.
---

## Connect to your server

Run npm ci and npm run dev in the repository. The default server is http://localhost:5000. On first boot, the server creates an owner key; use it to generate a restricted write key for your agent. Set BASE to your server URL and KEY to that scoped key. Never put the owner key in client code.

```shell
export BASE="http://localhost:5000"
export KEY="<your-scoped-write-key>"
curl "$BASE/api/capabilities" \
  -H "Authorization: Bearer $KEY"
```

## Create a project

Copy the id from the response into PROJECT. Even when there is no media, the project needs an initial clips array.

```shell
curl -X POST "$BASE/api/projects" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"First motion","timeline":{"fps":30,"resolution":{"width":1280,"height":720},"background":"#17191b","clips":[]}}'
export PROJECT="<id-from-response>"
```

## Add motion graphics

This template expands into a plate, headline and subtitle. The response includes createdClipIds, which you can use to adjust each clip with update_clip or set_keyframes.

```shell
curl -X POST "$BASE/api/projects/$PROJECT/timeline/ops" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"op":"add_motion_template","args":{"template":"lower-third","title":"Ada Lovelace","subtitle":"Pioneer of computing","color":"#f6a447","start":0,"duration":4}}'
```

## Inspect and export

Render a PNG at one second to check the result. Queue the final export, copy jobId into JOB, and poll until status is done before downloading. A render with status error includes a message; fix the composition before retrying.

```shell
curl "$BASE/api/projects/$PROJECT/frame?t=1&width=640" \
  -H "Authorization: Bearer $KEY" -o frame.png
curl -X POST "$BASE/api/renders" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT\"}"
export JOB="<jobId-from-response>"
curl "$BASE/api/renders/$JOB" -H "Authorization: Bearer $KEY"
# Once status is done:
curl "$BASE/api/renders/$JOB/download" \
  -H "Authorization: Bearer $KEY" -o motion.mp4
```
