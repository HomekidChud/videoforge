// AUTO-GENERATED from docs/*.md — edit the markdown, not this file.
// Regenerate with: npm run docs
import type { DocPage } from "./docs-content";

export const DOC_PAGES: DocPage[] = [
  {
    "slug": "introduction",
    "group": "Get started",
    "title": "Introduction",
    "description": "One timeline. A browser studio. An API your agents can actually use.",
    "sections": [
      {
        "title": "Welcome to VideoForge",
        "text": "VideoForge is a self-hosted video editor and programmable composition engine. Use the Studio to cut footage and animate graphics, or use the same HTTP API to let scripts and AI agents build the edit. Your media stays on your server. A hosted deployment runs at <https://videoforge-api-s54w.onrender.com> — set BASE to it and use an API key issued by that deployment. GET /api/health reports status. To run your own, see Self-hosting."
      },
      {
        "title": "Choose your starting point",
        "text": "New to the API? Create a composition in the quickstart. Prefer working visually? Open Studio with a scoped API key. No footage required: the motion toolkit creates shapes, titles and reusable animated layouts.",
        "links": [
          {
            "label": "Your first composition",
            "slug": "quickstart"
          },
          {
            "label": "Motion graphics",
            "slug": "motion-graphics"
          },
          {
            "label": "Using the editor",
            "slug": "editor"
          }
        ]
      },
      {
        "title": "The creative loop",
        "text": "Discover capabilities, compose with JSON, inspect the evaluated state or a rendered frame, then export an MP4. Timeline edits are atomic. Preview changes with dryRun before committing them.",
        "language": "WORKFLOW",
        "code": "Discover → Compose → Validate → Inspect → Render"
      }
    ]
  },
  {
    "slug": "quickstart",
    "group": "Get started",
    "title": "Your first composition",
    "description": "Create an animated lower third and export it without uploading a single asset.",
    "sections": [
      {
        "title": "Connect to your server",
        "text": "Run npm ci and npm run dev in the repository. The default server is http://localhost:5000. On first boot, the server creates an owner key; use it to generate a restricted write key for your agent. Set BASE to your server URL and KEY to that scoped key. Never put the owner key in client code. To use the hosted deployment instead, set BASE to https://videoforge-api-s54w.onrender.com. Keys are issued per deployment: a key from your local server will not work there. GET /api/health reports status.",
        "language": "SHELL",
        "code": "export BASE=\"http://localhost:5000\"\nexport KEY=\"<your-scoped-write-key>\"\ncurl \"$BASE/api/capabilities\" \\\n  -H \"Authorization: Bearer $KEY\""
      },
      {
        "title": "Create a project",
        "text": "Copy the id from the response into PROJECT. Even when there is no media, the project needs an initial clips array.",
        "language": "SHELL",
        "code": "curl -X POST \"$BASE/api/projects\" \\\n  -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d '{\"name\":\"First motion\",\"timeline\":{\"fps\":30,\"resolution\":{\"width\":1280,\"height\":720},\"background\":\"#17191b\",\"clips\":[]}}'\nexport PROJECT=\"<id-from-response>\""
      },
      {
        "title": "Add motion graphics",
        "text": "This template expands into a plate, headline and subtitle. The response includes createdClipIds, which you can use to adjust each clip with update_clip or set_keyframes.",
        "language": "SHELL",
        "code": "curl -X POST \"$BASE/api/projects/$PROJECT/timeline/ops\" \\\n  -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d '{\"op\":\"add_motion_template\",\"args\":{\"template\":\"lower-third\",\"title\":\"Ada Lovelace\",\"subtitle\":\"Pioneer of computing\",\"color\":\"#f6a447\",\"start\":0,\"duration\":4}}'"
      },
      {
        "title": "Inspect and export",
        "text": "Render a PNG at one second to check the result. Queue the final export, copy jobId into JOB, and poll until status is done before downloading. A render with status error includes a message; fix the composition before retrying.",
        "language": "SHELL",
        "code": "curl \"$BASE/api/projects/$PROJECT/frame?t=1&width=640\" \\\n  -H \"Authorization: Bearer $KEY\" -o frame.png\ncurl -X POST \"$BASE/api/renders\" \\\n  -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d \"{\\\"projectId\\\":\\\"$PROJECT\\\"}\"\nexport JOB=\"<jobId-from-response>\"\ncurl \"$BASE/api/renders/$JOB\" -H \"Authorization: Bearer $KEY\"\n# Once status is done:\ncurl \"$BASE/api/renders/$JOB/download\" \\\n  -H \"Authorization: Bearer $KEY\" -o motion.mp4"
      }
    ]
  },
  {
    "slug": "authentication",
    "group": "Get started",
    "title": "Authentication & scopes",
    "description": "Sign in with email, Google or an API key — and give agents only the access they need.",
    "sections": [
      {
        "title": "Three ways to sign in",
        "text": "- **Email and password** — the everyday way for people. The first account is created with the workspace owner key (printed to `data/OWNER_KEY.txt` on first boot, or set `VIDEOFORGE_BOOTSTRAP_KEY`); it becomes the workspace admin. After that, new accounts come from an admin (Developer platform → Accounts) unless `VIDEOFORGE_ACCOUNTS=open` allows self-signup. - **Google** — a “Continue with Google” button appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (standard OAuth, verified id-token claims). - **API keys** — for AI agents, scripts and the standalone tool exports. No password, no cookie: `Authorization: Bearer <key>`. Sessions are random tokens stored in SQLite behind an HttpOnly `vf_session` cookie (30 days), so **sign-ins survive server restarts and browser refreshes**. Logout destroys the session. The health endpoint, documentation, share pages and the homepage never require a sign-in.",
        "language": "SHELL",
        "code": "# Account sign-in (sets the cookie)\ncurl -c jar -X POST \"$BASE/api/auth/login\" -H 'Content-Type: application/json' \\\n  -d '{\"email\":\"you@example.com\",\"password\":\"…\"}'\ncurl -b jar \"$BASE/api/auth/me\"\n\n# Agent key\ncurl \"$BASE/api/auth/me\" -H \"Authorization: Bearer $KEY\""
      },
      {
        "title": "Permission scopes",
        "text": "Scopes are cumulative. Additional key restrictions can constrain expiry, project access, allowed origins, request rate, uploads, rendering and deletion.",
        "rows": [
          [
            "Scope",
            "Permission"
          ],
          [
            "read",
            "Read projects/media, inspect state and frames."
          ],
          [
            "write",
            "Read plus upload, edit projects and render."
          ],
          [
            "admin",
            "Write plus key management, visibility and live watching."
          ]
        ]
      },
      {
        "title": "Create an agent key",
        "text": "POST this JSON to /api/keys with an admin Bearer key. Newly created keys are returned once; the server stores their hashes. Keep credentials in environment variables or a secret manager.",
        "code": "{\n  \"label\": \"Motion graphics agent\",\n  \"scope\": \"write\",\n  \"restrictions\": {\n    \"allowDelete\": false\n  }\n}"
      },
      {
        "title": "Handle denied requests",
        "text": "401 means the key is missing or invalid. 403 means its scope or restrictions disallow the request. A revoked or expired key cannot be recovered by retrying. Ask the workspace administrator for an appropriate replacement.",
        "links": [
          {
            "label": "API reference",
            "slug": "api-reference"
          }
        ]
      }
    ]
  },
  {
    "slug": "timeline",
    "group": "Core concepts",
    "title": "Timeline & layers",
    "description": "Understand seconds, normalized coordinates and composition order.",
    "sections": [
      {
        "title": "The timeline model",
        "text": "A project has fps, resolution, background, tracks, markers and clips. All timeline coordinates are seconds. Media clips reference an assetId; text and shape clips have an empty assetId. Shapes and text are separate clips.",
        "code": "{\n  \"version\": 4,\n  \"fps\": 30,\n  \"resolution\": {\n    \"width\": 1280,\n    \"height\": 720\n  },\n  \"background\": \"#17191b\",\n  \"clips\": []\n}"
      },
      {
        "title": "Timing and coordinates",
        "text": "start is a timeline offset. inPoint and outPoint define the source window. Media duration is (outPoint - inPoint) / speed; asset-free clip duration is outPoint - inPoint. x and y are normalized center coordinates from 0 to 1. Keyframe times are relative to the clip start."
      },
      {
        "title": "Layer order",
        "text": "Footage on video is below media on overlay. Shapes are composited next; text and captions are composited last. Within each family, later entries draw over earlier entries in the renderer. There is no general z-index or nested scene graph in this version. Track hidden and muted settings affect preview and rendering."
      },
      {
        "title": "Limits",
        "text": "A timeline accepts up to 200 clips. Each animated property supports up to 64 keyframes. A batch accepts at most 100 operations. Canvas dimensions normalize to even values between 160 and 3840; fps is 1 to 60. Validate before rendering if your agent is generating complex JSON.",
        "links": [
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Animation keyframes",
            "slug": "keyframes"
          }
        ]
      }
    ]
  },
  {
    "slug": "motion-graphics",
    "group": "Motion graphics",
    "title": "Motion graphics",
    "description": "Build asset-free animation with primitives and editable templates.",
    "sections": [
      {
        "title": "A toolkit, not a black box",
        "text": "Motion graphics are ordinary timeline clips. Create a shape, add text, and animate position, scale, rotation or opacity with keyframes. Templates are convenience operations that expand into these primitives, so the API and the editor can refine the same result."
      },
      {
        "title": "Add a motion template",
        "text": "Send add_motion_template to the timeline operations endpoint. Options are template, title, subtitle, color, start, duration and an optional idPrefix. Duration must be 0.5 to 60 seconds. The returned createdClipIds identify every generated layer. With the prefix lt the layers are lt-0, lt-1 and so on, so later ops in the same batch can target them without waiting for a response.",
        "code": "{\n  \"op\": \"add_motion_template\",\n  \"args\": {\n    \"template\": \"lower-third\",\n    \"title\": \"Ada Lovelace\",\n    \"subtitle\": \"Pioneer of computing\",\n    \"color\": \"#f6a447\",\n    \"start\": 0,\n    \"duration\": 4\n  }\n}"
      },
      {
        "title": "Template catalog",
        "text": "All templates support the same composition workflow. Kinetic type accepts up to eight words. Text size is estimated to fit the composition's aspect ratio; inspect long text before final export. The playground uses the same template compiler and keyframe evaluator as Studio.",
        "rows": [
          [
            "Template",
            "What it makes"
          ],
          [
            "lower-third",
            "Animated nameplate with a supporting subtitle."
          ],
          [
            "title-card",
            "A centered headline, accent rule and supporting copy."
          ],
          [
            "callout",
            "An animated badge with a short message."
          ],
          [
            "kinetic-type",
            "Words arrive in sequence with staggered motion."
          ],
          [
            "countdown",
            "A sequence of numbered beats with a final message."
          ],
          [
            "quote-card",
            "A large quotation mark, the quote and an attribution rule."
          ],
          [
            "split-reveal",
            "Two accent rules wipe open around a rising headline."
          ],
          [
            "progress-bar",
            "A rounded track fills with a headline above and caption below."
          ],
          [
            "stat-highlight",
            "A big number inside a springing accent ring with a caption."
          ],
          [
            "bullet-list",
            "A headline with up to six points that slide in one by one."
          ],
          [
            "social-handle",
            "A rounded pill with a handle and a short call to action."
          ],
          [
            "chapter-number",
            "A huge chapter number, a rule and the chapter title."
          ],
          [
            "starburst",
            "A rocking two-square burst with a short label, driven by code."
          ]
        ]
      },
      {
        "title": "Refine the composition",
        "text": "Adjust generated clips with update_clip. Replace curves with set_keyframes or add an existing motion preset with apply_motion. Use stagger_clips to offset several clips in a deliberate order, or apply_motion_sequence to apply one preset across several clips with a stagger. Templates do not add an AI model or invoke arbitrary code.",
        "links": [
          {
            "label": "Motion presets",
            "slug": "motion-presets"
          },
          {
            "label": "Examples gallery",
            "slug": "examples"
          },
          {
            "label": "Shape primitives",
            "slug": "shapes"
          },
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Agent workflow",
            "slug": "agent-workflow"
          }
        ]
      }
    ]
  },
  {
    "slug": "shapes",
    "group": "Motion graphics",
    "title": "Shape primitives",
    "description": "Rectangles, ellipses and lines with fill, stroke and transform animation.",
    "sections": [
      {
        "title": "Create a shape clip",
        "text": "Shape clips require no media upload. They live on overlay and use an empty assetId. width and height are fractions of the canvas. radius and strokeWidth are pixels at the project's output resolution, scaled for smaller frame previews. A line is a thin rectangle; rotate it for other orientations.",
        "code": "{\n  \"op\": \"add_shape_clip\",\n  \"args\": {\n    \"id\": \"badge\",\n    \"start\": 0,\n    \"duration\": 4,\n    \"x\": 0.5,\n    \"y\": 0.5,\n    \"shape\": {\n      \"type\": \"rectangle\",\n      \"width\": 0.35,\n      \"height\": 0.2,\n      \"fill\": \"#f6a447\",\n      \"stroke\": \"#ffffff\",\n      \"strokeWidth\": 2,\n      \"radius\": 24\n    },\n    \"keyframes\": {\n      \"rotation\": [\n        {\n          \"time\": 0,\n          \"value\": -12,\n          \"easing\": \"ease-out\"\n        },\n        {\n          \"time\": 1,\n          \"value\": 0\n        }\n      ]\n    }\n  }\n}"
      },
      {
        "title": "Shape fields",
        "text": "Colors accept six-digit hex or transparent. Transparent fill makes outlined shapes possible. Invalid primitives, numeric bounds and colors return validation errors.",
        "rows": [
          [
            "Field",
            "Accepted values"
          ],
          [
            "type",
            "rectangle | ellipse | line"
          ],
          [
            "width",
            "0.01..1 (default 0.35)"
          ],
          [
            "height",
            "0.002..1 (default 0.2; line 0.01)"
          ],
          [
            "fill / stroke",
            "#rrggbb | transparent"
          ],
          [
            "strokeWidth",
            "0..40 pixels"
          ],
          [
            "radius",
            "0..200 pixels; rectangle corners"
          ]
        ]
      },
      {
        "title": "Update and animate",
        "text": "update_clip replaces the shape object, so supply all shape fields you want to preserve. Transform keyframes work as they do for text: x, y, scale, rotation and opacity. Shape dimensions and colors are static in this version. No SVG, expressions, custom shaders or arbitrary JavaScript are executed.",
        "code": "{\n  \"op\": \"update_clip\",\n  \"args\": {\n    \"clipId\": \"badge\",\n    \"shape\": {\n      \"type\": \"ellipse\",\n      \"width\": 0.2,\n      \"height\": 0.35,\n      \"fill\": \"transparent\",\n      \"stroke\": \"#f6a447\",\n      \"strokeWidth\": 8\n    }\n  }\n}"
      },
      {
        "title": "Machine-readable schema",
        "text": "GET /api/graphics/schema returns the JSON Schema for the shape object. GET /api/capabilities includes this schema alongside every operation and template. Both require a read-capable key.",
        "links": [
          {
            "label": "API reference",
            "slug": "api-reference"
          }
        ]
      }
    ]
  },
  {
    "slug": "keyframes",
    "group": "Motion graphics",
    "title": "Keyframes & easing",
    "description": "Precise animation that previews in the browser and renders through FFmpeg.",
    "sections": [
      {
        "title": "Clip-local keyframes",
        "text": "Each property has an array of {time,value,easing}. Time is measured from the clip start, not from zero on the timeline. Easing belongs to the outgoing segment. Before the first and after the last keyframe, the endpoint value holds.",
        "code": "{\n  \"op\": \"set_keyframes\",\n  \"args\": {\n    \"clipId\": \"badge\",\n    \"property\": \"scale\",\n    \"keyframes\": [\n      {\n        \"time\": 0,\n        \"value\": 0.5,\n        \"easing\": \"back-out\"\n      },\n      {\n        \"time\": 0.7,\n        \"value\": 1\n      },\n      {\n        \"time\": 4,\n        \"value\": 1\n      }\n    ]\n  }\n}"
      },
      {
        "title": "Animatable properties",
        "text": "The following bounds apply to both Studio and the agent API. Browser curves are evaluated directly; the FFmpeg renderer approximates cubic-bezier segments with 24 samples.",
        "rows": [
          [
            "Property",
            "Range"
          ],
          [
            "x",
            "0..1"
          ],
          [
            "y",
            "0..1"
          ],
          [
            "scale",
            "0.1..2"
          ],
          [
            "rotation",
            "-360..360"
          ],
          [
            "opacity",
            "0..1"
          ],
          [
            "reveal",
            "0..1"
          ],
          [
            "volume",
            "0..1"
          ],
          [
            "brightness",
            "-0.5..0.5"
          ],
          [
            "contrast",
            "0.5..2"
          ],
          [
            "saturation",
            "0..2"
          ]
        ]
      },
      {
        "title": "Easing options",
        "text": "Use linear, ease, ease-in, ease-out, ease-in-out, back-out, snappy (fast start, long settle), anticipate (dips backwards before launching), hold or step-start. A custom cubic bezier is [x1,y1,x2,y2], with x in 0..1 and y in -2..3. hold keeps the start value until the next keyframe; step-start jumps to the next value the moment the segment begins. Output values remain clamped to each property's bounds."
      },
      {
        "title": "Reveal: a wipe mask",
        "text": "reveal (0..1) is a left-to-right alpha mask on media and shape clips. At 0 nothing is drawn, at 1 the whole layer is. It is applied before scale and rotation, so it follows the layer. Text clips reject it; use opacity or position there. Combine it with the snappy easing for a crisp wipe, or animate it on a thin shape for progress bars.",
        "code": "{\n  \"op\": \"set_keyframes\",\n  \"args\": {\n    \"clipId\": \"bar\",\n    \"property\": \"reveal\",\n    \"keyframes\": [\n      {\n        \"time\": 0,\n        \"value\": 0,\n        \"easing\": \"snappy\"\n      },\n      {\n        \"time\": 1.2,\n        \"value\": 1\n      }\n    ]\n  }\n}"
      },
      {
        "title": "Stagger several layers",
        "text": "Pass unique clipIds in your desired order. stagger_clips sets the first start, then offsets every following clip by delay seconds. This operation retimes clips without changing their clip-local animation curves.",
        "code": "{\n  \"op\": \"stagger_clips\",\n  \"args\": {\n    \"clipIds\": [\n      \"word-a\",\n      \"word-b\",\n      \"word-c\"\n    ],\n    \"start\": 0,\n    \"delay\": 0.15\n  }\n}"
      }
    ]
  },
  {
    "slug": "motion-presets",
    "group": "Motion graphics",
    "title": "Motion presets & sequencing",
    "description": "One-line entrances, emphasis beats and exits, with timing you control.",
    "sections": [
      {
        "title": "Presets are keyframes, not magic",
        "text": "Every preset compiles to ordinary keyframes on the clip, so you can open the Motion tab afterwards and edit each one. Presets replace only the properties they animate. Use them from Studio (Effects tab or the Motion inspector) or from the API with apply_motion.",
        "rows": [
          [
            "Preset",
            "Group",
            "What it does"
          ],
          [
            "fade",
            "entrance",
            "Soft opacity entrance"
          ],
          [
            "slide-left",
            "entrance",
            "Arrive from the left"
          ],
          [
            "rise",
            "entrance",
            "Lift into position"
          ],
          [
            "zoom",
            "emphasis",
            "Gentle push-in across the clip"
          ],
          [
            "pop",
            "entrance",
            "Scale with an overshoot"
          ],
          [
            "drift",
            "emphasis",
            "Slow pan across the clip"
          ],
          [
            "spring",
            "entrance",
            "Damped, bouncing scale entrance"
          ],
          [
            "whip",
            "entrance",
            "Fast right-to-left arrival with anticipation"
          ],
          [
            "spin",
            "entrance",
            "Rotation and scale settle together"
          ],
          [
            "pulse",
            "emphasis",
            "One smooth emphasis beat"
          ],
          [
            "shake",
            "emphasis",
            "Damped horizontal impact"
          ],
          [
            "reveal",
            "entrance",
            "Uncover the layer from left to right"
          ],
          [
            "exit-left",
            "exit",
            "Slide away and fade at the clip end"
          ],
          [
            "fade-out",
            "exit",
            "Fade at the clip end"
          ],
          [
            "slide-right",
            "entrance",
            "Arrive from the right"
          ],
          [
            "drop",
            "entrance",
            "Fall into place with a small overshoot"
          ],
          [
            "bounce-in",
            "entrance",
            "Fall from above and bounce to rest"
          ],
          [
            "zoom-out",
            "entrance",
            "Start oversized and settle into place"
          ],
          [
            "swing",
            "entrance",
            "Tilted arrival that swings to rest"
          ],
          [
            "wobble",
            "emphasis",
            "Damped side-to-side rocking"
          ],
          [
            "rubber",
            "emphasis",
            "Elastic squash-and-stretch pulse"
          ],
          [
            "tada",
            "emphasis",
            "Pop with a celebratory shake"
          ],
          [
            "heartbeat",
            "emphasis",
            "Two quick thumps"
          ],
          [
            "blink",
            "emphasis",
            "Hard on/off flashes"
          ],
          [
            "flash",
            "emphasis",
            "Fast opacity flicker"
          ],
          [
            "glitch",
            "emphasis",
            "Hard horizontal jumps"
          ],
          [
            "exit-right",
            "exit",
            "Slide away to the right and fade"
          ],
          [
            "exit-up",
            "exit",
            "Float up and fade"
          ],
          [
            "exit-down",
            "exit",
            "Sink down and fade"
          ],
          [
            "shrink-out",
            "exit",
            "Scale down and fade at the clip end"
          ],
          [
            "spin-out",
            "exit",
            "Rotate, shrink and fade at the clip end"
          ],
          [
            "pop-out",
            "exit",
            "Wind up, then collapse and fade"
          ],
          [
            "reveal-out",
            "exit",
            "Cover the layer from right to left"
          ]
        ]
      },
      {
        "title": "Timing and strength",
        "text": "apply_motion accepts three optional controls. duration is how long the move takes, delay is how far into the clip it starts, and strength (0.1 to 2) scales distance and overshoot. Entrances play from the delay; every exit preset finishes exactly at the end of the clip. Studio exposes the same three controls in the Motion presets panel.",
        "code": "{\n  \"op\": \"apply_motion\",\n  \"args\": {\n    \"clipId\": \"badge\",\n    \"preset\": \"spring\",\n    \"delay\": 0.4,\n    \"duration\": 1.2,\n    \"strength\": 1.5\n  }\n}"
      },
      {
        "title": "Sequence many layers",
        "text": "apply_motion_sequence applies one preset to several clips and offsets each start by stagger seconds (default 0.12). Pass the clips in reading order. It is one atomic step, so a failure leaves the timeline unchanged.",
        "code": "{\n  \"op\": \"apply_motion_sequence\",\n  \"args\": {\n    \"clipIds\": [\n      \"k-0\",\n      \"k-1\",\n      \"k-2\"\n    ],\n    \"preset\": \"whip\",\n    \"stagger\": 0.2,\n    \"start\": 0.2,\n    \"duration\": 0.6\n  }\n}"
      },
      {
        "title": "Reverse and retime",
        "text": "reverse_animation plays every curve of a clip backwards and mirrors each easing, which turns an entrance into a matching exit. retime_animation squeezes or stretches all of a clip's keyframes into a window you give it, keeping relative timing between properties.",
        "code": "[\n  {\n    \"op\": \"reverse_animation\",\n    \"args\": {\n      \"clipId\": \"badge\"\n    }\n  },\n  {\n    \"op\": \"retime_animation\",\n    \"args\": {\n      \"clipId\": \"badge\",\n      \"duration\": 0.8,\n      \"delay\": 3\n    }\n  }\n]"
      },
      {
        "title": "Sync to a beat",
        "text": "add_beat_markers drops markers on every beat of a tempo (20 to 300 BPM) so they show on the Studio timeline. snap_to_beats moves clips onto the nearest beat. Combine them with apply_motion_sequence and a stagger of 60 / BPM seconds to land motion on the beat.",
        "code": "[\n  {\n    \"op\": \"add_beat_markers\",\n    \"args\": {\n      \"bpm\": 120,\n      \"count\": 8\n    }\n  },\n  {\n    \"op\": \"snap_to_beats\",\n    \"args\": {\n      \"clipIds\": [\n        \"b0\",\n        \"b1\"\n      ],\n      \"bpm\": 120\n    }\n  }\n]"
      },
      {
        "title": "Rendering notes",
        "text": "Spring, shake, bounce-in, rubber, tada, wobble, swing and heartbeat are sampled into 25 linear keyframes so the browser and FFmpeg draw the same curve. These presets therefore use more of the 64 keyframes a property allows, and preset window times round to milliseconds.",
        "links": [
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Examples gallery",
            "slug": "examples"
          }
        ]
      }
    ]
  },
  {
    "slug": "fit-and-layout",
    "group": "Motion graphics",
    "title": "Fit & layout",
    "description": "Text that wraps, media that fits and a report for everything that does not.",
    "sections": [
      {
        "title": "Text fits by default",
        "text": "Text clips wrap onto new lines and shrink until the whole block sits inside its box. The box is 90% of the frame width and 50% of its height unless you change textMaxWidth or textMaxHeight, and it never extends past the nearer frame edge. The same layout code runs in the Studio preview and the renderer, so what you see is what exports. Set textFit to none to opt out.",
        "code": "{\n  \"op\": \"add_text_clip\",\n  \"args\": {\n    \"id\": \"headline\",\n    \"text\": \"A very long headline that now wraps and fits instead of running off both sides\",\n    \"textSize\": 10,\n    \"textMaxWidth\": 0.8\n  }\n}"
      },
      {
        "title": "Fit media to the frame",
        "text": "Footage on the video track has three fit modes: contain (everything visible, letterboxed), cover (fills the frame and crops) and fill (stretches to the frame and ignores the aspect ratio). In Studio, use the Fit to frame section of the inspector.",
        "code": "{\n  \"op\": \"update_clip\",\n  \"args\": {\n    \"clipId\": \"clip-a\",\n    \"fit\": \"cover\"\n  }\n}"
      },
      {
        "title": "Fit a layer inside the frame",
        "text": "fit_clip scales and nudges one text, shape or overlay clip until its animated bounds sit inside the frame minus a margin (default 4%). Keyframed and code-driven scale and rotation are checked at their peak. fit_all does the same for every visual clip, optionally forcing footage to contain, cover or fill.",
        "code": "[\n  {\n    \"op\": \"fit_clip\",\n    \"args\": {\n      \"clipId\": \"badge\",\n      \"margin\": 0.05\n    }\n  },\n  {\n    \"op\": \"fit_all\",\n    \"args\": {\n      \"media\": \"contain\"\n    }\n  }\n]"
      },
      {
        "title": "Change the canvas safely",
        "text": "set_project with refit true re-fits text, shapes and overlays after you change the resolution, for example from 16:9 to 9:16. Studio does this automatically when you pick a new canvas.",
        "code": "{\n  \"op\": \"set_project\",\n  \"args\": {\n    \"resolution\": {\n      \"width\": 1080,\n      \"height\": 1920\n    },\n    \"refit\": true\n  }\n}"
      },
      {
        "title": "Find what does not fit",
        "text": "GET /api/projects/:id/fit-report?margin=0.04 lists every clip whose bounds leave the frame, how far, and the op that fixes it. In Studio, the Fit everything section of the project inspector shows the count and a Fit all layers button.",
        "language": "SHELL",
        "code": "curl \"$BASE/api/projects/$PROJECT/fit-report?margin=0.04\" -H \"Authorization: Bearer $KEY\""
      },
      {
        "title": "Known limits",
        "text": "Text width uses per-family estimates — the base Noto Sans table scaled for each catalog font — with about 12% spare room, so an unusual font may fit more loosely or more tightly. Fit checks the static position and the peak animated scale and rotation. It does not account for x and y travel of entrance animations, which are meant to start off position.",
        "links": [
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Animate with code",
            "slug": "animate-with-code"
          }
        ]
      }
    ]
  },
  {
    "slug": "fonts-and-text",
    "group": "Motion graphics",
    "title": "Fonts & text",
    "description": "A large font catalog, bold, alignment, line height, letter spacing and uppercase — with a fit engine that knows every family.",
    "sections": [
      {
        "title": "A catalog of families",
        "text": "Every text clip can pick a font from a catalog of over 40 families: sans, serif, display, handwriting and mono faces from Anton to Space Grotesk. The same catalog drives the Studio preview, the fit engine and the FFmpeg renderer, so the font you pick is the font that exports. Set `font` on a text clip with a catalog id.",
        "code": "{\n  \"op\": \"add_text_clip\",\n  \"args\": {\n    \"id\": \"headline\",\n    \"text\": \"The night the studio burned down\",\n    \"font\": \"playfair-display\",\n    \"fontWeight\": 700,\n    \"textSize\": 8\n  }\n}"
      },
      {
        "title": "Choose a family",
        "text": "The Studio Typography section groups the catalog by category and previews each family with live text. Fonts with two weights offer Regular and Bold. The renderer downloads each family on first use and caches it on the server, so the first render with a new font may take a moment longer.",
        "rows": [
          [
            "Category",
            "Examples"
          ],
          [
            "Sans",
            "Inter, Poppins, Montserrat, Oswald, DM Sans, Space Grotesk"
          ],
          [
            "Serif",
            "Playfair Display, Merriweather, Lora, Source Serif 4, Cinzel"
          ],
          [
            "Display",
            "Bebas Neue, Anton, Archivo Black, Bungee, Press Start 2P, Lobster"
          ],
          [
            "Handwriting",
            "Pacifico, Caveat, Dancing Script, Permanent Marker"
          ],
          [
            "Mono",
            "Space Mono, JetBrains Mono, IBM Plex Mono"
          ]
        ]
      },
      {
        "title": "Style a text clip",
        "text": "Beyond the family, text clips take a weight, an alignment, a line height, letter spacing and a case transform. Alignment positions each line inside the text box: left and right edges are anchored to the widest line. Letter spacing is measured in em, from tight (-0.05) to airy (0.25), and the fit engine counts it in the width budget.",
        "code": "{\n  \"op\": \"update_clip\",\n  \"args\": {\n    \"clipId\": \"headline\",\n    \"font\": \"anton\",\n    \"textAlign\": \"left\",\n    \"lineHeight\": 1.5,\n    \"letterSpacing\": 0.04,\n    \"textTransform\": \"uppercase\"\n  }\n}"
      },
      {
        "title": "Fields",
        "text": "All style fields are optional; unset fields keep their defaults and are omitted from the stored timeline.",
        "rows": [
          [
            "Field",
            "Accepted values"
          ],
          [
            "font",
            "catalog id, for example inter or playfair-display"
          ],
          [
            "fontWeight",
            "400 (default) or 700, when the family has a bold cut"
          ],
          [
            "textAlign",
            "left, center (default) or right"
          ],
          [
            "lineHeight",
            "1..2, default 1.4"
          ],
          [
            "letterSpacing",
            "-0.05..0.25 em"
          ],
          [
            "textTransform",
            "none (default) or uppercase"
          ]
        ]
      },
      {
        "title": "Fit knows the font",
        "text": "The shrink-to-fit engine measures every family with its own width table, scaled from the base Noto Sans estimates: a condensed face like Bebas Neue fits noticeably more text in the same box than a wide face like Press Start 2P. Bold runs a little wider, letter spacing adds one gap per character pair, and upper-case text is measured in its rendered form. Line height counts toward the height budget."
      },
      {
        "title": "Rendering notes",
        "text": "Preview and export agree because both use the same metrics and the same font files. Two approximations remain: character positions for letter spacing and left/right alignment use the estimated advances, so long lines can drift a few pixels. Letter spacing works with a background box too: the box is drawn from the same per-character estimates, so it can be a few pixels off the exact glyph extents. Set `VIDEOFORGE_FONT` to render every clip with one server font file instead of the catalog.",
        "links": [
          {
            "label": "Fit & layout",
            "slug": "fit-and-layout"
          },
          {
            "label": "Using the editor",
            "slug": "editor"
          },
          {
            "label": "Examples gallery",
            "slug": "examples"
          }
        ]
      }
    ]
  },
  {
    "slug": "animate-with-code",
    "group": "Motion graphics",
    "title": "Animate with code",
    "description": "Drive any property with a formula of time that previews live and renders exactly.",
    "sections": [
      {
        "title": "Expressions",
        "text": "Give a property an expression instead of keyframes. The formula is a function of time, so a few characters make an orbit, a wiggle or a heartbeat that never runs out of keyframes. The browser preview and the FFmpeg renderer compile the same parsed expression, so they agree. An expression wins over keyframes on that property.",
        "code": "{\n  \"op\": \"animate_code\",\n  \"args\": {\n    \"clipId\": \"badge\",\n    \"expressions\": {\n      \"x\": \"0.5 + 0.2 * cos(t * 2)\",\n      \"y\": \"0.5 + 0.2 * sin(t * 2)\",\n      \"rotation\": \"wiggle(2, 4)\"\n    }\n  }\n}"
      },
      {
        "title": "Variables and operators",
        "text": "Use + - * / % ^ and parentheses. Results are clamped to the property's range. Division by zero or invalid maths falls back to base for that frame.",
        "rows": [
          [
            "Name",
            "Meaning"
          ],
          [
            "t",
            "seconds since the clip started"
          ],
          [
            "d",
            "clip duration in seconds"
          ],
          [
            "p",
            "progress through the clip, 0 to 1"
          ],
          [
            "base",
            "the property's static value"
          ],
          [
            "pi",
            "3.14159"
          ]
        ]
      },
      {
        "title": "Functions",
        "text": "Everything maps to plain FFmpeg expression functions. Expressions are limited to 300 characters. There are no loops, strings, variables or property access, so an expression cannot do anything except calculate a number.",
        "rows": [
          [
            "Function",
            "What it does"
          ],
          [
            "sin",
            "sine, radians"
          ],
          [
            "cos",
            "cosine, radians"
          ],
          [
            "tan",
            "tangent"
          ],
          [
            "atan",
            "arctangent"
          ],
          [
            "atan2",
            "two-argument arctangent"
          ],
          [
            "abs",
            "absolute value"
          ],
          [
            "sqrt",
            "square root"
          ],
          [
            "pow",
            "a to the power b"
          ],
          [
            "exp",
            "e to the power a"
          ],
          [
            "log",
            "natural logarithm"
          ],
          [
            "min",
            "smaller of two"
          ],
          [
            "max",
            "larger of two"
          ],
          [
            "clamp",
            "clamp(value, low, high)"
          ],
          [
            "floor",
            "round down"
          ],
          [
            "ceil",
            "round up"
          ],
          [
            "round",
            "round to nearest"
          ],
          [
            "fract",
            "fractional part, a sawtooth when fed time"
          ],
          [
            "mod",
            "positive modulo, a sawtooth when fed time"
          ],
          [
            "sign",
            "-1, 0 or 1"
          ],
          [
            "mix",
            "mix(a, b, k) blends from a to b"
          ],
          [
            "step",
            "step(edge, x) is 0 before the edge and 1 after"
          ],
          [
            "smoothstep",
            "smoothstep(a, b, x) eases 0..1 between a and b"
          ],
          [
            "easeIn",
            "cubic ease-in of a 0..1 value"
          ],
          [
            "easeOut",
            "cubic ease-out of a 0..1 value"
          ],
          [
            "easeInOut",
            "cubic ease-in-out of a 0..1 value"
          ],
          [
            "noise",
            "smooth deterministic noise, about -1..1"
          ],
          [
            "tri",
            "triangle wave, -1..1, period 1"
          ],
          [
            "lt",
            "1 when a < b"
          ],
          [
            "lte",
            "1 when a <= b"
          ],
          [
            "gt",
            "1 when a > b"
          ],
          [
            "gte",
            "1 when a >= b"
          ],
          [
            "between",
            "between(x, low, high) is 1 inside the range"
          ],
          [
            "if",
            "if(condition, then, else)"
          ],
          [
            "wiggle",
            "wiggle(frequency, amount) is smooth noise over time"
          ]
        ]
      },
      {
        "title": "Looping recipes",
        "text": "apply_code_motion writes ready-made expressions that read each property's base value, so they work from wherever the layer sits. speed (0.1 to 5) and strength (0.1 to 3) tune them. In Studio use Animate with code in the Motion tab.",
        "code": "{\n  \"op\": \"apply_code_motion\",\n  \"args\": {\n    \"clipIds\": [\n      \"badge\",\n      \"logo\"\n    ],\n    \"recipe\": \"float\",\n    \"speed\": 1.2,\n    \"strength\": 1\n  }\n}",
        "rows": [
          [
            "Recipe",
            "Behaviour"
          ],
          [
            "float",
            "Gentle vertical bob"
          ],
          [
            "sway",
            "Slow side-to-side drift"
          ],
          [
            "breathe",
            "Soft scale in and out"
          ],
          [
            "heartbeat",
            "Double-thump pulse"
          ],
          [
            "wiggle",
            "Organic random-feeling jitter"
          ],
          [
            "orbit",
            "Circle around its position"
          ],
          [
            "spin",
            "Continuous rotation"
          ],
          [
            "pendulum",
            "Swing back and forth"
          ],
          [
            "bounce",
            "Repeated hops that never sink below the start"
          ],
          [
            "flicker",
            "Neon-sign opacity flicker"
          ],
          [
            "pulse-glow",
            "Opacity breathes between soft and full"
          ],
          [
            "drift-loop",
            "Slow ping-pong pan"
          ],
          [
            "glitch",
            "Brief horizontal jumps with flicker"
          ]
        ]
      },
      {
        "title": "Bake to keyframes",
        "text": "bake_expression samples an expression into linear keyframes (2 to 64, default 48) and removes the code, so you can drag the points in the graph. Applying a motion preset to a property also takes over from any expression on it.",
        "code": "{\n  \"op\": \"bake_expression\",\n  \"args\": {\n    \"clipId\": \"badge\",\n    \"property\": \"x\",\n    \"samples\": 32\n  }\n}"
      },
      {
        "title": "Rules",
        "text": "Reveal expressions are rejected on text clips. A clip accepts up to 10 expressions. Invalid code returns a readable message with the character position, and Studio shows it under the editor as you type.",
        "links": [
          {
            "label": "Motion presets",
            "slug": "motion-presets"
          },
          {
            "label": "Fit & layout",
            "slug": "fit-and-layout"
          }
        ]
      }
    ]
  },
  {
    "slug": "transitions",
    "group": "Motion graphics",
    "title": "Transitions",
    "description": "Dissolves, wipes, an iris, barn doors and a diamond between video clips.",
    "sections": [
      {
        "title": "Add a transition",
        "text": "set_transition overlaps a video or image clip with the clip before it. With join:true (the default) the clip first moves to touch its predecessor, then later video clips move up by the overlap. Duration is 0.1 to 3 seconds and never more than half of either clip. Use type none to remove one.",
        "code": "{\n  \"op\": \"set_transition\",\n  \"args\": {\n    \"clipId\": \"clip-b\",\n    \"type\": \"iris\",\n    \"duration\": 1\n  }\n}"
      },
      {
        "title": "Available types",
        "text": "Every type previews in Studio and renders in FFmpeg. Wipes reveal the incoming clip from the named edge; the iris opens a circle from the centre; barn doors open from the middle; the diamond grows from the centre; the diagonal wipe sweeps from the top-left corner.",
        "rows": [
          [
            "Type",
            "Effect"
          ],
          [
            "dissolve",
            "Dissolve"
          ],
          [
            "wipe-left",
            "Wipe from left"
          ],
          [
            "wipe-right",
            "Wipe from right"
          ],
          [
            "wipe-up",
            "Wipe from bottom"
          ],
          [
            "wipe-down",
            "Wipe from top"
          ],
          [
            "iris",
            "Iris open"
          ],
          [
            "barn-h",
            "Barn doors (horizontal)"
          ],
          [
            "barn-v",
            "Barn doors (vertical)"
          ],
          [
            "diamond",
            "Diamond open"
          ],
          [
            "wipe-diagonal",
            "Diagonal wipe"
          ]
        ]
      },
      {
        "title": "Audio",
        "text": "Overlapping clips cross-fade their audio over the same duration, so the sound follows the picture.",
        "links": [
          {
            "label": "Using the editor",
            "slug": "editor"
          }
        ]
      }
    ]
  },
  {
    "slug": "examples",
    "group": "Examples",
    "title": "Examples gallery",
    "description": "17 asset-free compositions you can play, copy and render.",
    "sections": [
      {
        "title": "How the examples work",
        "text": "Each example is a plain list of timeline ops. The gallery below plays them live with the Studio engine, the repository renders them to GIFs with the real FFmpeg pipeline, and the test suite builds every one, so an example that stops working fails CI. None of them needs uploaded media."
      },
      {
        "title": "Run one against your server",
        "text": "Create a project, then POST the ops from the gallery. Replace PROJECT with the id from the first response.",
        "language": "SHELL",
        "code": "curl -X POST \"$BASE/api/projects\" -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d '{\"name\":\"Beat drop\",\"timeline\":{\"fps\":30,\"resolution\":{\"width\":1280,\"height\":720},\"background\":\"#0f1020\",\"clips\":[]}}'\n\ncurl -X POST \"$BASE/api/projects/$PROJECT/timeline/ops\" -H \"Authorization: Bearer $KEY\" -H \"Content-Type: application/json\" \\\n  -d @ops.json   # paste the JSON from the gallery into ops.json\n\ncurl \"$BASE/api/projects/$PROJECT/frame?t=1.5&width=640\" -H \"Authorization: Bearer $KEY\" -o frame.png"
      },
      {
        "title": "What each one shows",
        "text": "Pick the example closest to what you want to build and change the text, colors and timing.",
        "rows": [
          [
            "Example",
            "Shows"
          ],
          [
            "preset-sampler",
            "Every entrance preset side by side: slides, springs, bounces, wipes and fades, each one a handful of editable keyframes. (13 entrance presets, apply_motion delay + duration, wipe reveal, damped spring)"
          ],
          [
            "emphasis-sampler",
            "Pulse, shake, wobble, rubber band, tada, heartbeat, blink, flash, glitch and more: beats that draw the eye to a layer that is already on screen. (11 emphasis presets, sampled keyframes, hold easing)"
          ],
          [
            "exit-sampler",
            "Nine ways to leave: slides, shrinks, spins, pops and wipes that finish exactly at the end of the clip. (9 exit presets, ends at clip end, reveal-out)"
          ],
          [
            "code-orbit",
            "A sun and three planets driven only by expressions of time. No keyframes, so the motion never runs out. (animate_code, sin / cos, base + t)"
          ],
          [
            "loop-recipes",
            "Thirteen ready-made looping behaviours: float, orbit, wiggle, heartbeat, glitch and more, each a single apply_code_motion call. (apply_code_motion, 13 recipes, wiggle noise)"
          ],
          [
            "fit-demo",
            "A headline far too long for one line wraps and shrinks to fit, while an oversized card and a stray caption are pulled back into the frame with fit_all. (textFit auto, fit_all, wrap + shrink)"
          ],
          [
            "bullet-points",
            "A headline and four points that slide in one after another. (bullet-list, items[], stagger)"
          ],
          [
            "starburst-badge",
            "A rocking two-square burst with a label, rocked by an expression instead of keyframes. (starburst, expressions, back-out easing)"
          ],
          [
            "chapter-opener",
            "A huge chapter number, a rule and the chapter title. (chapter-number, number option)"
          ],
          [
            "social-handle",
            "A rounded pill wipes open around a handle with a call to action beneath it. (social-handle, reveal on a rounded shape)"
          ],
          [
            "lower-third-reveal",
            "The classic nameplate, with the plate wiping open and each line rising in on its own delay. (add_motion_template, reveal property, per-layer delay)"
          ],
          [
            "kinetic-whip",
            "A headline whips in word by word using one sequenced preset instead of hand-placed keyframes. (kinetic-type, apply_motion_sequence, anticipate easing)"
          ],
          [
            "quote-card",
            "A springing quotation mark, a rising quote and an attribution rule. (quote-card, spring preset, idPrefix)"
          ],
          [
            "split-reveal",
            "Two accent rules wipe open and a headline rises between them. (split-reveal, reveal keyframes, snappy easing)"
          ],
          [
            "progress-bar",
            "A rounded track fills to 100 percent using a reveal keyframe on a shape. (progress-bar, reveal on shapes)"
          ],
          [
            "stat-highlight",
            "A big number inside a springing accent ring with a supporting caption. (stat-highlight, ellipse stroke, back-out easing)"
          ],
          [
            "beat-drop",
            "Four circles spring in one beat apart at 120 BPM and leave together. Beat markers show up on the Studio timeline. (add_beat_markers, apply_motion_sequence, spring preset)"
          ]
        ]
      },
      {
        "title": "Render the GIFs yourself",
        "text": "npm run examples renders every composition plus a transitions reel from generated footage into docs/examples. Pass one or more ids to render only those.",
        "language": "SHELL",
        "code": "npm run examples\nnpm run examples -- beat-drop quote-card",
        "links": [
          {
            "label": "Motion presets",
            "slug": "motion-presets"
          },
          {
            "label": "Transitions",
            "slug": "transitions"
          }
        ]
      }
    ]
  },
  {
    "slug": "editor",
    "group": "Studio",
    "title": "Using the editor",
    "description": "Cut media, build graphics and refine keyframes visually.",
    "sections": [
      {
        "title": "Open your workspace",
        "text": "Open Studio and sign in with a read, write or admin key. The left library holds Media, Effects, Graphics and Projects. Drag the dividers to resize the library, inspector and timeline. Focus a divider and use arrow keys to resize with a keyboard. Tools lets you hide panels or reset the layout. Layout changes last for the current page session."
      },
      {
        "title": "Work on a smaller screen",
        "text": "On mobile, the preview stays above the active Timeline, Library or Inspector panel. Switch panels with the panel buttons rather than scrolling away from the preview. Tools contains composition JSON, add title, redo, snapping and documentation links."
      },
      {
        "title": "Custom tools",
        "text": "The Tools tab of the library lists your custom tools: automations written in JavaScript or assembled from building blocks. Run one and its operations apply as a single undoable step. See Custom tools."
      },
      {
        "title": "Typography for text clips",
        "text": "Select a text clip and open the Typography section of the inspector to choose a family from the catalog, a weight, an alignment, line height, letter spacing and uppercase. The preview loads every catalog font, so what you pick is what renders. The font catalog is documented in Fonts & text."
      },
      {
        "title": "Create graphics",
        "text": "Open Graphics and select a visual template card. Hover a preview to see its animation; reduced-motion preferences keep previews still. Customize the headline, supporting text, accent and duration, then choose Add to timeline. Generated clips are inserted at the playhead and selected. Click a single object in the canvas or its named timeline lane to edit it. Shift-click adds or removes objects from the selection. Shape primitives can also be inserted directly."
      },
      {
        "title": "Animate and refine",
        "text": "Choose Animate to open a dedicated property graph alongside the timeline. Selected graphic clips expand into property-labelled keyframe lanes. Click a diamond to seek and select that exact property and key in the graph. Add keys at the playhead, drag graph diamonds and adjust outgoing tween slopes. The inspector's Motion tab remains available in Edit mode. On-canvas handles move and scale selected visual clips."
      },
      {
        "title": "Understand graphic lanes",
        "text": "Each overlay clip has a named lane in document order, so moving it in time does not repack it onto a different row. These are clip lanes, not user-defined tracks or a new layer-order system. Existing rendering order is unchanged: media first, then shapes, then text. Video and audio categories still pack overlapping clips."
      },
      {
        "title": "Share a composition with your agent",
        "text": "Open Tools → Composition JSON to copy or download the full timeline. Paste a JSON composition, validate it, then apply it as one undoable edit. Missing assets must be uploaded first. With several clips selected, Stagger places them at the playhead with 0.15-second spacing."
      },
      {
        "title": "Keyboard shortcuts",
        "text": "Shortcuts are ignored while typing in an input. Editing commands require a write-capable key.",
        "rows": [
          [
            "Key",
            "Action"
          ],
          [
            "Space",
            "Play / pause"
          ],
          [
            "S",
            "Split at playhead"
          ],
          [
            "Ctrl/Cmd + Z",
            "Undo"
          ],
          [
            "Ctrl/Cmd + Shift + Z",
            "Redo"
          ],
          [
            "Delete",
            "Delete selection"
          ],
          [
            "Shift + Delete",
            "Ripple delete"
          ],
          [
            "Left / Right",
            "Seek one frame"
          ],
          [
            "[ / ]",
            "Trim to playhead"
          ],
          [
            "+ / -",
            "Timeline zoom"
          ]
        ]
      },
      {
        "title": "Save and export",
        "text": "Projects autosave as you edit. Check the save status before leaving. Export queues a server-side MP4 job. Public sharing requires an admin to change visibility and a completed render. A public share link does not expose your API key or source footage.",
        "links": [
          {
            "label": "Rendering",
            "slug": "rendering"
          }
        ]
      }
    ]
  },
  {
    "slug": "custom-tools",
    "group": "Studio",
    "title": "Custom tools",
    "description": "Write your own one-click automations in JavaScript or snap them together in a full-screen block studio.",
    "sections": [
      {
        "title": "Your own tools",
        "text": "Custom tools are small automations you write once and run with a click: \"three beat titles at the playhead\", \"bold every title\", \"orbit the selection\". A tool returns a list of timeline operations, and running it applies them as one atomic, undoable step — the same operations the API uses, with the same validation. Click the **Blocks** tab, next to Effects, and the block studio opens straight away; code tools live in the Tools tab."
      },
      {
        "title": "Two ways to write one",
        "text": "Every tool has a name, a description, and a program written in one of two modes, both edited in the full-screen block studio. - **Blocks** is a canvas like Scratch: drag friendly blocks, connect them with lines, and run them — no code required. - **Code** is a short JavaScript function that receives a `vf` helper and returns operations. The studio's Code tab is a plain editor for coders. Duplicate a built-in example to get started; your tools are stored in your browser and run only against the timeline you have open."
      },
      {
        "title": "The block studio",
        "text": "Open any tool (or create one) and the studio takes over the screen. Blocks live in the palette on the left. The narrow rail of coloured dots picks a **category** — Create, Edit, Animate, Text, Style, Clips, Timing, Values and Flow — and the palette shows that category's blocks. Drag them onto the canvas. Connect a block's bottom dot to the next block's top dot to say \"then do this\": the line snaps in place and that becomes the run order. A tool starts at the **Start** block and follows the lines. Creating your first tool with **New tool with blocks** opens a short tutorial: name the tool, meet the block menu, change the text of the Add title block, press Run, and find your tool again in the Blocks panel. The 🎓 Tutorial button in the header replays it any time. Every field on a block has a small dot on its left. Clip and frame blocks plug into clip and time fields; **Values** blocks plug into any field. Drag a 📝 Text, 🔢 Number or 🔘 Yes / No block next to a block, type the value, and drag from its dot into the field — the connected value wins over whatever is typed in the field itself. Number blocks that don't hold a number turn red, and an unplugged value block gets a nudge to connect it. ### Editing clips you already have The **Edit** group is for everything that changes an existing clip. **Move**, **Set size** and **Rotate** transform a clip; **Flip upside down** and **Mirror** flip it; **Line up** and **Snap to grid** tidy a whole selection — place them in a tidy row or column at fixed frame spots, or spread them evenly across the frame. Colour and mood come from **Colour look**, **Brightness**, **Contrast**, **Colour strength** and **Blur**. Timing and sound: **Change speed**, **Set duration**, **Volume**, **Mute**, **Fade sound in/out**. Layering is real stacking order: **Forwards/Backwards one layer** and **Bring to front / Send to back** change a clip's z (higher draws on top, in both the preview and the render), and **Move to track** moves it between the overlay, video and audio tracks. **Crop** trims a picture or video in from the sides — the layer keeps its box with transparent padding where pixels were cut, so the preview and the export match. **Copy with offset** duplicates a clip and nudges the copy sideways — perfect for shadows and rows — and **Change words** rewrites a text clip while keeping its font, colour and size. Motion blocks also take an **easing** pick (the default, \"preset\", keeps each move's own built-in easing). ### Animating anything **Animate a property** is the keyframe block: pick a property (position, size, rotation, opacity, colour filters, reveal, volume), a **from** and a **to** value, a duration, a delay and an easing — including bounce and elastic, which the studio converts into keyframe curves for you. Ready-made variants cover the popular moves (slide in, rise up, drop, zoom, spin, fade), and **Draw on** uncovers shapes and videos left to right. Expression blocks like **Pulsing glow** and **Parallax float** animate forever with small formulas of time. ### Text effects Text clips can be revealed over time: **Typewriter** types them on character by character, **Reveal word by word** and **Reveal line by line** show them progressively, and **Colour cycle** steps the colour through a rainbow. All of them preview in the editor and export to video. **Stop text effects** turns them off. Control blocks (Repeat, For each clip, Function) have a second dot on their right side: connect blocks there to fill their body.",
        "rows": [
          [
            "Block family",
            "What it does"
          ],
          [
            "Create",
            "add a title, shape or sticker"
          ],
          [
            "Edit",
            "change clips you already have: move, resize, rotate, flip and mirror, line up and distribute, snap to grid, crop, opacity, colour looks and filters, speed and duration, volume, mute, fades, tracks, real layer order, copy with offset, replace words"
          ],
          [
            "Animate",
            "friendly from-to moves — fade in or out, slide in, rise up, drop down, zoom, spin, draw on — plus animate any property yourself, and expression-driven floats, glows and orbits"
          ],
          [
            "Text",
            "typewriter, word-by-word and line-by-line reveal, colour cycling"
          ],
          [
            "Style",
            "bold or colour the text of a clip"
          ],
          [
            "Clips",
            "delete or duplicate clips, stagger a selection, beat markers"
          ],
          [
            "Timing",
            "stagger to beats, speed changes, reverse and stretch motion, Repeat and For each clip"
          ],
          [
            "Values",
            "little typed blocks — Text, Number, Yes / No — that plug into any block's field, so arguments can be wired instead of typed"
          ],
          [
            "Flow",
            "Function defines a named group; Call runs it by name"
          ]
        ]
      },
      {
        "title": "Clips and frames",
        "text": "Two special blocks plug your project straight into a tool. - **Import clips** lists every clip in the timeline — add one and it becomes a clip block on the canvas. - **Add frame** adds a frame block: a frame number that knows the project fps, so it shows the real seconds it stands for. Connect a clip block's right dot into a block's **clip** field (a purple dot on its left edge) to make that block act on that clip. Connect a frame block into a **time** field and it becomes that many seconds. One connection per field — dragging a new one replaces the old."
      },
      {
        "title": "Errors, live",
        "text": "The studio checks the graph as you edit. Problems turn the block red and collect in the error panel at the bottom of the screen: click a message to jump to the block. A missing Start, a block with two blocks after it, a loop that never ends, a function that calls itself, a clip that no longer exists — all are caught before anything runs. Disconnected blocks only get a warning, and running with errors is disabled until they are fixed. Run failures land in the same panel."
      },
      {
        "title": "Templates",
        "text": "Any string value in a block can hold a template that is resolved when the tool runs. Arithmetic works too: `\"$playhead + $index * 0.4\"` staggers each step from the playhead. Fields marked JSON (patches, keyframes, expressions) are parsed into objects, so an update step can carry any clip fields, including the new text style. For-each groups can also filter by what a clip looks like or says: pick **colour** and a colour swatch to run blocks for every clip of that colour, or pick **contains** and type a few words to catch every text clip containing them. Audio clips are included too (kind \"audio\"), so a for-each over audio can change volume across a whole soundtrack. Switching a blocks tool to the Code tab converts the graph into readable JavaScript that produces the same operations; the `vf` helpers cover everything the blocks can do, including `vf.animateProperty`, `vf.textEffect` and `vf.colorCycle`.",
        "rows": [
          [
            "Template",
            "Becomes"
          ],
          [
            "$playhead",
            "the playhead position in seconds"
          ],
          [
            "$duration",
            "the timeline duration in seconds"
          ],
          [
            "$index / $count",
            "position inside a repeat or for-each group"
          ],
          [
            "$clipId",
            "the current clip inside a for-each group"
          ],
          [
            "$selection",
            "the selected clip ids, comma separated"
          ]
        ]
      },
      {
        "title": "Blocks ↔ code",
        "text": "Switching a blocks tool to the Code tab converts the graph into readable, commented JavaScript that uses the `vf` helper — chains become sequential calls, Repeat becomes a `for` loop, For-each-clip becomes a filtered `vf.clips` loop, functions become `const name = (index, count, clipId) => …`, and clip/frame connections become arguments. The tool now runs that code (the blocks are kept, so you can switch back). The conversion is faithful: the generated code produces the same operations the blocks would, resolved at run time against the live playhead and selection. Invalid graphs stay in Blocks with an error instead of converting."
      },
      {
        "title": "Code tools",
        "text": "A code tool is the body of a JavaScript function. It receives one argument, `vf`, and returns one operation or an array of them. The Code tab is a real editor: line numbers, tab-key support, and a reference panel listing every `vf` helper — click an example to insert it at the cursor. The `$templates` the blocks use (like `$playhead`) are listed with their code equivalents (`vf.playhead`). When a run fails, the error shows inline above the code with the offending line highlighted in the gutter, as well as in the error console.",
        "language": "JS",
        "code": "// vf has the playhead, selection and every clip\nconst ops = [];\nfor (const id of vf.selection) {\n  ops.push(vf.animate(id, { rotation: \"wiggle(2, 4)\" }));\n}\nops.push(vf.markers(120, 8));\nreturn ops;",
        "rows": [
          [
            "Helper",
            "Returns"
          ],
          [
            "vf.addText({ text, start?, duration?, ... })",
            "add_text_clip"
          ],
          [
            "vf.addShape({ shape, ... })",
            "add_shape_clip"
          ],
          [
            "vf.update(id, patch)",
            "update_clip with any clip fields"
          ],
          [
            "vf.motion(id, preset, opts?)",
            "apply_motion"
          ],
          [
            "vf.stagger(ids, opts?)",
            "stagger_clips"
          ],
          [
            "vf.keyframes(id, property, keys)",
            "set_keyframes"
          ],
          [
            "vf.animate(id, expressions)",
            "animate_code"
          ],
          [
            "vf.remove(id) / vf.duplicate(id)",
            "remove_clip / duplicate_clip"
          ],
          [
            "vf.markers(bpm, count)",
            "add_beat_markers"
          ]
        ]
      },
      {
        "title": "Safety and limits",
        "text": "Code tools run as ordinary JavaScript in your own browser page — there is no sandbox, so only run tools you wrote or trust. The server still validates every operation a tool produces and rejects anything invalid, atomically. Both block and code tools may produce at most 100 operations, matching the batch limit. Because tools are just operations, they respect scopes, undo, dry runs and everything else in the operation catalog."
      },
      {
        "title": "Where tools live",
        "text": "Your library syncs to your account (or API key), so it follows you between browsers — `GET/PUT/DELETE /api/tools/:id` — with the browser's local copy as the offline fallback. Share one with the 🔗 Share button: a compact `VFT1:` code anyone can import. The Code tab's **Export as standalone script** downloads a single `.mjs` that runs the same code against the API — set `VF_API_KEY` and pass a project id (`--dry-run` previews the change summary) — handy for agents and cron jobs. The studio speaks Spanish too: the 🌐 button switches every block label and description (remembered per browser).",
        "links": [
          {
            "label": "Using the editor",
            "slug": "editor"
          },
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Fonts & text",
            "slug": "fonts-and-text"
          }
        ]
      }
    ]
  },
  {
    "slug": "agent-workflow",
    "group": "Agent API",
    "title": "Agent workflow",
    "description": "A reliable observe, edit, verify loop for AI-driven video production.",
    "sections": [
      {
        "title": "Discover before composing",
        "text": "Read GET /api/capabilities, GET /api/motion/templates and GET /api/graphics/schema. Use their operations, limits and enums instead of guessing endpoints or inventing properties. Generate only structured JSON; VideoForge does not execute agent-supplied code."
      },
      {
        "title": "Plan an atomic edit",
        "text": "Fetch the latest project and retain updatedAt. Build one operation or an ops array, then dry-run the batch. If it succeeds, submit the batch again with expectedUpdatedAt. A 409 means another editor changed the project; fetch and re-plan instead of overwriting.",
        "code": "{\n  \"expectedUpdatedAt\": 1790000000000,\n  \"dryRun\": true,\n  \"ops\": [\n    {\n      \"op\": \"add_motion_template\",\n      \"args\": {\n        \"template\": \"lower-third\",\n        \"title\": \"Ada Lovelace\",\n        \"subtitle\": \"Pioneer of computing\",\n        \"color\": \"#f6a447\",\n        \"start\": 0,\n        \"duration\": 4\n      }\n    }\n  ]\n}"
      },
      {
        "title": "Observe the actual output",
        "text": "GET state returns numeric animation values. GET frame returns the composed PNG and GET storyboard returns a contact sheet. Do not assume that valid JSON means a visually correct result. Inspect at the entry, hold and exit times, especially if text is long."
      },
      {
        "title": "Render and report",
        "text": "Queue POST /api/renders with the projectId, poll the returned jobId, and download only when status is done. Be explicit about errors and never report a render as complete merely because it was queued.",
        "links": [
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Rendering",
            "slug": "rendering"
          }
        ]
      }
    ]
  },
  {
    "slug": "batch-operations",
    "group": "Agent API",
    "title": "Batch operations",
    "description": "Atomic edits, dry-run validation and revision guards.",
    "sections": [
      {
        "title": "Atomic by default",
        "text": "Send {op,args} or {ops:[...]} to POST /api/projects/:id/timeline/ops. Every operation is applied to an isolated timeline. If any fails, none of the batch is saved. Errors include a zero-based failedIndex and the failing operation in message."
      },
      {
        "title": "Dry-run before writing",
        "text": "dryRun:true runs the same validation and returns the proposed timeline without saving, updating the revision or announcing a live edit. Generated IDs in dry-run are provisional; get the final createdClipIds from the committed response. Supply explicit IDs to add_shape_clip if you need stable references within a batch.",
        "code": "{\n  \"dryRun\": true,\n  \"ops\": [\n    {\n      \"op\": \"add_shape_clip\",\n      \"args\": {\n        \"id\": \"accent\",\n        \"duration\": 4,\n        \"shape\": {\n          \"type\": \"ellipse\"\n        }\n      }\n    },\n    {\n      \"op\": \"apply_motion\",\n      \"args\": {\n        \"clipId\": \"accent\",\n        \"preset\": \"fade\"\n      }\n    }\n  ]\n}"
      },
      {
        "title": "Avoid stale writes",
        "text": "expectedUpdatedAt must match the latest project's updatedAt. On mismatch, the server returns HTTP 409 and REVISION_CONFLICT. Fetch the project again and adjust your plan. The guard is optional for backwards compatibility; it applies to ops requests, not to full-timeline PUT replacement."
      },
      {
        "title": "Validate a whole timeline",
        "text": "POST /api/projects/:id/timeline/validate with {timeline} checks structure, clips, animation, shape bounds and missing media references. It returns a normalized timeline, duration and clipCount, or HTTP 422 with a readable error. Normalization may clamp legacy fields; shape fields are strictly bounded."
      },
      {
        "title": "Operation catalog",
        "text": "These descriptions come from the shared capabilities catalog used by the backend.",
        "rows": [
          [
            "Operation",
            "Arguments"
          ],
          [
            "add_shape_clip",
            "shape: {type,width?,height?,fill?,stroke?,strokeWidth?,radius?}, id?, start?, duration?, x?, y?, plus transform/keyframe fields"
          ],
          [
            "add_motion_template",
            "template (lower-third|title-card|callout|kinetic-type|countdown|quote-card|split-reveal|progress-bar|stat-highlight|bullet-list|social-handle|chapter-number|starburst); bullet-list takes items[] (1..6), chapter-number takes number, title?, subtitle?, color?, start?, duration? (0.5..60), idPrefix? (stable layer ids: prefix-0, prefix-1, ...)"
          ],
          [
            "stagger_clips",
            "clipIds: [id...] in desired order, delay (0..60 seconds), start?"
          ],
          [
            "add_clip",
            "assetId, track?, start?, inPoint?, outPoint?, plus any clip field"
          ],
          [
            "add_text_clip",
            "text, id?, start?, duration?, plus text and transform fields"
          ],
          [
            "remove_clip",
            "clipId"
          ],
          [
            "ripple_delete",
            "clipId"
          ],
          [
            "duplicate_clip",
            "clipId, start?, dx?, dy? (position offset for the copy)"
          ],
          [
            "trim_clip",
            "clipId, inPoint?, outPoint?"
          ],
          [
            "move_clip",
            "clipId, start?, track?"
          ],
          [
            "split_clip",
            "clipId, at (timeline seconds)"
          ],
          [
            "update_clip",
            "clipId plus any clip field"
          ],
          [
            "swap_asset",
            "clipId, assetId, duration?, inPoint?, outPoint?, keepKeyframes? — replaces the media source of an existing clip (kept id, style, and placement). not supported on text/shape clips."
          ],
          [
            "set_audio",
            "clipId, volume?, muted?"
          ],
          [
            "add_text",
            "clipId, text"
          ],
          [
            "set_keyframes",
            "clipId, property, keyframes: [{time,value,easing?}] replaces that property; [] clears it"
          ],
          [
            "upsert_keyframe",
            "clipId, property, time, value, easing?"
          ],
          [
            "remove_keyframe",
            "clipId, property, time"
          ],
          [
            "apply_motion",
            "clipId, preset (see motionPresets), duration? (seconds the move takes), delay? (seconds into the clip), strength? (0.1..2, distance/overshoot multiplier)"
          ],
          [
            "apply_motion_sequence",
            "clipIds[], preset, stagger? (default 0.12 s between clips), start?, plus apply_motion's duration/delay/strength. Applies one preset to many clips and offsets their starts"
          ],
          [
            "reverse_animation",
            "clipId - plays every keyframe curve backwards, mirroring each easing"
          ],
          [
            "retime_animation",
            "clipId, duration, delay? - compresses or stretches all keyframes of a clip into one window, keeping relative timing"
          ],
          [
            "add_beat_markers",
            "bpm (20..300), count? (1..100, default 8), start?, every? (markers on every Nth beat), label?, color?"
          ],
          [
            "snap_to_beats",
            "clipIds[], bpm, start? - moves clip starts to the nearest beat"
          ],
          [
            "align_clips",
            "clipIds[], mode (left|center|right|top|middle|bottom|distribute-h|distribute-v) - lines clips up or spreads them evenly across the frame"
          ],
          [
            "snap_to_grid",
            "clipIds[], grid (0.02..0.5, default 0.1) - rounds positions to a grid"
          ],
          [
            "move_layer",
            "clipId, direction (forward|backward|front|back) - changes stacking order within a track via the clip z field"
          ],
          [
            "set_track",
            "track, settings: {muted?, hidden?, locked?}"
          ],
          [
            "add_marker",
            "time, label?, color?"
          ],
          [
            "remove_marker",
            "id"
          ],
          [
            "set_project",
            "fps?, resolution?: {width,height}, background?: #rrggbb, refit? (true refits text, shapes and overlays to the new canvas)"
          ],
          [
            "reorder",
            "order: [clipId...] re-spaces video clips sequentially"
          ],
          [
            "shift_clips",
            "delta (seconds, may be negative), from? (only clips starting at or after), track?, clipIds?"
          ],
          [
            "close_gaps",
            "track? (default video) packs the track's clips end to end in their current order"
          ],
          [
            "update_clips",
            "patch: {any clip field}, plus clipIds? or track? (omit both to hit every clip)"
          ],
          [
            "copy_style",
            "fromClipId, toClipIds: copies transform, color, fades, text style and keyframes (scaled to the target length)"
          ],
          [
            "set_marker",
            "id, time?, label?, color?"
          ],
          [
            "set_transition",
            "clipId, type (none|dissolve|wipe-left|wipe-right|wipe-up|wipe-down|iris|barn-h|barn-v|diamond|wipe-diagonal), duration? (0.1-3, default 0.6), join? (default true: move the clip to touch the previous video clip first). Overlaps the clip with the one before it and moves later video clips up"
          ],
          [
            "animate_code",
            "clipId, expressions: {property: code}, replace? - see codeAnimation"
          ],
          [
            "apply_code_motion",
            "clipId or clipIds[], recipe (see codeAnimation.recipes), speed? (0.1..5), strength? (0.1..3)"
          ],
          [
            "bake_expression",
            "clipId, property?, samples? (2..64, default 48) - converts expressions to linear keyframes"
          ],
          [
            "fit_clip",
            "clipId, mode? (safe|contain|cover|fill, default safe), margin? (0..0.3, default 0.04)"
          ],
          [
            "fit_all",
            "media? (keep|contain|cover|fill), clipIds?, margin? - fits every visual clip inside the frame"
          ],
          [
            "remove_clips",
            "clipIds[] - delete several clips in one step"
          ]
        ]
      }
    ]
  },
  {
    "slug": "api-reference",
    "group": "Agent API",
    "title": "HTTP API reference",
    "description": "The HTTP endpoints used by the Studio and external agents.",
    "sections": [
      {
        "title": "Request conventions",
        "text": "Use your own server origin as BASE. Private routes require a Bearer key. JSON requests require Content-Type: application/json. Uploads use multipart/form-data with repeated files fields. :id denotes a path parameter; query parameters are shown where useful."
      },
      {
        "title": "Endpoints",
        "text": "Project and media restrictions are checked server-side. Read routes require read or higher. Mutation routes normally require write or higher; keys, visibility and live watching require admin.",
        "rows": [
          [
            "Method",
            "Path",
            "Purpose"
          ],
          [
            "GET",
            "/api/health",
            "Public health check."
          ],
          [
            "GET",
            "/api/auth/me",
            "Check your key and scope."
          ],
          [
            "GET",
            "/api/capabilities",
            "Operation, property and preset discovery."
          ],
          [
            "GET",
            "/api/graphics/schema",
            "JSON Schema for shape primitives."
          ],
          [
            "GET",
            "/api/motion/templates",
            "List motion graphics templates."
          ],
          [
            "GET / POST",
            "/api/keys",
            "Admin: list or generate scoped keys."
          ],
          [
            "DELETE",
            "/api/keys/:id",
            "Admin: revoke a key."
          ],
          [
            "POST",
            "/api/media/upload",
            "Multipart upload; repeat the files field."
          ],
          [
            "GET",
            "/api/media",
            "List accessible assets."
          ],
          [
            "GET / DELETE",
            "/api/media/:id",
            "Read metadata or delete an asset."
          ],
          [
            "GET",
            "/api/media/:id/raw",
            "Stream original media."
          ],
          [
            "GET",
            "/api/media/:id/thumb",
            "JPEG thumbnail."
          ],
          [
            "GET",
            "/api/media/:id/waveform",
            "Peak-envelope data."
          ],
          [
            "GET / POST",
            "/api/projects",
            "List projects or create with {name,timeline}."
          ],
          [
            "GET / PUT / DELETE",
            "/api/projects/:id",
            "Read, replace/rename, or delete a project."
          ],
          [
            "POST",
            "/api/projects/:id/duplicate",
            "Duplicate a project."
          ],
          [
            "POST",
            "/api/projects/:id/timeline/ops",
            "Atomic operations; dryRun and expectedUpdatedAt supported."
          ],
          [
            "POST",
            "/api/projects/:id/timeline/validate",
            "Check and normalize {timeline}, without saving."
          ],
          [
            "GET",
            "/api/projects/:id/state?t=1.5",
            "Animated state at timeline time t."
          ],
          [
            "GET",
            "/api/projects/:id/frame?t=1.5&width=640",
            "PNG composed frame."
          ],
          [
            "GET",
            "/api/projects/:id/storyboard?count=6",
            "PNG contact sheet."
          ],
          [
            "POST",
            "/api/projects/:id/presence",
            "Live playhead, cursor and selection."
          ],
          [
            "GET",
            "/api/projects/:id/activity",
            "Recent project edits."
          ],
          [
            "GET / POST",
            "/api/renders",
            "List render jobs or enqueue with {projectId}."
          ],
          [
            "GET",
            "/api/renders/:id",
            "Poll render status and progress."
          ],
          [
            "GET",
            "/api/renders/:id/download",
            "Download a finished MP4."
          ],
          [
            "GET",
            "/api/live",
            "Admin: view live projects."
          ],
          [
            "GET",
            "/api/live/:id",
            "Admin: watch an unsaved edit."
          ]
        ]
      },
      {
        "title": "Response and error conventions",
        "text": "Project responses contain id, name, visibility, timeline, createdAt and updatedAt. Ops responses add applied and createdClipIds. Render creation returns jobId. Errors include message; invalid ops return 422 and failedIndex, stale guarded ops return 409, unknown resources return 404, and denied credentials return 401 or 403."
      },
      {
        "title": "Detailed repository reference",
        "text": "The repository's docs/API.md retains the expanded endpoint contracts, key restrictions, security notes and deployment guidance. The motion graphics additions are also documented there.",
        "links": [
          {
            "label": "Your first composition",
            "slug": "quickstart"
          },
          {
            "label": "Authentication",
            "slug": "authentication"
          }
        ]
      }
    ]
  },
  {
    "slug": "rendering",
    "group": "Agent API",
    "title": "Rendering & inspection",
    "description": "See your composition before paying the cost of a full export.",
    "sections": [
      {
        "title": "Frame inspection",
        "text": "GET /api/projects/:id/frame?t=1.5&width=640 renders a PNG at a timeline time. Shapes, text, media, fades and keyframes go through the same FFmpeg composition path as exports. Width is optional. Use an authenticated request or supported signed media URLs when embedding protected media."
      },
      {
        "title": "Storyboards",
        "text": "GET /api/projects/:id/storyboard?count=6 returns a PNG contact sheet of evenly spaced frames. The X-Storyboard header contains column, row and time metadata. Use it to evaluate pacing and content coverage."
      },
      {
        "title": "MP4 exports",
        "text": "POST /api/renders accepts {projectId} and returns jobId. GET /api/renders/:id reports queued, rendering, done or error and numeric progress. The download endpoint serves the finished MP4. Rendering requires FFmpeg and ffprobe on the server.",
        "code": "{\n  \"projectId\": \"<project-id>\"\n}"
      },
      {
        "title": "Known boundaries",
        "text": "This release does not provide arbitrary SVG paths, Lottie import, 3D, expressions, nested compositions or motion blur. Shape fill and size are static; transforms animate. Preview and export can differ slightly in font metrics, cubic easing approximation and shape edge antialiasing. Inspect exported frames for final approval."
      }
    ]
  },
  {
    "slug": "self-hosting",
    "group": "Resources",
    "title": "Self-hosting",
    "description": "Run the Studio and rendering API on infrastructure you control.",
    "sections": [
      {
        "title": "Requirements",
        "text": "Use Node 20 or newer with ffmpeg and ffprobe on PATH. SQLite stores project data, data/media holds uploads and data/renders holds exports. These contain private data; back them up and never commit them."
      },
      {
        "title": "Hosted instance",
        "text": "A hosted deployment runs at https://videoforge-api-s54w.onrender.com for trying the API without infrastructure. Point BASE at it and use a key issued by that deployment. To control the deployment, its data and its keys, self-host."
      },
      {
        "title": "Development and production",
        "text": "The default port is 5000. Production serves the compiled frontend from dist/public and runs the API from the bundled server.",
        "language": "SHELL",
        "code": "npm ci\nnpm run dev\n\n# Production\nnpm run check\nnpm run build\nnpm start"
      },
      {
        "title": "Frontend hosting",
        "text": "If you host the frontend separately, set VITE_API_BASE to your HTTPS API origin at build time and configure CORS_ORIGIN on the backend. The frontend alone cannot render video; FFmpeg and the API must remain running. Hash routes support GitHub Pages without rewrite rules."
      },
      {
        "title": "Secure your deployment",
        "text": "Use HTTPS, secure the owner key, restrict agent keys and configure your frontend origin. Do not expose data directories directly. Keep dependency security updates current. See docs/API.md in the repository for the detailed security and deployment notes."
      }
    ]
  },
  {
    "slug": "TODO",
    "group": "Studio",
    "title": "Bucket list",
    "description": "What is done in the block studio and custom tools, and what to build next.",
    "sections": [
      {
        "title": "Where we are",
        "text": "The block studio, the code editor and the tool engine are in good shape. Each item below shipped with its own tests and a commit to main, and everything on this page reflects the current state of the repo. The remaining ideas are roughly ordered by value for kids making videos."
      },
      {
        "title": "Shipped",
        "text": "- [x] Full-screen Scratch-style block studio (React Flow) with palette drag and drop, custom nodes, per-edge delete buttons, inline param handles, live validation and the error console bar. - [x] Code tab as a real editor: helper reference sidebar with click-to-insert examples, $-template reference, line numbers, tab-key support, bigger monospace font and inline run errors. - [x] Blocks → Code conversion on tab switch, with generated JavaScript that produces the same operations the blocks would, and a notice that the tool now runs the code. - [x] Animation everything: all motion presets in the palette (entrances, exits, attention, springy, camera), animate-any-property keyframe blocks with easings, text effects (typewriter, word/line reveal, colour cycle), draw-on, pulsing glow, parallax, speed and timing blocks. - [x] Many more edit tools: the Edit group covers transform, flip and mirror, row/column placement and distribute, snap to grid, crop, opacity, colour looks and filters, brightness/contrast/saturation/blur, speed and duration, volume, mute, audio fades, tracks and layering, copy with offset, replace words, and for-each filtering by colour and contained text. (True edge-to-edge alignment is still open — see the bucket list.) - [x] True z-order: clips carry a z field (-100..100). Overlay visuals — media, shapes and text alike — stack by z in one order, in both the preview and the renderer; move_layer blocks step past the nearest neighbour even with unequal ranks. - [x] Spatial crop for media clips: a crop box (fractions of the layer box) applied by the preview's clip-path and the renderer's crop filter (the layer keeps its box, padded back transparent, so preview and export match), driven by the friendly trim-sides Crop block. - [x] Motion blocks take an easing pick; audio clips are walkable by for-each (kind \"audio\") for volume tools. - [x] Hosted API server documented: https://videoforge-api-s54w.onrender.com is stated in the introduction, quickstart, self-hosting guide and README, with per-deployment keys. - [x] Palette tabs: the studio palette is a Scratch-style rail of coloured categories (Create, Edit, Move in, Move out, Attention, Springy, Camera, Animate, Text, Style, Clips, Timing, Values, Flow) with the palette showing only the selected category. - [x] First-tool tutorial: a six-step guided tour opens the first time a new blocks tool is created — name the tool, meet the block menu, edit the Add title block, run it and find it again — replayable from the 🎓 Tutorial button. - [x] Value blocks: Text, Number and Yes / No blocks in a new Values category plug into any block field — typed arguments without touching code; bad numbers turn red and unplugged values get a warning, and blocks-to-code conversion inlines them identically. - [x] Arguments JSON editor removed: the Advanced op block and its Arguments (JSON) box are gone from the palette and the studio — every operation shows named, friendly fields, and a saved JSON object (like update_clip's patch) becomes editable property rows instead of raw text (saved advanced tools keep working). - [x] Motion blocks are edit tools: \"Entrances\"/\"Exits\" became Move in / Move out with labels like \"Move a clip in\", framed as animating a clip you already have; saved block ids are unchanged. - [x] Blocks panel: the block studio now opens from its own Blocks tab next to Effects — the Tools tab is code-only (no block editor: its studio hides the Blocks tab and the block-creation buttons), while it still runs tools. - [x] Blocks tab opens the canvas itself: clicking Blocks goes straight into the block studio (your latest tool, or a fresh draft with the tutorial) — no tools list in between; closing it returns to the panel you came from. - [x] Palette diet: the canned motion chips (Move in, Move out, Attention, Springy, Camera and their Animate duplicates) are out of the palette — the friendly from/to Animate blocks and presets cover them; hidden ids still load older saved tools. - [x] Real edge alignment for the Line up block: clips line up by their measured edges — against each other or flush with the frame — including text clips (the renderer measures rendered text with drawtext/ascent). - [x] Real speed ramps and freeze frames as first-class timeline ops: the Speed steps block builds a per-clip ramp (segments of constant speed, 0 = freeze), rendered with per-segment trim/setpts/concat (audio silenced and padded to match), and the preview plays the same ramp. Freeze frame is its own block. - [x] Undo/redo for the studio: one entry per drop, delete, paste or edge; drags are one entry (committed at drag start); quick typing coalesces (900 ms). Ctrl+Z / Ctrl+Shift+Z, with a capture-phase listener so text fields don't swallow it. - [x] Shareable tool codes: the 🔗 Share button copies a compact `VFT1:` code; the tools panel imports it. Old links keep working (damaged codes get a friendly error). - [x] Server-side tool library: tools sync per account (or per API key) with `GET/PUT/DELETE /api/tools/:id`, merged with the browser's local copy as the offline fallback. - [x] Save as sticker: the block turns any clip into a reusable building block; stickers appear in their own palette category and drop as fresh clips. - [x] Hover help on palette groups and a searchable palette (search matches either language). - [x] Export code tools as standalone scripts: the Code tab's “Export as standalone script” downloads a single .mjs that runs the same code against the API (`VF_API_KEY` env, `--dry-run` preview), for agents and cron jobs. - [x] Localization: Spanish labels and descriptions for every block and group (🌐 button in the studio, remembered per browser; the browser language is the default). Search matches either language. - [x] Accounts with durable sign-ins: email + password (first account needs the owner key), Google when configured, API keys for agents; sessions live in SQLite so they survive restarts. No API key needed to use the studio. - [x] Calmer blocks: the coloured field dots (clip / frame / value sockets) only show when you hover a block, select it, focus it or while dragging a connection — dots that already have something plugged in stay visible, and the 🔌 Connectors button pins them all on. The canvas legend explains the dots. - [x] Neater blocks: every block got more breathing room (roomier header, field and hint spacing) and a cleaner look — soft gradient card, one-pixel border, a colour-coded accent bar per block kind, circular glowing handles and hover states on the palette chips. - [x] One ✕ per wire, not per canvas: a wire's delete button now appears when you click that wire (or hover the ✕ itself), instead of every ✕ lighting up whenever you touch the canvas. - [x] 🧹 Tidy button: lines the run chain up a column, puts repeat bodies to its right, helper blocks (values, clips, frames) beside the blocks they feed and notes in a far column — one undo entry, like a drag. Presets and free spots also land further apart, so new blocks no longer stack on old ones. - [x] Bigger tutorial: six steps became eleven in three parts (Your first tool, Connecting things, Power moves) with part chips you can jump between — now covering wires vs field dots, importing clips, value blocks, undo, presets and where saved tools live."
      },
      {
        "title": "Bucket list",
        "text": "Big and small ideas, roughly by value. Each one is a candidate for its own commit and browser-verified round. - [ ] **Rig animations — a Roblox-Studio-style rig animator.** The big one: characters and props built from a joint hierarchy (bones with parent/child transforms), posed by selecting a joint and rotating/moving it, the way Roblox Studio's Animation Editor works. Poses captured as per-joint keyframes on a timeline, interpolated (linear + easing, maybe the existing bezier tween slopes), and baked into an **animation clip that lands on the video timeline as a normal, editable clip** — trim it, retime it, layer it, run it backwards with the existing tools. Stretch: onion skinning, IK handles for limbs, walk-cycle presets, and a library of rigs (stick figure, mascot, hands). This is skeletal animation — today's motion presets only animate whole clips, so this needs a new rig data model, a pose/keyframe editor panel and renderer support (browser canvas first, FFmpeg export after). Big but the future of the studio. - [ ] Your idea here — the studio is in good shape; what should kids be able to make next?"
      }
    ]
  }
];
