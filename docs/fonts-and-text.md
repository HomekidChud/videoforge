---
title: Fonts & text
group: Motion graphics
order: 10
description: A large font catalog, bold, alignment, line height, letter spacing and uppercase — with a fit engine that knows every family.
---

## A catalog of families

Every text clip can pick a font from a catalog of over 40 families: sans, serif, display, handwriting and mono faces from Anton to Space Grotesk. The same catalog drives the Studio preview, the fit engine and the FFmpeg renderer, so the font you pick is the font that exports. Set `font` on a text clip with a catalog id.

```json
{
  "op": "add_text_clip",
  "args": {
    "id": "headline",
    "text": "The night the studio burned down",
    "font": "playfair-display",
    "fontWeight": 700,
    "textSize": 8
  }
}
```

## Choose a family

The Studio Typography section groups the catalog by category and previews each family with live text. Fonts with two weights offer Regular and Bold. The renderer downloads each family on first use and caches it on the server, so the first render with a new font may take a moment longer.

| Category | Examples |
|---|---|
| Sans | Inter, Poppins, Montserrat, Oswald, DM Sans, Space Grotesk |
| Serif | Playfair Display, Merriweather, Lora, Source Serif 4, Cinzel |
| Display | Bebas Neue, Anton, Archivo Black, Bungee, Press Start 2P, Lobster |
| Handwriting | Pacifico, Caveat, Dancing Script, Permanent Marker |
| Mono | Space Mono, JetBrains Mono, IBM Plex Mono |

## Style a text clip

Beyond the family, text clips take a weight, an alignment, a line height, letter spacing and a case transform. Alignment positions each line inside the text box: left and right edges are anchored to the widest line. Letter spacing is measured in em, from tight (-0.05) to airy (0.25), and the fit engine counts it in the width budget.

```json
{
  "op": "update_clip",
  "args": {
    "clipId": "headline",
    "font": "anton",
    "textAlign": "left",
    "lineHeight": 1.5,
    "letterSpacing": 0.04,
    "textTransform": "uppercase"
  }
}
```

## Fields

All style fields are optional; unset fields keep their defaults and are omitted from the stored timeline.

| Field | Accepted values |
|---|---|
| font | catalog id, for example inter or playfair-display |
| fontWeight | 400 (default) or 700, when the family has a bold cut |
| textAlign | left, center (default) or right |
| lineHeight | 1..2, default 1.4 |
| letterSpacing | -0.05..0.25 em |
| textTransform | none (default) or uppercase |

## Fit knows the font

The shrink-to-fit engine measures every family with its own width table, scaled from the base Noto Sans estimates: a condensed face like Bebas Neue fits noticeably more text in the same box than a wide face like Press Start 2P. Bold runs a little wider, letter spacing adds one gap per character pair, and upper-case text is measured in its rendered form. Line height counts toward the height budget.

## Rendering notes

Preview and export agree because both use the same metrics and the same font files. Two approximations remain: character positions for letter spacing and left/right alignment use the estimated advances, so long lines can drift a few pixels, and letter spacing on a text clip with a background box is exported without the spacing (keep the box or the spacing, not both). Set `VIDEOFORGE_FONT` to render every clip with one server font file instead of the catalog.

- [Fit & layout](fit-and-layout)
- [Using the editor](editor)
- [Examples gallery](examples)
