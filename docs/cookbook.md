---
title: Cookbook
group: Examples
order: 14
description: Short recipes: one goal, one atomic batch each.
---

## How to use these recipes

Every recipe is one atomic batch: POST it to `/api/projects/:id/timeline/ops` with `dryRun: true` first, look at the returned timeline, then send it for real. Replace the ids with yours.

## A lower third in one request

The fastest way to a professional title: one template call places, styles and animates it.

```json
{
  "ops": [
    { "op": "add_motion_template", "args": { "template": "lower-third", "title": "Ada Lovelace", "subtitle": "Pioneer of computing", "color": "#f6a447", "start": 0, "duration": 4 } }
  ]
}
```

## Stagger a row of titles

Give a list of clips the same entrance with a delay between them: title bars that cascade in.

```json
{
  "ops": [
    { "op": "stagger_clips", "args": { "clipIds": ["t1", "t2", "t3"], "delay": 0.25, "start": 1 } }
  ]
}
```

## Cut out the dead air

Split at the boring moment, then ripple the rest closed — no gap left behind. The split's response lists the new right-hand clip's id in `createdClipIds`; use it in the second batch.

```json
{
  "ops": [
    { "op": "split_clip", "args": { "clipId": "intro", "at": 12.4 } }
  ]
}
```

```json
{
  "ops": [
    { "op": "ripple_delete", "args": { "clipId": "the new id from createdClipIds" } }
  ]
}
```

## Constant speed and a freeze

A clip's speed is a field like any other: set it once, or ramp it with the Speed steps block in Studio for freeze frames and slow motion.

```json
{
  "ops": [
    { "op": "update_clip", "args": { "clipId": "b-roll", "speed": 1.5 } }
  ]
}
```

## A caption that stays readable

Text wraps and shrinks to fit its box; give it a background and place it once.

```json
{
  "ops": [
    { "op": "add_text_clip", "args": { "text": "Chapter one: the problem", "start": 0, "duration": 6, "textSize": 0.06, "textBg": "#101826cc", "x": 0.5, "y": 0.9 } }
  ]
}
```

## Everything inside the frame

One call refits every clip that crosses the edges — media, text and shapes alike, with a margin.

```json
{
  "ops": [
    { "op": "fit_all", "args": { "margin": 0.03 } }
  ]
}
```

## A badge that floats, then keyframes

Drive any property with a formula of time, then bake it into editable keyframes when you are happy.

```json
{
  "ops": [
    { "op": "animate_code", "args": { "clipId": "badge", "expressions": { "y": "0.15 + 0.01 * sin(t * 2)" } } },
    { "op": "bake_expression", "args": { "clipId": "badge", "property": "y" } }
  ]
}
```

## Check before you render

Two GETs save a render: a frame at the moment you care about, and the full storyboard. Both are read routes — send your key.

```shell
curl -H "Authorization: Bearer $KEY" "$BASE/api/projects/$ID/frame?t=3&width=640" -o frame.png
curl -H "Authorization: Bearer $KEY" "$BASE/api/projects/$ID/storyboard?count=6" -o sheet.png
```

- [Examples gallery](examples)
- [Batch operations](batch-operations)
- [Motion presets & sequencing](motion-presets)
- [Animate with code](animate-with-code)
