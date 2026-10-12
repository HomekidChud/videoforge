import { useEffect, useRef, useState } from "react";
import { useApiKey } from "@/lib/apiKey";

// ---------------------------------------------------------------------------
// Login page. Users paste their VideoForge API key (read/write/admin).
// ---------------------------------------------------------------------------

export default function ApiKeyPage() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // focus the input on mount
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    // Validate the key by hitting a read-only endpoint.
    try {
      const res = await fetch("/api/media", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(text);
      }
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Network error — check your key and try again.");
      return;
    }

    setSubmitting(false);
    setApiKey(trimmed);
    // navigate back to the editor (hash routing)
    window.location.hash = "#/";
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">VideoForge</h1>
        <p className="text-xs text-zinc-400 mb-6">
          Paste your API key to sign in. Keys are scoped (read / write / admin) —
          see <a className="text-blue-400 underline" href="#/api-docs">API docs</a> for how to
          create one.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            placeholder="vf_live_…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            data-testid="input-api-key"
          />
          {error && (
            <p className="text-xs text-red-400" data-testid="text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!draft.trim() || submitting}
            className="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold"
            data-testid="button-sign-in"
          >
            {submitting ? "Verifying…" : "Sign in"}
          </button>
        </form>

        {apiKey && (
          <button
            onClick={clearApiKey}
            className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 underline"
            data-testid="button-sign-out"
          >
            Sign out (forget key on this device)
          </button>
        )}
      </div>
    </div>
  );
}
