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
        "text": "VideoForge is a self-hosted video editor and programmable composition engine. Use the Studio to cut footage and animate graphics, or use the same HTTP API to let scripts and AI agents build the edit. Your media stays on your server.\n\nA hosted deployment runs at [videoforge-api-s54w.onrender.com](https://videoforge-api-s54w.onrender.com) — set BASE to it and use an API key issued by that deployment. GET /api/health reports status. To run your own, see Self-hosting."
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
            "label": "Motion graphics tutorial",
            "slug": "motion-graphics-tutorial"
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
    ],
    "updated": "2026-10-17T13:19:57Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "quickstart",
    "group": "Get started",
    "title": "Your first composition",
    "description": "Create an animated lower third and export it without uploading a single asset.",
    "sections": [
      {
        "title": "Connect to your server",
        "text": "Run npm ci and npm run dev in the repository. The default server is http://localhost:5000. On first boot, the server creates an owner key; use it to generate a restricted write key for your agent. Set BASE to your server URL and KEY to that scoped key. Never put the owner key in client code.\n\nTo use the hosted deployment instead, set BASE to https://videoforge-api-s54w.onrender.com. Keys are issued per deployment: a key from your local server will not work there. GET /api/health reports status.",
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
    ],
    "updated": "2026-10-16T06:24:05Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "motion-graphics-tutorial",
    "group": "Get started",
    "title": "Motion graphics tutorial",
    "description": "Build an animated intro in the Studio, step by step. No footage needed.",
    "sections": [
      {
        "title": "What you will make",
        "text": "A five second intro: a headline that springs in, an accent bar that wipes open, a tagline that rises, a badge that floats forever and a lower third that arrives at two seconds. It takes about fifteen minutes and needs no uploads. Every layer is a normal clip, so you can change anything afterwards.\n\nEach step below has a short recording of the Studio doing it — watch the clip, then do the same in your own tab.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Follow along in a second tab. Open the Studio at `#/editor` and keep this page next to it."
          }
        ]
      },
      {
        "title": "Start the project",
        "text": "Click the project name at the top left and type `Animated intro`. With nothing selected, the right panel shows Project settings: leave Canvas on 16:9 HD (1280×720) and Frame rate on 30 fps, and set the Background swatch to a dark navy such as `#101826`.",
        "video": "mg-start"
      },
      {
        "title": "Add a headline",
        "text": "Click Add title in the top bar, then type `Make your move` into the Text box. Set Size to about 10%, pick Poppins Bold in Typography, set Vertical to 44% and Duration to 5 seconds so it lasts the whole intro.",
        "callouts": [
          {
            "kind": "note",
            "text": "Size is a percentage of the frame height, and Horizontal and Vertical are percentages of the frame, so the same numbers work at any resolution."
          }
        ],
        "video": "mg-headline"
      },
      {
        "title": "Make it spring in",
        "text": "Open the Motion tab, expand Motion presets, set Duration to 0.9 and click Spring. Press Space to play and the headline pops in with a damped bounce.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Click any preset to preview it, then press Ctrl+Z and try another. Presets replace only the properties they animate."
          }
        ],
        "video": "mg-spring"
      },
      {
        "title": "Add an accent bar",
        "text": "Open the Graphics tab and click rectangle. Set Shape width to 22% and height to 1 or 2%, fill it orange `#f6a447`, set Start to 0.3 and Duration to 4.7, and Vertical to 56%. Back in the Motion tab, click Wipe reveal with a Duration of 0.7 and the bar draws itself from left to right.",
        "callouts": [
          {
            "kind": "note",
            "text": "Shape width and height are fractions of the frame, so on a 16:9 canvas equal percentages do not make a square — which matters for the next circle."
          }
        ],
        "video": "mg-bar"
      },
      {
        "title": "Add a tagline",
        "text": "Click Add title again and type `Motion graphics, made in the Studio`. Set Size to about 3.5%, Poppins, colour `#9fb3c8`, Vertical to 62%, Start to 0.5 and Duration to 4.5. In the Motion tab choose Rise with a Duration of 0.6.",
        "video": "mg-tagline"
      },
      {
        "title": "Add a badge that keeps moving",
        "text": "In Graphics click ellipse. A circle on 16:9 needs width 7% and height 12%. Fill it orange, set Vertical to 22% and Duration to 5. In the Motion tab expand Animate with code, choose the Float recipe and click Apply recipe: the badge bobs gently for as long as the clip lasts.",
        "callouts": [
          {
            "kind": "tip",
            "text": "A recipe is a formula, not keyframes, so it keeps looping at any clip length. Click Bake to keyframes if you later want to edit the movement by hand."
          }
        ],
        "video": "mg-badge"
      },
      {
        "title": "Drop in a lower third",
        "text": "Click the timeline ruler at 2 seconds to place the playhead. In Graphics, click Lower third, set Headline to `Ada Lovelace`, Supporting text to `Pioneer of computing`, keep the orange Accent, set Duration to 3 and click Add to timeline. The template expands into three ordinary clips you can edit like any layer.",
        "video": "mg-lower-third"
      },
      {
        "title": "Tune the motion on a graph",
        "text": "Click Animate in the top bar and select the headline. Its clip opens into Scale and Opacity lanes, with an Animation panel at the bottom right. The spring is drawn as a curve that overshoots and settles: drag the highest diamond down to soften the bounce, drag sideways to change timing, or click Key at playhead to add a key. Click Edit when you are done.",
        "video": "mg-graph"
      },
      {
        "title": "Fade everything out",
        "text": "Select the headline, then drag the Fade out slider in the Edit tab to 0.6 seconds. Do the same for the tagline. Fade out is separate from keyframes, so it never fights the spring you set up earlier.",
        "video": "mg-fade"
      },
      {
        "title": "Check it fits and play it back",
        "text": "With nothing selected, click Fit all layers in the Project panel to pull anything sticking out back inside. Click the skip-to-start button next to Play, press Space and watch the whole intro through once. Watch the save status next to the project name: when it says All changes saved, your work is stored with your account.",
        "video": "mg-playback"
      },
      {
        "title": "Export your video",
        "text": "Click Export in the top bar. A progress bar shows the render and the MP4 is ready to download when it finishes. The server renders with FFmpeg and downloads each font the first time it is used, so a first render with a new font can take a little longer.",
        "callouts": [
          {
            "kind": "note",
            "text": "The preview and the export use the same formulas, but font metrics can differ by a pixel or two. Watch the export once before you publish it."
          }
        ],
        "video": "mg-export"
      },
      {
        "title": "Build the same thing with the API",
        "text": "Everything you did in the Studio is an operation, and the whole intro is one batch. Send this to `POST /api/projects/:id/timeline/ops` with a write key and you get the same layers. Add `\"dryRun\": true` first to see what would change.",
        "code": "{\n  \"ops\": [\n    {\"op\": \"set_project\", \"args\": {\"background\": \"#101826\"}},\n    {\"op\": \"add_text_clip\", \"args\": {\"id\": \"headline\", \"text\": \"Make your move\", \"start\": 0, \"duration\": 5, \"x\": 0.5, \"y\": 0.44, \"textSize\": 10, \"font\": \"poppins\", \"fontWeight\": 700, \"textColor\": \"#ffffff\", \"fadeOut\": 0.6}},\n    {\"op\": \"add_shape_clip\", \"args\": {\"id\": \"bar\", \"start\": 0.3, \"duration\": 4.7, \"x\": 0.5, \"y\": 0.56, \"shape\": {\"type\": \"rectangle\", \"width\": 0.22, \"height\": 0.012, \"fill\": \"#f6a447\", \"radius\": 6}}},\n    {\"op\": \"add_text_clip\", \"args\": {\"id\": \"tagline\", \"text\": \"Motion graphics, made in the Studio\", \"start\": 0.5, \"duration\": 4.5, \"x\": 0.5, \"y\": 0.62, \"textSize\": 3.5, \"font\": \"poppins\", \"textColor\": \"#9fb3c8\", \"fadeOut\": 0.6}},\n    {\"op\": \"add_shape_clip\", \"args\": {\"id\": \"badge\", \"start\": 0, \"duration\": 5, \"x\": 0.5, \"y\": 0.22, \"shape\": {\"type\": \"ellipse\", \"width\": 0.07, \"height\": 0.124, \"fill\": \"#f6a447\"}}},\n    {\"op\": \"apply_motion\", \"args\": {\"clipId\": \"headline\", \"preset\": \"spring\", \"delay\": 0, \"duration\": 0.9}},\n    {\"op\": \"apply_motion\", \"args\": {\"clipId\": \"bar\", \"preset\": \"reveal\", \"delay\": 0, \"duration\": 0.7}},\n    {\"op\": \"apply_motion\", \"args\": {\"clipId\": \"tagline\", \"preset\": \"rise\", \"delay\": 0, \"duration\": 0.6}},\n    {\"op\": \"apply_code_motion\", \"args\": {\"clipIds\": [\"badge\"], \"recipe\": \"float\", \"speed\": 1, \"strength\": 1}},\n    {\"op\": \"add_motion_template\", \"args\": {\"template\": \"lower-third\", \"title\": \"Ada Lovelace\", \"subtitle\": \"Pioneer of computing\", \"color\": \"#f6a447\", \"start\": 2, \"duration\": 3, \"idPrefix\": \"lt\"}}\n  ]\n}"
      },
      {
        "title": "Where to go next",
        "text": "Try changing one thing at a time: swap Spring for Bounce in, add a second lower third, or use Animator to make the badge and bar move as one rig. Presets, keyframes and expressions all combine, so small changes go a long way.",
        "links": [
          {
            "label": "Motion presets",
            "slug": "motion-presets"
          },
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Animate with code",
            "slug": "animate-with-code"
          },
          {
            "label": "Animator",
            "slug": "animator"
          },
          {
            "label": "Examples gallery",
            "slug": "examples"
          }
        ]
      }
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-17T08:48:53Z"
  },
  {
    "slug": "authentication",
    "group": "Get started",
    "title": "Authentication & scopes",
    "description": "Sign in with email, Google or an API key — and give agents only the access they need.",
    "sections": [
      {
        "title": "Three ways to sign in",
        "text": "- **Email and password** — the everyday way for people. The first account is created with the workspace owner key (printed to `data/OWNER_KEY.txt` on first boot, or set `VIDEOFORGE_BOOTSTRAP_KEY`); it becomes the workspace admin. After that, new accounts come from an admin (Developer platform → Accounts) unless `VIDEOFORGE_ACCOUNTS=open` allows self-signup.\n- **Google** — a “Continue with Google” button appears when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (standard OAuth, verified id-token claims).\n- **API keys** — for AI agents, scripts and the standalone tool exports. No password, no cookie: `Authorization: Bearer <key>`.\n\nSessions are random tokens stored in SQLite behind an HttpOnly `vf_session` cookie (30 days), so **sign-ins survive server restarts and browser refreshes**. Logout destroys the session. The health endpoint, documentation, share pages and the homepage never require a sign-in.",
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "tutorial-blocks",
    "group": "Get started",
    "title": "Block coding tutorial",
    "description": "Build your first set of blocks, wire values into them and apply the result to your edit.",
    "sections": [
      {
        "title": "What you will make",
        "text": "A set of blocks called **Title every clip** that adds a styled title to the playhead and fades every clip in your edit in half a second. You build it in the block studio without writing a line of code, check it with Preview, then press Apply to edit and watch the whole change land as one undoable step.\n\nIt takes about ten minutes. The same blocks run through the same operations and validation as the API, so what you build here is exactly what an agent could send as a batch.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Open the Studio at `#/editor` in a second tab and keep this page next to it."
          }
        ]
      },
      {
        "title": "Open the block studio",
        "text": "Sign in to the Studio and click the **Blocks** tab, next to Effects. The block studio takes over the screen: the palette sits on the left, the canvas in the middle and the run controls in the header.\n\nIf you have never used blocks before, press the 🎓 **Tutorial** button in the header first. It walks you through naming a set of blocks, the block menu and your first Apply. It replays any time."
      },
      {
        "title": "Start from the green block",
        "text": "Every set of blocks begins with the green **When Apply is pressed** block. It is already on the canvas when you start. Its **Work on** setting decides what `$selection` means later — set it to **Every clip**, so this set of blocks works on the whole edit without you selecting anything.\n\nClick the set's name in the header and type `Title every clip`. The description is optional; write one if you plan to share it."
      },
      {
        "title": "Build the chain",
        "text": "The run order follows the lines between blocks, from the green block down. You will add three blocks to it.\n\nDrag an **Add title** block from the **Create** category onto the canvas. Drag from the green block's bottom dot to the Add title block's top dot: the line snaps in place, so the title is added first. In the block's Text field, type `Made with blocks`.\n\nNext, from the **Animate** category, drag **Fade in**. Connect it under the Add title block. Fade in asks which clips to work on: click its clip field and pick `$selection`.\n\nFinally, from the **Timing** category, drag a **For each clip** block and drop it on empty canvas. Move the Fade in block into its body — connect it to the dot on the block's right side, not the bottom. Then connect the For each clip block under the Add title block. Fade in now runs once per clip instead of once for the selection.",
        "callouts": [
          {
            "kind": "note",
            "text": "The coloured dots on a block's fields are sockets. Clip fields take clip blocks, time fields take frame blocks, and any field can take a Values block instead of a typed value."
          }
        ]
      },
      {
        "title": "Wire a value block",
        "text": "The title's text does not have to be typed into the field. From the **Values** category, drag a 📝 **Text** block next to the Add title block, type `Made with blocks` into it, and drag from its dot into the Add title block's Text field. The connected value wins over whatever is typed in the field.\n\nThis is the whole idea of block coding: values, clips and frames are blocks too, so a set of blocks can be re-wired without retyping anything. Try a 🔢 **Number** block in Fade in's Duration field with `0.5`."
      },
      {
        "title": "Preview, then apply",
        "text": "Press **Preview** in the header. The preview lists exactly what Apply would change, one line per change, without touching your edit: a title is added, every clip gets a fade.\n\nPress **▶ Apply to edit**. The title lands at the playhead and every clip in the edit fades in. One Ctrl+Z in the editor undoes the whole apply, because it is one step.\n\nIf something is wrong, the error bar at the bottom of the studio explains what and jumps to the offending block. Applying is disabled until errors are fixed.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Switch **Work on** between **Every clip** and **Selected clips** and press Preview each time. The same blocks then work on the whole edit or just what you have selected."
          }
        ]
      },
      {
        "title": "Save, share and reuse",
        "text": "Your blocks save to your account as you work. Back in the Studio, the Tools panel lists them, and pressing ▶ Apply to edit on a saved set runs it against the timeline you have open.\n\n- The 🔗 **Share** button copies a compact `VFT1:` code that anyone can paste into their Tools panel.\n- The **Save as sticker** block turns any clip into a reusable building block that appears in its own palette category.\n- The Code tab shows the same set of blocks as JavaScript, and Export as standalone script downloads a single `.mjs` that runs against the API."
      },
      {
        "title": "Build the same thing with the API",
        "text": "Everything the blocks did is one operations batch. Send this to `POST /api/projects/:id/timeline/ops` with a write key and you get the same result.\n\n`update_clips` without `clipIds` or `track` hits every clip in the edit, which is what the For each clip block did.",
        "code": "{\n  \"ops\": [\n    {\"op\": \"add_text_clip\", \"args\": {\"id\": \"blocks-title\", \"text\": \"Made with blocks\", \"start\": 0, \"duration\": 5, \"x\": 0.5, \"y\": 0.15, \"textSize\": 5, \"textColor\": \"#ffffff\"}},\n    {\"op\": \"update_clips\", \"args\": {\"patch\": {\"fadeIn\": 0.5}}}\n  ]\n}"
      },
      {
        "title": "Where to go next",
        "text": "Small changes go a long way: rewire the value blocks, add a Repeat block around the fade, or build a second set of blocks that styles titles. The same blocks, code and API all describe one edit.",
        "links": [
          {
            "label": "Blocks & scripts",
            "slug": "custom-tools"
          },
          {
            "label": "Motion graphics tutorial",
            "slug": "motion-graphics-tutorial"
          },
          {
            "label": "Animator tutorial",
            "slug": "tutorial-animator"
          },
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Animator",
            "slug": "animator"
          }
        ]
      }
    ],
    "updated": "2026-10-17T18:00:49Z",
    "added": "2026-10-17T17:48:00Z"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "tutorial-animator",
    "group": "Get started",
    "title": "Animator tutorial",
    "description": "Rig a figure in the Animator, pose it, key the poses and bake the result onto your edit.",
    "sections": [
      {
        "title": "What you will make",
        "text": "A waving figure: the ready-made stick figure rigged in the Animator, with one arm keyed to wave twice in under three seconds, eased so it swings naturally. You pose, key and play inside the Animator, then press **Apply to edit** and the whole motion lands on your timeline as ordinary keyframes.\n\nIt takes about ten minutes. Because the result is plain keyframes, the preview, the FFmpeg export and the API all agree with no new renderer.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Open the Studio at `#/editor` in a second tab. You need at least one clip in the project before the Animator has something to rig."
          }
        ]
      },
      {
        "title": "Put something on the timeline",
        "text": "Open the Studio and click **Stick figure** in the Animator, or add a couple of shapes first: an ellipse for a head and two rectangles for arms work well. For this tutorial, open the Animator with the **Animator** button in the top bar and press **Stick figure**. Ten shapes land on the timeline, already rigged."
      },
      {
        "title": "Meet the rig",
        "text": "The Rig list on the left shows every part. Parts can hang off a **parent** and turn about a **joint**. In the stick figure the forearm is parented to the upper arm, the way a Roblox character's arm works: rotate the upper arm and the whole chain follows.\n\nOpen a part's **Joint & parent** row to see where its joint sits. Put the joint at the shoulder of an arm and rotating the arm swings it from there, not from its middle."
      },
      {
        "title": "Pose and key",
        "text": "Drag the playhead to `0.0`. Nothing to key yet — this is the rest pose.\n\nDrag the playhead to `0.3`. Now pose the forearm: drag it on the stage, or type into its **Pose** fields. Set **Turn** to `-60` so the forearm swings out. Each change writes a keyframe at the playhead, and a first key at the start pins the resting value so nothing jumps.\n\nMove the playhead to `1.0` and pose the forearm the other way: **Turn** `40`. A second key appears.\n\nTwo keys are a wave, but a stiff one. Select the second key and set its **Easing** to **ease-in-out**, then drag between keys to check the swing. Add one more pair of keys at `1.7` (`-50`) and `2.4` (`0`) so the arm settles back to rest.",
        "callouts": [
          {
            "kind": "note",
            "text": "Every property keys on its own: position, size, turn and see-through. The summary row on a part shows every key time at once, and the Keyframes panel expands each property onto its own line."
          }
        ]
      },
      {
        "title": "Play it back",
        "text": "Press play in the Animator. The figure waves twice and settles. Scrub the playhead to check individual poses. If a key lands in the wrong place, drag the diamond — it snaps to frames.\n\nUseful keys while you work:",
        "rows": [
          [
            "Key",
            "Action"
          ],
          [
            "K",
            "Key pose: keys every property of the selected part at the playhead"
          ],
          [
            "Ctrl+Z",
            "Undo, one pose or key at a time"
          ]
        ]
      },
      {
        "title": "Apply to edit",
        "text": "Press the green **Apply to edit** button. The Animator closes and the motion is baked onto the clips as ordinary keyframes. Select the forearm in the editor and open **Animate** to see them: position and rotation curves you can trim, retime, or hand-edit like any other keyframes.\n\nNothing is lost by baking. The animation stays with this project in your browser, so you can reopen the Animator and keep posing."
      },
      {
        "title": "Build the same thing with the API",
        "text": "The Animator's result is one `rig_bake` operation. Send this to `POST /api/projects/:id/timeline/ops` with a write key and the same wave lands on the timeline — parts, joints and keyframes included.\n\nThe forearm is parented to the upper arm with a joint above it, and only its rotation is keyed — the same rig you posed by hand.",
        "code": "{\n  \"ops\": [\n    {\"op\": \"add_shape_clip\", \"args\": {\"id\": \"upper-arm\", \"start\": 0, \"duration\": 3, \"x\": 0.44, \"y\": 0.5, \"shape\": {\"type\": \"rectangle\", \"width\": 0.03, \"height\": 0.18, \"fill\": \"#e8edf4\"}}},\n    {\"op\": \"add_shape_clip\", \"args\": {\"id\": \"forearm\", \"start\": 0, \"duration\": 3, \"x\": 0.44, \"y\": 0.62, \"shape\": {\"type\": \"rectangle\", \"width\": 0.028, \"height\": 0.16, \"fill\": \"#e8edf4\"}}},\n    {\"op\": \"rig_bake\", \"args\": {\"start\": 0, \"animation\": {\"name\": \"Wave\", \"length\": 3, \"parts\": [{\"clipId\": \"upper-arm\"}, {\"clipId\": \"forearm\", \"parentId\": \"upper-arm\", \"pivotX\": 0, \"pivotY\": -0.08}], \"tracks\": {\"forearm\": {\"rotation\": [{\"time\": 0, \"value\": 0, \"easing\": \"ease-in-out\"}, {\"time\": 0.3, \"value\": -60, \"easing\": \"ease-in-out\"}, {\"time\": 1.0, \"value\": 40, \"easing\": \"ease-in-out\"}, {\"time\": 1.7, \"value\": -50, \"easing\": \"ease-in-out\"}, {\"time\": 2.4, \"value\": 0}]}}}}}\n  ]\n}"
      },
      {
        "title": "Where to go next",
        "text": "Rig your own clips instead of the figure, parent a hand to a forearm and drag it, or pose a lower third onto a clip. Everything you key bakes to ordinary keyframes you can keep editing.",
        "links": [
          {
            "label": "Animator",
            "slug": "animator"
          },
          {
            "label": "Block coding tutorial",
            "slug": "tutorial-blocks"
          },
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Motion graphics tutorial",
            "slug": "motion-graphics-tutorial"
          },
          {
            "label": "Examples gallery",
            "slug": "examples"
          }
        ]
      }
    ],
    "updated": "2026-10-17T18:00:49Z",
    "added": "2026-10-17T17:48:00Z"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "tutorial-fire-edit",
    "group": "Get started",
    "title": "Fire edit tutorial",
    "description": "Turn one clip into a finished edit: trim to the beat, warm it up, add motion graphics, cut with transitions and export.",
    "sections": [
      {
        "title": "What you will make",
        "text": "A fifteen second edit from a single clip: two trimmed cuts joined with a dissolve, a warm colour look over everything, a headline that springs in, a floating badge and a lower third that arrives late. You upload a clip (a screen recording works just as well as camera footage), cut it in the editor, dress it with motion graphics and export an MP4.\n\nIt takes about twenty minutes. Every layer is a normal clip, so you can retime and restyle anything afterwards.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Follow along in a second tab. Open the Studio at `#/editor` and keep this page next to it. Any clip will do: a screen recording, phone footage or something from a stock library."
          }
        ]
      },
      {
        "title": "Get the clip in",
        "text": "Open the **Media** tab in the left library and drag your clip onto the timeline, or click upload and pick the file. The clip is probed once: its length, size and thumbnail appear straight away, and it plays back with range requests so scrubbing stays smooth.\n\nGive the project a name: click the project name at the top left and type `Fire edit`."
      },
      {
        "title": "Trim to the beat",
        "text": "Watch the clip once and find its two best moments. Trim each end of the clip by dragging its edges in the timeline, or select the clip and set **In** and **Out** in the inspector under Timing.\n\nFor this tutorial, keep the first cut to about eight seconds: set the clip's **Out** to `8`."
      },
      {
        "title": "Make the second cut",
        "text": "Right-click the clip and choose **Duplicate**, or select it and press the duplicate button in the inspector. Drag the copy so it starts where the first cut ends, then trim it to about seven seconds and, if the moment you want is later in the source, set its **In** to a different point so the second cut shows new footage.\n\nTwo cuts of the same source back to back is the fastest way to build rhythm from one clip. With a 0.5 second dissolve joining them, the second cut needs about seven and a half seconds so the video still ends where the overlays do."
      },
      {
        "title": "Warm the whole edit up",
        "text": "Select both clips — shift-click the second one — and open the **Edit** tab in the inspector. Under colour, set the **look** to **Warm**. Fire edits live in warm tones: everything shifts toward amber, and the highlights roll off gently.\n\nIf your footage is dark, raise **Brightness** a little. If it is flat, raise **Contrast** and **Colour strength**."
      },
      {
        "title": "Add the headline",
        "text": "Click **Add title** in the top bar. In the Text box, type `Fire edit`. Set Size to about 10%, pick a bold weight, and set Vertical to 20% so it sits near the top. Under Timing, set Start to `0` and Duration to `15` so it runs the whole edit.\n\nOpen the **Motion** tab, expand Motion presets and click **Spring** with a Duration of 0.9. The headline pops in with a damped bounce and stays put."
      },
      {
        "title": "Add a badge that floats",
        "text": "Open the **Graphics** tab and click **ellipse**. Set Shape width to 7% and height to 12% so it reads as a circle on 16:9, fill it orange `#f6a447`, and set Vertical to 68%, low on the frame.\n\nIn the Motion tab, expand **Animate with code** and under Looping recipe choose **Float**, then click **Apply recipe**. The badge bobs gently for the whole edit — a formula, not keyframes, so it loops at any length."
      },
      {
        "title": "Add the lower third",
        "text": "In the **Graphics** tab, find the lower third template card. Set the title to your name, the subtitle to `Cut · graded · exported`, and the accent colour to the same orange. Set Start to `2` and Duration to `4`.\n\nHover the card to preview its animation, then click **Add to timeline**. It lands at the playhead, already selected — drag it or set its start until it sits where you want."
      },
      {
        "title": "Join the cuts with a dissolve",
        "text": "Open the **Effects** tab and look under **Transitions**. Drag **Dissolve** onto the second clip — the one that follows the first — or select the second clip and choose Dissolve in the inspector. Set its duration to about `0.5`.\n\nThe transition overlaps the two cuts and moves later video up, so the edit stays tight. It plays in the preview and survives the FFmpeg export.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Try the other transitions on the same cut: iris for a punch-in feel, wipe-left for a harder rhythm. One transition per cut is plenty."
          }
        ]
      },
      {
        "title": "Check it, then export",
        "text": "Press Space and watch the whole edit once: headline springs in, badge floats, lower third arrives at two seconds, the two cuts dissolve into each other. Use the arrow keys to step frame by frame over anything you are unsure about.\n\nWhen you are happy, click **Export** in the top bar, choose MP4, and start the render. The render runs server side with FFmpeg; the progress page shows the percentage, and the finished MP4 downloads from the same place."
      },
      {
        "title": "Build the same thing with the API",
        "text": "Everything you did in the editor is operations. This batch assumes the clip is uploaded and its asset id is `clip-1` — replace it with the id from `GET /api/media`. Send the ops to `POST /api/projects/:id/timeline/ops` with a write key, then enqueue a render with `POST /api/renders`.\n\n`update_clips` with `clipIds` warms both cuts at once, exactly like selecting them in the editor. The transition, presets and templates are the same operations the Studio sends.",
        "code": "{\n  \"ops\": [\n    {\"op\": \"add_clip\", \"args\": {\"assetId\": \"clip-1\", \"id\": \"cut-1\", \"start\": 0, \"outPoint\": 8, \"track\": \"video\"}},\n    {\"op\": \"add_clip\", \"args\": {\"assetId\": \"clip-1\", \"id\": \"cut-2\", \"start\": 8, \"inPoint\": 8, \"outPoint\": 15.5, \"track\": \"video\"}},\n    {\"op\": \"update_clips\", \"args\": {\"clipIds\": [\"cut-1\", \"cut-2\"], \"patch\": {\"filter\": \"warm\"}}},\n    {\"op\": \"set_transition\", \"args\": {\"clipId\": \"cut-2\", \"type\": \"dissolve\", \"duration\": 0.5}},\n    {\"op\": \"add_text_clip\", \"args\": {\"id\": \"headline\", \"text\": \"Fire edit\", \"start\": 0, \"duration\": 15, \"x\": 0.5, \"y\": 0.2, \"textSize\": 10, \"fontWeight\": 700, \"textColor\": \"#ffffff\"}},\n    {\"op\": \"apply_motion\", \"args\": {\"clipId\": \"headline\", \"preset\": \"spring\", \"duration\": 0.9}},\n    {\"op\": \"add_shape_clip\", \"args\": {\"id\": \"badge\", \"start\": 0, \"duration\": 15, \"x\": 0.5, \"y\": 0.68, \"shape\": {\"type\": \"ellipse\", \"width\": 0.07, \"height\": 0.124, \"fill\": \"#f6a447\"}}},\n    {\"op\": \"apply_code_motion\", \"args\": {\"clipIds\": [\"badge\"], \"recipe\": \"float\", \"speed\": 1, \"strength\": 1}},\n    {\"op\": \"add_motion_template\", \"args\": {\"template\": \"lower-third\", \"title\": \"Your name\", \"subtitle\": \"Cut · graded · exported\", \"color\": \"#f6a447\", \"start\": 2, \"duration\": 4, \"idPrefix\": \"lt\"}}\n  ]\n}"
      },
      {
        "title": "Where to go next",
        "text": "Try the same structure on your own footage: more cuts, a kinetic type title, or the Animator rigging the badge and headline as one part. The edit is ordinary clips all the way down, so anything can be retimed or restyled.",
        "links": [
          {
            "label": "Motion graphics tutorial",
            "slug": "motion-graphics-tutorial"
          },
          {
            "label": "Transitions",
            "slug": "transitions"
          },
          {
            "label": "Rendering",
            "slug": "rendering"
          },
          {
            "label": "Motion presets",
            "slug": "motion-presets"
          },
          {
            "label": "Animator tutorial",
            "slug": "tutorial-animator"
          }
        ]
      }
    ],
    "updated": "2026-10-17T18:00:49Z",
    "added": "2026-10-17T17:48:00Z"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:29:58+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "cookbook",
    "group": "Examples",
    "title": "Cookbook",
    "description": "Short recipes: one goal, one atomic batch each.",
    "sections": [
      {
        "title": "How to use these recipes",
        "text": "Every recipe is one atomic batch: POST it to `/api/projects/:id/timeline/ops` with `dryRun: true` first, look at the returned timeline, then send it for real. Replace the ids with yours."
      },
      {
        "title": "A lower third in one request",
        "text": "The fastest way to a professional title: one template call places, styles and animates it.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"add_motion_template\", \"args\": { \"template\": \"lower-third\", \"title\": \"Ada Lovelace\", \"subtitle\": \"Pioneer of computing\", \"color\": \"#f6a447\", \"start\": 0, \"duration\": 4 } }\n  ]\n}"
      },
      {
        "title": "Stagger a row of titles",
        "text": "Give a list of clips the same entrance with a delay between them: title bars that cascade in.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"stagger_clips\", \"args\": { \"clipIds\": [\"t1\", \"t2\", \"t3\"], \"delay\": 0.25, \"start\": 1 } }\n  ]\n}"
      },
      {
        "title": "Cut out the dead air",
        "text": "Split at the boring moment, then ripple the rest closed — no gap left behind. The split's response lists the new right-hand clip's id in `createdClipIds`; use it in the second batch.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"ripple_delete\", \"args\": { \"clipId\": \"the new id from createdClipIds\" } }\n  ]\n}"
      },
      {
        "title": "Constant speed and a freeze",
        "text": "A clip's speed is a field like any other: set it once, or ramp it with the Speed steps block in Studio for freeze frames and slow motion.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"update_clip\", \"args\": { \"clipId\": \"b-roll\", \"speed\": 1.5 } }\n  ]\n}"
      },
      {
        "title": "A caption that stays readable",
        "text": "Text wraps and shrinks to fit its box; give it a background and place it once.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"add_text_clip\", \"args\": { \"text\": \"Chapter one: the problem\", \"start\": 0, \"duration\": 6, \"textSize\": 0.06, \"textBg\": \"#101826cc\", \"x\": 0.5, \"y\": 0.9 } }\n  ]\n}"
      },
      {
        "title": "Everything inside the frame",
        "text": "One call refits every clip that crosses the edges — media, text and shapes alike, with a margin.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"fit_all\", \"args\": { \"margin\": 0.03 } }\n  ]\n}"
      },
      {
        "title": "A badge that floats, then keyframes",
        "text": "Drive any property with a formula of time, then bake it into editable keyframes when you are happy.",
        "code": "{\n  \"ops\": [\n    { \"op\": \"animate_code\", \"args\": { \"clipId\": \"badge\", \"expressions\": { \"y\": \"0.15 + 0.01 * sin(t * 2)\" } } },\n    { \"op\": \"bake_expression\", \"args\": { \"clipId\": \"badge\", \"property\": \"y\" } }\n  ]\n}"
      },
      {
        "title": "Check before you render",
        "text": "Two GETs save a render: a frame at the moment you care about, and the full storyboard. Both are read routes — send your key.",
        "language": "SHELL",
        "code": "curl -H \"Authorization: Bearer $KEY\" \"$BASE/api/projects/$ID/frame?t=3&width=640\" -o frame.png\ncurl -H \"Authorization: Bearer $KEY\" \"$BASE/api/projects/$ID/storyboard?count=6\" -o sheet.png",
        "links": [
          {
            "label": "Examples gallery",
            "slug": "examples"
          },
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Motion presets & sequencing",
            "slug": "motion-presets"
          },
          {
            "label": "Animate with code",
            "slug": "animate-with-code"
          }
        ]
      }
    ],
    "updated": "2026-10-17T13:19:57Z",
    "added": "2026-10-17T13:09:37Z"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
        "title": "Blocks and scripts",
        "text": "The **Blocks** tab opens the block studio: snap blocks together, preview what they would change, then press the green **Apply to edit** button to change your timeline in one undoable step. The Tools tab lists saved scripts written in JavaScript. See Blocks & scripts.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Press Preview in the block studio to see exactly what Apply would do before it touches your edit."
          }
        ]
      },
      {
        "title": "Animator",
        "text": "The **Animator** button in the top bar opens a Roblox-style animation editor for clips, text and shapes. Add clips as parts of a rig, parent them, set joints, pose them on a timeline and press Apply to edit. See Animator."
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
        "title": "Work together",
        "text": "Everyone with a key that can read a project sees coloured live cursors on the timeline and preview, plus each other's playheads and selections. Click a person's avatar in the top bar to Follow them, and press Stop to go back to your own view. Shift-click or drag a box to select several clips, then move or edit them together.\n\nMaster admins also get a Live page that lists every project and opens any of them in a view-only mode. It follows the editor's unsaved timeline, playhead, selection and animated values about ten times a second, with an activity feed that also shows API and agent edits. A small badge in the editor tells you when an admin is watching."
      },
      {
        "title": "Add transitions",
        "text": "Open the Effects tab and look under Transitions. Dissolve, five wipes, iris, barn doors and diamond open can be dragged onto a video clip that follows another clip, or chosen in the inspector. Transitions work in the preview and in the FFmpeg export. See Transitions for the full list."
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
            "label": "Motion graphics tutorial",
            "slug": "motion-graphics-tutorial"
          },
          {
            "label": "Transitions",
            "slug": "transitions"
          },
          {
            "label": "Animator",
            "slug": "animator"
          },
          {
            "label": "Blocks & scripts",
            "slug": "custom-tools"
          },
          {
            "label": "Rendering",
            "slug": "rendering"
          }
        ]
      }
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "animator",
    "group": "Studio",
    "title": "Animator",
    "description": "Pose clips, text and shapes like a rig, key them on a timeline and apply the result to your edit.",
    "sections": [
      {
        "title": "What the Animator is",
        "text": "The Animator is a pose-and-keyframe editor in the style of Roblox Studio's Animation Editor, but the puppet parts are your own clips. A video clip, an image, a line of text or a shape can each be a **part**. Parts have a **joint** they turn about, can hang off a **parent**, and carry keyframes for position, size, turn and see-through. Press **Apply to edit** and the result lands on your timeline as ordinary keyframes, so you can still trim, retime and layer the clips with every other tool.\n\nOpen it with the **Animator** button in the top bar of the Studio, or the 🎞 Animator button inside the block studio.",
        "callouts": [
          {
            "kind": "note",
            "text": "Nothing about rendering changes. The Animator bakes into the same keyframes every clip already has, so the preview, the FFmpeg export and the API all agree."
          }
        ]
      },
      {
        "title": "Build a rig",
        "text": "Select the clips you want to animate in the editor, open the Animator and press **Selected clips**. They appear in the Rig list on the left. **On screen** adds every clip that is visible while the animation plays, and **Stick figure** creates a ready-made figure of ten shapes on the timeline and rigs it for you.\n\n- Drag a part onto another to make it a **child**. Drag it into empty space to unparent it.\n- A child moves, turns and scales with its parent, about the parent's joint. Its own keyframes still work on top.\n- Open **Joint & parent** to move the joint. Put the joint at the shoulder of an arm clip and rotating the arm swings it from there.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Parent a hand to a forearm and the forearm to an upper arm. Rotating the upper arm carries the whole chain, the way a Roblox character's arm works."
          }
        ]
      },
      {
        "title": "Pose and key",
        "text": "Move the playhead, then pose a part. You can drag the highlighted object on the stage, or type into the **Pose** fields. Each change writes a keyframe at the playhead. If a property had no keys yet, a first key at the start pins its resting value so nothing jumps.\n\nOpen a part's row in the Keyframes panel to see each property on its own line. The summary row shows every key time at once.",
        "rows": [
          [
            "Control",
            "What it does"
          ],
          [
            "Diamond beside a field",
            "Adds or removes a key for that one property at the playhead"
          ],
          [
            "Key pose (K)",
            "Keys every property of the selected part at the playhead"
          ],
          [
            "Double-click a property row",
            "Adds a key at that time"
          ],
          [
            "Drag a diamond",
            "Moves the key, snapped to a frame"
          ],
          [
            "Easing",
            "Sets how the pose eases into the next key. Choose hold to step"
          ]
        ]
      },
      {
        "title": "Presets",
        "text": "The **Presets** menu writes a ready-made motion onto the selected part, or onto all parts. Values are relative to each part's resting pose, so a preset works wherever the clip sits.",
        "rows": [
          [
            "Preset",
            "Result"
          ],
          [
            "Bounce",
            "Hops up and lands, again and again"
          ],
          [
            "Swing",
            "Rocks left and right about the joint"
          ],
          [
            "Wave",
            "A quick friendly wave"
          ],
          [
            "Pulse",
            "Breathes in and out"
          ],
          [
            "Float",
            "Drifts gently up and down"
          ],
          [
            "Pop in",
            "Springs into view"
          ],
          [
            "Walk cycle",
            "Swings limbs in opposite pairs. Made for the stick figure"
          ]
        ],
        "callouts": [
          {
            "kind": "tip",
            "text": "Apply Walk cycle to all parts of the stick figure, press Space to play, then Apply to edit."
          }
        ]
      },
      {
        "title": "Apply to your edit",
        "text": "**Apply to edit** is the green button. It bakes the active animation into the clips as one undoable step, so Ctrl+Z puts everything back. Keys outside the part of the clip the animation covers are left alone. **Starts at** sets where on the timeline the animation begins, and **At playhead** uses the current playhead.\n\nAnimations are saved in this browser for the project, so they are there when you reopen the Animator. A part whose clip has been deleted shows as missing and must be removed before you can apply.",
        "callouts": [
          {
            "kind": "warning",
            "text": "Applying replaces the position, size, turn and see-through keyframes on the rigged clips, including any you added by hand. Keyframes on other properties are untouched. Use Clear from edit to remove a rig's keyframes from its clips."
          }
        ]
      },
      {
        "title": "Use it from blocks and the API",
        "text": "Saved animations can run from blocks. Add **Play an Animator animation** and type the animation's name. Two more blocks work on clips directly: **Pose clips together** moves several clips to a pose at once, and **Make a clip follow another** lets one clip ride another's motion about a joint.\n\nThe same three actions exist as timeline operations, so agents can drive rigs without the Animator.",
        "rows": [
          [
            "Operation",
            "Purpose"
          ],
          [
            "rig_bake",
            "Bakes an animation with parts, parents, joints and local keyframes into clip keyframes"
          ],
          [
            "rig_pose",
            "Moves several clips to a pose together, from where they are now"
          ],
          [
            "rig_follow",
            "Makes a child clip ride a parent clip's motion"
          ]
        ],
        "code": "{\n  \"op\": \"rig_bake\",\n  \"args\": {\n    \"animation\": {\n      \"name\": \"Wave\",\n      \"length\": 2,\n      \"start\": 0,\n      \"parts\": [\n        { \"clipId\": \"upper-arm\", \"pivotY\": -0.07 },\n        { \"clipId\": \"forearm\", \"parentId\": \"upper-arm\", \"pivotY\": -0.065 }\n      ],\n      \"tracks\": {\n        \"upper-arm\": { \"rotation\": [{ \"time\": 0, \"value\": 0 }, { \"time\": 1, \"value\": 40, \"easing\": \"ease-in-out\" }, { \"time\": 2, \"value\": 0 }] }\n      }\n    }\n  }\n}"
      },
      {
        "title": "Keyboard shortcuts",
        "text": "Shortcuts are ignored while typing in a field.",
        "rows": [
          [
            "Key",
            "Action"
          ],
          [
            "Space",
            "Play / pause the preview"
          ],
          [
            "K",
            "Key the selected part's whole pose"
          ],
          [
            "Left / Right",
            "Step one frame"
          ],
          [
            "Delete",
            "Delete the selected key"
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
            "Escape",
            "Close the Animator"
          ]
        ],
        "links": [
          {
            "label": "Keyframes & easing",
            "slug": "keyframes"
          },
          {
            "label": "Blocks & scripts",
            "slug": "custom-tools"
          }
        ]
      }
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-17T07:51:59Z"
  },
  {
    "slug": "custom-tools",
    "group": "Studio",
    "title": "Blocks & scripts",
    "description": "Build anything for your edit with blocks or code, preview it, then apply it to your timeline in one undoable step.",
    "sections": [
      {
        "title": "What blocks are for",
        "text": "Blocks are a way to tell the editor what to do to your edit. They started as a way to build small custom tools, and they are much more than that now: titles and timing, styling a whole selection, animating clips, rigging characters, building whole sequences. You describe the change by snapping blocks together, then press the green **Apply to edit** button. Everything lands on your timeline as one atomic, undoable step, using the same operations and validation as the API.",
        "callouts": [
          {
            "kind": "note",
            "text": "Click the **Blocks** tab, next to Effects, and the block studio opens straight away. Scripts written in JavaScript live in the Tools tab."
          }
        ]
      },
      {
        "title": "Apply to edit",
        "text": "Every set of blocks begins with the green **When Apply is pressed** block. Press **▶ Apply to edit** in the header, or on a saved set in the Tools panel, and the blocks below it run.\n\n- **Preview** lists exactly what would change, one line per change, without touching your edit. Apply from the preview when it looks right.\n- **Work on** sits on the green block and picks which clips `$selection` means: the selected clips, every clip, the clips under the playhead, all video and image clips, all text clips or all shapes. A set of blocks that fades every title works without selecting anything.\n- If something is wrong the error bar at the bottom explains what and jumps to the block. Applying is disabled until errors are fixed.\n- Ctrl+Z in the editor undoes an apply in one step.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Not sure what a set of blocks does? Press Preview first. It never changes your edit."
          }
        ]
      },
      {
        "title": "Two ways to write them",
        "text": "Every set of blocks has a name, a description, and a program written in one of two modes, both edited in the full-screen block studio.\n\n- **Blocks** is a canvas like Scratch: drag friendly blocks, connect them with lines, and apply them. No code required.\n- **Code** is a short JavaScript function that receives a `vf` helper and returns operations. The studio's Code tab is a plain editor for coders.\n\nDuplicate a built-in example to get started. Your blocks sync to your account and run only against the timeline you have open."
      },
      {
        "title": "The block studio",
        "text": "Open any blocks (or create new ones) and the studio takes over the screen. Blocks live in the palette on the left. The narrow rail of coloured dots picks a **category** — Create, Edit, Animate, Text, Style, Clips, Timing, Values and Flow — and the palette shows that category's blocks. Drag them onto the canvas. Connect a block's bottom dot to the next block's top dot to say \"then do this\": the line snaps in place and that becomes the run order. Everything starts at the green block and follows the lines.\n\nCreating your first blocks with **New blocks** opens a short tutorial: name them, meet the block menu, change the text of the Add title block, press Apply to edit, and find them again in the Blocks panel. The 🎓 Tutorial button in the header replays it any time.\n\nEvery field on a block has a small dot on its left. Clip and frame blocks plug into clip and time fields; **Values** blocks plug into any field. Drag a 📝 Text, 🔢 Number or 🔘 Yes / No block next to a block, type the value, and drag from its dot into the field — the connected value wins over whatever is typed in the field itself. Number blocks that don't hold a number turn red, and an unplugged value block gets a nudge to connect it.\n\n### Editing clips you already have\n\nThe **Edit** group is for everything that changes an existing clip. **Move**, **Set size** and **Rotate** transform a clip; **Flip upside down** and **Mirror** flip it; **Line up** and **Snap to grid** tidy a whole selection — place them in a tidy row or column at fixed frame spots, or spread them evenly across the frame. Colour and mood come from **Colour look**, **Brightness**, **Contrast**, **Colour strength** and **Blur**. Timing and sound: **Change speed**, **Set duration**, **Volume**, **Mute**, **Fade sound in/out**. Layering is real stacking order: **Forwards/Backwards one layer** and **Bring to front / Send to back** change a clip's z (higher draws on top, in both the preview and the render), and **Move to track** moves it between the overlay, video and audio tracks. **Crop** trims a picture or video in from the sides — the layer keeps its box with transparent padding where pixels were cut, so the preview and the export match. **Copy with offset** duplicates a clip and nudges the copy sideways — perfect for shadows and rows — and **Change words** rewrites a text clip while keeping its font, colour and size. Motion blocks also take an **easing** pick (the default, \"preset\", keeps each move's own built-in easing).\n\n### Animating anything\n\n**Animate a property** is the keyframe block: pick a property (position, size, rotation, opacity, colour filters, reveal, volume), a **from** and a **to** value, a duration, a delay and an easing — including bounce and elastic, which the studio converts into keyframe curves for you. Ready-made variants cover the popular moves (slide in, rise up, drop, zoom, spin, fade), and **Draw on** uncovers shapes and videos left to right. Expression blocks like **Pulsing glow** and **Parallax float** animate forever with small formulas of time.\n\n### Text effects\n\nText clips can be revealed over time: **Typewriter** types them on character by character, **Reveal word by word** and **Reveal line by line** show them progressively, and **Colour cycle** steps the colour through a rainbow. All of them preview in the editor and export to video. **Stop text effects** turns them off.\n\nControl blocks (Repeat, For each clip, Function) have a second dot on their right side: connect blocks there to fill their body.",
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
            "Rig",
            "make clips behave like parts of a rig: pose several clips together, make one clip follow another, or play an animation saved in the Animator"
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
        "title": "Rig blocks",
        "text": "The **Rig** group treats any clip, whether video, image, text or shape, like a part of a puppet.",
        "rows": [
          [
            "Block",
            "What it does"
          ],
          [
            "Pose clips together",
            "Moves several clips to a pose at once (position, size, angle, see-through) from where they are now"
          ],
          [
            "Make a clip follow another",
            "The follower rides the leader's motion, turning and resizing with it about a joint, like a hand on an arm"
          ],
          [
            "Play an Animator animation",
            "Applies an animation you saved in the Animator. Type its name"
          ]
        ],
        "callouts": [
          {
            "kind": "tip",
            "text": "Open the Animator from the 🎞 Animator button in the studio header to build the animation, then play it from blocks by name."
          }
        ]
      },
      {
        "title": "Clips and frames",
        "text": "Two special blocks plug your project straight into your blocks.\n\n- **Import clips** lists every clip in the timeline — add one and it becomes a clip block on the canvas.\n- **Add frame** adds a frame block: a frame number that knows the project fps, so it shows the real seconds it stands for.\n\nConnect a clip block's right dot into a block's **clip** field (a purple dot on its left edge) to make that block act on that clip. Connect a frame block into a **time** field and it becomes that many seconds. One connection per field — dragging a new one replaces the old."
      },
      {
        "title": "Errors, live",
        "text": "The studio checks the graph as you edit. Problems turn the block red and collect in the error panel at the bottom of the screen: click a message to jump to the block. A missing green block, a block with two blocks after it, a loop that never ends, a function that calls itself, a clip that no longer exists — all are caught before anything runs. Disconnected blocks only get a warning, and applying with errors is disabled until they are fixed. Failures while applying land in the same panel."
      },
      {
        "title": "Templates",
        "text": "Any string value in a block can hold a template that is resolved when you apply the blocks.\n\nArithmetic works too: `\"$playhead + $index * 0.4\"` staggers each step from the playhead. Fields marked JSON (patches, keyframes, expressions) are parsed into objects, so an update step can carry any clip fields, including the new text style.\n\nFor-each groups can also filter by what a clip looks like or says: pick **colour** and a colour swatch to run blocks for every clip of that colour, or pick **contains** and type a few words to catch every text clip containing them. Audio clips are included too (kind \"audio\"), so a for-each over audio can change volume across a whole soundtrack.\n\nSwitching to the Code tab converts the graph into readable JavaScript that produces the same operations; the `vf` helpers cover everything the blocks can do, including `vf.animateProperty`, `vf.textEffect` and `vf.colorCycle`.",
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
        "text": "Switching to the Code tab converts the graph into readable, commented JavaScript that uses the `vf` helper — chains become sequential calls, Repeat becomes a `for` loop, For-each-clip becomes a filtered `vf.clips` loop, functions become `const name = (index, count, clipId) => …`, and clip/frame connections become arguments. The blocks now run as that code (they are kept, so you can switch back). The conversion is faithful: the generated code produces the same operations the blocks would, resolved at run time against the live playhead and selection. Invalid graphs stay in Blocks with an error instead of converting."
      },
      {
        "title": "Code scripts",
        "text": "A script is the body of a JavaScript function. It receives one argument, `vf`, and returns one operation or an array of them. The Code tab is a real editor: line numbers, tab-key support, and a reference panel listing every `vf` helper — click an example to insert it at the cursor. The `$templates` the blocks use (like `$playhead`) are listed with their code equivalents (`vf.playhead`). When a run fails, the error shows inline above the code with the offending line highlighted in the gutter, as well as in the error console.",
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
        "text": "Scripts run as ordinary JavaScript in your own browser page — there is no sandbox, so only run scripts you wrote or trust. The server still validates every operation a tool produces and rejects anything invalid, atomically. Both blocks and scripts may produce at most 100 operations, matching the batch limit. Because blocks and scripts are just operations, they respect scopes, undo, dry runs and everything else in the operation catalog.",
        "callouts": [
          {
            "kind": "warning",
            "text": "Code scripts run in your own browser page with no sandbox. Only run scripts you wrote or trust."
          }
        ]
      },
      {
        "title": "Where they live",
        "text": "Your library syncs to your account (or API key), so it follows you between browsers — `GET/PUT/DELETE /api/tools/:id` — with the browser's local copy as the offline fallback. Share one with the 🔗 Share button: a compact `VFT1:` code anyone can import. Animations you save in the Animator are stored in this browser for the project. The Code tab's **Export as standalone script** downloads a single `.mjs` that runs the same code against the API — set `VF_API_KEY` and pass a project id (`--dry-run` previews the change summary) — handy for agents and cron jobs. The studio speaks Spanish too: the 🌐 button switches every block label and description (remembered per browser).",
        "links": [
          {
            "label": "Animator",
            "slug": "animator"
          },
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:35:29+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
            "rig_bake",
            "animation: {name?, length, start?, parts: [{clipId, parentId?, pivotX?, pivotY?}], tracks: {clipId: {x|y|scale|rotation|opacity: [{time,value,easing?}]}}}, start? - bakes an Animator animation (joints and parent/child parts) into ordinary clip keyframes"
          ],
          [
            "rig_pose",
            "clipIds[], any of x, y, scale, rotation, opacity, delay? (0..60), duration? (default 0.8), easing? - moves several clips to a pose together from where they are now"
          ],
          [
            "rig_follow",
            "childId, parentId, pivotX?, pivotY? (joint offset from the parent's centre, fraction of the frame) - the child rides the parent's motion, turning and scaling about the joint"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
        "text": "The repository's docs/API.md retains the expanded endpoint contracts, key restrictions, security notes and deployment guidance. The motion graphics additions are also documented there.\n\nAn [OpenAPI description generated from this endpoint list and the operation catalog](https://homekidchud.github.io/videoforge/openapi.json) is served alongside the docs; operation arguments are documented as prose in each operation's description, exactly as `GET /api/capabilities` reports them.",
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
    ],
    "updated": "2026-10-17T13:09:37Z",
    "added": "2026-10-15T22:20:52+01:00"
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
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
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
        "text": "Use HTTPS, secure the owner key, restrict agent keys and configure your frontend origin. Do not expose data directories directly. Keep dependency security updates current. See docs/API.md in the repository for the detailed security and deployment notes.",
        "links": [
          {
            "label": "Storage & durability",
            "slug": "storage-and-durability"
          },
          {
            "label": "Contribute",
            "slug": "contribute"
          }
        ]
      }
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-15T22:20:52+01:00"
  },
  {
    "slug": "storage-and-durability",
    "group": "Resources",
    "title": "Storage & durability",
    "description": "Where VideoForge keeps your data, how it is backed up, and how it behaves when a disk is missing.",
    "sections": [
      {
        "title": "Where your data lives",
        "text": "Projects, media records, render jobs, accounts and API key hashes live in one SQLite database. Uploads are files in `data/media`, finished exports are files in `data/renders`, and temporary render files use `data/tmp`. Keys are stored as SHA-256 hashes, never as plaintext.",
        "rows": [
          [
            "Variable",
            "What it sets",
            "Default"
          ],
          [
            "`VIDEOFORGE_DB`",
            "The SQLite database file",
            "`data.db`"
          ],
          [
            "`VIDEOFORGE_MEDIA_DIR`",
            "Uploaded media",
            "`data/media`"
          ],
          [
            "`VIDEOFORGE_RENDER_DIR`",
            "Rendered MP4 files",
            "`data/renders`"
          ],
          [
            "`VIDEOFORGE_SYNC_DIR`",
            "Save manifest backup (optional)",
            "off"
          ],
          [
            "`VIDEOFORGE_MAX_UPLOAD_MB`",
            "Largest single upload",
            "`2048`"
          ]
        ],
        "callouts": [
          {
            "kind": "warning",
            "text": "On a host with a temporary disk, such as a free Render instance, media and the database reset on every restart. Mount a persistent disk and point the variables above inside it."
          }
        ]
      },
      {
        "title": "Three layers of saving",
        "text": "The database is the source of truth. Two more layers exist so a mistake or an outage does not cost you work.\n\n- **Database:** every project, asset and render job is written here as you work.\n- **Save manifest:** when `VIDEOFORGE_SYNC_DIR` is set, the server writes a JSON backup of every row, with key hashes only. It is a point-in-time backup and is deliberately not merged back on boot, because an old manifest could bring back a project you deleted or a key you revoked.\n- **Browser drafts:** the Studio keeps a snapshot of the working copy in the browser every 300 ms, including the unsaved timeline, selection, playhead and zoom. After a closed tab, a refresh or a network drop, the draft is restored and saved on the next autosave.\n\nOpen Tools and choose Local drafts to see every draft on the device, delete one or clear them all."
      },
      {
        "title": "Restore after a lost database",
        "text": "If a rebuild loses the database, restore by hand with the explicit command. It merges only rows that are missing from the live database and never overwrites a row that already exists.",
        "language": "SHELL",
        "code": "npm run durable:restore"
      },
      {
        "title": "Example for a persistent disk",
        "text": "Point every path inside the mounted disk. On Render, with a disk mounted at `/var/lib/videoforge/data`, use:",
        "language": "SHELL",
        "code": "VIDEOFORGE_DB=/var/lib/videoforge/data/data.db\nVIDEOFORGE_SYNC_DIR=/var/lib/videoforge/data/restore\nVIDEOFORGE_MEDIA_DIR=/var/lib/videoforge/data/media\nVIDEOFORGE_RENDER_DIR=/var/lib/videoforge/data/renders"
      },
      {
        "title": "When a path cannot be written",
        "text": "Durable directories are created at boot with graceful fallback, so a missing or misplaced disk never crashes the server with a permission error. It starts and degrades in a clear, visible way.\n\nWrites are refused instead of accepted into a database that would be lost on the next deploy. Fix `VIDEOFORGE_DB` and redeploy to return to normal. The manifest never mirrors a degraded database, and a bootstrap owner key is discarded, with guidance to set `VIDEOFORGE_BOOTSTRAP_KEY`, rather than printed into deployment logs.",
        "rows": [
          [
            "Part",
            "What happens"
          ],
          [
            "Save manifest",
            "Turns itself off with a warning. The database and everything else keep working."
          ],
          [
            "Database",
            "The server runs on an in-memory database. `GET /api/health` returns `ok: false` with a `warnings` list, and every write to `/api` is refused with a `503` that names the fix."
          ],
          [
            "Media, renders and temp files",
            "Uploads and renders that need the unwritable folder fail with a clear message. Reads and everything else keep working."
          ]
        ]
      },
      {
        "title": "MongoDB integration (optional)",
        "text": "MongoDB is an optional store for integrations. It does not replace SQLite, and enabling it does not move projects, media or API keys out of the database.\n\n- **No `MONGODB_URI`:** nothing connects and the app is unchanged.\n- **`MONGODB_URI` set:** the connection is created on first use, with a 5 second server selection timeout and a 10 second socket timeout, so a dead cluster cannot hang the server.\n- **Health:** `GET /api/health` only reports `mongo: \"configured\"`. It never contacts the cluster, so an unreachable integration cannot make the app look down.\n- **Checking it:** run `npm run mongo:check`. It exits 0 when MongoDB is reachable or not configured, and 1 on an error, so it works in deploy hooks.\n- **Safety:** a failed connection never falls back to another store and never crashes the process. Errors never include credentials or driver messages.\n\nServer code can import `getMongoDb` from `./mongo` to use the handle. The pool closes on SIGTERM and SIGINT. All variables are listed in `.env.example`.",
        "language": "SHELL",
        "code": "MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/?retryWrites=true\nMONGODB_DB=videoforge",
        "links": [
          {
            "label": "Self-hosting",
            "slug": "self-hosting"
          },
          {
            "label": "Authentication & scopes",
            "slug": "authentication"
          }
        ]
      }
    ],
    "updated": "2026-10-17T08:48:53Z",
    "added": "2026-10-17T08:48:53Z"
  },
  {
    "slug": "contribute",
    "group": "Resources",
    "title": "Contribute",
    "description": "Set up the project, find your way around the code, and open a pull request that gets merged.",
    "sections": [
      {
        "title": "Ways to help",
        "text": "There are two kinds of contributor, and the rules are strict so that pull requests are small, true and easy to review.\n\n- **Community contributors may only change the docs.** Your pull request must touch nothing outside the `docs/` folder, and it needs a description that says which page, what was wrong and how you checked it. Anything else fails the contribution rules check and is closed by a maintainer. See `CONTRIBUTING.md` in the repository root for the full policy.\n- **Bugs and ideas:** open an issue with what you did, what you expected and what happened. Add the browser and the project JSON if you can. Do not fix code yourself; a maintainer will pick it up.\n- **Maintainers** (the repository owner) may change anything — code, presets, templates and blocks — using the recipes further down this page.",
        "callouts": [
          {
            "kind": "warning",
            "text": "Nonsense is rejected. A docs change must describe something you actually tried in a running Studio, written in your own words. AI-pasted filler, drive-by refactors, dependency bumps and mass rewrites of pages are closed without review."
          }
        ]
      },
      {
        "title": "Set up your machine",
        "text": "Fork the repository on GitHub, clone your fork, and install. You need Node 20 or newer, plus `ffmpeg` and `ffprobe` on your PATH, because rendering, thumbnails and several tests use them.\n\nThe app opens at `http://localhost:5000`. On first boot the server prints an owner key and writes it to `data/OWNER_KEY.txt`. Use it on the sign-in page to create your account.",
        "language": "SHELL",
        "code": "git clone https://github.com/<you>/videoforge.git\ncd videoforge\nnpm ci\nnpm run dev",
        "callouts": [
          {
            "kind": "tip",
            "text": "Point `VIDEOFORGE_DB` at a scratch file, for example `VIDEOFORGE_DB=/tmp/vf.db npm run dev`, so experiments never touch a database you care about."
          }
        ]
      },
      {
        "title": "Find your way around",
        "text": "The browser and the server share the same editing code, so the preview and the export agree. When you change how something animates or evaluates, you usually change `shared/`.",
        "rows": [
          [
            "Folder",
            "What lives there"
          ],
          [
            "`client/src/pages`",
            "One file per screen: editor, docs, platform, live, share"
          ],
          [
            "`client/src/components`",
            "Studio panels such as the timeline, inspector, preview, Animator and block studio"
          ],
          [
            "`client/src/lib`",
            "Client helpers, docs search and the generated docs content"
          ],
          [
            "`server`",
            "Express routes, accounts and keys, rendering with FFmpeg, storage"
          ],
          [
            "`shared`",
            "Timeline schema, editing operations, presets, templates, expressions, rigs, blocks"
          ],
          [
            "`docs`",
            "Every docs page, as markdown"
          ],
          [
            "`test`",
            "Specs, run with `tsx`"
          ],
          [
            "`script`",
            "Docs generator, example renderer, restore and check tools"
          ]
        ]
      },
      {
        "title": "Make a change",
        "text": "Work on a branch, keep each change focused, and run the checks before you push.\n\nOpen a pull request against `main`. Describe what changed and why, and mention how you tested it. Pushes to `main` run `npm run check` and `npm run build` again before the site deploys.",
        "language": "SHELL",
        "code": "git switch -c fix-lower-third-spacing\n# make your change\nnpm run check   # regenerates the docs and runs the type checker\nnpm test        # the whole suite\nnpm run build   # confirms the client and server still bundle",
        "callouts": [
          {
            "kind": "note",
            "text": "`client/src/lib/docs-generated.ts` is generated from `docs/*.md` and is committed on purpose. Community pull requests never touch it: a maintainer runs `npm run docs` and commits the result when your docs change is merged."
          }
        ]
      },
      {
        "title": "Run the tests",
        "text": "Each spec is a plain script, so you can run one on its own while you work. Add or update a test with every behaviour change.\n\nThe rest of the suite covers durability, deployment, text fitting and block translations. `npm test` runs all of it.",
        "rows": [
          [
            "Command",
            "What it covers"
          ],
          [
            "`npx tsx test/graphics.spec.ts`",
            "Shapes, templates, every motion preset, sequencing and real FFmpeg output"
          ],
          [
            "`npx tsx test/api.spec.ts`",
            "Keys, restrictions, uploads, batches, discovery and validation"
          ],
          [
            "`npx tsx test/rig.spec.ts`",
            "The Animator rig engine"
          ],
          [
            "`npx tsx test/custom-tools.spec.ts`",
            "Blocks and scripts"
          ],
          [
            "`npx tsx test/docs.spec.ts`",
            "Docs source, links and generated output"
          ],
          [
            "`npx tsx test/docs-search.spec.ts`",
            "Docs search ranking"
          ],
          [
            "`npx tsx test/accounts.spec.ts`",
            "Sign-in, sessions and accounts"
          ]
        ]
      },
      {
        "title": "Recipe: add a motion preset",
        "text": "Presets are timed, strength-scaled keyframes. Add the entry to the `MOTION_PRESETS` list in `shared/presets.ts` with an `id`, `label` and `description`, then add a matching case to `motionPreset` in the same file. Entrance, emphasis and exit groups are decided by which list the id belongs to.\n\nThe Studio buttons, the API discovery list and the docs table all read from `MOTION_PRESETS`, so nothing else needs editing. Add the preset to `test/graphics.spec.ts`, which already checks every preset."
      },
      {
        "title": "Recipe: add a template or an operation",
        "text": "A template is a list of clips. Add it to `MOTION_TEMPLATES` in `shared/graphics.ts` and build its clips in the same file, then check it renders in `test/graphics.spec.ts`.\n\nAn operation is one case in `applyTimelineOp` in `shared/editing.ts`. Describe it in `shared/capabilities.ts` so agents can discover it, and add its arguments to `OP_PARAMS` in `shared/custom-tools.ts` if it should be usable from blocks. The operations table in the docs fills itself from this description."
      },
      {
        "title": "Recipe: add a block",
        "text": "Blocks live in `BLOCK_LIBRARY` in `shared/custom-tools.ts`. Give each block a plain name, a one line description and the fields it exposes, and put it in one of the groups in `BLOCK_GROUPS`. Add its Spanish text in `shared/block-i18n.ts`; `test/block-i18n.spec.ts` fails if a visible block is not translated."
      },
      {
        "title": "Write docs that read well",
        "text": "Say what a thing does, then show how. Keep sentences short, name the exact button or field, and use callouts for the few things that matter: a note for context, a tip for a shortcut, a warning for something that can lose work. The full page format is in `docs/README.md`.\n\nTables that list operations, presets, templates or endpoints are generated from the code with `{{auto:...}}` markers, so they cannot drift. Use a marker instead of copying a list by hand."
      },
      {
        "title": "Open the pull request",
        "text": "A good pull request is small, tested and explained. Before you open it, check that:\n\n- `npm run check`, `npm test` and `npm run build` all pass\n- new behaviour has a test, and new options appear in the docs\n- you did not commit `data/`, `data.db`, `.env` or `data/OWNER_KEY.txt`\n- the title says what changed, in the same style as recent commits such as `Docs: ...` or `Blocks: ...`\n\nBy contributing you agree that your work is released under the MIT license that covers the project."
      },
      {
        "title": "Report a security problem",
        "text": "Please do not post security problems in a public issue. Use private vulnerability reporting under the Security tab of the repository if it is switched on, or open an issue that only asks for a private way to reach the maintainer, with no details of the problem. Keys, session cookies and anything in `data/` are private, so never paste them into an issue or a pull request.\n\n- [Roadmap and TODO](TODO)",
        "links": [
          {
            "label": "Introduction",
            "slug": "introduction"
          },
          {
            "label": "Self-hosting",
            "slug": "self-hosting"
          },
          {
            "label": "Storage & durability",
            "slug": "storage-and-durability"
          }
        ]
      }
    ],
    "updated": "2026-10-17T18:00:49Z",
    "added": "2026-10-17T08:48:53Z"
  },
  {
    "slug": "troubleshooting",
    "group": "Resources",
    "title": "Troubleshooting",
    "description": "Fixes for the errors people actually hit: uploads, renders, keys and self-hosting.",
    "sections": [
      {
        "title": "Setup and first boot",
        "text": "The server needs Node 20 or newer, plus `ffmpeg` and `ffprobe` on PATH. If either binary is missing, uploads fail with a probe error and renders never start.\n\nThe first boot prints an owner key and writes it to `data/OWNER_KEY.txt`. The first account must be created with it; after that, delete the file and keep the key in a password manager. If the file is gone and no account exists, set `VIDEOFORGE_BOOTSTRAP_KEY` and restart to print a fresh one.",
        "callouts": [
          {
            "kind": "note",
            "text": "`ffmpeg -version` and `ffprobe -version` should both print a version. On Ubuntu, `apt install ffmpeg` installs both. On macOS, `brew install ffmpeg`."
          }
        ]
      },
      {
        "title": "Uploads and media",
        "text": "**Upload fails with \"probe\" or \"unsupported\".** Every file is probed once on upload. Video and audio need a codec FFmpeg can decode: MP4/H.264, MOV, WebM and MP3/WAV/AAC/M4A are the safe choices. A zero-byte or partially uploaded file also fails here — check the file plays locally first.\n\n**The thumbnail or waveform never appears.** Thumbnails are made straight after upload; if the file is still uploading elsewhere or the disk is full, they are skipped. Re-upload the file once the underlying problem is fixed.\n\n**Media plays in the browser but not in the export.** The browser plays many codecs FFmpeg's default build cannot decode. Re-encode the source with `ffmpeg -i input -c:v libx264 -c:a aac output.mp4` and swap the asset."
      },
      {
        "title": "Renders",
        "text": "**A render stays queued.** Renders run one at a time by default and need disk space in `data/renders`. Check the server logs for the FFmpeg error line; the most common causes are a full disk, a missing binary and a clip whose asset was deleted.\n\n**The render looks different from the preview.** Report it with the project ID — preview and export share the same engine, so a mismatch is a bug, not a tuning knob. Before reporting, check the project still validates with `POST /api/projects/:id/timeline/validate`.\n\n**Renders are slow.** Render time scales with clip count, effects and resolution. Render at 720p while composing, and switch the project resolution up for the final pass. `GET /api/renders/:id` reports progress so you can poll instead of guessing."
      },
      {
        "title": "Keys and sign-in",
        "text": "**401 from the hosted deployment.** Keys are issued per deployment: a key from your local server never works on the hosted one, and the reverse. Create a key on the deployment you are calling.\n\n**403 with a scope error.** The key's scope is too small: read keys cannot upload or edit, write keys cannot manage other keys. The error names the missing scope; recreate the key with it or use an admin key.\n\n**Sessions signed out after a restart.** Sessions live in SQLite, so restarts keep them. If everyone is signed out, the SQLite file changed or was restored from a different backup — sign in again.\n\n**First account: \"owner key required\".** That is by design. Use the key from `data/OWNER_KEY.txt` (or `VIDEOFORGE_BOOTSTRAP_KEY`) for the first account only."
      },
      {
        "title": "API and agents",
        "text": "**409 on a timeline edit.** The batch carried `expectedUpdatedAt` and another edit landed first — the write is refused so nothing is clobbered. GET the project, read the fresh `updatedAt`, and send it with the next batch — the atomic batches page explains the pattern.\n\n**An operation name is rejected.** Operation names come from `GET /api/capabilities`; never invent one. The validation error names the closest known operation if there is a typo.\n\n**dryRun says OK but the real batch fails.** dryRun validates the timeline shape; it cannot catch a missing asset or a key restriction such as `allowUpload: false`. Run the real batch and read the error body."
      },
      {
        "title": "Self-hosting",
        "text": "**The frontend cannot reach the API.** If the frontend is hosted separately, `VITE_API_BASE` must be set at build time to the API origin, and `CORS_ORIGIN` on the backend must allow the frontend origin. The frontend alone cannot render video — FFmpeg must stay with the API.\n\n**Data directories.** `data/` (SQLite), `data/media` (uploads) and `data/renders` (exports) hold everything. Back them up together, restore them together, and never serve them statically. The Storage & durability page covers backups and the optional MongoDB store.",
        "links": [
          {
            "label": "Storage & durability",
            "slug": "storage-and-durability"
          },
          {
            "label": "Authentication & scopes",
            "slug": "authentication"
          },
          {
            "label": "Rendering & inspection",
            "slug": "rendering"
          },
          {
            "label": "Self-hosting",
            "slug": "self-hosting"
          }
        ]
      }
    ],
    "updated": "2026-10-17T13:19:57Z",
    "added": "2026-10-17T13:09:37Z"
  },
  {
    "slug": "faq",
    "group": "Resources",
    "title": "FAQ",
    "description": "Short answers to the questions that come up most.",
    "sections": [
      {
        "title": "General",
        "text": "**Is my footage uploaded anywhere?** No. Your self-hosted server stores uploads in `data/media` on your own disk. The hosted deployment is for trying the API; self-host to control the data.\n\n**Can I use it without an account?** Yes. The Studio, docs and share pages never require a sign-in. An account is only needed to keep projects and keys; the first account requires the owner key from first boot.\n\n**What formats can I import?** Anything FFmpeg can decode: MP4, MOV, WebM for video, MP3, WAV, AAC, M4A for audio, plus images. If the browser can play it but the export cannot, re-encode to H.264 + AAC.\n\n**What do I need to run it?** Node 20 or newer and `ffmpeg`/`ffprobe` on PATH. That is the whole list; SQLite is bundled, no other database is required."
      },
      {
        "title": "Studio",
        "text": "**Where does my project go?** Autosave writes it to the server as you work; the timeline is the single source of truth for Studio, API and renders alike.\n\n**What is the difference between the three tracks?** Video is full-frame footage and images, overlay is picture-in-picture clips, titles and shapes stacked by z-order, audio is music and voice-over.\n\n**Can I undo everything?** Yes — undo and redo cover drops, deletes, pastes, drags and quick typing, in Studio and in the block studio.\n\n**How do I export?** Export renders an MP4 with FFmpeg server-side. Queue it from Export, watch progress, then download the finished file."
      },
      {
        "title": "Motion graphics",
        "text": "**What is a motion preset?** A ready-made entrance, exit, attention or camera move applied to a clip — animate one thing or stagger many.\n\n**What are keyframes and formulas?** Keyframes set a property at moments in time with easing between them; formulas (expressions) drive a property with code of time. Both preview live and both render in FFmpeg.\n\n**What does the Animator do?** It poses clips together as a rig and bakes the result into ordinary keyframes — so preview and export need nothing new."
      },
      {
        "title": "API and agents",
        "text": "**How do agents authenticate?** With scoped API keys: `Authorization: Bearer <key>`. Scopes are read, write or admin, with per-key restrictions for expiry, projects, rate, uploads, rendering and deletion.\n\n**How do I make several edits safely?** Send them as one atomic batch to `/api/projects/:id/timeline/ops` with `dryRun: true` first, then for real with `expectedUpdatedAt` so a stale write fails with 409 instead of clobbering.\n\n**Can I see what I built before rendering?** Yes: `GET /frame?t=1.5` returns a composed PNG, `GET /state?t=1.5` returns the animated values, and `GET /storyboard` returns a contact sheet.\n\n**Is there an OpenAPI file?** Yes — an OpenAPI description generated from the operation list is served at [the OpenAPI description](https://homekidchud.github.io/videoforge/openapi.json) and linked from the HTTP API reference."
      },
      {
        "title": "Self-hosting",
        "text": "**Can I host the frontend separately from the API?** Yes. Build the frontend with `VITE_API_BASE`, set `CORS_ORIGIN` on the backend, and keep FFmpeg with the API — the frontend cannot render video on its own.\n\n**How do I back up?** Back up the `data` directory (SQLite, `data/media`, `data/renders`) together. The Storage & durability page covers the backup recipes and the optional MongoDB store.",
        "links": [
          {
            "label": "Troubleshooting",
            "slug": "troubleshooting"
          },
          {
            "label": "Authentication & scopes",
            "slug": "authentication"
          },
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Self-hosting",
            "slug": "self-hosting"
          }
        ]
      }
    ],
    "updated": "2026-10-17T13:19:57Z",
    "added": "2026-10-17T13:09:37Z"
  },
  {
    "slug": "glossary",
    "group": "Resources",
    "title": "Glossary",
    "description": "The words this documentation uses, each with a one-line meaning.",
    "sections": [
      {
        "title": "How to use it",
        "text": "Hover a dotted-underlined word anywhere in the docs to see its meaning; this page collects them all."
      },
      {
        "title": "Timeline",
        "text": "The words of the edit itself.",
        "rows": [
          [
            "Term",
            "Meaning"
          ],
          [
            "timeline",
            "The whole edit: clips, their order and their animated properties. Studio, the API and the renderer all read the same one."
          ],
          [
            "clip",
            "One building block of the timeline: media, text or a shape, with its own timing, transform and effects."
          ],
          [
            "track",
            "A layer of the timeline: video, overlay or audio. Clips sit on tracks and stack by z-order."
          ],
          [
            "z-order",
            "The stacking rank of a clip, from -100 to 100. Overlays draw in one order in preview and export alike."
          ],
          [
            "keyframe",
            "A value for a property at one moment in time. The engine eases from one keyframe to the next."
          ],
          [
            "easing",
            "The curve a property follows between two keyframes: linear, springy, bouncy and more."
          ],
          [
            "expression",
            "A formula of time that drives a property live in the preview and compiles to FFmpeg."
          ],
          [
            "preset",
            "A ready-made entrance, exit, attention or camera move applied to a clip."
          ],
          [
            "template",
            "A composed motion-graphics block such as a lower third or title card, added with one operation."
          ],
          [
            "scope",
            "What a key may do: read, write or admin. API keys are scoped; accounts have roles."
          ],
          [
            "rig",
            "A poseable group of clips in the Animator: each part has a joint, an optional parent and its own keys."
          ],
          [
            "dope sheet",
            "The Animator's key list: one row per part, one column per moment in time."
          ],
          [
            "block",
            "A drag-and-drop node in the block studio that builds timeline operations without code."
          ],
          [
            "render",
            "The FFmpeg pass that turns a timeline into an MP4 server-side."
          ],
          [
            "storyboard",
            "A PNG contact sheet of evenly spaced frames, one request for the whole edit."
          ]
        ],
        "links": [
          {
            "label": "Keyframes",
            "slug": "keyframes"
          },
          {
            "label": "Shapes",
            "slug": "shapes"
          },
          {
            "label": "Batch operations",
            "slug": "batch-operations"
          },
          {
            "label": "Animator",
            "slug": "animator"
          }
        ]
      }
    ],
    "updated": "2026-10-17T13:09:37Z",
    "added": "2026-10-17T13:09:37Z"
  },
  {
    "slug": "status",
    "group": "Resources",
    "title": "Live status",
    "description": "Whether the hosted deployment is up right now, checked from your browser.",
    "sections": [
      {
        "title": "What you are looking at",
        "text": "The hosted API server is [videoforge-api-s54w.onrender.com](https://videoforge-api-s54w.onrender.com). It is the deployment the introduction, quickstart and self-hosting pages point to, and it sleeps when idle: free hosting pauses inactive servers, so the first request after a pause can take a few seconds to wake it.\n\nIf the check cannot reach it from your browser, that is not proof it is down: the deployment may be asleep, or your browser or network may block the cross-origin request. The self-hosting guide is the reliable answer.",
        "callouts": [
          {
            "kind": "tip",
            "text": "Self-hosting is the supported way to use VideoForge: your uploads stay on your disk, renders use your FFmpeg, and nothing sleeps."
          }
        ],
        "links": [
          {
            "label": "Self-hosting",
            "slug": "self-hosting"
          },
          {
            "label": "Troubleshooting",
            "slug": "troubleshooting"
          },
          {
            "label": "Quickstart",
            "slug": "quickstart"
          }
        ]
      }
    ],
    "updated": "2026-10-17T13:19:57Z",
    "added": "2026-10-17T13:09:37Z"
  },
  {
    "slug": "TODO",
    "group": "Studio",
    "title": "Bucket list",
    "description": "Progress on the block studio, the Animator, the docs and the editor, with what is in progress and what comes next.",
    "sections": [
      {
        "title": "Where we are",
        "text": "{{progress-overall}}\n\nNothing is in progress right now. When a task starts it is marked here with an In progress label, and items first in line carry an Up next label. Every open item has a priority of High, Medium or Low, and each item ships with its own tests and a commit to main, so this page always matches the repo.\n\nEvery count, bar and percentage on this page is calculated from the checkboxes below at build time, so none of it is typed by hand. Use the filters to show everything, only the open items, the work in progress or what is done, and narrow the list by priority or area."
      },
      {
        "title": "Progress by area",
        "text": "Each bar counts finished items in that area, worked out from this page's own sections.\n\n{{progress-table}}"
      },
      {
        "title": "Next: tutorial videos",
        "text": "Tutorials become motion graphics and real video: recordings of VideoForge being used, placed next to the steps they show.",
        "tasks": [
          {
            "status": "done",
            "text": "Written motion graphics tutorial with a matching API batch."
          },
          {
            "status": "done",
            "text": "Record a screen capture of the whole motion graphics tutorial, one short clip per section, with the Studio shown at a readable size."
          },
          {
            "status": "done",
            "text": "Play each clip inside the docs page next to the step it shows: a video block with a poster image, captions and play, pause and replay."
          },
          {
            "status": "todo",
            "text": "Chapters on every tutorial video that link to the page section, and a section link that jumps the video to the right second.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Loop recordings for every motion preset, template and shape, shown beside its entry in the docs.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Recorded walkthroughs of the Studio tour, the Animator, the block studio and the agent API workflow.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "Make the recordings with a script (Playwright plus FFmpeg) so they can be rebuilt in one command whenever the interface changes: `npm run videos` records the Studio and rebuilds every clip, cutting and captioning each one through VideoForge's own API and renderer."
          },
          {
            "status": "todo",
            "text": "More recorded tutorials: a YouTube lower third, kinetic type, a product promo, captions on a talking-head clip, and driving an edit from an agent.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "More written tutorials: the Animator, block coding and a fire edit built from one clip, each with a matching API batch the docs tests apply for real."
          },
          {
            "status": "todo",
            "text": "Transcripts for every video, so each tutorial also works as text and in search.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "A short intro film for the docs home page and a recorded changelog for each release.",
            "priority": "Low"
          },
          {
            "status": "todo",
            "text": "Host videos outside git (a release asset or storage bucket) so the repository stays small.",
            "priority": "Low"
          }
        ],
        "taskStats": {
          "done": 5,
          "doing": 0,
          "todo": 7
        }
      },
      {
        "title": "Next: editor UI revamp",
        "text": "The editor has grown crowded. The goal is a calmer layout where the common controls are obvious and the rest is one step away.",
        "tasks": [
          {
            "status": "todo",
            "text": "**Up next.** Audit every panel and the top bar, listing what is used daily, what is rare and what can move into a menu.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Calmer top bar: keep Edit and Animate, Add title, Project and Export in view and move the rest into a single More menu.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Workspace presets (Edit, Animate, Graphics, Audio, Blocks) that show only the panels each job needs, and remember the last one.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "A command palette on Ctrl+K for every Studio action, with recent commands and shortcuts shown beside each.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Inspector with progressive disclosure: the common controls first, advanced groups folded, and a search box inside the inspector.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Icon dock for the left panels (Media, Effects, Blocks, Graphics, Tools, Projects) with tooltips, instead of a block of text tabs.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Simple and Advanced modes, so a first-time user sees a small set of tools and can switch the rest on.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "One spacing, type and colour scale shared by the Studio, Animator and block studio, built from the same design tokens.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Timeline polish: tidier track headers, collapsible tracks, a minimap for long projects and clearer selection.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Keyboard shortcut sheet on the ? key, and an editor tour for first-time users.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Better empty states for media, graphics and the timeline, each with one clear next action.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "A mobile editor layout built around one panel at a time.",
            "priority": "Low"
          },
          {
            "status": "todo",
            "text": "A light theme for the Studio.",
            "priority": "Low"
          },
          {
            "status": "todo",
            "text": "Screenshot checks at three window sizes in CI, so the layout cannot drift back into clutter.",
            "priority": "Low"
          }
        ],
        "taskStats": {
          "done": 0,
          "doing": 0,
          "todo": 14
        }
      },
      {
        "title": "Next: docs reading and navigation",
        "text": "Small features that make the docs faster to read and easier to trust.",
        "tasks": [
          {
            "status": "done",
            "text": "Previous and next links at the bottom of every page, in reading order."
          },
          {
            "status": "done",
            "text": "Copy button and syntax highlighting on every code block."
          },
          {
            "status": "todo",
            "text": "Language tabs on API examples: curl, JavaScript and Python side by side.",
            "priority": "High"
          },
          {
            "status": "done",
            "text": "Is this page helpful? buttons on every page."
          },
          {
            "status": "done",
            "text": "Last updated date on every page, taken from git."
          },
          {
            "status": "done",
            "text": "Roles on the docs home page: cards for Studio user, agent builder and contributor, each with a short path."
          },
          {
            "status": "done",
            "text": "Troubleshooting and FAQ pages, plus a cookbook of short recipes."
          },
          {
            "status": "done",
            "text": "A glossary with hover definitions for words like clip, track, keyframe, scope and rig."
          },
          {
            "status": "todo",
            "text": "Keyboard shortcuts page generated from the Studio's own shortcut list.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "New and Updated badges on pages and sidebar entries."
          },
          {
            "status": "todo",
            "text": "Click-to-zoom images, a print stylesheet and an offline copy of the docs.",
            "priority": "Low"
          },
          {
            "status": "todo",
            "text": "Docs search: remember filters, show a preview of the section on hover and add a / hint on every page.",
            "priority": "Low"
          }
        ],
        "taskStats": {
          "done": 8,
          "doing": 0,
          "todo": 4
        }
      },
      {
        "title": "Next: docs live and generated",
        "text": "Pages that run, update themselves and can be read by agents.",
        "tasks": [
          {
            "status": "todo",
            "text": "Try it panel on each endpoint: paste a key, send a real request and see the response.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Interactive examples that embed the real preview, so a page shows a preset or template playing live.",
            "priority": "High"
          },
          {
            "status": "done",
            "text": "An OpenAPI file generated from the operation list, linked from the API reference."
          },
          {
            "status": "todo",
            "text": "Generate the changelog page from commit messages.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Docs versions, so a self-hosted older release reads the matching pages.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "A Markdown copy of every page and an llms.txt, so agents can read the docs directly."
          },
          {
            "status": "todo",
            "text": "Spanish docs that follow the Spanish block labels already in the studio.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "A page that shows the live status of the hosted deployment."
          }
        ],
        "taskStats": {
          "done": 3,
          "doing": 0,
          "todo": 5
        }
      },
      {
        "title": "Next: calculated todo list",
        "text": "Make this page's checkboxes and progress bars real controls that work themselves out, instead of symbols and numbers typed by hand.",
        "tasks": [
          {
            "status": "done",
            "text": "Draw `- [ ]` and `- [x]` items as real checkboxes in the docs page, read-only and labelled for screen readers, instead of the ☐ and ☑ text symbols."
          },
          {
            "status": "done",
            "text": "Calculate progress from the checkboxes at build time, per section and overall, so no bar, percentage or count is typed by hand."
          },
          {
            "status": "done",
            "text": "Generate the Progress by area table from the page's own sections, with done, in progress and to do counts worked out from the items."
          },
          {
            "status": "done",
            "text": "Draw each bar as a real progress element with an accessible label naming the done and total counts, so it animates, scales and reads out properly."
          },
          {
            "status": "done",
            "text": "Status syntax in the markdown: `[ ]` to do, `[~]` in progress and `[x]` done, each with its own icon and counted separately in the bars."
          },
          {
            "status": "done",
            "text": "Parse the priority (High, Medium, Low) out of each item so the page can sort, filter and count by priority."
          },
          {
            "status": "done",
            "text": "Filter controls at the top of the page: All, Open, In progress and Done, plus priority and area, remembered per browser."
          },
          {
            "status": "done",
            "text": "Fail the docs build when a hand-written number on the page disagrees with the checkboxes, and add a test that the calculated counts match."
          },
          {
            "status": "done",
            "text": "Show the overall progress next to the Bucket list entry in the sidebar."
          },
          {
            "status": "done",
            "text": "Items can link to their issue or commit with ordinary markdown links, and [script/todo-from-issues.ts](https://github.com/HomekidChud/videoforge/blob/main/script/todo-from-issues.ts) fills the list from open GitHub issues in one command."
          }
        ],
        "taskStats": {
          "done": 10,
          "doing": 0,
          "todo": 0
        }
      },
      {
        "title": "Next: docs quality and reach",
        "text": "Checks that stop the docs drifting from the product, and work that helps people find them.",
        "tasks": [
          {
            "status": "done",
            "text": "Link checker in CI for internal links, section anchors and external URLs."
          },
          {
            "status": "todo",
            "text": "Test every JSON and shell example in the docs against the real API, the way the tutorial batch is tested.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Style and spelling checks on docs pull requests.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "An accessibility pass on the docs: contrast, focus order, skip link and screen reader labels.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Social preview images and page descriptions for each page, plus a sitemap.",
            "priority": "Medium"
          },
          {
            "status": "done",
            "text": "Strict contribution rules: community pull requests are docs-only, enforced by a workflow that also demands a real description, with the policy in CONTRIBUTING.md and the Contribute page."
          },
          {
            "status": "done",
            "text": "A contributors list on the Contribute page."
          }
        ],
        "taskStats": {
          "done": 3,
          "doing": 0,
          "todo": 4
        }
      },
      {
        "title": "Animator and rigs",
        "text": "What would make the Animator feel complete.",
        "tasks": [
          {
            "status": "done",
            "text": "**Rig animations, for clips.** The Animator is a Roblox-style animation editor where the parts are your own clips instead of bones: video clips, images, text and shapes all become rig parts with a joint, an optional parent and their own keyframes. Pose by dragging on the stage or typing values, key on a dope sheet with easing per key, parent parts by dragging, and bake the result into plain clip keyframes with the green Apply to edit button. Presets (bounce, swing, wave, pulse, float, pop in, walk cycle), a ready-made stick figure, undo and redo, and animations saved per project. Because it bakes into ordinary keyframes the preview, FFmpeg export and API need no new renderer."
          },
          {
            "status": "done",
            "text": "**Animator button.** Opens from the Studio top bar and from the block studio header."
          },
          {
            "status": "done",
            "text": "**Rig blocks and operations.** Pose clips together, Make a clip follow another and Play an Animator animation join the palette, backed by new `rig_pose`, `rig_follow` and `rig_bake` timeline operations that agents can call too."
          },
          {
            "status": "todo",
            "text": "Onion skinning and a ghost of the previous pose in the Animator.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "Save Animator animations to the project on the server so they follow you between browsers.",
            "priority": "High"
          },
          {
            "status": "todo",
            "text": "IK handles so dragging a hand moves the whole arm.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Rig keys on text effects and colour, not just position, size, turn and see-through.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "A library of ready-made rigs beyond the stick figure: mascot, hands.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Copy and paste poses between parts and between animations.",
            "priority": "Low"
          }
        ],
        "taskStats": {
          "done": 3,
          "doing": 0,
          "todo": 6
        }
      },
      {
        "title": "Media and studio ideas",
        "text": "Uploads, playback speed and open ideas.",
        "tasks": [
          {
            "status": "todo",
            "text": "Resumable and chunked uploads for very large files.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Background proxies for large video, so scrubbing stays smooth.",
            "priority": "Medium"
          },
          {
            "status": "todo",
            "text": "Your idea here: the studio is in good shape, so what should people be able to make next?",
            "priority": "Low"
          }
        ],
        "taskStats": {
          "done": 0,
          "doing": 0,
          "todo": 3
        }
      },
      {
        "title": "Shipped: block studio",
        "text": "Everything the block studio does today.",
        "tasks": [
          {
            "status": "done",
            "text": "Full-screen Scratch-style block studio (React Flow) with palette drag and drop, custom nodes, per-edge delete buttons, inline param handles, live validation and the error console bar."
          },
          {
            "status": "done",
            "text": "Code tab as a real editor: helper reference sidebar with click-to-insert examples, $-template reference, line numbers, tab-key support, bigger monospace font and inline run errors."
          },
          {
            "status": "done",
            "text": "Blocks → Code conversion on tab switch, with generated JavaScript that produces the same operations the blocks would, and a notice that the tool now runs the code."
          },
          {
            "status": "done",
            "text": "Animation everything: all motion presets in the palette (entrances, exits, attention, springy, camera), animate-any-property keyframe blocks with easings, text effects (typewriter, word/line reveal, colour cycle), draw-on, pulsing glow, parallax, speed and timing blocks."
          },
          {
            "status": "done",
            "text": "Many more edit tools: the Edit group covers transform, flip and mirror, row/column placement and distribute, snap to grid, crop, opacity, colour looks and filters, brightness/contrast/saturation/blur, speed and duration, volume, mute, audio fades, tracks and layering, copy with offset, replace words, and for-each filtering by colour and contained text. (True edge-to-edge alignment is still open — see the bucket list.)"
          },
          {
            "status": "done",
            "text": "True z-order: clips carry a z field (-100..100). Overlay visuals — media, shapes and text alike — stack by z in one order, in both the preview and the renderer; move_layer blocks step past the nearest neighbour even with unequal ranks."
          },
          {
            "status": "done",
            "text": "Spatial crop for media clips: a crop box (fractions of the layer box) applied by the preview's clip-path and the renderer's crop filter (the layer keeps its box, padded back transparent, so preview and export match), driven by the friendly trim-sides Crop block."
          },
          {
            "status": "done",
            "text": "Motion blocks take an easing pick; audio clips are walkable by for-each (kind \"audio\") for volume tools."
          },
          {
            "status": "done",
            "text": "Palette tabs: the studio palette is a Scratch-style rail of coloured categories (Create, Edit, Move in, Move out, Attention, Springy, Camera, Animate, Text, Style, Clips, Timing, Values, Flow) with the palette showing only the selected category."
          },
          {
            "status": "done",
            "text": "First-tool tutorial: a six-step guided tour opens the first time a new blocks tool is created — name the tool, meet the block menu, edit the Add title block, run it and find it again — replayable from the 🎓 Tutorial button."
          },
          {
            "status": "done",
            "text": "Value blocks: Text, Number and Yes / No blocks in a new Values category plug into any block field — typed arguments without touching code; bad numbers turn red and unplugged values get a warning, and blocks-to-code conversion inlines them identically."
          },
          {
            "status": "done",
            "text": "Arguments JSON editor removed: the Advanced op block and its Arguments (JSON) box are gone from the palette and the studio — every operation shows named, friendly fields, and a saved JSON object (like update_clip's patch) becomes editable property rows instead of raw text (saved advanced tools keep working)."
          },
          {
            "status": "done",
            "text": "Motion blocks are edit tools: \"Entrances\"/\"Exits\" became Move in / Move out with labels like \"Move a clip in\", framed as animating a clip you already have; saved block ids are unchanged."
          },
          {
            "status": "done",
            "text": "Blocks panel: the block studio now opens from its own Blocks tab next to Effects — the Tools tab is code-only (no block editor: its studio hides the Blocks tab and the block-creation buttons), while it still runs tools."
          },
          {
            "status": "done",
            "text": "Blocks tab opens the canvas itself: clicking Blocks goes straight into the block studio (your latest tool, or a fresh draft with the tutorial) — no tools list in between; closing it returns to the panel you came from."
          },
          {
            "status": "done",
            "text": "Palette diet: the canned motion chips (Move in, Move out, Attention, Springy, Camera and their Animate duplicates) are out of the palette — the friendly from/to Animate blocks and presets cover them; hidden ids still load older saved tools."
          },
          {
            "status": "done",
            "text": "Real edge alignment for the Line up block: clips line up by their measured edges — against each other or flush with the frame — including text clips (the renderer measures rendered text with drawtext/ascent)."
          },
          {
            "status": "done",
            "text": "Real speed ramps and freeze frames as first-class timeline ops: the Speed steps block builds a per-clip ramp (segments of constant speed, 0 = freeze), rendered with per-segment trim/setpts/concat (audio silenced and padded to match), and the preview plays the same ramp. Freeze frame is its own block."
          },
          {
            "status": "done",
            "text": "Undo/redo for the studio: one entry per drop, delete, paste or edge; drags are one entry (committed at drag start); quick typing coalesces (900 ms). Ctrl+Z / Ctrl+Shift+Z, with a capture-phase listener so text fields don't swallow it."
          },
          {
            "status": "done",
            "text": "Shareable tool codes: the 🔗 Share button copies a compact `VFT1:` code; the tools panel imports it. Old links keep working (damaged codes get a friendly error)."
          },
          {
            "status": "done",
            "text": "Save as sticker: the block turns any clip into a reusable building block; stickers appear in their own palette category and drop as fresh clips."
          },
          {
            "status": "done",
            "text": "Hover help on palette groups and a searchable palette (search matches either language)."
          },
          {
            "status": "done",
            "text": "Export code tools as standalone scripts: the Code tab's \"Export as standalone script\" downloads a single .mjs that runs the same code against the API (`VF_API_KEY` env, `--dry-run` preview), for agents and cron jobs."
          },
          {
            "status": "done",
            "text": "Localization: Spanish labels and descriptions for every block and group (🌐 button in the studio, remembered per browser; the browser language is the default). Search matches either language."
          },
          {
            "status": "done",
            "text": "Calmer blocks: the coloured field dots (clip / frame / value sockets) only show when you hover a block, select it, focus it or while dragging a connection — dots that already have something plugged in stay visible, and the 🔌 Connectors button pins them all on. The canvas legend explains the dots."
          },
          {
            "status": "done",
            "text": "Neater blocks: every block got more breathing room (roomier header, field and hint spacing) and a cleaner look — soft gradient card, one-pixel border, a colour-coded accent bar per block kind, circular glowing handles and hover states on the palette chips."
          },
          {
            "status": "done",
            "text": "One ✕ per wire, not per canvas: a wire's delete button now appears when you click that wire (or hover the ✕ itself), instead of every ✕ lighting up whenever you touch the canvas."
          },
          {
            "status": "done",
            "text": "🧹 Tidy button: lines the run chain up a column, puts repeat bodies to its right, helper blocks (values, clips, frames) beside the blocks they feed and notes in a far column — one undo entry, like a drag. Presets and free spots also land further apart, so new blocks no longer stack on old ones."
          },
          {
            "status": "done",
            "text": "Bigger tutorial: six steps became eleven in three parts (Your first tool, Connecting things, Power moves) with part chips you can jump between — now covering wires vs field dots, importing clips, value blocks, undo, presets and where saved tools live."
          },
          {
            "status": "done",
            "text": "**Blocks are about the whole edit, not one tool.** The green block now reads \"When Apply is pressed\" and the Run button is ▶ Apply to edit. Preview lists what Apply would change before it touches the edit, and the green block's Work on setting picks which clips the blocks use: selected, every clip, under the playhead, or all video, text or shapes. Wording across the studio and the Tools panel changed from tools to blocks and scripts."
          }
        ],
        "taskStats": {
          "done": 30,
          "doing": 0,
          "todo": 0
        }
      },
      {
        "title": "Shipped: docs",
        "text": "What the docs site already does.",
        "tasks": [
          {
            "status": "done",
            "text": "**Better docs.** Sidebar guide groups open and close with an arrow (remembered per browser, plus Collapse all), every section folds with its own arrow, and there are reading times, a progress bar, a highlighted on-this-page list, copyable section links, breadcrumbs, note, tip and warning callouts, bullet lists with bold, code and links, and a back-to-top button."
          },
          {
            "status": "done",
            "text": "**Docs search.** Every section is searched, typos are forgiven only for words the docs do not contain, weak matches are trimmed, four pages show first with Show more, and a closest-match fallback appears when no page has every word."
          },
          {
            "status": "done",
            "text": "**Docs start tidy.** Only Get started is open on arrival, and the group you are reading opens by itself."
          },
          {
            "status": "done",
            "text": "**Motion graphics tutorial.** An animated intro built step by step in the Studio, plus the same result as one API batch that a test keeps honest."
          },
          {
            "status": "done",
            "text": "**Recorded tutorial.** Every step of the motion graphics tutorial now has a short clip of the Studio doing it: a Playwright capture cut and captioned through VideoForge itself, embedded beside the step with a poster, captions and native controls, under 1 MB for all eleven clips."
          },
          {
            "status": "done",
            "text": "**Three more tutorials.** Block coding in the block studio, a wave in the Animator and a fire edit cut from one clip — each with step-by-step editor instructions and a matching API batch the docs tests apply for real."
          },
          {
            "status": "done",
            "text": "**Contribute and Storage pages.** Setup, code layout, tests and recipes for presets, templates, operations and blocks, and a page on disks, backups and the optional MongoDB store."
          },
          {
            "status": "done",
            "text": "**Short README.** A one-screen overview with a docs index, instead of repeating the docs."
          }
        ],
        "taskStats": {
          "done": 8,
          "doing": 0,
          "todo": 0
        }
      },
      {
        "title": "Shipped: accounts and media",
        "text": "Sign-ins, keys and uploads that already work.",
        "tasks": [
          {
            "status": "done",
            "text": "Hosted API server documented: https://videoforge-api-s54w.onrender.com is stated in the introduction, quickstart, self-hosting guide and README, with per-deployment keys."
          },
          {
            "status": "done",
            "text": "Server-side tool library: tools sync per account (or per API key) with `GET/PUT/DELETE /api/tools/:id`, merged with the browser's local copy as the offline fallback."
          },
          {
            "status": "done",
            "text": "Accounts with durable sign-ins: email + password (first account needs the owner key), Google when configured, API keys for agents; sessions live in SQLite so they survive restarts. No API key needed to use the studio."
          },
          {
            "status": "done",
            "text": "**Faster uploads, and the sign-in bug fixed.** The session cookie is now sent with uploads, four files go up at once, each file is probed once, thumbnails are ready straight after upload and media plays with range requests."
          }
        ],
        "taskStats": {
          "done": 4,
          "doing": 0,
          "todo": 0
        }
      }
    ],
    "taskStats": {
      "done": 74,
      "doing": 0,
      "todo": 43
    },
    "updated": "2026-10-17T18:00:49Z",
    "added": "2026-10-16T00:27:26Z"
  }
];

export const CONTRIBUTORS: { name: string; commits: number }[] = [
  {
    "commits": 69,
    "name": "HomekidChud"
  },
  {
    "commits": 2,
    "name": "Perplexity Computer"
  },
  {
    "commits": 2,
    "name": "VideoForge Agent"
  },
  {
    "commits": 1,
    "name": "AgentMedia1942"
  }
];
