import { useCallback, useEffect, useState } from "react";
import { loadUILang, rememberUILang, saveUILang, tUI, type UILang, type UIStringKey } from "@shared/ui-i18n";

/** One selector drives the whole Studio: dispatching this event updates every
 *  mounted useUILang() (and the block studio follows the same storage key). */
export const LANG_CHANGE_EVENT = "vf-lang-change";

/** localStorage can be missing or throw (sandboxed iframes, privacy modes), so
 *  every access goes through this guarded shim. */
export const safeLocalStorage = {
  getItem(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
  setItem(k: string, v: string): void { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  removeItem(k: string): void { try { window.localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export function useUILang() {
  const [lang, setLangState] = useState<UILang>(() => loadUILang(safeLocalStorage));
  useEffect(() => {
    const h = () => setLangState(loadUILang(safeLocalStorage));
    window.addEventListener(LANG_CHANGE_EVENT, h);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, h);
  }, []);
  const setLang = useCallback((l: UILang) => {
    rememberUILang(l); // keeps the session's choice even when storage is unavailable
    saveUILang(l, safeLocalStorage);
    document.documentElement.lang = l;
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT));
  }, []);
  const t = useCallback((key: UIStringKey) => tUI(lang, key), [lang]);
  return { lang, setLang, t };
}
