import { useEffect, useRef, useState } from "react";
import { KeyRound, ArrowRight, ShieldCheck, Server, Terminal } from "lucide-react";
import { useApiKey } from "@/lib/apiKey";
import { ForgeLogo, ErrorBox } from "@/components/forge-shell";
import { API_BASE } from "@/lib/api";

export default function ApiKeyPage() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${trimmed}` } });
      if (!res.ok) {
        let message = res.statusText;
        try { message = (await res.json()).message || message; } catch { /* ignore */ }
        throw new Error(message);
      }
      setApiKey(trimmed);
      window.location.hash = "#/";
    } catch (err) {
      setError(err instanceof TypeError ? "Can’t reach the VideoForge server. Check your connection or server address." : err instanceof Error ? err.message : "Could not verify this key.");
    } finally { setSubmitting(false); }
  }

  return <div className="forge-app auth-page">
    <header className="share-head"><ForgeLogo/><a className="ghost-link" href="#/api-docs">API reference</a></header>
    <main className="auth-grid">
      <section className="auth-copy"><div className="eyebrow">VIDEO PRODUCTION, PROGRAMMABLE</div><h1>Cut, compose and render — from the browser or your code.</h1><p>One workspace for a full timeline editor and an API with scoped, revocable keys. Share finished videos publicly while keeping footage and credentials private.</p>
        <ul className="feature-list"><li><ShieldCheck size={18}/> Scoped keys with expiry, project limits and rate limits</li><li><Terminal size={18}/> The editor uses the same API you do</li><li><Server size={18}/> Self-hosted — your footage stays on your server</li></ul></section>
      <section className="auth-card"><div className="card-icon"><KeyRound size={22}/></div><h2>Sign in with an API key</h2><p className="muted">Paste a key to open your workspace. The owner key is printed on first server start (or set with <span className="mono">VIDEOFORGE_BOOTSTRAP_KEY</span>) and can generate more from the Developer platform.</p>
        <form onSubmit={submit}><label className="field">API key<input ref={inputRef} type="password" autoComplete="current-password" placeholder="vf_live_… or vf_admin_…" className="mono" value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="input-api-key"/></label>
          <ErrorBox message={error}/>
          <button className="primary-btn full" type="submit" disabled={!draft.trim() || submitting} data-testid="button-sign-in">{submitting ? "Verifying…" : <>Open workspace <ArrowRight size={16}/></>}</button></form>
        {apiKey && <button onClick={clearApiKey} className="ghost-link" data-testid="button-sign-out">Forget the saved key on this device</button>}
        <p className="help-text">Need access? Ask your workspace admin to generate a key for you.</p></section>
    </main></div>;
}
