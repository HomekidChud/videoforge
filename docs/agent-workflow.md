---
title: Agent workflow
group: Agent API
order: 14
description: A reliable observe, edit, verify loop for AI-driven video production.
---

## Discover before composing

Read GET /api/capabilities, GET /api/motion/templates and GET /api/graphics/schema. Use their operations, limits and enums instead of guessing endpoints or inventing properties. Generate only structured JSON; VideoForge does not execute agent-supplied code.

## Plan an atomic edit

Fetch the latest project and retain updatedAt. Build one operation or an ops array, then dry-run the batch. If it succeeds, submit the batch again with expectedUpdatedAt. A 409 means another editor changed the project; fetch and re-plan instead of overwriting.

```json
{
  "expectedUpdatedAt": 1790000000000,
  "dryRun": true,
  "ops": [
    {
      "op": "add_motion_template",
      "args": {
        "template": "lower-third",
        "title": "Ada Lovelace",
        "subtitle": "Pioneer of computing",
        "color": "#f6a447",
        "start": 0,
        "duration": 4
      }
    }
  ]
}
```

## Observe the actual output

GET state returns numeric animation values. GET frame returns the composed PNG and GET storyboard returns a contact sheet. Do not assume that valid JSON means a visually correct result. Inspect at the entry, hold and exit times, especially if text is long.

## Render and report

Queue POST /api/renders with the projectId, poll the returned jobId, and download only when status is done. Be explicit about errors and never report a render as complete merely because it was queued.

- [Batch operations](batch-operations)
- [Rendering](rendering)
