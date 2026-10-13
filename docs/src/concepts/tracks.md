# Tracks

Every timeline has three tracks:

| Track | Holds |
| --- | --- |
| `video` | The base layer — footage, images |
| `overlay` | Anything on top — titles, shapes, picture-in-picture |
| `audio` | Music, voiceover |

Tracks can be muted or hidden. Hidden tracks are skipped in the render; muted
tracks keep their video.

`move_clip` moves a clip between tracks — the editor keeps in/out points and
keyframes intact.
