// ============================================================================
// Client-side environment module.
//
// Single source of truth for every `VITE_` env variable the browser reads.
// The Vite bundler inlines `import.meta.env.VITE_*` at build time; this module
// centralises access + validation so the rest of the client never touches
// `import.meta.env` directly.
//
// SECURITY INVARIANT: this module is compiled INTO THE BROWSER BUNDLE. Never
// add a VITE_-prefixed variable that is a secret. The build script
// (`script/build.ts`) runs `check-bundle-secrets.ts` after the Vite build to
// fail the build if a secret-looking value appears in dist/public.
// ============================================================================

const raw = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;

/** The API base URL, or "" for same-origin. */
export const API_BASE: string = (raw.VITE_API_BASE ?? "").replace(/\/$/, "");

/**
 * The only client env variables we recognise. Anything else in
 * `import.meta.env` is ignored — if a new VITE_ variable is added it must be
 * registered here.
 */
export const CLIENT_ENV_KEYS = ["VITE_API_BASE"] as const;
export type ClientEnvKey = (typeof CLIENT_ENV_KEYS)[number];

/** Whether this is a production client build. */
export const IS_PROD: boolean = raw.PROD === "true" || raw.MODE === "production";

if (IS_PROD && raw.VITE_API_BASE === undefined) {
  // Not an error — same-origin is the default deployment. Just documented.
  console.info("[videoforge] VITE_API_BASE unset — using same-origin API.");
}
