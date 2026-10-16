// ============================================================================
// Localization: every palette block and group has a Spanish label and
// description, search matches either language, and the language pick is
// remembered.
//
// Run:
//   npx tsx test/block-i18n.spec.ts
// ============================================================================

import {
  ES, LANG_STORAGE_KEY, detectLang, loadLang, saveLang,
  trLabel, trDescription, trGroup, trHeading, matchesSearch, i18nCoverage,
} from "../shared/block-i18n";
import { BLOCK_LIBRARY, BLOCK_GROUPS } from "../shared/custom-tools";

let checks = 0;
function check(label: string, fn: () => void) { fn(); checks++; console.log(`✓ ${label}`); }

check("every visible block is translated", () => {
  const { missing, stale } = i18nCoverage();
  if (missing.length) throw new Error(`blocks without Spanish: ${missing.join(", ")}`);
  if (stale.length) throw new Error(`translations for blocks that no longer exist: ${stale.join(", ")}`);
});

check("every palette group is translated", () => {
  for (const g of BLOCK_GROUPS) {
    if (ES.groups[g] === undefined) throw new Error(`group without Spanish: ${g}`);
  }
  // “Clips” is happily the same word in both languages.
});

check("Spanish labels and descriptions are non-empty and real Spanish", () => {
  const title = BLOCK_LIBRARY.find((b) => b.id === "add-title")!;
  if (trLabel("es", title) !== "Añadir título") throw new Error("add-title should translate");
  if (trDescription("es", title) === title.description) throw new Error("descriptions should differ in Spanish");
  if (!/ñ|[áéíóú]/.test(trLabel("es", title))) throw new Error("expected Spanish characters");
});

check("English is untouched and unknown ids fall back", () => {
  const title = BLOCK_LIBRARY.find((b) => b.id === "add-title")!;
  if (trLabel("en", title) !== title.label) throw new Error("English must be the source");
  if (trLabel("es", { id: "does-not-exist", label: "Fallback" }) !== "Fallback") throw new Error("missing ids fall back to English");
});

check("search matches either language from either language", () => {
  const title = BLOCK_LIBRARY.find((b) => b.id === "add-title")!;
  if (!matchesSearch("en", title, "title")) throw new Error("English search should find it");
  if (!matchesSearch("en", title, "título")) throw new Error("Spanish words should find it even in English mode");
  if (!matchesSearch("es", title, "title")) throw new Error("English words should find it even in Spanish mode");
  if (matchesSearch("en", title, "zzzz")) throw new Error("random text should not match");
});

check("palette headings and groups translate", () => {
  if (trGroup("es", "Create") !== "Crear") throw new Error("Create → Crear");
  if (trHeading("es", "Create") !== "Bloques de Crear") throw new Error("heading should be Spanish");
  if (trHeading("en", "Create") !== "Create blocks") throw new Error("English heading");
});

check("the language choice is remembered", () => {
  const store: Record<string, string> = {};
  const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  saveLang("es", storage);
  if (store[LANG_STORAGE_KEY] !== "es") throw new Error("the choice should be saved");
  if (loadLang(storage) !== "es") throw new Error("the saved choice should win");
  saveLang("en", storage);
  if (loadLang(storage) !== "en") throw new Error("switching back should stick");
});

check("no navigator means English (tests, server)", () => {
  if (detectLang() !== "en") throw new Error("detectLang should be safe without a browser");
});

console.log(`block-i18n.spec: ${checks} checks passed`);
