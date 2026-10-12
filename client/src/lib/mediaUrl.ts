import { useEffect, useState } from "react";
import { loadStoredKey } from "@/lib/apiKey";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const SHORT_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches server
const RENEW_AT = SHORT_TTL_MS - 10 * 60 * 1000; // renew 10 min before expiry

type ShortTokenState = { token: string; expiresAt: number };

// In-memory cache shared across components in this tab.
let cached: ShortTokenState | null = null;

export async function fetchMediaToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + RENEW_AT) return cached.token;

  const key = loadStoredKey();
  if (!key) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/media-token`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    cached = { token: json.token as string, expiresAt: json.expiresAt as number };
    return cached.token;
  } catch {
    return null;
  }
}

/**
 * Returns a function that converts a relative API URL (e.g. /api/media/x/raw)
 * into a fully-qualified URL with ?st=<shortToken> so that <img>/<video> can
 * authenticate. If the token can't be fetched, returns the URL unchanged
 * (browser will get a 401 and onError handler will hide the element).
 */
export function useMediaUrl(): (url: string) => string {
  const [state, setState] = useState<ShortTokenState | null>(cached);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const t = await fetchMediaToken();
      if (cancelled || !t) return;
      if (cached) setState(cached);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (url: string) => {
    const st = state?.token;
    if (!st) return `${API_BASE}${url}`;
    const joiner = url.includes("?") ? "&" : "?";
    return `${API_BASE}${url}${joiner}st=${encodeURIComponent(st)}`;
  };
}
