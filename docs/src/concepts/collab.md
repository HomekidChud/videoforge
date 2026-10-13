# Live collaboration

VideoForge has real-time collaboration. Open the same project in two browsers
and you see each other's cursor, selection and scrub position within
milliseconds.

## How it works

- Presence and edits go over WebSocket to `/api/v1/live/:projectId`.
- Edits are broadcast to every connected peer as they commit.
- Late joiners get the current timeline state on connect.

## What's shared

| Event | Payload |
| --- | --- |
| Cursor move | `{ x, y }` in preview-normalised coordinates |
| Clip selection | `{ clipId }` |
| Timeline scrub | `{ time }` |
| Op commit | The op batch + resulting timeline version |

Conflict resolution is last-writer-wins per op. Because ops are strictly
validated, a bad op from one peer is rejected server-side and never reaches
the other peers.
