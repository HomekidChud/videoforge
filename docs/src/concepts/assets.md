# Assets and uploads

Uploads go to `POST /api/v1/assets` as multipart form data. The server probes
each file with `ffprobe` to learn its kind, duration and dimensions before
storing it.

## Kinds

| Kind | Accepted as |
| --- | --- |
| `video` | mp4, mov, webm, mkv |
| `audio` | mp3, wav, aac, flac, ogg |
| `image` | png, jpg, jpeg, webp, gif |

## Size limits

- 500 MB per upload (configurable).
- API-key scope `write` or `admin` required.

## Serving

Assets are served through `/api/media/:id/raw` with short-lived signed URLs,
not direct filesystem paths. A missing asset is a hard error at render time —
the renderer does not silently drop footage.
