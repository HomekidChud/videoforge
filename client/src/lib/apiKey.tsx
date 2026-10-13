import { createContext, useCallback, useContext, useMemo, useState } from "react";

// NOTE: intentionally NOT importing queryClient to avoid a circular import.
// Sign-in / sign-out callers should clear the query cache explicitly.
let onKeyChange: (() => void) | null = null;
export function setKeyChangeNotifier(fn: (() => void) | null) {
  onKeyChange = fn;
}

/**
 * Fires whenever the session API key changes so caches can be invalidated.
 */
function notifyKeyChange() {
  onKeyChange?.();
  window.dispatchEvent(new CustomEvent("vf-key-change"));
}

// ---------------------------------------------------------------------------
// Key is held in memory and exposed via React context. Never persist credentials
// in browser storage; a page reload requires signing in again.
// ---------------------------------------------------------------------------

let sessionKey: string | null = null;

export function loadStoredKey(): string | null {
  return sessionKey;
}

export function storeKey(key: string): void {
  sessionKey = key;
}

export function clearStoredKey(): void {
  sessionKey = null;
}

type ApiKeyCtx = {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
};

const ApiKeyContext = createContext<ApiKeyCtx | null>(null);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => loadStoredKey());

  const setApiKey = useCallback((key: string) => {
    storeKey(key);
    setApiKeyState(key);
    notifyKeyChange();
  }, []);

  const clearApiKey = useCallback(() => {
    clearStoredKey();
    setApiKeyState(null);
    notifyKeyChange();
  }, []);

  const value = useMemo(() => ({ apiKey, setApiKey, clearApiKey }), [apiKey, setApiKey, clearApiKey]);

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

export function useApiKey(): ApiKeyCtx {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used inside <ApiKeyProvider>");
  return ctx;
}
