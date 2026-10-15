/** Font catalog shared by the Studio preview, the FFmpeg renderer and the API. */
export type FontCategory = "Sans" | "Serif" | "Display" | "Handwriting" | "Mono";
export type FontDef = {
  /** Clip field value: font: "playfair-display". */
  id: string;
  label: string;
  category: FontCategory;
  /** Google Fonts css2 family segment, e.g. "Inter:wght@400;700". */
  google: string;
  /** CSS font-family stack with fallbacks. */
  stack: string;
  /** Available weights. */
  weights: number[];
  /** Average character advance relative to the base Noto Sans table. */
  width: number;
};

export const FONT_CATALOG: FontDef[] = [
  // Sans
  { id: "noto-sans", label: "Noto Sans", category: "Sans", google: "Noto+Sans:wght@400;700", stack: "'Noto Sans', sans-serif", weights: [400, 700], width: 1 },
  { id: "inter", label: "Inter", category: "Sans", google: "Inter:wght@400;700", stack: "'Inter', sans-serif", weights: [400, 700], width: 0.99 },
  { id: "roboto", label: "Roboto", category: "Sans", google: "Roboto:wght@400;700", stack: "'Roboto', sans-serif", weights: [400, 700], width: 1 },
  { id: "open-sans", label: "Open Sans", category: "Sans", google: "Open+Sans:wght@400;700", stack: "'Open Sans', sans-serif", weights: [400, 700], width: 1 },
  { id: "lato", label: "Lato", category: "Sans", google: "Lato:wght@400;700", stack: "'Lato', sans-serif", weights: [400, 700], width: 0.98 },
  { id: "poppins", label: "Poppins", category: "Sans", google: "Poppins:wght@400;700", stack: "'Poppins', sans-serif", weights: [400, 700], width: 1.03 },
  { id: "montserrat", label: "Montserrat", category: "Sans", google: "Montserrat:wght@400;700", stack: "'Montserrat', sans-serif", weights: [400, 700], width: 1.06 },
  { id: "raleway", label: "Raleway", category: "Sans", google: "Raleway:wght@400;700", stack: "'Raleway', sans-serif", weights: [400, 700], width: 1 },
  { id: "work-sans", label: "Work Sans", category: "Sans", google: "Work+Sans:wght@400;700", stack: "'Work Sans', sans-serif", weights: [400, 700], width: 0.99 },
  { id: "manrope", label: "Manrope", category: "Sans", google: "Manrope:wght@400;700", stack: "'Manrope', sans-serif", weights: [400, 700], width: 1 },
  { id: "karla", label: "Karla", category: "Sans", google: "Karla:wght@400;700", stack: "'Karla', sans-serif", weights: [400, 700], width: 0.97 },
  { id: "rubik", label: "Rubik", category: "Sans", google: "Rubik:wght@400;700", stack: "'Rubik', sans-serif", weights: [400, 700], width: 1 },
  { id: "nunito", label: "Nunito", category: "Sans", google: "Nunito:wght@400;700", stack: "'Nunito', sans-serif", weights: [400, 700], width: 1.05 },
  { id: "quicksand", label: "Quicksand", category: "Sans", google: "Quicksand:wght@400;700", stack: "'Quicksand', sans-serif", weights: [400, 700], width: 1.08 },
  { id: "dm-sans", label: "DM Sans", category: "Sans", google: "DM+Sans:wght@400;700", stack: "'DM Sans', sans-serif", weights: [400, 700], width: 0.98 },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", category: "Sans", google: "IBM+Plex+Sans:wght@400;700", stack: "'IBM Plex Sans', sans-serif", weights: [400, 700], width: 0.99 },
  { id: "space-grotesk", label: "Space Grotesk", category: "Sans", google: "Space+Grotesk:wght@400;700", stack: "'Space Grotesk', sans-serif", weights: [400, 700], width: 1 },
  { id: "oswald", label: "Oswald", category: "Sans", google: "Oswald:wght@400;700", stack: "'Oswald', sans-serif", weights: [400, 700], width: 0.85 },
  { id: "fjalla-one", label: "Fjalla One", category: "Sans", google: "Fjalla+One", stack: "'Fjalla One', sans-serif", weights: [400], width: 0.95 },
  // Serif
  { id: "playfair-display", label: "Playfair Display", category: "Serif", google: "Playfair+Display:wght@400;700", stack: "'Playfair Display', serif", weights: [400, 700], width: 1 },
  { id: "merriweather", label: "Merriweather", category: "Serif", google: "Merriweather:wght@400;700", stack: "'Merriweather', serif", weights: [400, 700], width: 1.06 },
  { id: "lora", label: "Lora", category: "Serif", google: "Lora:wght@400;700", stack: "'Lora', serif", weights: [400, 700], width: 1.02 },
  { id: "source-serif-4", label: "Source Serif 4", category: "Serif", google: "Source+Serif+4:wght@400;700", stack: "'Source Serif 4', serif", weights: [400, 700], width: 1 },
  { id: "dm-serif-display", label: "DM Serif Display", category: "Serif", google: "DM+Serif+Display", stack: "'DM Serif Display', serif", weights: [400], width: 1.02 },
  { id: "ibm-plex-serif", label: "IBM Plex Serif", category: "Serif", google: "IBM+Plex+Serif:wght@400;700", stack: "'IBM Plex Serif', serif", weights: [400, 700], width: 1 },
  { id: "cinzel", label: "Cinzel", category: "Serif", google: "Cinzel:wght@400;700", stack: "'Cinzel', serif", weights: [400, 700], width: 1.12 },
  { id: "abril-fatface", label: "Abril Fatface", category: "Serif", google: "Abril+Fatface", stack: "'Abril Fatface', serif", weights: [400], width: 1 },
  { id: "alfa-slab-one", label: "Alfa Slab One", category: "Serif", google: "Alfa+Slab+One", stack: "'Alfa Slab One', serif", weights: [400], width: 1.05 },
  // Display
  { id: "bebas-neue", label: "Bebas Neue", category: "Display", google: "Bebas+Neue", stack: "'Bebas Neue', sans-serif", weights: [400], width: 0.72 },
  { id: "anton", label: "Anton", category: "Display", google: "Anton", stack: "'Anton', sans-serif", weights: [400], width: 0.78 },
  { id: "archivo-black", label: "Archivo Black", category: "Display", google: "Archivo+Black", stack: "'Archivo Black', sans-serif", weights: [400], width: 1.05 },
  { id: "bungee", label: "Bungee", category: "Display", google: "Bungee", stack: "'Bungee', sans-serif", weights: [400], width: 1.12 },
  { id: "righteous", label: "Righteous", category: "Display", google: "Righteous", stack: "'Righteous', sans-serif", weights: [400], width: 1 },
  { id: "bangers", label: "Bangers", category: "Display", google: "Bangers", stack: "'Bangers', cursive", weights: [400], width: 1 },
  { id: "press-start-2p", label: "Press Start 2P", category: "Display", google: "Press+Start+2P", stack: "'Press Start 2P', monospace", weights: [400], width: 1.35 },
  { id: "lobster", label: "Lobster", category: "Display", google: "Lobster", stack: "'Lobster', cursive", weights: [400], width: 0.95 },
  // Handwriting
  { id: "pacifico", label: "Pacifico", category: "Handwriting", google: "Pacifico", stack: "'Pacifico', cursive", weights: [400], width: 1.05 },
  { id: "caveat", label: "Caveat", category: "Handwriting", google: "Caveat:wght@400;700", stack: "'Caveat', cursive", weights: [400, 700], width: 0.85 },
  { id: "dancing-script", label: "Dancing Script", category: "Handwriting", google: "Dancing+Script:wght@400;700", stack: "'Dancing Script', cursive", weights: [400, 700], width: 0.9 },
  { id: "permanent-marker", label: "Permanent Marker", category: "Handwriting", google: "Permanent+Marker", stack: "'Permanent Marker', cursive", weights: [400], width: 0.95 },
  { id: "shadows-into-light", label: "Shadows Into Light", category: "Handwriting", google: "Shadows+Into+Light", stack: "'Shadows Into Light', cursive", weights: [400], width: 0.9 },
  // Mono
  { id: "space-mono", label: "Space Mono", category: "Mono", google: "Space+Mono:wght@400;700", stack: "'Space Mono', monospace", weights: [400, 700], width: 1.1 },
  { id: "jetbrains-mono", label: "JetBrains Mono", category: "Mono", google: "JetBrains+Mono:wght@400;700", stack: "'JetBrains Mono', monospace", weights: [400, 700], width: 1.1 },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", category: "Mono", google: "IBM+Plex+Mono:wght@400;700", stack: "'IBM Plex Mono', monospace", weights: [400, 700], width: 1.1 },
];

export const FONT_IDS = FONT_CATALOG.map((f) => f.id);
export const FONT_CATEGORIES: FontCategory[] = ["Sans", "Serif", "Display", "Handwriting", "Mono"];
export const FONT_MAP = new Map(FONT_CATALOG.map((f) => [f.id, f]));
export const DEFAULT_FONT = "noto-sans";
/** Bold text runs a touch wider than the regular cut. */
export const BOLD_WIDTH_FACTOR = 1.04;

export function getFont(id: string | undefined): FontDef {
  return (id && FONT_MAP.get(id)) || FONT_MAP.get(DEFAULT_FONT)!;
}

export function fontWeights(id: string | undefined): number[] {
  return getFont(id).weights;
}

/** CSS href that loads every catalog family from Google Fonts. */
export function googleFontsHref(): string {
  return `https://fonts.googleapis.com/css2?${FONT_CATALOG.map((f) => `family=${f.google}`).join("&")}&display=swap`;
}
