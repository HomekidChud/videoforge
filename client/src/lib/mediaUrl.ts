import { useCallback, useEffect, useState } from "react";
import { loadStoredKey } from "@/lib/apiKey";

const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
const API_BASE = (env.VITE_API_BASE ?? "").replace(/\/$/, "");
const SHORT_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches server
const RENEW_AT_MS = 10 * 60 * 1000; // renew when <10 min left
const RETRY_MS = 30 * 1000; // bounded failure retry

type TokenEntry = { token: string; expiresAt: number; issuedAt: number };

// In-memory cache of resource-scoped media tokens for this tab.
const tokenCache = new Map<string, TokenEntry>();
// In-flight requests, so multiple consumers don't fire duplicates.
const inflight = new Map<string, Promise<TokenEntry | null>>;
// Last time we retried a failed fetch, to bound retry loops.
const lastAttempt = new Map<string, number>();
// Credential generation, bumped on every key change so stale in-flight
// requests from before a sign-out can't repopulate the cache.
let credentialGeneration = 0;

function authHeaders(): Record<string, string> {
  const key = loadStoredKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Invalidate cached tokens (sign-in / sign-out / key change). */
export function invalidateMediaTokens(): void {
  credentialGeneration += 1;
  tokenCache.clear();
  inflight.clear();
  lastAttempt.clear();
}

/**
 * Fetch (or reuse) a scoped media token for one resource, deduplicated.
 * Captures the current credential generation so a request that started before
 * a key change never writes into the (cleared) cache.
 */
export async function fetchMediaToken(resourceId: string): Promise<TokenEntry | null> {
  const cached = tokenCache.get(resourceId);
  if (cached && cached.expiresAt - Date.now() > RENEW_AT_MS) return cached;

  const existing = inflight.get(resourceId);
  if (existing) return existing;

  // Bound retries: don't re-attempt more than once per RETRY_MS on failure.
  const last = lastAttempt.get(resourceId) ?? 0;
  if (Date.now() - last < RETRY_MS) return null;
  lastAttempt.set(resourceId, Date.now());

  const myGeneration = credentialGeneration;
  const p = fetch(
    `${API_BASE}/api/auth/media-token/${encodeURIComponent(resourceId)}`,
    { credentials: "include", headers: authHeaders() },
  )
    .then(async (res) => {
      if (!res.ok) return null;
      const json = await res.json();
      const entry: TokenEntry = {
        token: json.token as string,
        expiresAt: json.expiresAt as number,
        issuedAt: Date.now(),
      };
      // Only write if the credential hasn't changed since we started the request.
      if (credentialGeneration === myGeneration) {
        tokenCache.set(resourceId, entry);
      }
      return entry;
    })
    .catch(() => null)
    .finally(() => {
      // Only clear our own in-flight slot. A newer generation's request
      // would have replaced the map entry, so don't delete theirs.
      if (inflight.get(resourceId) === p) {
        inflight.delete(resourceId);
      }
    });

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
    // return "" for missing OR expired entries
    if (!entry || entry.expiresAt <= Date.now()) return "";
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
 * Renewal schedules itself recursively (each successful renewal schedules the
 * next one), failures are bounded via RETRY_MS, and the effect depends on the
 * current credential version so a key change restarts the whole lifecycle
 * (timers cleared, cache re-fetched for the new credential).
 */
export function useMediaTokenLifecycle(resourceIds: (string | null | undefined)[]): void {
  // join the ids and drop nulls; recompute when the caller's ids change
  const idsKey = resourceIds.filter(Boolean).join(",");
  // depend on the current credential generation so a key change restarts us
  const [credentialVersion, setCredentialVersion] = useState(0);

  useEffect(() => {
    const onKeyChange = () => setCredentialVersion((v) => v + 1);
    window.addEventListener("vf-key-change", onKeyChange);
    return () => window.removeEventListener("vf-key-change", onKeyChange);
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // fetch a token and schedule the NEXT renewal if we got one —
    // recursive so renewals chain until cancelled.
    async function renew(id: string, depth: number = 0) {
      if (cancelled) return;
      const MAX_DEPTH = 1000; // hard bound so a bug can't loop forever
      if (depth > MAX_DEPTH) return;
      const e = await fetchMediaToken(id);
      if (cancelled) return;
      if (e) {
        window.dispatchEvent(new CustomEvent("vf-token-update"));
        const msLeft = e.expiresAt - Date.now();
        if (msLeft > RENEW_AT_MS) {
          const t = setTimeout(() => {
            renew(id, depth + 1).catch(() => {});
          }, msLeft - RENEW_AT_MS);
          timers.push(t);
        }
      }
      // on failure: fetchMediaToken bounds its own retry via RETRY_MS, so
      // do nothing more here. The lifecycle hook re-fires on next ids/credential change
    }

    for (const id of ids) {
      renew(id).catch(() => {});
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [idsKey, credentialVersion]);
}
