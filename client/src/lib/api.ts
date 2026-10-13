import { loadStoredKey } from "@/lib/apiKey";
import { API_BASE } from "@/lib/client-env";

export { API_BASE };

/** Authenticated JSON request; errors carry the server's human-readable message. */
export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const key = loadStoredKey();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}
