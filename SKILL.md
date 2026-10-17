---
name: videoforge-editing
description: Edit video in VideoForge through its HTTP API, and cut professional tutorial and screen recording videos with a clean, restrained editing style. Use when asked to assemble, trim, caption, animate, grade, render or review a video in VideoForge.
---

# VideoForge editing skill

This file teaches an AI agent two things: how to drive VideoForge, and how to edit well once it can. The first half is mechanics. The second half is taste, and it matters more.

Reference docs live in the repository under `docs/`: `batch-operations.md`, `timeline.md`, `keyframes.md`, `transitions.md`, `motion-presets.md`, `fonts-and-text.md`, `fit-and-layout.md`, `rendering.md` and `agent-workflow.md`. When this file and the live server disagree, the server wins: call `GET /api/capabilities` first and trust it.

## 1. Ground rules

- Never use em dashes or double hyphens in anything the viewer reads: on screen text, captions, narration, titles, file names. Use commas, colons or full stops.
- Write in a formal, plain, professional voice. No hype words, no filler openers, no exclamation marks, no emojis. A tutorial should sound like a competent colleague explaining a task.
- Do not invent facts about the interface. Record the real UI, and read labels from it.
- Show the user what you are about to do before any destructive change, such as deleting a project or overwriting a published file.

## 2. Connect

- Base URL: `http://localhost:5000` for a local server, or `https://videoforge-api-s54w.onrender.com` for the hosted one. Keys are issued per deployment, so a local key does not work on the hosted server.
- Auth: send `Authorization: Bearer <key>` on every request. Use a scoped write key, not the owner key, unless you must administer the server.
- Health check: `GET /api/health`.
- Start every session with `GET /api/capabilities`. It lists every operation, preset, transition, filter, font, easing and limit.

## 3. The workflow

1. Create a project: `POST /api/projects` with `{name, timeline: {fps, resolution: {width, height}, background, clips: []}}`. Use 30 fps and 1920 by 1080 for tutorials. A project always needs the `clips` array, even when empty.
2. Upload media: `POST /api/media/upload` as multipart form data, field name `files`. The response contains `assets[0].id`. Probe results (duration, size) are stored on the asset.
3. Build the timeline with operations: `POST /api/projects/:id/timeline/ops` with either `{op, args}` or `{ops: [...]}`. Send at most 100 operations per request. The reply includes `createdClipIds`.
4. Validate before saving large changes: add `dryRun: true`, or call `POST /api/projects/:id/timeline/validate`. Pass `expectedUpdatedAt` to avoid overwriting someone else's edit (a stale write returns 409).
5. Look at the result. Do not render blind:
   - `GET /api/projects/:id/frame?t=SECONDS&width=960` returns a PNG of one frame.
   - `GET /api/projects/:id/storyboard?count=8&width=320` returns a contact sheet.
   - `GET /api/projects/:id/fit-report` lists anything crossing the frame edge, with a fix.
6. Render: `POST /api/renders` with `{projectId}`, then poll `GET /api/renders/:jobId` until `status` is `done` (states: queued, rendering, done, error). Download from `/api/renders/:jobId/download`.
7. Master the audio and check the file (section 7), then deliver.

Timeline coordinates are seconds. Keyframe times are relative to the clip start. Maximum 200 clips per project, 64 keyframes per property, speed between 0.25 and 4, minimum clip length 0.1 seconds.

## 4. Tracks and layers

- `video` track: full frame footage and images, fitted to the canvas.
- `overlay` track: picture in picture, titles, shapes, stickers. Stacking order inside overlay is the `z` field (-100 to 100, higher on top).
- `audio` track: voice over and music.

## 5. Operation cheat sheet

Add and arrange
- `add_clip {assetId, track?, start?, inPoint?, outPoint?, id?, ...clip fields}`
- `add_text_clip {text, start, duration, x, y, textSize, textColor, font, fontWeight, textBg, textMaxWidth, fadeIn, fadeOut}`
- `add_shape_clip {shape: {type, width, height, fill, stroke, strokeWidth, radius}, start, duration, x, y}`
- `add_motion_template {template, title?, subtitle?, color?, start, duration}` with templates lower-third, title-card, callout, kinetic-type, countdown, quote-card, split-reveal, progress-bar, stat-highlight, bullet-list, social-handle, chapter-number, starburst
- `split_clip {clipId, at}`, `trim_clip`, `move_clip`, `remove_clip`, `ripple_delete`, `duplicate_clip`, `shift_clips`, `close_gaps`, `reorder`, `swap_asset`

Style and look
- `update_clip` and `update_clips` for any clip field: x, y (0 to 1 of the frame), scale, rotation, opacity, blur, fit (contain, cover, fill), filter (none, mono, sepia, vivid, cool, warm, faded), brightness, contrast, saturation, volume, speed, fadeIn, fadeOut
- `copy_style {fromClipId, toClipIds}` to keep repeated elements identical
- `set_project {fps?, resolution?, background?, refit?}`

Motion
- `apply_motion {clipId, preset, duration?, delay?, strength?}`. Entrances: fade, slide-left, slide-right, rise, drop, zoom, pop, drift, spring, whip, reveal, bounce-in. Exits: fade-out, exit-left, exit-right, exit-up, exit-down, shrink-out, zoom-out, pop-out, reveal-out. Emphasis: pulse, shake, swing, wobble, rubber, tada, heartbeat, blink, flash, glitch, spin.
- `apply_motion_sequence {clipIds, preset, stagger?}` for lists
- `set_keyframes`, `upsert_keyframe`, `remove_keyframe` for exact curves. Properties: x, y, scale, rotation, opacity and others listed in capabilities. Easings include linear, ease, ease-in, ease-out, back-out, snappy, anticipate, hold, or a custom `[x1,y1,x2,y2]`.
- `animate_code {clipId, expressions}` and `apply_code_motion` for expression driven motion, `bake_expression` to turn code into editable keys
- `rig_pose`, `rig_follow`, `rig_bake` for parented, joint style animation (the Animator)

Transitions and timing
- `set_transition {clipId, type, duration?}` with dissolve, wipe-left, wipe-right, wipe-up, wipe-down, iris, barn-h, barn-v, diamond, wipe-diagonal. The clip overlaps the previous video clip by the duration.
- `add_marker`, `add_beat_markers`, `snap_to_beats`, `stagger_clips`

Layout
- `fit_clip`, `fit_all`, `align_clips`, `snap_to_grid`, `move_layer`

## 6. Known traps (each one cost real time)

- Audio clips need an explicit length. An `add_clip` for audio with no `outPoint` falls back to a default of about five seconds, which silently cuts narration off. Always pass `inPoint: 0` and `outPoint` equal to the real audio duration.
- Do not reuse one long source file for many clips. FFmpeg fans a single decoder out to every trim, buffers gigabytes of frames and renders at a crawl. Cut the source into one file per section first, upload each, and place one clip per file.
- Bake zoom push ins into the section file (scale then crop in FFmpeg) instead of animating `scale` on a 1080p clip for the whole video. It renders about the same speed as plain footage.
- Avoid per pixel expressions in custom filters. Opacity and dissolves use `sendcmd` gain changes in the renderer for that reason.
- Very large filter graphs must go through a script file, not the command line, or the process fails with `E2BIG`. The server already does this; keep your own FFmpeg calls the same.
- Send operations in batches of 40 to 100 and stop at the first failure. Read the error message, fix the cause, and replay from that batch.
- Do not edit the interface source while a screen recording is running. The dev server reloads the page and the recording captures a restored draft.
- Check the first frame of every cut. A clip placed with the wrong `start` leaves a black gap that is easy to miss at normal playback.

## 7. Output checks before delivery

Run these on every render, and fix what they find.

- Duration matches the plan within a second.
- Audio is present for the whole programme: run `ffmpeg -i out.mp4 -af silencedetect=n=-40dB:d=2.5 -f null -` and confirm any silence is deliberate, such as a title card.
- Loudness is mastered to about -16 LUFS integrated with a true peak under -1.5 dBFS: `loudnorm=I=-16:TP=-1.5:LRA=9`.
- A contact sheet from `/storyboard` shows no clipped text, no text over busy footage without a backing plate, and no overlapping elements.
- Captions (WebVTT) cover every spoken sentence and chapters (FFMETADATA) match the real section starts.
- File plays from the start with `-movflags +faststart` set.

## 8. Editing style: what good looks like

The mechanics above get a video made. This section is what separates a polished cut from a slideshow of clips.

### Pace and trimming
- Remove dead air. If nothing changes on screen for more than two seconds and nobody is speaking, cut it or speed it up. Never leave the viewer watching a loading state or a pointer idling.
- Cut on action. Start a cut as the viewer's attention is moving, such as a click landing or a panel opening, not in the middle of a held frame.
- Let narration lead. Start the narration a beat after the visual arrives, never before. Cover the interface change first, then explain it.
- Speed up repetitive actions (typing, long drags) to 2x to 4x with a small speed badge on screen, and return to real speed for anything the viewer must follow.
- Target section length of 12 to 25 seconds. A section that needs more should be split into two chapters.

### Transitions
- Default to a short dissolve of 0.3 to 0.5 seconds between sections. Keep every transition in a video the same family. Do not mix wipes, irises and diamonds.
- Use a hard cut inside a section. Transitions mark a change of topic, nothing else.

### Focus and framing
- Guide the eye with push ins of 1.3x to 1.6x on the control being discussed, easing in over about 0.85 seconds and easing out when the topic moves on. Never zoom on a static screen for its own sake.
- Keep one focal point at a time. If a callout, a zoom and a label all appear together, remove two.
- Add a highlight ring or short pulse when a small control matters, instead of relying on the cursor alone.
- Move the pointer like a person: an eased curve, a short pause before the click, no teleporting.

### On screen text
- One chapter label per section, small, in the lower third, arriving 0.7 seconds into the section and leaving after about 3.5 seconds. Use a consistent format such as "STEP 03 OF 08" above the title.
- Titles are short noun phrases. Keep body text on screen for at least one second per six words.
- Always put text on a backing plate or over a calm area. Check contrast against the frame, not against the background colour you picked.
- Use one font family for the whole video and at most two weights.

### Colour and brand
- Choose one accent colour and one neutral palette, then reuse them for cards, labels, highlights and shapes. Define them as constants at the top of your script.
- Title and end cards share the same layout, with a headline, a thin accent rule and a short subtitle. Open with the card for about 4.5 seconds and close with a "next steps" card of about 5 seconds.

### Audio
- Narration is the master track. Keep it at full level and master it last.
- Under narration, music (if used) sits at roughly -24 to -28 LUFS and ducks a further 6 dB while someone speaks.
- Leave a quarter of a second of room tone before and after each line so cuts do not clip breaths or consonants.
- Match the narration to what is on screen at that second. Rewrite the line, not the footage, when they disagree.

### Narration writing
- Short sentences, active voice, one idea each. Name the control exactly as the interface labels it.
- Say what the viewer should do, then what they will see. Avoid "simply", "just", "obviously" and "easily".
- No dashes as punctuation. Write the line so it reads naturally aloud at a calm pace of about 150 words per minute.

### What to avoid
- Template overload: do not add a motion template to every beat.
- Long silent holds, repeated zooms on the same control, and any element that moves without a reason.
- Mixed easing styles in one video. Pick two (for example ease-out for entrances and ease-in-out for moves) and stay with them.
- Captions that run faster than people can read: keep cues under two lines, and at most about 17 characters per second.

## 9. A reliable build recipe for a tutorial

1. Write the narration first, one block per section, with a title, subtitle and next step line.
2. Generate the voice over, one file per section, and note each file's exact duration.
3. Record the interface at 1920 by 1080, timing every action to the narration, and write a manifest of section start and end times plus the audio length.
4. Cut the capture into one file per section, baking any zoom into the file.
5. Create the project, upload section files and narration, then build in this order: section clips, transitions, narration clips (with `outPoint`), chapter labels, title card, end card.
6. Preview with a storyboard and three or four single frames, including the first and last. Fix, then render.
7. Master the audio, write captions and chapters, then run the checks in section 7.
8. Review the finished video once, end to end, with sound, before delivering. If something feels slow, it is.

## 10. When something fails

- A 400 on an operation lists the field that was rejected. Fix the field, not the whole batch.
- A 409 means the project changed. Fetch it again and reapply.
- A render with status `error` includes a message. Reduce the cause (fewer simultaneous overlays, shorter source files) before retrying. Do not retry the same render unchanged.
- If a result looks wrong, read `GET /api/projects/:id/state?t=SECONDS` to see the evaluated values at that instant instead of guessing.
