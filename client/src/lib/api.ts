import { loadStoredKey } from "@/lib/apiKey";
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Authenticated JSON request; errors carry the server's human-readable message. */
export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const key = loadStoredKey();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try { message = JSON.parse(text).message || message; } catch { /* plain text */ }
    throw new Error(message);
  }
  return res.json();
}
