---
title: Fit & layout
group: Motion graphics
order: 10
description: Text that wraps, media that fits and a report for everything that does not.
---

## Text fits by default

Text clips wrap onto new lines and shrink until the whole block sits inside its box. The box is 90% of the frame width and 50% of its height unless you change textMaxWidth or textMaxHeight, and it never extends past the nearer frame edge. The same layout code runs in the Studio preview and the renderer, so what you see is what exports. Set textFit to none to opt out.

```json
{
  "op": "add_text_clip",
  "args": {
    "id": "headline",
    "text": "A very long headline that now wraps and fits instead of running off both sides",
    "textSize": 10,
    "textMaxWidth": 0.8
  }
}
```

## Fit media to the frame

Footage on the video track has three fit modes: contain (everything visible, letterboxed), cover (fills the frame and crops) and fill (stretches to the frame and ignores the aspect ratio). In Studio, use the Fit to frame section of the inspector.

```json
{
  "op": "update_clip",
  "args": {
    "clipId": "clip-a",
    "fit": "cover"
  }
}
```

## Fit a layer inside the frame

fit_clip scales and nudges one text, shape or overlay clip until its animated bounds sit inside the frame minus a margin (default 4%). Keyframed and code-driven scale and rotation are checked at their peak. fit_all does the same for every visual clip, optionally forcing footage to contain, cover or fill.

```json
[
  {
    "op": "fit_clip",
    "args": {
      "clipId": "badge",
      "margin": 0.05
    }
  },
  {
    "op": "fit_all",
    "args": {
      "media": "contain"
    }
  }
]
```

## Change the canvas safely

set_project with refit true re-fits text, shapes and overlays after you change the resolution, for example from 16:9 to 9:16. Studio does this automatically when you pick a new canvas.

```json
{
  "op": "set_project",
  "args": {
    "resolution": {
      "width": 1080,
      "height": 1920
    },
    "refit": true
  }
}
```

## Find what does not fit

GET /api/projects/:id/fit-report?margin=0.04 lists every clip whose bounds leave the frame, how far, and the op that fixes it. In Studio, the Fit everything section of the project inspector shows the count and a Fit all layers button.

```shell
curl "$BASE/api/projects/$PROJECT/fit-report?margin=0.04" -H "Authorization: Bearer $KEY"
```

## Known limits

Text width uses per-family estimates — the base Noto Sans table scaled for each catalog font — with about 12% spare room, so an unusual font may fit more loosely or more tightly. Fit checks the static position and the peak animated scale and rotation. It does not account for x and y travel of entrance animations, which are meant to start off position.

- [Keyframes & easing](keyframes)
- [Animate with code](animate-with-code)
