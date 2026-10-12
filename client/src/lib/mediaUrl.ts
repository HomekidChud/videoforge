import { useCallback, useEffect, useState } from "react";
import { loadStoredKey } from "@/lib/apiKey";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const SHORT_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches server
const RENEW_AT_MS = 10 * 60 * 1000; // renew when <10 min left

type TokenEntry = { token: string; expiresAt: number };

// In-memory cache of resource-scoped media tokens for this tab.
const tokenCache = new Map<string, TokenEntry>();

function authHeaders(): Record<string, string> {
  const key = loadStoredKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Fetch (or reuse) a scoped media token for one resource. */
export async function fetchMediaToken(resourceId: string): Promise<TokenEntry | null> {
  const cached = tokenCache.get(resourceId);
  const now = Date.now();
  if (cached && cached.expiresAt - now > RENEW_AT_MS) return cached;

  try {
    const res = await fetch(
      `${API_BASE}/api/auth/media-token/${encodeURIComponent(resourceId)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const entry = { token: json.token as string, expiresAt: json.expiresAt as number };
    tokenCache.set(resourceId, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Drop all cached media tokens (e.g. on sign-in / sign-out / key change). */
export function invalidateMediaTokens(): void {
  tokenCache.clear();
}

/**
 * Hook that gives you a function to build fully-qualified, signed URLs for a
 * specific media resource. The returned function is resource-aware:
 *
 *   const mediaUrl = useAuthedMediaUrl();
 *   mediaUrl("abc123", "/api/media/abc123/thumb");
 *   // → "https://api…/api/media/abc123/thumb?st=<token-for-abc123>"
 *
 * The function caches tokens per-resource, re-fetches when expired, and
 * returns "" until a token is available so callers can gate rendering and
 * avoid requests that would 401 and hide <img> permanently.
 */
export function useAuthedMediaUrl(): (resourceId: string, url: string) => string {
  // tracks which resources we've fetched tokens for this render
  const [version, setVersion] = useState(0);

  // Re-render when the API key changes (sign-in / sign-out / other tab)
  useEffect(() => {
    const onChange = () => {
      invalidateMediaTokens();
      setVersion((v) => v + 1);
    };
    window.addEventListener("vf-key-change", onChange);
    return () => window.removeEventListener("vf-key-change", onChange);
  }, []);

  return useCallback(
    (resourceId: string, url: string) => {
      // kick off token fetch if missing or stale — re-render will follow
      const cached = tokenCache.get(resourceId);
      const now = Date.now();
      const needsFetch = !cached || cached.expiresAt - now <= RENEW_AT_MS;
      if (needsFetch) {
        // fire-and-forget; on resolution we bump version to re-render
        fetchMediaToken(resourceId).then(() => setVersion((v) => v + 1));
        if (!cached) return ""; // no token yet — don't issue a request that 401s
      }
      const entry = tokenCache.get(resourceId);
      if (!entry) return "";
      const joiner = url.includes("?") ? "&" : "?";
      return `${API_BASE}${url}${joiner}st=${encodeURIComponent(entry.token)}`;
    },
    [version],
  );
}
