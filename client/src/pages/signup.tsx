import { useState } from "react";
import { KeyRound, ArrowRight, Bot, Check, Copy, Mail, UserPlus, ShieldCheck, Clock, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/lib/apiKey";
import { ForgeLogo, ErrorBox, copyText } from "@/components/forge-shell";
import { API_BASE } from "@/lib/api";

type AuthConfig = { google: boolean; accountsOpen: boolean; hasAccounts: boolean; agentKeys?: boolean };
type IssuedKey = { key: string; agentId: string; expiresAt: number; limits?: { requestsPerMinute?: number } };

/** The public sign-up page. Anyone, person or AI, can get working access without an existing
 *  credential: an instant sandboxed key (no email, nothing to verify), or a full account when
 *  the server has open sign-ups. The plain-HTML twin at signup.html serves tools that can't run
 *  the app. */
export default function SignupPage() {
  const { setApiKey } = useApiKey();
  const configQ = useQuery<AuthConfig>({ queryKey: ["/api/auth/config"] });
  const config = configQ.data;
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const base = API_BASE || window.location.origin;
  const copy = async (label: string, text: string) => {
    await copyText(text);
    setCopied(label);
    window.setTimeout(() => setCopied((c) => (c === label ? "" : c)), 1800);
  };

  async function getKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/agent/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "my-agent", days }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error(`Too many keys requested from this network. Try again in ${res.headers.get("Retry-After") ?? "a few"} seconds.`);
      if (res.status === 403) throw new Error(data.message || "Instant keys are turned off on this server. Ask the owner for access.");
      if (!res.ok) throw new Error(data.message || res.statusText);
      setIssued(data as IssuedKey);
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the VideoForge server. Check your connection." : err instanceof Error ? err.message : "Could not create a key.");
    } finally { setBusy(false); }
  }

  function openStudio() {
    if (!issued) return;
    setApiKey(issued.key);
    window.location.hash = "#/editor";
    window.location.reload();
  }

  const expires = issued ? new Date(issued.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const curl = issued ? `curl ${base}/api/projects \\\n  -H "Authorization: Bearer ${issued.key}"` : "";
  const env = issued ? `export VF_API_KEY=${issued.key}\nexport VF_BASE_URL=${base}` : "";

  return <div className="forge-app auth-page">
    <header className="share-head"><ForgeLogo /><span style={{ display: "flex", gap: 16 }}><a className="ghost-link" href="#/api-key">Sign in</a><a className="ghost-link" href="#/docs/agent-keys">Docs</a></span></header>
    <main className="auth-grid">
      <section className="auth-copy">
        <div className="eyebrow">SIGN UP</div>
        <h1>Get access in one click. No email, no existing key.</h1>
        <p>Pick a name and get a working key right away. It works for people, scripts and AI agents, including tools that can't sign in or make authenticated calls to begin with.</p>
        <ul className="feature-list">
          <li><Bot size={18} /> Made for AIs that have to create their own credentials</li>
          <li><ShieldCheck size={18} /> A private sandbox: it only sees what it creates</li>
          <li><Clock size={18} /> Expires on its own, renewable before then</li>
          <li><FileText size={18} /> <a className="ghost-link" href="signup.html">Plain HTML version for tools that can't run this app</a></li>
        </ul>
      </section>
      <section className="auth-card">
        {!issued ? (
          config?.agentKeys === false ? (
            <>
              <div className="card-icon"><KeyRound size={22} /></div>
              <h2>Instant keys are off here</h2>
              <p className="muted">The owner of this server turned off self-serve keys. Ask them for a key, or {config.accountsOpen ? "create an account below." : "ask an admin to add you."}</p>
            </>
          ) : (
            <>
              <div className="card-icon"><Bot size={22} /></div>
              <h2>Get an instant key</h2>
              <p className="muted">Free, nothing to verify. You'll see the key once, so copy it before you leave.</p>
              <form onSubmit={getKey}>
                <label className="field">Name<input type="text" maxLength={60} placeholder="my-agent" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-agent-name" /></label>
                <label className="field">Lasts for
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="select-agent-days">
                    {[1, 7, 14, 30].map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}
                  </select>
                </label>
                <ErrorBox message={error} />
                <button className="primary-btn full" type="submit" disabled={busy} data-testid="button-get-key">{busy ? "Creating…" : <>Get my key <ArrowRight size={16} /></>}</button>
              </form>
            </>
          )
        ) : (
          <>
            <div className="card-icon"><Check size={22} /></div>
            <h2>Your key is ready</h2>
            <p className="muted">Shown once. It expires on {expires}. Copy it now.</p>
            <div className="secret-box"><code data-testid="signup-key">{issued.key}</code>
              <button className="icon-btn" aria-label="Copy key" onClick={() => copy("key", issued.key)}>{copied === "key" ? <Check size={18} /> : <Copy size={18} />}</button></div>
            <p className="muted" style={{ marginBottom: 6 }}>Use it from a terminal</p>
            <div className="secret-box"><code style={{ whiteSpace: "pre-wrap" }}>{curl}</code>
              <button className="icon-btn" aria-label="Copy curl command" onClick={() => copy("curl", curl)}>{copied === "curl" ? <Check size={18} /> : <Copy size={18} />}</button></div>
            <p className="muted" style={{ marginBottom: 6 }}>Or hand it to an agent</p>
            <div className="secret-box"><code style={{ whiteSpace: "pre-wrap" }}>{env}</code>
              <button className="icon-btn" aria-label="Copy environment variables" onClick={() => copy("env", env)}>{copied === "env" ? <Check size={18} /> : <Copy size={18} />}</button></div>
            <button className="primary-btn full" onClick={openStudio} data-testid="button-open-studio">Open the studio with this key <ArrowRight size={16} /></button>
            <p className="muted" style={{ fontSize: 12 }}>The studio keeps the key in memory only, so a refresh signs you out. Paste it on the sign-in page to come back.</p>
          </>
        )}

        {!issued && config?.accountsOpen && (
          <div className="help-text">
            <p><Mail size={14} /> Want a permanent account with an email and password?</p>
            <a className="ghost-link" href="#/api-key" data-testid="link-create-account"><UserPlus size={14} /> Create an account</a>
          </div>
        )}
        {!issued && <div className="help-text"><p className="muted">Already have a key or account? <a className="ghost-link" href="#/api-key">Sign in</a></p></div>}
      </section>
    </main>
  </div>;
}
