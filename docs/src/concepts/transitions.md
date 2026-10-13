# Transitions

Transitions live on the **incoming** clip and reference the clip before it
(`fromClipId`).

| Type | Effect |
| --- | --- |
| `dissolve` | Cross-fade |
| `wipe-left` | Wipe from right to left |
| `wipe-right` | Wipe from left to right |

Duration is 0.05 – 3 seconds. Transitions are audio-aware: an incoming clip's
audio cross-fades to match.

```json
{ "op": "set_transition", "args": { "clipId": "c2", "type": "dissolve", "duration": 0.6 } }
```

Transitions render identically in preview and export — both use the same
`shared/transitions.ts` progress function.
