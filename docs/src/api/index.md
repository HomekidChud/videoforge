# API reference

Base URL: `https://<your-host>/api/v1`

Authentication: `Authorization: Bearer <api-key>` with scope `read`, `write`,
or `admin`.

## Endpoints

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/projects` | read | List projects |
| `POST` | `/projects` | write | Create a project |
| `GET` | `/projects/:id` | read | Get a project + timeline |
| `POST` | `/projects/:id/timeline` | write | Apply editing ops |
| `POST` | `/assets` | write | Upload a file |
| `GET` | `/assets/:id/raw` | read | Download media |
| `POST` | `/projects/:id/render` | write | Render to MP4 |
| `GET` | `/renders/:id` | read | Render status |

Editing operations are documented at
[editing](/docs/api/editing/) and [motion graphics](/docs/api/motion-graphics/).

## Conventions

- Every write returns the updated timeline.
- Invalid input returns `400` with a human-readable `error` field.
- Batch ops are atomic: all succeed or none apply.
