// ----------------------------------------------------------------------------
// One reactive UI language for the whole Studio: the chrome (top bar,
// transport, panels, export menu) and the Blocks studio switch together.
// It reuses the storage key the block studio always used (vf.lang.v1), so an
// existing saved choice keeps working, and English is always the fallback.
// ----------------------------------------------------------------------------

import { useCallback, useSyncExternalStore } from "react";
import { detectLang, loadLang, type BlockLang } from "@shared/block-i18n";

/** Spanish translations for the Studio chrome. The English text is written
 *  inline at each call site, so a missing key here simply falls back to it. */
const ES: Record<string, string> = {
  // studio bar
  "bar.search": "Buscar comandos",
  "bar.undo": "Deshacer",
  "bar.redo": "Rehacer",
  "bar.addTitle": "Añadir título",
  "bar.addTitleFull": "Añadir título",
  "bar.titleStyles": "Estilos de título",
  "bar.project": "Proyecto",
  "bar.projectSettings": "Ajustes del proyecto y compartir",
  "bar.export": "Exportar",
  "bar.language": "Idioma / Language",
  "save.empty": "Sin guardar",
  "save.saved": "Todos los cambios guardados",
  "save.dirty": "Cambios sin guardar",
  "save.saving": "Guardando…",
  "save.error": "Fallo al guardar",
  "save.readonly": "Clave de solo lectura",
  "save.retry": "Reintentar",
  // export menu
  "export.video": "Exportar vídeo",
  "export.quality": "Calidad",
  "export.quality.draft": "Borrador",
  "export.quality.draft.hint": "La más rápida, menor detalle",
  "export.quality.standard": "Estándar",
  "export.quality.standard.hint": "Equilibrada",
  "export.quality.high": "Alta",
  "export.quality.high.hint": "Más detalle, más lenta",
  "export.resolution": "Resolución",
  "export.resolution.project": "Del proyecto",
  "export.start": "Iniciar exportación",
  "export.download": "Descargar MP4",
  "export.preparing": "Preparando la vista previa…",
  "export.rendering": "Renderizando {pct}%",
  "export.queued": "En cola…",
  "export.failed": "Error de exportación: {error}",
  "export.saveFailed": "No se pudo guardar el proyecto. Arregla el error antes de exportar.",
  "export.needClip": "Añade al menos un clip antes de exportar.",
  // transport
  "transport.start": "Ir al inicio",
  "transport.end": "Ir al final",
  "transport.play": "Reproducir",
  "transport.pause": "Pausar",
  "transport.split": "Dividir",
  "transport.splitTitle": "Dividir en el cursor (S)",
  // panels
  "panel.media": "Medios",
  "panel.effects": "Efectos",
  "panel.graphics": "Gráficos",
  "panel.blocks": "Bloques",
  "panel.tools": "Herramientas",
  "panel.projects": "Proyectos",
  "panel.media.hint": "Vídeo, música e imágenes para este proyecto.",
  "panel.effects.hint": "Arrastra sobre un clip o haz clic para aplicar.",
  "panel.graphics.hint": "Títulos, formas y composiciones listas.",
  "panel.blocks.hint": "Crea ediciones repetibles con bloques.",
  "panel.tools.hint": "Ejecuta scripts sobre la línea de tiempo.",
  "panel.projects.hint": "Todo lo que has guardado.",
  "media.import": "Importar medios",
  "media.importHint": "Vídeo, audio o imágenes. También puedes soltar archivos en cualquier parte.",
  "media.uploading": "Subiendo {pct}%",
  "media.empty": "Todavía no hay medios",
  "media.emptyHint": "Importa material para empezar a montar tu línea de tiempo.",
  "media.addToTimeline": "Añadir {name} a la línea de tiempo",
  "projects.new": "Nuevo proyecto",
  "projects.empty": "No hay proyectos guardados",
  "projects.emptyHint": "Los proyectos se guardan automáticamente al editar.",
  // timeline
  "timeline.sequence": "Secuencia",
  "timeline.clips": "clips",
  "timeline.selected": "seleccionados",
  "timeline.hintKeys": "S dividir · M marcador · Espacio reproducir",
  "timeline.zoom": "Zoom",
  "timeline.addMarker": "Añadir marcador en el cursor",
  "timeline.fit": "Ajustar línea de tiempo",
  "timeline.fitTitle": "Ajustar la línea de tiempo a la ventana",
  "lane.overlay": "Títulos y capas",
  "lane.video": "Vídeo",
  "lane.audio": "Audio",
  "lane.overlay.hint": "Añade títulos o suelta clips picture-in-picture",
  "lane.video.hint": "Suelta vídeo o imágenes aquí",
  "lane.audio.hint": "Suelta música o locución aquí",
  "monitor.program": "Programa",
  "monitor.hint": "Haz clic en un objeto para seleccionarlo · Mayús para multiselección",
  "monitor.animateHint": "Anima el clip seleccionado aquí abajo",
  // preview empty state
  "preview.emptyTitle": "Tu próxima historia empieza aquí.",
  "preview.emptyHint": "Importa medios o añade un título para empezar.",
  // tools menu
  "tools.title": "Herramientas",
  "tools.animator": "Animador",
  "tools.composition": "Composición JSON",
  "tools.snapping": "Ajuste magnético: {state}",
  "tools.snapping.on": "sí",
  "tools.snapping.off": "no",
  "tools.stagger": "Escalonar selección",
  "tools.layout": "Distribución",
  "tools.library.show": "Mostrar biblioteca",
  "tools.library.hide": "Ocultar biblioteca",
  "tools.inspector.show": "Mostrar inspector",
  "tools.inspector.hide": "Ocultar inspector",
  "tools.resetLayout": "Restablecer distribución",
  "tools.mode.simple": "Cambiar a modo Simple",
  "tools.mode.advanced": "Cambiar a modo Avanzado",
  "tools.help": "Ayuda",
  "tools.shortcuts": "Atajos de teclado",
  "tools.tour": "Visita del estudio",
  "tools.docs": "Documentación",
  "tools.platform": "Plataforma para desarrolladores",
  "tools.live": "Monitor en vivo",
  "tools.drafts": "Borradores locales",
  // workspace presets
  "preset.edit": "Editar",
  "preset.animate": "Animar",
  "preset.graphics": "Gráficos",
  "preset.audio": "Audio",
  "preset.blocks": "Bloques",
  // language command
  "lang.switchToEs": "Cambiar a Español",
  "lang.switchToEn": "Switch to English",
};

/** The current language, as a plain value (for non-React call sites). */
export function studioT(lang: BlockLang, key: string, english: string): string {
  return lang === "es" ? ES[key] ?? english : english;
}

const listeners = new Set<() => void>();
// Restore the saved choice first (vf.lang.v1), then fall back to the browser language.
let current: BlockLang = loadLang(typeof window === "undefined" ? { getItem: () => null } : window.localStorage);

const store = {
  get: () => current,
  set: (lang: BlockLang) => {
    if (lang === current) return;
    current = lang;
    try { window.localStorage.setItem("vf.lang.v1", lang); } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
};

/** The shared language and its setter. Blocks and the Studio chrome use the
 *  same store, so one selector moves both. */
export function useLang(): [BlockLang, (lang: BlockLang) => void] {
  const lang = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [lang, store.set];
}

/** A translate function for React components: t("key", "English text"). */
export function useT(): (key: string, english: string) => string {
  const [lang] = useLang();
  return useCallback((key: string, english: string) => studioT(lang, key, english), [lang]);
}
