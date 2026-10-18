// -------------------------------------------------------------------------------
// UI language strings. English is the canonical key set; every other language
// must cover it fully (enforced by the type below) so a missing string can
// never render as a raw key. The block studio shares the same storage key, so
// one selector drives both.
// -------------------------------------------------------------------------------

import { LANG_STORAGE_KEY, detectLang, saveLang, type BlockLang } from "./block-i18n";

export type UILang = BlockLang;

export const UI_LANGS: Array<{ id: UILang; native: string; english: string }> = [
  { id: "en", native: "English", english: "English" },
  { id: "es", native: "Español", english: "Spanish" },
];

const en = {
  "panel.media": "Media",
  "panel.effects": "Effects",
  "panel.graphics": "Graphics",
  "panel.blocks": "Blocks",
  "panel.tools": "Tools",
  "panel.projects": "Projects",
  "btn.addTitle": "Add title",
  "btn.project": "Project",
  "btn.export": "Export",
  "btn.search": "Search commands",
  "btn.split": "Split",
  "btn.play": "Play",
  "btn.pause": "Pause",
  "save.empty": "Not saved yet",
  "save.saved": "All changes saved",
  "save.dirty": "Unsaved changes",
  "save.saving": "Saving…",
  "save.error": "Save failed",
  "save.readonly": "Read-only key",
  "transport.start": "Jump to start",
  "transport.end": "Jump to end",
  "monitor.program": "Program",
  "monitor.hint": "Click an object to select · Shift to multi-select",
  "monitor.animateHint": "Animate the selected clip below",
  "sequence": "Sequence",
  "sequence.selected": "selected",
  "sequence.shortcuts": "S split · M marker · Space play",
  "library.import": "Import media",
  "library.importHint": "Video, audio or images. You can also drop files anywhere.",
  "library.new": "New project",
  "library.noMedia": "No media yet",
  "library.noMediaHint": "Import footage to start building your timeline.",
  "library.noProjects": "No saved projects",
  "library.noProjectsHint": "Projects save automatically as you edit.",
  "library.clips": "clips",
  "preview.empty": "Import media or add a title to begin.",
  "export.title": "Export video",
  "export.resolution": "Resolution",
  "export.quality": "Quality",
  "export.qualityHigh": "High",
  "export.qualityStandard": "Standard",
  "export.qualityDraft": "Draft",
  "export.fps": "Frame rate",
  "export.fpsProject": "Project",
  "export.audio": "Include audio",
  "export.output": "Output",
  "export.start": "Start export",
  "export.starting": "Starting…",
  "export.download": "Download MP4",
  "export.rendering": "Rendering",
  "export.queued": "Queued…",
  "export.preparing": "Preparing preview…",
  "export.failed": "Export failed",
  "drafts.title": "Local drafts",
  "drafts.clear": "Clear all drafts",
  "drafts.none": "No local drafts",
  "language": "Language",
};

export type UIStringKey = keyof typeof en;

const es: Record<UIStringKey, string> = {
  "panel.media": "Medios",
  "panel.effects": "Efectos",
  "panel.graphics": "Gráficos",
  "panel.blocks": "Bloques",
  "panel.tools": "Herramientas",
  "panel.projects": "Proyectos",
  "btn.addTitle": "Añadir título",
  "btn.project": "Proyecto",
  "btn.export": "Exportar",
  "btn.search": "Buscar comandos",
  "btn.split": "Dividir",
  "btn.play": "Reproducir",
  "btn.pause": "Pausar",
  "save.empty": "Sin guardar",
  "save.saved": "Cambios guardados",
  "save.dirty": "Cambios sin guardar",
  "save.saving": "Guardando…",
  "save.error": "Error al guardar",
  "save.readonly": "Clave de solo lectura",
  "transport.start": "Ir al inicio",
  "transport.end": "Ir al final",
  "monitor.program": "Programa",
  "monitor.hint": "Haz clic en un objeto para seleccionarlo · Mayús para selección múltiple",
  "monitor.animateHint": "Anima el clip seleccionado abajo",
  "sequence": "Secuencia",
  "sequence.selected": "seleccionados",
  "sequence.shortcuts": "S dividir · M marcador · Espacio reproducir",
  "library.import": "Importar medios",
  "library.importHint": "Vídeo, audio o imágenes. También puedes soltar archivos aquí.",
  "library.new": "Nuevo proyecto",
  "library.noMedia": "Aún no hay medios",
  "library.noMediaHint": "Importa material para empezar tu línea de tiempo.",
  "library.noProjects": "No hay proyectos guardados",
  "library.noProjectsHint": "Los proyectos se guardan automáticamente al editar.",
  "library.clips": "clips",
  "preview.empty": "Importa medios o añade un título para empezar.",
  "export.title": "Exportar vídeo",
  "export.resolution": "Resolución",
  "export.quality": "Calidad",
  "export.qualityHigh": "Alta",
  "export.qualityStandard": "Estándar",
  "export.qualityDraft": "Borrador",
  "export.fps": "Fotogramas por segundo",
  "export.fpsProject": "Del proyecto",
  "export.audio": "Incluir audio",
  "export.output": "Salida",
  "export.start": "Iniciar exportación",
  "export.starting": "Iniciando…",
  "export.download": "Descargar MP4",
  "export.rendering": "Renderizando",
  "export.queued": "En cola…",
  "export.preparing": "Preparando vista previa…",
  "export.failed": "Error de exportación",
  "drafts.title": "Borradores locales",
  "drafts.clear": "Borrar todos los borradores",
  "drafts.none": "No hay borradores locales",
  "language": "Idioma",
};

export const UI_STRINGS: Record<UILang, Record<UIStringKey, string>> = { en, es };

export function tUI(lang: UILang, key: UIStringKey): string {
  return UI_STRINGS[lang][key] ?? en[key];
}

// If storage is unavailable (sandboxed iframe, privacy mode) the last choice is
// kept in memory so the session still switches languages.
let lastKnownLang: UILang | null = null;

/** Reads the language the user picked (the key the block studio also follows). */
export function loadUILang(storage: { getItem(k: string): string | null }): UILang {
  try {
    const saved = storage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "es") { lastKnownLang = saved; return saved; }
  } catch { /* storage unavailable */ }
  if (lastKnownLang) return lastKnownLang;
  return detectLang();
}

export function rememberUILang(lang: UILang): void {
  lastKnownLang = lang;
}

export function saveUILang(lang: UILang, storage: { setItem(k: string, v: string): void }): void {
  saveLang(lang, storage);
}

export const UI_LANG_STORAGE_KEY = LANG_STORAGE_KEY;
