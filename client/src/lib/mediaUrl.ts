import { useCallback, useEffect, useRef, useState } from "react";
import { loadStoredKey } from "@/lib/apiKey";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const SHORT_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches server
const RENEW_AT_MS = 10 * 60 * 1000; // renew when <10 min left
const RETRY_MS = 30 * 1000; // bounded failure retry

type TokenEntry = { token: string; expiresAt: number; issuedAt: number };

// In-memory cache of resource-scoped media tokens for this tab.
const tokenCache = new Map<string, TokenEntry>();
// In-flight requests, so multiple consumers don't fire duplicates.
const inflight = new Map<string, Promise<TokenEntry | null>>();
// Last time we retried a failed fetch, to bound retry loops.
const lastAttempt = new Map<string, number>();

function authHeaders(): Record<string, string> {
  const key = loadStoredKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Invalidate cached tokens (sign-in / sign-out / key change). */
export function invalidateMediaTokens(): void {
  tokenCache.clear();
  inflight.clear();
  lastAttempt.clear();
}

/** Fetch (or reuse) a scoped media token for one resource, deduplicated. */
export async function fetchMediaToken(resourceId: string): Promise<TokenEntry | null> {
  const cached = tokenCache.get(resourceId);
  if (cached && cached.expiresAt - Date.now() > RENEW_AT_MS) return cached;

  const existing = inflight.get(resourceId);
  if (existing) return existing;

  // Bound retries: don't re-attempt more than once per RETRY_MS on failure.
  const last = lastAttempt.get(resourceId) ?? 0;
  if (Date.now() - last < RETRY_MS) return null;
  lastAttempt.set(resourceId, Date.now());

  const p = fetch(
    `${API_BASE}/api/auth/media-token/${encodeURIComponent(resourceId)}`,
    { headers: authHeaders() },
  )
    .then(async (res) => {
      if (!res.ok) return null;
      const json = await res.json();
      const entry: TokenEntry = {
        token: json.token as string,
        expiresAt: json.expiresAt as number,
        issuedAt: Date.now(),
      };
      tokenCache.set(resourceId, entry);
      return entry;
    })
    .catch(() => null)
    .finally(() => inflight.delete(resourceId));

  inflight.set(resourceId, p);
  return p;
}

/**
 * Hook that returns a PURE function to build fully-qualified, signed URLs for a
 * specific media resource. Token fetching and renewal happen in effects (via
 * useMediaTokenLifecycle), never inside the URL builder during render.
 *
 *   const mediaUrl = useAuthedMediaUrl();
 *   mediaUrl("abc123", "/api/media/abc123/thumb");
 *
 * The builder reads only from cache and returns "" when no token is available,
 * so callers can gate rendering and avoid requests that would 401.
 */
export function useAuthedMediaUrl(): (resourceId: string, url: string) => string {
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((v) => v + 1);
    window.addEventListener("vf-key-change", onChange);
    window.addEventListener("vf-token-update", onChange);
    return () => {
      window.removeEventListener("vf-key-change", onChange);
      window.removeEventListener("vf-token-update", onChange);
    };
  }, []);

  return useCallback((resourceId: string, url: string) => {
    const entry = tokenCache.get(resourceId);
    if (!entry) return "";
    const joiner = url.includes("?") ? "&" : "?";
    return `${API_BASE}${url}${joiner}st=${encodeURIComponent(entry.token)}`;
  }, []);
}

/**
 * Component/hook-level lifecycle: register the resources currently displayed
 * so tokens are fetched and renewed proactively via effects (not during render).
 *
 *   useMediaTokenLifecycle(["asset1", "asset2", renderJobId]);
 *
 * Also renews before expiry and cleans up on unmount / key change.
 */
export function useMediaTokenLifecycle(resourceIds: (string | null | undefined)[]): void {
  // join the ids and drop nulls; recompute when the caller's ids change
  const idsKey = resourceIds.filter(Boolean).join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function loadAll() {
      for (const id of ids) {
        if (cancelled) return;
        const e = await fetchMediaToken(id);
        if (e && !cancelled) window.dispatchEvent(new CustomEvent("vf-token-update"));
        // schedule renewal if we got a token
        if (e) {
          const msLeft = e.expiresAt - Date.now();
          if (msLeft > RENEW_AT_MS) {
            timers.push(setTimeout(() => {
              fetchMediaToken(id).then(() =>
                window.dispatchEvent(new CustomEvent("vf-token-update")),
              );
            }, msLeft - RENEW_AT_MS));
          }
        }
      }
    }

    loadAll();

    const onKeyChange = () => {
      // tokens become invalid — clear and let consumers re-fetch on next effect
      invalidateMediaTokens();
    };
    window.addEventListener("vf-key-change", onKeyChange);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("vf-key-change", onKeyChange);
    };
  }, [idsKey]);
}
