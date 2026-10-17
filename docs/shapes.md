---
title: Shape primitives
group: Motion graphics
order: 7
description: Rectangles, ellipses and lines with fill, stroke and transform animation.
---

## Create a shape clip

Shape clips require no media upload. They live on overlay and use an empty assetId. width and height are fractions of the canvas. radius and strokeWidth are pixels at the project's output resolution, scaled for smaller frame previews. A line is a thin rectangle; rotate it for other orientations.

```json
{
  "op": "add_shape_clip",
  "args": {
    "id": "badge",
    "start": 0,
    "duration": 4,
    "x": 0.5,
    "y": 0.5,
    "shape": {
      "type": "rectangle",
      "width": 0.35,
      "height": 0.2,
      "fill": "#f6a447",
      "stroke": "#ffffff",
      "strokeWidth": 2,
      "radius": 24
    },
    "keyframes": {
      "rotation": [
        {
          "time": 0,
          "value": -12,
          "easing": "ease-out"
        },
        {
          "time": 1,
          "value": 0
        }
      ]
    }
  }
}
```

## Shape fields

Colors accept six-digit hex or transparent. Transparent fill makes outlined shapes possible. Invalid primitives, numeric bounds and colors return validation errors.

| Field | Accepted values |
|---|---|
| type | rectangle | ellipse | line |
| width | 0.01..1 (default 0.35) |
| height | 0.002..1 (default 0.2; line 0.01) |
| fill / stroke | #rrggbb | transparent |
| strokeWidth | 0..40 pixels |
| radius | 0..200 pixels; rectangle corners |

## Update and animate

update_clip replaces the shape object, so supply all shape fields you want to preserve. Transform keyframes work as they do for text: x, y, scale, rotation and opacity. Shape dimensions and colors are static in this version. No SVG, expressions, custom shaders or arbitrary JavaScript are executed.

```json
{
  "op": "update_clip",
  "args": {
    "clipId": "badge",
    "shape": {
      "type": "ellipse",
      "width": 0.2,
      "height": 0.35,
      "fill": "transparent",
      "stroke": "#f6a447",
      "strokeWidth": 8
    }
  }
}
```

## Machine-readable schema

GET /api/graphics/schema returns the JSON Schema for the shape object. GET /api/capabilities includes this schema alongside every operation and template. Both require a read-capable key.

- [API reference](api-reference)
