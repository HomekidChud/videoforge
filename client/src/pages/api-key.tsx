import { useEffect, useState } from "react";
import { KeyRound, ArrowRight, ShieldCheck, Server, Terminal, Mail, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/lib/apiKey";
import { ForgeLogo, ErrorBox } from "@/components/forge-shell";
import { API_BASE } from "@/lib/api";

type AuthConfig = { google: boolean; accountsOpen: boolean; hasAccounts: boolean };

/** The sign-in page: email + password accounts, Google when configured, and the
 *  API-key path for AI agents and scripts. Sessions are a cookie the server
 *  keeps in its database, so a restart or a refresh keeps you signed in. */
export default function ApiKeyPage() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey();
  const [tab, setTab] = useState<"email" | "key">("email");
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [form, setForm] = useState({ email: "", password: "", name: "", ownerKey: "" });
  const [keyDraft, setKeyDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configQ = useQuery<AuthConfig>({ queryKey: ["/api/auth/config"] });
  const config = configQ.data ?? { google: false, accountsOpen: false, hasAccounts: false };
  const meQ = useQuery<{ email?: string; label?: string }>({ queryKey: ["/api/auth/me"], retry: false });

  const signOut = async () => {
    try { await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch { /* already gone */ }
    clearApiKey();
    window.location.hash = "#/editor";
    window.location.reload();
  };

  useEffect(() => { if (!configQ.isLoading && configQ.data && !configQ.data.hasAccounts) setMode("create"); }, [configQ.isLoading, configQ.data]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const url = mode === "create" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "create"
        ? { email: form.email, password: form.password, name: form.name, ownerKey: form.ownerKey || undefined }
        : { email: form.email, password: form.password };
      const res = await fetch(`${API_BASE}${url}`, {
        method: "POST",
        credentials: "include", // keep the session cookie when the API is on another origin
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || res.statusText);
      // the session cookie is set, go in
      window.location.hash = "#/editor";
      window.location.reload();
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the VideoForge server. Check your connection." : err instanceof Error ? err.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function submitKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include", headers: { Authorization: `Bearer ${trimmed}` } });
      if (!res.ok) {
        let message = res.statusText;
        try { message = (await res.json()).message || message; } catch { /* ignore */ }
        throw new Error(message);
      }
      setApiKey(trimmed);
      // No reload: the key lives in memory, so a reload would sign the user out.
      // The hash router picks up the route change, and the key-change event
      // invalidates the query caches.
      window.location.hash = "#/editor";
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the VideoForge server. Check your connection." : err instanceof Error ? err.message : "Could not verify this key.");
    } finally { setBusy(false); }
  }

  const firstRun = !configQ.isLoading && configQ.data && !configQ.data.hasAccounts;

  return <div className="forge-app auth-page">
    <header className="share-head"><ForgeLogo /><a className="ghost-link" href="#/api-docs">API reference</a></header>
    <main className="auth-grid">
      <section className="auth-copy"><div className="eyebrow">VIDEO PRODUCTION, PROGRAMMABLE</div><h1>Cut, compose and render, from the browser or your code.</h1><p>One workspace for a full timeline editor and an API with scoped, revocable keys. Share finished videos publicly while keeping footage and credentials private.</p>
        <ul className="feature-list"><li><ShieldCheck size={18} /> Accounts that stay signed in across restarts</li><li><Terminal size={18} /> The editor uses the same API you do</li><li><Server size={18} /> Self-hosted, so your footage stays on your server</li></ul></section>
      <section className="auth-card">
        {meQ.data && (
          <div className="notice" style={{ marginBottom: 16 }} data-testid="already-signed-in">
            <div><b>You're already signed in{meQ.data.email ? ` as ${meQ.data.email}` : ""}.</b></div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <a className="primary-btn" href="#/editor">Go to the studio</a>
              <button className="ghost-link" onClick={signOut} data-testid="button-sign-out-page">Sign out</button>
            </div>
          </div>
        )}
        <div className="auth-tabs" role="tablist" aria-label="Sign-in method">
          <button role="tab" aria-selected={tab === "email"} className={tab === "email" ? "active" : ""} onClick={() => setTab("email")} data-testid="tab-signin-email"><Mail size={14} /> Email</button>
          <button role="tab" aria-selected={tab === "key"} className={tab === "key" ? "active" : ""} onClick={() => setTab("key")} data-testid="tab-signin-key"><KeyRound size={14} /> API key</button>
        </div>

        {tab === "email" ? (
          <>
            {config.google && (
              <a className="primary-btn full google-btn" href={`${API_BASE}/api/auth/google/start`} data-testid="button-google">
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" /><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.222 0-9.615-3.342-11.283-7.976l-6.51 5.024C9.4 39.383 16.1 44 24 44z" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34.514 44 24c0-1.341-.138-2.65-.389-3.917z" /></svg>
                Continue with Google
              </a>
            )}
            {config.google && <div className="auth-or"><span>or with your email</span></div>}
            {firstRun ? (
              <p className="muted">This workspace has no accounts yet. The first one becomes its admin. Create yours below (you'll need the owner API key from <span className="mono">data/OWNER_KEY.txt</span> or <span className="mono">VIDEOFORGE_BOOTSTRAP_KEY</span>).</p>
            ) : mode === "create" && !config.accountsOpen ? (
              <p className="muted">This workspace needs an admin to create accounts. Ask them to add you from the Developer platform.</p>
            ) : null}
            <form onSubmit={submitEmail}>
              {mode === "create" && (
                <>
                  <label className="field">Name<input type="text" autoComplete="name" placeholder="Your name" value={form.name} onChange={set("name")} data-testid="input-name" /></label>
                  {firstRun && (
                    <label className="field">Owner API key<input type="password" autoComplete="off" placeholder="vf_admin_…" className="mono" value={form.ownerKey} onChange={set("ownerKey")} data-testid="input-owner-key" /></label>
                  )}
                </>
              )}
              <label className="field">Email<input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} data-testid="input-email" /></label>
              <label className="field">Password<input type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} placeholder={mode === "create" ? "at least 8 characters" : "Your password"} value={form.password} onChange={set("password")} data-testid="input-password" /></label>
              <ErrorBox message={error} />
              <button className="primary-btn full" type="submit" disabled={busy || !form.email || !form.password} data-testid="button-sign-in-email">
                {busy ? "Just a moment…" : <>{mode === "create" ? <><UserPlus size={16} /> Create account</> : <><ArrowRight size={16} /> Sign in</>}</>}
              </button>
            </form>
            {!firstRun && (config.accountsOpen || mode === "signin") && (
              <button className="ghost-link" onClick={() => { setMode((m) => (m === "create" ? "signin" : "create")); setError(""); }} data-testid="toggle-signin-mode">
                {mode === "create" ? "I already have an account" : config.accountsOpen ? "New here? Create an account" : ""}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="card-icon"><KeyRound size={22} /></div>
            <h2>Sign in with an API key</h2>
            <p className="muted">For AI agents and scripts. The owner key is saved to <span className="mono">data/OWNER_KEY.txt</span> on first server start (or set with <span className="mono">VIDEOFORGE_BOOTSTRAP_KEY</span>). Keys stay in memory for this page session.</p>
            <form onSubmit={submitKey}>
              <label className="field">API key<input type="password" autoComplete="current-password" placeholder="vf_live_… or vf_admin_…" className="mono" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} data-testid="input-api-key" /></label>
              <ErrorBox message={error} />
              <button className="primary-btn full" type="submit" disabled={!keyDraft.trim() || busy} data-testid="button-sign-in">{busy ? "Verifying…" : <>Open workspace <ArrowRight size={16} /></>}</button>
            </form>
            {apiKey && <button onClick={clearApiKey} className="ghost-link" data-testid="button-sign-out">Sign out of this session</button>}
          </>
        )}
      </section>
    </main>
  </div>;
}
