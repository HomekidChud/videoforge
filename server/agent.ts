// ============================================================================
// Self-serve agent keys: the routes. The rules and the token format live in
// auth.ts; read the comment there for the sandbox an agent key is held to.
//
//   GET    /api/agent                  public: is it on, and how to use it
//   POST   /api/agent/keys             public: mint a key, no sign-in needed
//   POST   /api/agent/keys/renew       agent key: a fresh key for the same agent
//   DELETE /api/agent/keys/self        agent key: revoke this agent for good
//   DELETE /api/agent/keys/:agentId    admin: revoke any agent
// ============================================================================

import type { Express, Request } from "express";
import {
  AGENT_KEY_DEFAULT_DAYS, AGENT_KEY_MAX_DAYS, agentKeysEnabled, agentRequestsPerMinute,
  issueAgentKey, requireAdmin, requireScope,
} from "./auth";
import { revokeToken } from "./accounts";
import { secretSource } from "./stateless";

const PER_IP_PER_HOUR = Number(process.env.VIDEOFORGE_AGENT_KEYS_PER_IP) > 0 ? Number(process.env.VIDEOFORGE_AGENT_KEYS_PER_IP) : 20;
const PER_HOUR_TOTAL = 500;
const HOUR = 60 * 60 * 1000;

const issued = new Map<string, number[]>();
let issuedTotal: number[] = [];

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : "";
  return first || req.socket?.remoteAddress || "unknown";
}

/** Count this request against the per-address and overall hourly limits. Returns seconds to wait, or 0. */
export function agentIssueThrottle(ip: string, now = Date.now()): number {
  const recent = (issued.get(ip) ?? []).filter((t) => now - t < HOUR);
  issuedTotal = issuedTotal.filter((t) => now - t < HOUR);
  if (recent.length >= PER_IP_PER_HOUR) return Math.ceil((HOUR - (now - recent[0])) / 1000);
  if (issuedTotal.length >= PER_HOUR_TOTAL) return Math.ceil((HOUR - (now - issuedTotal[0])) / 1000);
  recent.push(now); issuedTotal.push(now);
  issued.set(ip, recent);
  if (issued.size > 5000) issued.forEach((v, k) => { if (!v.some((t) => now - t < HOUR)) issued.delete(k); });
  return 0;
}
/** Test hook. */
export function resetAgentIssueThrottle(): void { issued.clear(); issuedTotal = []; }

function describe() {
  return {
    enabled: agentKeysEnabled(),
    create: { method: "POST", path: "/api/agent/keys", body: { name: "string, optional label", days: `number, optional, 1 to ${AGENT_KEY_MAX_DAYS}, default ${AGENT_KEY_DEFAULT_DAYS}` } },
    renew: { method: "POST", path: "/api/agent/keys/renew", auth: "Authorization: Bearer <agent key>" },
    revoke: { method: "DELETE", path: "/api/agent/keys/self", auth: "Authorization: Bearer <agent key>" },
    scope: "write",
    sandbox: "An agent key sees only the projects and media it created.",
    limits: { defaultDays: AGENT_KEY_DEFAULT_DAYS, maxDays: AGENT_KEY_MAX_DAYS, requestsPerMinute: agentRequestsPerMinute(), keysPerHourPerAddress: PER_IP_PER_HOUR },
    survivesRestart: secretSource() !== "memory",
    docs: "/docs/agent-keys",
  };
}

export function registerAgentRoutes(app: Express) {
  app.get("/api/agent", (_req, res) => res.json(describe()));

  app.post("/api/agent/keys", (req, res) => {
    if (!agentKeysEnabled()) return res.status(403).json({ message: "Self-serve agent keys are turned off on this server. Ask the owner for a key, or ask them to unset VIDEOFORGE_AGENT_KEYS=off." });
    const wait = agentIssueThrottle(clientIp(req));
    if (wait > 0) { res.setHeader("Retry-After", String(wait)); return res.status(429).json({ message: `Too many keys requested from this address. Try again in ${wait} seconds.` }); }
    const { name, days } = req.body ?? {};
    if (name !== undefined && typeof name !== "string") return res.status(400).json({ message: "name must be a string." });
    if (days !== undefined && (typeof days !== "number" || !Number.isFinite(days) || days < 1 || days > AGENT_KEY_MAX_DAYS)) return res.status(400).json({ message: `days must be a number from 1 to ${AGENT_KEY_MAX_DAYS}.` });
    const { key, agentId, expiresAt } = issueAgentKey(name ?? "agent", days ?? AGENT_KEY_DEFAULT_DAYS);
    res.status(201).json({
      message: "Save this key now. It is shown only once. Send it as 'Authorization: Bearer <key>'.",
      key, agentId, scope: "write", expiresAt,
      sandbox: "This key sees only the projects and media it creates.",
      limits: describe().limits,
      renew: "POST /api/agent/keys/renew with this key before it expires to get a fresh one for the same agent.",
    });
  });

  app.post("/api/agent/keys/renew", requireScope("read"), (req, res) => {
    const k = (req as any).apiKey as { agentId?: string; label: string } | undefined;
    if (!k?.agentId) return res.status(400).json({ message: "Only an agent key can be renewed. Owner and account keys do not expire this way." });
    const days = req.body?.days;
    if (days !== undefined && (typeof days !== "number" || !Number.isFinite(days) || days < 1 || days > AGENT_KEY_MAX_DAYS)) return res.status(400).json({ message: `days must be a number from 1 to ${AGENT_KEY_MAX_DAYS}.` });
    const fresh = issueAgentKey(k.label, days ?? AGENT_KEY_DEFAULT_DAYS, k.agentId);
    res.status(201).json({ message: "Save this key now. The old key keeps working until it expires.", key: fresh.key, agentId: fresh.agentId, scope: "write", expiresAt: fresh.expiresAt });
  });

  const revokeAgent = (agentId: string) => revokeToken(agentId, "agent", Date.now() + AGENT_KEY_MAX_DAYS * 24 * HOUR);
  app.delete("/api/agent/keys/self", requireScope("read"), (req, res) => {
    const k = (req as any).apiKey as { agentId?: string } | undefined;
    if (!k?.agentId) return res.status(400).json({ message: "Only an agent key can revoke itself here." });
    revokeAgent(k.agentId);
    res.json({ revoked: true, agentId: k.agentId });
  });
  app.delete("/api/agent/keys/:agentId", requireAdmin, (req, res) => {
    const id = String(req.params.agentId);
    if (!/^[a-f0-9]{16}$/.test(id)) return res.status(400).json({ message: "agentId is the 16 character id returned when the key was created." });
    revokeAgent(id);
    res.json({ revoked: true, agentId: id });
  });
}
