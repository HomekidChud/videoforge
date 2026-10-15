---
title: Batch operations
group: Agent API
order: 15
description: Atomic edits, dry-run validation and revision guards.
---

## Atomic by default

Send {op,args} or {ops:[...]} to POST /api/projects/:id/timeline/ops. Every operation is applied to an isolated timeline. If any fails, none of the batch is saved. Errors include a zero-based failedIndex and the failing operation in message.

## Dry-run before writing

dryRun:true runs the same validation and returns the proposed timeline without saving, updating the revision or announcing a live edit. Generated IDs in dry-run are provisional; get the final createdClipIds from the committed response. Supply explicit IDs to add_shape_clip if you need stable references within a batch.

```json
{
  "dryRun": true,
  "ops": [
    {
      "op": "add_shape_clip",
      "args": {
        "id": "accent",
        "duration": 4,
        "shape": {
          "type": "ellipse"
        }
      }
    },
    {
      "op": "apply_motion",
      "args": {
        "clipId": "accent",
        "preset": "fade"
      }
    }
  ]
}
```

## Avoid stale writes

expectedUpdatedAt must match the latest project's updatedAt. On mismatch, the server returns HTTP 409 and REVISION_CONFLICT. Fetch the project again and adjust your plan. The guard is optional for backwards compatibility; it applies to ops requests, not to full-timeline PUT replacement.

## Validate a whole timeline

POST /api/projects/:id/timeline/validate with {timeline} checks structure, clips, animation, shape bounds and missing media references. It returns a normalized timeline, duration and clipCount, or HTTP 422 with a readable error. Normalization may clamp legacy fields; shape fields are strictly bounded.

## Operation catalog

These descriptions come from the shared capabilities catalog used by the backend.

| Operation | Arguments |
|---|---|
| {{auto:ops}} |
