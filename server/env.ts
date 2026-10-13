// ============================================================================
// Server-side environment module.
//
// Single source of truth for every env variable the server reads. Validated
// with Zod at startup; the process exits with a clear list of every missing
// or invalid variable. No other file should read `process.env` directly.
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema. Optional variables fall back to a documented default. Only
// variables explicitly marked "secret" are ever validated for strength; none
// of them are logged.
//
// Cross-field rules ("CORS_ORIGIN is required in production", "no localhost in
// production") live in a single refinement on the whole object rather than
// on individual optional fields.
// ---------------------------------------------------------------------------

const isProduction = (d: { NODE_ENV?: string }) => d.NODE_ENV === "production";

export const envSchema = z
  .object({
    // App -----------------------------------------------------------------
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_URL: z.string().url().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),

    // CORS ----------------------------------------------------------------
    // Allowlist of Origins. Unset means "allow all" in development only —
    // it is a hard error in production. `*` is always rejected.
    CORS_ORIGIN: z.string().optional(),

    // Storage -------------------------------------------------------------
    VIDEOFORGE_DB: z.string().min(1).default("data.db"),
    VIDEOFORGE_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(16384).default(2048),
    VIDEOFORGE_FONT: z.string().optional(),

    // Auth ----------------------------------------------------------------
    VIDEOFORGE_BOOTSTRAP_KEY: z
      .string()
      .min(32, "VIDEOFORGE_BOOTSTRAP_KEY must be at least 32 characters (a long random string).")
      .optional(),

    // Feature flags ---------------------------------------------------------
    FEATURE_FLAGS: z.string().optional(),
  })
  .check((ctx) => {
    const cors = ctx.value.CORS_ORIGIN;
    const prod = ctx.value.NODE_ENV === "production";

    // Production must set an explicit allowlist (or explicitly `none`).
    if (prod && (cors === undefined || cors === "")) {
      ctx.issues.push({
        code: "custom",
        input: undefined,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN must be set in production — a comma-separated list of allowed origins, or `none` to disable cross-origin entirely.",
      });
    }

    // `*` is never allowed; a list containing `*` is a typo.
    if (cors !== undefined && cors !== "" && cors.split(",").map((s) => s.trim()).includes("*")) {
      ctx.issues.push({
        code: "custom",
        input: cors,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN cannot be `*` (or contain `*` in a list). Use an explicit allowlist.",
      });
    }

    // Every non-`none` entry must be a valid absolute URL (scheme + host).
    if (cors !== undefined && cors !== "" && cors !== "none") {
      for (const item of cors.split(",").map((s) => s.trim()).filter(Boolean)) {
        let u: URL;
        try {
          u = new URL(item);
        } catch {
          ctx.issues.push({
            code: "custom",
            input: item,
            path: ["CORS_ORIGIN"],
            message: `CORS_ORIGIN contains an entry that is not a valid absolute URL (expected https://host or http://host). Every non-'none' entry must be an absolute URL.`,
          });
          continue;
        }
        if (!(u.protocol === "https:" || u.protocol === "http:") || !u.hostname) {
          ctx.issues.push({
            code: "custom",
            input: item,
            path: ["CORS_ORIGIN"],
            message: `CORS_ORIGIN contains an entry that is not a valid http(s) URL.`,
          });
          continue;
        }
        // In production, plain-HTTP and localhost are not permitted.
        if (prod) {
          if (u.protocol === "http:") {
            ctx.issues.push({
              code: "custom",
              input: item,
              path: ["CORS_ORIGIN"],
              message: `CORS_ORIGIN entries must be https:// in production (found a http:// entry).`,
            });
          }
          if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1") {
            ctx.issues.push({
              code: "custom",
              input: item,
              path: ["CORS_ORIGIN"],
              message: `CORS_ORIGIN entries must not be localhost in production.`,
            });
          }
        }
      }
    }

    // In production, APP_ENV must match (no accidental development default).
    if (prod && ctx.value.APP_ENV === "development") {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.APP_ENV,
        path: ["APP_ENV"],
        message: `APP_ENV must be 'production' (or 'staging') when NODE_ENV=production.`,
      });
    }

    // Bootstrap key must not be a trivially-guessable value.
    const boot = ctx.value.VIDEOFORGE_BOOTSTRAP_KEY;
    if (boot !== undefined) {
      const isWeak = /^(.)\1+$/.test(boot) || /^(0|1)$/.test(boot) || /^(?:\d+)$/.test(boot) || boot.length < 32;
      if (isWeak) {
        ctx.issues.push({
          code: "custom",
          input: undefined,
          path: ["VIDEOFORGE_BOOTSTRAP_KEY"],
          message: `VIDEOFORGE_BOOTSTRAP_KEY looks weak (repeated/numeric/short). Use 'openssl rand -hex 32'.`,
        });
      }
    }

    // Warn (not fail) on http:// URLs in production.
    if (prod && typeof ctx.value.APP_URL === "string" && ctx.value.APP_URL.startsWith("http://")) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.APP_URL,
        path: ["APP_URL"],
        message: "APP_URL should be https:// in production.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Parse + fail fast
// ---------------------------------------------------------------------------

let cached: Env | null = null;

/**
 * dotenv and shells frequently emit `VAR=` (empty string) for unset vars.
 * Normalise those to `undefined` so optional fields behave as if unset —
 * otherwise `APP_URL=` fails URL validation and `VIDEOFORGE_BOOTSTRAP_KEY=`
 * fails the min-length rule.
 */
function normaliseBlank(processEnv: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(processEnv)) {
    out[k] = typeof v === "string" && v.trim() === "" ? undefined : v;
  }
  return out;
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(normaliseBlank(process.env));
  if (!parsed.success) {
    const lines = ["", "VideoForge failed to start because of invalid environment variables:", ""];
    for (const issue of parsed.error.issues) {
      // Never print the value — only the variable name and the reason.
      const name = issue.path.join(".") || "(root)";
      lines.push(`  • ${name}: ${issue.message}`);
    }
    lines.push("", "Fix these in .env / .env.local and restart.", "");
    console.error(lines.join("\n"));
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Import side-effect. Every module that wants env values should call
 * `getEnv()` (lazily, so tests can set env before importing).
 */
export const env = getEnv();

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export type CorsMode = { kind: "allow-all" | "deny-all" | "allowlist"; list: string[] };

/**
 * Resolve the CORS mode. Semantics:
 *   unset / blank   → allow-all in development, boot-error in production.
 *   "none"          → explicitly DENY all cross-origin (browser Origin header
 *                     present → 403). Same-origin (curl, no Origin header)
 *                     still works.
 *   CSV of URLs     → explicit allowlist.
 */
export const corsMode = (): CorsMode => {
  const v = getEnv().CORS_ORIGIN;
  if (v === undefined) return { kind: getEnv().NODE_ENV === "production" ? "deny-all" : "allow-all", list: [] };
  if (v.trim() === "" || v.trim().toLowerCase() === "none") return { kind: "deny-all", list: [] };
  return { kind: "allowlist", list: v.split(",").map((s) => s.trim()).filter(Boolean) };
};

/**
 * True if this Origin may call the API cross-origin.
 *
 * Same-origin requests (browser POST with an Origin header matching the
 * request's own host, or a non-browser request with no Origin at all) are
 * always allowed regardless of CORS mode.
 */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // non-browser / no Origin header
  if (!host) return false;
  try {
    const u = new URL(origin);
    // The Host header is `host[:port]`; compare hostname and default-port
    // normalisation (http/https on 80/443).
    const [hostName, hostPort] = host.split(":");
    const originPort = u.port || (u.protocol === "https:" ? "443" : "80");
    const expectedPort = hostPort || (u.protocol === "https:" ? "443" : "80");
    return u.hostname === hostName && originPort === expectedPort;
  } catch {
    return false;
  }
}

export const isCorsAllowed = (origin: string | undefined, host?: string | undefined): boolean => {
  const mode = corsMode();
  if (mode.kind === "allow-all") return true; // dev-only (boot check rejects unset in prod)
  if (isSameOrigin(origin, host)) return true; // same-origin / no-Origin never blocked
  if (mode.kind === "deny-all") return false;
  // origin is defined here — isSameOrigin returned false, which requires origin.
  return typeof origin === "string" && mode.list.includes(origin);
};

export const maxUploadBytes = () => getEnv().VIDEOFORGE_MAX_UPLOAD_MB * 1024 * 1024;
