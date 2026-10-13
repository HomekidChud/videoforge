import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStoredKey } from "@/lib/apiKey";

// ---------------------------------------------------------------------------
// VideoForge API Key Dashboard.
// Create / manage / revoke API keys with restrictions: kind (public/private),
// fine-grained permissions, expiry, allowed origins, allowed IPs, rate limit,
// quota. Usage stats per key. Requires admin (keys:manage) key.
// ---------------------------------------------------------------------------

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

const PERMISSIONS = [
  { id: "media:read", label: "Read media", desc: "List + view media assets" },
  { id: "media:upload", label: "Upload media", desc: "Add video / audio / images" },
  { id: "media:delete", label: "Delete media", desc: "Remove media assets" },
  { id: "projects:read", label: "Read projects", desc: "View saved projects" },
  { id: "projects:write", label: "Write projects", desc: "Create / edit / delete projects" },
  { id: "timeline:edit", label: "Edit timeline", desc: "Apply clip operations" },
  { id: "renders:create", label: "Create renders", desc: "Trigger ffmpeg renders" },
  { id: "renders:download", label: "Download renders", desc: "Fetch rendered MP4s" },
  { id: "keys:manage", label: "Manage keys", desc: "Create / revoke other keys (admin)" },
];

type KeyRecord = {
  id: string;
  label: string;
  kind: "public" | "private";
  scope: string;
  permissions: string[];
  revoked: boolean;
  expired: boolean;
  expiresAt: number;
  allowedOrigins: string[];
  allowedIps: string[];
  rateLimitPerHour: number;
  quotaTotal: number;
  requestsUsed: number;
  requestsLastHour: number;
  lastUsedAt: number;
  createdAt: number;
};

type UsageOverview = {
  requestsLastHour: number;
  requestsTotal: number;
  byKey: { keyId: string; count: number }[];
  recent: { id: number; keyId: string; method: string; path: string; status: number; createdAt: number }[];
};

async function api<T>(method: string, url: string, body?: any): Promise<T> {
  const key = loadStoredKey();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t}`);
  }
  return res.json();
}

const fmtDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtRel = (ms: number) => {
  if (!ms) return "never";
  const d = Date.now() - ms;
  const mins = Math.floor(d / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "keys" | "usage">("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<KeyRecord | null>(null);

  const keysQ = useQuery<{ keys: KeyRecord[] }>({
    queryKey: ["/api/keys"],
    refetchInterval: 10000,
  });
  const usageQ = useQuery<UsageOverview>({
    queryKey: ["/api/keys/usage-overview"],
    refetchInterval: 10000,
  });

  const keys = keysQ.data?.keys ?? [];
  const usage = usageQ.data;

  const activeKeys = keys.filter((k) => !k.revoked && !k.expired);
  const publicKeys = activeKeys.filter((k) => k.kind === "public");

  // ---------------------------------------------------------------- create

  const createKeyM = useMutation({
    mutationFn: async (payload: any) =>
      api<{ key: string; record: KeyRecord }>("POST", "/api/keys", payload),
    onSuccess: (d) => {
      setNewKeyPlaintext(d.key);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["/api/keys"] });
    },
  });

  const revokeKeyM = useMutation({
    mutationFn: async (id: string) => api<{ revoked: boolean }>("DELETE", `/api/keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/keys"] }),
  });

  const enableKeyM = useMutation({
    mutationFn: async (id: string) => api<KeyRecord>("POST", `/api/keys/${id}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/keys"] }),
  });

  const rotateKeyM = useMutation({
    mutationFn: async (id: string) =>
      api<{ key: string; record: KeyRecord }>("POST", `/api/keys/${id}/rotate`),
    onSuccess: (d) => {
      setNewKeyPlaintext(d.key);
      qc.invalidateQueries({ queryKey: ["/api/keys"] });
    },
  });

  const updateKeyM = useMutation({
    mutationFn: async (id: string, payload: any) => api<KeyRecord>("PUT", `/api/keys/${id}`, payload),
    onSuccess: () => {
      setEditingKey(null);
      qc.invalidateQueries({ queryKey: ["/api/keys"] });
    },
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ------------------------------ top bar */}
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center gap-3 sticky top-0 z-20 bg-zinc-950">
        <Logo />
        <span className="text-xs text-zinc-500">Dashboard</span>
        <div className="flex-1" />
        <a href="#/" className="text-xs text-zinc-400 hover:text-zinc-200 mr-2">Editor</a>
        <a href="#/api-docs" className="text-xs text-zinc-400 hover:text-zinc-200 mr-2">API docs</a>
      </header>

      {/* ------------------------------ tabs */}
      <div className="px-4 pt-3 pb-2 flex gap-1 border-b border-zinc-800">
        {(["overview", "keys", "usage"] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 text-xs rounded-t-md border-b-2 ${
              tab === t ? "border-blue-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "overview" ? "Overview" : t === "keys" ? "API Keys" : "Usage"}
          </button>
        ))}
      </div>

      {/* ------------------------------ content */}
      <main className="p-4 max-w-6xl mx-auto">
        {/* ------------------------------ Overview */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Active keys" value={activeKeys.length} sub={`${keys.length} total`} />
              <StatCard title="Public keys" value={publicKeys.length} sub="embeddable, read-only" />
              <StatCard title="Requests (1h)" value={usage?.requestsLastHour ?? 0} sub={`${usage?.requestsTotal ?? 0} all-time`} />
              <StatCard
                title="Revoked / expired"
                value={keys.filter((k) => k.revoked || k.expired).length}
                sub="inactive keys"
              />
            </div>

            <Card title="Recent activity">
              {usage && usage.recent.length > 0 ? (
                <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
                  {usage.recent.slice(0, 20).map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-zinc-400">
                      <span className="text-zinc-500">{new Date(r.createdAt).toLocaleTimeString("en-GB")}</span>
                      <span className={`px-1 rounded ${r.status >= 400 ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"}`}>{r.status}</span>
                      <span className="font-mono">{r.method}</span>
                      <span className="truncate">{r.path}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">No requests recorded yet.</p>
              )}
            </Card>

            <Card title="Keys by usage">
              {usage && usage.byKey.length > 0 ? (
                <ul className="text-xs space-y-1">
                  {usage.byKey.map((b) => {
                    const k = keys.find((x) => x.id === b.keyId);
                    return (
                      <li key={b.keyId} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-zinc-300">{k?.label ?? b.keyId}</span>
                        <span className="text-zinc-500">{b.count} req</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">No usage data.</p>
              )}
            </Card>
          </div>
        )}

        {/* ------------------------------ Keys */}
        {tab === "keys" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your API keys</h2>
              <button
                className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500"
                onClick={() => setShowCreate(true)}
              >
                Create key
              </button>
            </div>

            {keysQ.isError && (
              <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded p-3">
                Could not load keys. You need a key with <code>keys:manage</code> permission (an admin key).
                <br />
                <span className="text-red-300 text-[11px]">{String((keysQ.error as any)?.message ?? "")}</span>
              </div>
            )}

            {keys.length === 0 && !keysQ.isError && (
              <div className="text-xs text-zinc-500">No keys yet. Create one above.</div>
            )}

            <div className="space-y-2">
              {keys.map((k) => (
                <KeyRow
                  key={k.id}
                  k={k}
                  onEdit={() => setEditingKey(k)}
                  onRevoke={() => {
                    if (window.confirm(`Revoke "${k.label}"? Existing requests will immediately stop working.`)) revokeKeyM.mutate(k.id);
                  }}
                  onEnable={() => enableKeyM.mutate(k.id)}
                  onRotate={() => {
                    if (window.confirm(`Rotate "${k.label}"? The old key is revoked and a new one is minted with the same settings.`)) rotateKeyM.mutate(k.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------ Usage */}
        {tab === "usage" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard title="Requests last hour" value={usage?.requestsLastHour ?? 0} />
              <StatCard title="Total requests" value={usage?.requestsTotal ?? 0} />
            </div>
            <Card title="Per-key totals">
              {usage && usage.byKey.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 text-left border-b border-zinc-800">
                      <th className="pb-1">Key</th>
                      <th className="pb-1 text-right">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byKey.map((b) => (
                      <tr key={b.keyId} className="border-b border-zinc-900">
                        <td className="py-1 truncate">{keys.find((x) => x.id === b.keyId)?.label ?? b.keyId}</td>
                        <td className="py-1 text-right">{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-zinc-500">No usage recorded yet.</p>
              )}
            </Card>
            <Card title="Recent requests (last 200)">
              {usage && usage.recent.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-950">
                      <tr className="text-zinc-500 text-left border-b border-zinc-800">
                        <th className="pb-1">Time</th>
                        <th className="pb-1">Key</th>
                        <th className="pb-1">Method</th>
                        <th className="pb-1">Path</th>
                        <th className="pb-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.recent.map((r) => (
                        <tr key={r.id} className="border-b border-zinc-900">
                          <td className="py-1 text-zinc-500">{new Date(r.createdAt).toLocaleTimeString("en-GB")}</td>
                          <td className="py-1 truncate max-w-32">{keys.find((x) => x.id === r.keyId)?.label ?? r.keyId.slice(0, 8)}</td>
                          <td className="py-1 font-mono">{r.method}</td>
                          <td className="py-1 truncate max-w-64">{r.path}</td>
                          <td className={`py-1 ${r.status >= 400 ? "text-red-400" : "text-green-400"}`}>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No requests yet.</p>
              )}
            </Card>
          </div>
        )}
      </main>

      {/* ------------------------------ create dialog */}
      {showCreate && (
        <CreateKeyDialog
          onClose={() => setShowCreate(false)}
          onSubmit={(p) => createKeyM.mutate(p)}
          pending={createKeyM.isPending}
          error={createKeyM.isError ? String((createKeyM.error as any)?.message ?? "") : null}
        />
      )}

      {/* ------------------------------ edit dialog */}
      {editingKey && (
        <EditKeyDialog
          k={editingKey}
          onClose={() => setEditingKey(null)}
          onSubmit={(patch) => updateKeyM.mutate(editingKey.id, patch)}
          pending={updateKeyM.isPending}
          error={updateKeyM.isError ? String((updateKeyM.error as any)?.message ?? "") : null}
        />
      )}

      {/* ------------------------------ new-key reveal */}
      {newKeyPlaintext && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setNewKeyPlaintext(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">Save your key now</h3>
            <p className="text-xs text-zinc-400">
              This key is shown <span className="text-amber-400">only once</span>. Copy it somewhere safe (password manager, env var). We only store its hash.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono break-all">{newKeyPlaintext}</code>
              <button
                className="text-xs px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 shrink-0"
                onClick={() => navigator.clipboard?.writeText(newKeyPlaintext)}
              >
                Copy
              </button>
            </div>
            <button className="w-full text-xs px-3 py-2 rounded bg-blue-600 hover:bg-blue-500" onClick={() => setNewKeyPlaintext(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- subcomponents

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="6" width="13" height="12" rx="2" />
        <path d="M15 10l6-3v10l-6-3" />
        <path d="M5 3h7" />
      </svg>
      <span className="font-bold text-sm">VideoForge</span>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: number | string; sub?: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function KeyRow({
  k, onEdit, onRevoke, onEnable, onRotate,
}: {
  k: KeyRecord;
  onEdit: () => void;
  onRevoke: () => void;
  onEnable: () => void;
  onRotate: () => void;
}) {
  const status = k.revoked ? "revoked" : k.expired ? "expired" : "active";
  return (
    <div className={`border rounded-lg p-3 ${k.revoked || k.expired ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-700"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{k.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
              k.kind === "public" ? "bg-emerald-900/50 text-emerald-300" : "bg-violet-900/50 text-violet-300"
            }`}>{k.kind}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
              status === "active" ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
            }`}>{status}</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 space-x-3 flex flex-wrap">
            <span>created {fmtDate(k.createdAt)}</span>
            <span>last used {fmtRel(k.lastUsedAt)}</span>
            <span>{k.requestsUsed} req</span>
            {k.rateLimitPerHour > 0 && <span>limit {k.rateLimitPerHour}/h</span>}
            {k.quotaTotal > 0 && <span>quota {k.requestsUsed}/{k.quotaTotal}</span>}
            {k.expiresAt > 0 && <span className={k.expired ? "text-red-400" : ""}>expires {fmtDate(k.expiresAt)}</span>}
            {k.allowedIps.length > 0 && <span>{k.allowedIps.length} IP rule(s)</span>}
            {k.allowedOrigins.length > 0 && <span>{k.allowedOrigins.length} origin(s)</span>}
          </div>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {k.permissions.map((p) => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">{p}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={onEdit}>Edit</button>
          {k.revoked ? (
            <button className="text-[11px] px-2 py-1 rounded bg-green-900/40 hover:bg-green-900/60 text-green-300" onClick={onEnable}>Enable</button>
          ) : (
            <>
              <button className="text-[11px] px-2 py-1 rounded bg-amber-900/40 hover:bg-amber-900/60 text-amber-300" onClick={onRotate}>Rotate</button>
              <button className="text-[11px] px-2 py-1 rounded bg-red-900/40 hover:bg-red-900/60 text-red-300" onClick={onRevoke}>Revoke</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create key dialog
// ---------------------------------------------------------------------------

function CreateKeyDialog({
  onClose, onSubmit, pending, error,
}: {
  onClose: () => void;
  onSubmit: (payload: any) => void;
  pending: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"public" | "private">("private");
  const [perms, setPerms] = useState<string[]>(["media:read", "projects:read", "renders:download"]);
  const [expiresDays, setExpiresDays] = useState(0);
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [rateLimit, setRateLimit] = useState(0);
  const [quota, setQuota] = useState(0);

  const togglePerm = (id: string) =>
    setPerms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const kindHelp = kind === "public"
    ? "Public keys are safe to embed in a browser or app. They are always read-only and cannot manage other keys."
    : "Private keys are server-side secrets. They can hold any permission including admin.";

  const submit = () => {
    if (!label.trim()) return;
    const expiresAt = expiresDays > 0 ? Date.now() + expiresDays * 24 * 60 * 60 * 1000 : 0;
    onSubmit({
      label: label.trim(),
      kind,
      permissions: perms,
      expiresAt,
      allowedOrigins: allowedOrigins.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      allowedIps: allowedIps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      rateLimitPerHour: rateLimit,
      quotaTotal: quota,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold">Create API key</h3>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Label</label>
          <input
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm"
            placeholder="e.g. production frontend, CI bot, Claude agent"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="input-key-label"
          />
        </div>

        {/* kind */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Key type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`text-xs p-3 rounded border text-left ${kind === "public" ? "border-emerald-500 bg-emerald-950/30" : "border-zinc-700"}`}
              onClick={() => {
                setKind("public");
                setPerms((p) => p.filter((x) => ["media:read", "projects:read", "renders:download"].includes(x)));
              }}
            >
              <div className="font-semibold">Public</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">vf_pub_… — embeddable, read-only</div>
            </button>
            <button
              className={`text-xs p-3 rounded border text-left ${kind === "private" ? "border-violet-500 bg-violet-950/30" : "border-zinc-700"}`}
              onClick={() => setKind("private")}
            >
              <div className="font-semibold">Private</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">vf_live_… — server-side secret, any permission</div>
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">{kindHelp}</p>
        </div>

        {/* permissions */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Permissions</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PERMISSIONS.map((p) => {
              const disabled = kind === "public" && !["media:read", "projects:read", "renders:download"].includes(p.id);
              const checked = perms.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-2 p-2 rounded border text-xs cursor-pointer ${
                    disabled ? "opacity-30 cursor-not-allowed border-zinc-800" : checked ? "border-blue-500 bg-blue-950/20" : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => togglePerm(p.id)}
                  />
                  <div>
                    <div className="font-mono text-[11px]">{p.id}</div>
                    <div className="text-[10px] text-zinc-500">{p.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* restrictions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Expires (days, 0 = never)</label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={expiresDays} onChange={(e) => setExpiresDays(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Rate limit (req/hour, 0 = none)</label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={rateLimit} onChange={(e) => setRateLimit(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Quota (total requests, 0 = none)</label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={quota} onChange={(e) => setQuota(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Allowed IPs / CIDRs (comma-separated, blank = any)</label>
            <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-xs" placeholder="203.0.113.5, 10.0.0.0/8" value={allowedIps} onChange={(e) => setAllowedIps(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Allowed origins (one per line, blank = any)</label>
            <textarea rows={2} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-xs" placeholder="https://mysite.com" value={allowedOrigins} onChange={(e) => setAllowedOrigins(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button className="flex-1 text-xs px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700" onClick={onClose}>Cancel</button>
          <button className="flex-1 text-xs px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40" disabled={!label.trim() || pending || perms.length === 0} onClick={submit}>
            {pending ? "Creating…" : "Create key"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit key dialog
// ---------------------------------------------------------------------------

function EditKeyDialog({
  k, onClose, onSubmit, pending, error,
}: {
  k: KeyRecord;
  onClose: () => void;
  onSubmit: (patch: any) => void;
  pending: boolean;
  error: string | null;
}) {
  const [label, setLabel] = useState(k.label);
  const [perms, setPerms] = useState<string[]>(k.permissions);
  const [expiresDays, setExpiresDays] = useState(0);
  const [allowedOrigins, setAllowedOrigins] = useState(k.allowedOrigins.join("\n"));
  const [allowedIps, setAllowedIps] = useState(k.allowedIps.join(", "));
  const [rateLimit, setRateLimit] = useState(k.rateLimitPerHour);
  const [quota, setQuota] = useState(k.quotaTotal);

  const togglePerm = (id: string) =>
    setPerms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () => {
    const nowLeft = k.expiresAt > Date.now() ? (k.expiresAt - Date.now()) / (24 * 60 * 60 * 1000) : 0;
    const newExpires = expiresDays > 0 ? Date.now() + expiresDays * 24 * 60 * 60 * 1000 : 0;
    onSubmit({
      label: label.trim(),
      permissions: perms,
      expiresAt: expiresDays === 0 && nowLeft > 0 ? k.expiresAt : newExpires, // keep existing if untouched
      allowedOrigins: allowedOrigins.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      allowedIps: allowedIps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      rateLimitPerHour: rateLimit,
      quotaTotal: quota,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold">Edit key — {k.label}</h3>
        <p className="text-[11px] text-zinc-500">
          Kind is fixed after creation ({k.kind}). Rotate to mint a new key; you cannot change a public key into a private one.
        </p>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Label</label>
          <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Permissions</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PERMISSIONS.map((p) => {
              const disabled = k.kind === "public" && !["media:read", "projects:read", "renders:download"].includes(p.id);
              const checked = perms.includes(p.id);
              return (
                <label key={p.id} className={`flex items-start gap-2 p-2 rounded border text-xs cursor-pointer ${disabled ? "opacity-30 cursor-not-allowed border-zinc-800" : checked ? "border-blue-500 bg-blue-950/20" : "border-zinc-700"}`}>
                  <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={() => togglePerm(p.id)} />
                  <div>
                    <div className="font-mono text-[11px]">{p.id}</div>
                    <div className="text-[10px] text-zinc-500">{p.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Expires in days (0 = never{k.expiresAt > 0 ? `; current: ${fmtDate(k.expiresAt)}` : ""})
            </label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={expiresDays} onChange={(e) => setExpiresDays(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Rate limit (req/hour)</label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={rateLimit} onChange={(e) => setRateLimit(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Quota (total requests)</label>
            <input type="number" min={0} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" value={quota} onChange={(e) => setQuota(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Allowed IPs / CIDRs</label>
            <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-xs" value={allowedIps} onChange={(e) => setAllowedIps(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Allowed origins</label>
            <textarea rows={2} className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-xs" value={allowedOrigins} onChange={(e) => setAllowedOrigins(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button className="flex-1 text-xs px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700" onClick={onClose}>Cancel</button>
          <button className="flex-1 text-xs px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40" disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
