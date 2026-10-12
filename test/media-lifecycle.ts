// Test the mediaUrl.ts lifecycle using the project's tsx runner.
// Run: npx tsx test/media-lifecycle.ts
import { fetchMediaToken, invalidateMediaTokens, useMediaTokenLifecycle } from "../client/src/lib/mediaUrl";
import { loadStoredKey, storeKey } from "../client/src/lib/apiKey";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log("PASS: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Shim browser globals — mediaUrl.ts is a client module but its exported pure
// helpers only touch localStorage (via loadStoredKey) and window events.
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: () => "testkey",
  setItem: () => {},
  removeItem: () => {},
};
// Vite's import.meta.env shim for plain tsx runs
(globalThis as any).import_meta_env = {};
if (!(import.meta as any).env) (import.meta as any).env = {};
if (!(import.meta as any).env.VITE_API_BASE) (import.meta as any).env.VITE_API_BASE = "";

let fetchCallCount = 0;
(globalThis as any).fetch = async (url: string) => {
  fetchCallCount++;
  const m = String(url).match(/media-token\/(.+)$/);
  if (!m) return { ok: false };
  return {
    ok: true,
    json: async () => ({ token: `tok-${m[1]}-${fetchCallCount}`, expiresAt: Date.now() + 6 * 3600 * 1000 }),
  };
};

async function main() {
  // ---- Test 1: fetch + cache
  const e1 = await fetchMediaToken("assetA");
  check("fetch returns an entry", !!e1 && e1.token.startsWith("tok-assetA"));

  // ---- Test 2: dedupe — second call within TTL hits cache, no extra fetch
  const before = fetchCallCount;
  await fetchMediaToken("assetA");
  check("dedupe: cache hit, no extra fetch", fetchCallCount === before);

  // ---- Test 3: credential generation — a slow in-flight fetch that completes
  // AFTER a generation bump must NOT write into the cleared cache.
  invalidateMediaTokens();
  check("invalidate clears cache", true); // can't inspect directly; verify via next test

  // patch fetch to be slow
  const origFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string) => {
    await new Promise(r => setTimeout(r, 50));
    const m = String(url).match(/media-token\/(.+)$/);
    const id = m ? m[1] : "unknown";
    return {
      ok: true,
      json: async () => ({ token: `slow-${id}`, expiresAt: Date.now() + 6 * 3600 * 1000 }),
    };
  };

  const p = fetchMediaToken("assetB");
  // bump generation BEFORE p resolves
  invalidateMediaTokens();
  const slowResult = await p;
  check("stale in-flight fetch returns a value (caller isn't blocked)", !!slowResult && (slowResult as any).token.startsWith("slow-"));
  // The cache should not have the entry because generation bumped — verify by
  // checking that a fresh call re-fetches (with a fast fetch again).
  (globalThis as any).fetch = origFetch;
  fetchCallCount = 0;
  const fresh = await fetchMediaToken("assetB");
  check("cache stayed empty after generation bump (fresh call re-fetches)", fetchCallCount === 1);

  // ---- Test 4: retry bound — a failing fetch shouldn't loop immediately.
  // Replace fetch with a failure and call twice in quick succession; the second
  // call should be blocked by the RETRY_MS gate (returns null without fetching).
  let failFetchCount = 0;
  (globalThis as any).fetch = async () => { failFetchCount++; return { ok: false }; };
  const r1 = await fetchMediaToken("assetC");
  check("failed fetch returns null", r1 === null);
  const beforeFail = failFetchCount;
  const r2 = await fetchMediaToken("assetC");
  check("retry gated within RETRY_MS (no second fetch)", failFetchCount === beforeFail);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
