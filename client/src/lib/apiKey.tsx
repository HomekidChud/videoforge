import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// NOTE: intentionally NOT importing queryClient to avoid a circular import.
// Sign-in / sign-out callers should clear the query cache explicitly.
let onKeyChange: (() => void) | null = null;
export function setKeyChangeNotifier(fn: (() => void) | null) {
  onKeyChange = fn;
}

// ---------------------------------------------------------------------------
// API key storage. Key is kept in localStorage and exposed via a React
// context so all fetches can attach it as a Bearer token.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vf_api_key";

export function loadStoredKey(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeKey(key: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* localStorage unavailable — key only lives for this session */
  }
}

export function clearStoredKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type ApiKeyCtx = {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
};

const ApiKeyContext = createContext<ApiKeyCtx | null>(null);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => loadStoredKey());

  useEffect(() => {
    // keep listeners in sync if the key changes elsewhere (e.g. another tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setApiKeyState(loadStoredKey());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setApiKey = useCallback((key: string) => {
    storeKey(key);
    setApiKeyState(key);
    onKeyChange?.();
  }, []);

  const clearApiKey = useCallback(() => {
    clearStoredKey();
    setApiKeyState(null);
    onKeyChange?.();
  }, []);

  const value = useMemo(() => ({ apiKey, setApiKey, clearApiKey }), [apiKey, setApiKey, clearApiKey]);

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

export function useApiKey(): ApiKeyCtx {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used inside <ApiKeyProvider>");
  return ctx;
}
