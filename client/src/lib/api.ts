import { loadStoredKey } from "@/lib/apiKey";
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Authenticated JSON request; errors carry the server's human-readable message. */
export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const key = loadStoredKey();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    // cookies ride along when the API is on another origin (they always do same-origin)
    credentials: "include",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try { message = JSON.parse(text).message || message; } catch { /* plain text */ }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json();
}

/** Trade an agent key for an HttpOnly cookie so a refresh keeps the tab signed in. The key itself stays out of
 *  browser storage. Best effort: if it fails (cookies blocked, server older than this feature) the key still
 *  works from memory for this page session. Other kinds of key are left alone. */
export async function startAgentSession(key: string): Promise<boolean> {
  if (!key.startsWith("vf_agent.")) return false;
  try {
    const res = await fetch(`${API_BASE}/api/agent/session`, { method: "POST", credentials: "include", headers: { Authorization: `Bearer ${key}` } });
    return res.ok;
  } catch { return false; }
}

/** End any server session (account or agent cookie). Never throws. */
export async function endServerSession(): Promise<void> {
  try { await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch { /* already gone */ }
}
