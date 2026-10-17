// ----------------------------------------------------------------------------
// Localization for the block studio: Spanish labels and descriptions for every
// palette block and group, picked from the browser's language (or a saved
// choice). Block ids never change — only what kids read on screen.
// ----------------------------------------------------------------------------

import { BLOCK_LIBRARY, BLOCK_GROUPS, type FriendlyBlock } from "./custom-tools";

export type BlockLang = "en" | "es";

export const LANG_STORAGE_KEY = "vf.lang.v1";
export const LANGS: BlockLang[] = ["en", "es"];

/** The browser's language, when it is one we speak. */
export function detectLang(): BlockLang {
  try {
    const nav = (globalThis as any).navigator;
    const pref = String(nav?.languages?.[0] ?? nav?.language ?? "en").toLowerCase();
    if (pref.startsWith("es")) return "es";
  } catch { /* no navigator (tests, server) */ }
  return "en";
}

/** The saved choice wins; otherwise the browser's language. */
export function loadLang(storage: Pick<Storage, "getItem">): BlockLang {
  try {
    const saved = storage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch { /* storage unavailable */ }
  return detectLang();
}

export function saveLang(lang: BlockLang, storage: Pick<Storage, "setItem">) {
  try { storage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
}

/* Spanish translations. Keys are block ids and group names — anything missing
 * falls back to English, so a new block is never left without a label. */
export const ES: { groups: Record<string, string>; blocks: Record<string, { label: string; description: string }> } = {
  groups: {
    Create: "Crear",
    Edit: "Editar",
    Animate: "Animar",
    Rig: "Rig",
    Text: "Texto",
    Style: "Estilo",
    Clips: "Clips",
    Timing: "Tiempo",
    Stickers: "Pegatinas",
    Values: "Valores",
    Flow: "Flujo",
  },
  blocks: {
    "add-title": { label: "Añadir título", description: "Añade un clip de texto con tus palabras." },
    "add-shape": { label: "Añadir forma", description: "Añade un rectángulo, elipse o línea." },
    "save-sticker": { label: "Guardar como pegatina", description: "Convierte un clip en una pegatina que puedes reutilizar en cualquier proyecto." },
    "move": { label: "Mover", description: "Mueve un clip a una posición." },
    "grow": { label: "Crecer", description: "Agranda un clip de pequeño a su tamaño completo." },
    "spin": { label: "Girar", description: "Hace girar un clip una vuelta entera." },
    "fade-in": { label: "Aparecer suave", description: "Hace aparecer un clip suavemente." },
    "spring-in": { label: "Entrar con rebote", description: "Hace entrar un clip con rebote." },
    "bounce-in": { label: "Caer", description: "Deja caer un clip desde arriba." },
    "wobble": { label: "Bambolear", description: "Balancea un clip de lado a lado." },
    "orbit": { label: "Orbitar", description: "Flota un clip en círculo para siempre." },
    "bold-text": { label: "Texto en negrita", description: "Pone un clip de texto en Inter negrita." },
    "color-text": { label: "Color del texto", description: "Cambia el color de un clip de texto." },
    "delete-clip": { label: "Borrar clip", description: "Quita un clip de la línea de tiempo." },
    "duplicate-clip": { label: "Duplicar clip", description: "Copia un clip." },
    "stagger": { label: "Escalonar selección", description: "Reparte los clips seleccionados en el tiempo." },
    "beat-markers": { label: "Marcadores de ritmo", description: "Pone marcadores en cada beat." },
    "advanced": { label: "Operación avanzada", description: "Cualquier operación de la línea de tiempo, con campos con nombre para todo lo que necesita." },
    "edit-move": { label: "Mover", description: "Mueve un clip a otro sitio del encuadre." },
    "edit-scale": { label: "Fijar tamaño", description: "Hace un clip más grande o más pequeño (1 = tamaño normal)." },
    "edit-rotate": { label: "Rotar", description: "Gira un clip, en grados." },
    "edit-flip": { label: "Voltear", description: "Voltea un clip de arriba abajo." },
    "edit-mirror": { label: "Espejo", description: "Voltea un clip de lado a lado, como un espejo." },
    "edit-align": { label: "Alinear", description: "Alinea clips por sus bordes reales — entre ellos o con el borde del encuadre." },
    "edit-snap": { label: "Ajustar a la rejilla", description: "Redondea las posiciones a una rejilla para que queden ordenadas." },
    "edit-crop": { label: "Recortar", description: "Recorta una imagen o vídeo por los lados — como recortar una foto." },
    "edit-opacity": { label: "Transparencia", description: "Fija cuán transparente es un clip (1 = sólido, 0 = invisible)." },
    "edit-filter": { label: "Look de color", description: "Da a un clip un look: blanco y negro, antiguo, vivo y más." },
    "edit-brightness": { label: "Brillo", description: "Hace un clip más claro o más oscuro." },
    "edit-contrast": { label: "Contraste", description: "Separa más (o menos) las partes oscuras y claras." },
    "edit-saturation": { label: "Intensidad de color", description: "Sube los colores brillantes o los baja a gris." },
    "edit-blur": { label: "Desenfoque", description: "Desenfoca un clip suavemente (en píxeles)." },
    "edit-speed": { label: "Cambiar velocidad", description: "Reproduce un clip más rápido o más lento (2 = doble, 0.5 = mitad)." },
    "edit-duration": { label: "Fijar duración", description: "Fija cuánto dura un clip de texto o forma, en segundos." },
    "edit-volume": { label: "Volumen", description: "Fija el volumen de un clip (1 = volumen total)." },
    "edit-mute": { label: "Silenciar", description: "Silencia un clip sin borrarlo." },
    "edit-fade-in-sound": { label: "Subir sonido", description: "Sube el sonido de un clip desde el silencio en unos segundos." },
    "edit-fade-out-sound": { label: "Bajar sonido", description: "Baja el sonido de un clip hasta el silencio en unos segundos." },
    "edit-track": { label: "Cambiar de pista", description: "Mueve un clip a otra pista: superposición arriba, vídeo detrás, audio para el sonido." },
    "edit-front": { label: "Traer al frente", description: "Pone un clip arriba del todo de su pista." },
    "edit-back": { label: "Enviar al fondo", description: "Pone un clip abajo del todo de su pista." },
    "edit-layer-up": { label: "Subir una capa", description: "Sube un clip una capa, por encima del clip de arriba." },
    "edit-layer-down": { label: "Bajar una capa", description: "Baja un clip una capa, bajo el clip de abajo." },
    "edit-copy-offset": { label: "Copiar con desplazamiento", description: "Copia un clip y mueve la copia a un lado — ideal para sombras y filas." },
    "edit-replace-text": { label: "Cambiar palabras", description: "Cambia lo que dice un clip de texto, manteniendo su fuente, color y tamaño." },
    "motion-entrances": { label: "Mover un clip hacia dentro", description: "Anima un clip que ya tienes — fundido, deslizamiento, pop, balanceo y más." },
    "motion-exits": { label: "Mover un clip hacia fuera", description: "Anima un clip para que se vaya — deslizar fuera, fundir fuera, encoger o girar." },
    "motion-attention": { label: "Llamar la atención", description: "Sacude, late o bambolea un clip para que la gente lo mire." },
    "motion-springy": { label: "Movimiento con muelle", description: "Movimientos elásticos con rebote que se pasan y se asientan." },
    "motion-camera": { label: "Movimiento de cámara", description: "Zooms y derivas lentas sobre un clip, como una cámara en movimiento." },
    "rig-pose": { label: "Posar clips juntos", description: "Lleva varios clips a una pose a la vez — posición, tamaño, giro y transparencia — desde donde están ahora." },
    "rig-follow": { label: "Hacer que un clip siga a otro", description: "Un clip acompaña el movimiento de otro, girando y cambiando de tamaño con él, como una mano en un brazo." },
    "rig-play": { label: "Reproducir una animación del Animador", description: "Aplica a tu edición una animación que guardaste en el Animador. Escribe su nombre." },
    "animate-property": { label: "Animar una propiedad", description: "Cambia cualquier propiedad con el tiempo — posición, tamaño, giro, transparencia, color y más." },
    "slide-in-left": { label: "Entrar desde la izquierda", description: "Desliza un clip desde el borde izquierdo." },
    "slide-in-right": { label: "Entrar desde la derecha", description: "Desliza un clip desde el borde derecho." },
    "rise-up": { label: "Subir flotando", description: "Eleva un clip hasta su sitio." },
    "drop-down": { label: "Bajar cayendo", description: "Deja caer un clip hasta su sitio." },
    "zoom-in": { label: "Acercar", description: "Agranda un clip de pequeño a su tamaño completo." },
    "spin-in": { label: "Entrar girando", description: "Enrosca un clip hasta su sitio." },
    "fade-in-soft": { label: "Aparecer despacio", description: "Funde un clip durante un rato — ideal para subtítulos." },
    "fade-out-soft": { label: "Desaparecer despacio", description: "Funde un clip fuera durante un rato." },
    "draw-on": { label: "Dibujar", description: "Descubre una forma o vídeo de izquierda a derecha, como si se dibujara." },
    "pulse-glow": { label: "Brillo pulsante", description: "Hace que un clip pulse suave de claro a oscuro, para siempre." },
    "parallax": { label: "Flotación de fondo", description: "Flota un clip lento de lado a lado y arriba abajo, como una capa de fondo." },
    "typewriter": { label: "Máquina de escribir", description: "Escribe un clip de texto, letra por letra." },
    "reveal-words": { label: "Mostrar palabra a palabra", description: "Muestra un clip de texto una palabra cada vez." },
    "reveal-lines": { label: "Mostrar línea a línea", description: "Muestra un clip de texto una línea cada vez." },
    "color-cycle-text": { label: "Ciclo de colores", description: "Pasa un clip de texto por un arcoíris de colores con el tiempo." },
    "stop-text-effects": { label: "Parar efectos de texto", description: "Apaga la máquina de escribir y los efectos de color." },
    "speed-ramp": { label: "Peldaños de velocidad", description: "Cambia la velocidad de un clip con el tiempo: tramos rápidos, lentos y normales en un solo clip." },
    "freeze-frame": { label: "Congelar fotograma", description: "Pausa un clip en un fotograma y lo mantiene — como pulsar pausa." },
    "speed-up": { label: "Acelerar", description: "Reproduce un clip más rápido (2 = doble velocidad)." },
    "slow-mo": { label: "Cámara lenta", description: "Reproduce un clip a cámara lenta (0.5 = mitad de velocidad)." },
    "reverse-motion": { label: "Reproducir al revés", description: "Invierte la animación de un clip, para que se reproduzca al revés." },
    "retime-motion": { label: "Estirar movimiento", description: "Estira o comprime la animación de un clip en una nueva ventana de tiempo." },
  },
};

/** A block's label in the chosen language (English is the source of truth). */
export function trLabel(lang: BlockLang, block: Pick<FriendlyBlock, "id" | "label">): string {
  return lang === "es" ? ES.blocks[block.id]?.label ?? block.label : block.label;
}

/** A block's description in the chosen language. */
export function trDescription(lang: BlockLang, block: Pick<FriendlyBlock, "id" | "label" | "description">): string {
  return lang === "es" ? ES.blocks[block.id]?.description ?? block.description : block.description;
}

/** A palette group name in the chosen language. */
export function trGroup(lang: BlockLang, group: string): string {
  return lang === "es" ? ES.groups[group] ?? group : group;
}

/** The palette heading, e.g. “Create blocks” / “Bloques de Crear”. */
export function trHeading(lang: BlockLang, group: string): string {
  return lang === "es" ? `Bloques de ${trGroup(lang, group)}` : `${group} blocks`;
}

/** Search always matches either language, so “title” and “título” both find Add title. */
export function matchesSearch(_lang: BlockLang, block: Pick<FriendlyBlock, "id" | "label" | "description">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const en = [block.label, block.description].join(" ").toLowerCase();
  const es = [trLabel("es", block), trDescription("es", block)].join(" ").toLowerCase();
  return en.includes(q) || es.includes(q);
}

/* Studio chrome and the Flow / Values chips (they are not library blocks, so
 * they live here rather than in the block table). */
export const ES_UI: Record<string, string> = {
  "flow-repeat": "Repetir",
  "flow-times": "veces",
  "flow-each-clip": "Para cada clip",
  "flow-function": "Función",
  "flow-call": "Llamar",
  "flow-note": "Nota",
  "value-text": "Texto",
  "value-number": "Número",
  "value-yesno": "Sí / No",
  "search-blocks": "Buscar bloques…",
};

/** A studio UI string in the chosen language (English fallback inline). */
export function trUI(lang: BlockLang, key: string, english: string): string {
  return lang === "es" ? ES_UI[key] ?? english : english;
}

/** Every translated id must still exist in the library (test hook). */
export function i18nCoverage(): { missing: string[]; stale: string[] } {
  const ids = new Set(BLOCK_LIBRARY.map((b) => b.id));
  const translated = new Set(Object.keys(ES.blocks));
  const missing = Array.from(ids).filter((id) => !translated.has(id));
  const stale = Array.from(translated).filter((id) => !ids.has(id));
  return { missing, stale };
}

/** Group names for the language picker — used by tests to keep groups honest. */
export function groupsFor(lang: BlockLang): string[] {
  return BLOCK_GROUPS.map((g) => trGroup(lang, g));
}
