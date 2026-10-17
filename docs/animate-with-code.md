---
title: Animate with code
group: Motion graphics
order: 12
description: Drive any property with a formula of time that previews live and renders exactly.
---

## Expressions

Give a property an expression instead of keyframes. The formula is a function of time, so a few characters make an orbit, a wiggle or a heartbeat that never runs out of keyframes. The browser preview and the FFmpeg renderer compile the same parsed expression, so they agree. An expression wins over keyframes on that property.

```json
{
  "op": "animate_code",
  "args": {
    "clipId": "badge",
    "expressions": {
      "x": "0.5 + 0.2 * cos(t * 2)",
      "y": "0.5 + 0.2 * sin(t * 2)",
      "rotation": "wiggle(2, 4)"
    }
  }
}
```

## Variables and operators

Use + - * / % ^ and parentheses. Results are clamped to the property's range. Division by zero or invalid maths falls back to base for that frame.

| Name | Meaning |
|---|---|
| t | seconds since the clip started |
| d | clip duration in seconds |
| p | progress through the clip, 0 to 1 |
| base | the property's static value |
| pi | 3.14159 |

## Functions

Everything maps to plain FFmpeg expression functions. Expressions are limited to 300 characters. There are no loops, strings, variables or property access, so an expression cannot do anything except calculate a number.

| Function | What it does |
|---|---|
| {{auto:functions}} |

## Looping recipes

apply_code_motion writes ready-made expressions that read each property's base value, so they work from wherever the layer sits. speed (0.1 to 5) and strength (0.1 to 3) tune them. In Studio use Animate with code in the Motion tab.

```json
{
  "op": "apply_code_motion",
  "args": {
    "clipIds": [
      "badge",
      "logo"
    ],
    "recipe": "float",
    "speed": 1.2,
    "strength": 1
  }
}
```

| Recipe | Behaviour |
|---|---|
| {{auto:recipes}} |

## Bake to keyframes

bake_expression samples an expression into linear keyframes (2 to 64, default 48) and removes the code, so you can drag the points in the graph. Applying a motion preset to a property also takes over from any expression on it.

```json
{
  "op": "bake_expression",
  "args": {
    "clipId": "badge",
    "property": "x",
    "samples": 32
  }
}
```

## Rules

Reveal expressions are rejected on text clips. A clip accepts up to 10 expressions. Invalid code returns a readable message with the character position, and Studio shows it under the editor as you type.

- [Motion presets](motion-presets)
- [Fit & layout](fit-and-layout)
