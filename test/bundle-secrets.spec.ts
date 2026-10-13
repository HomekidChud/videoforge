// ============================================================================
// Tests for the post-build bundle-secret check (script/check-bundle-secrets.ts).
//
// 1. A clean bundle passes.
// 2. A bundle with an injected fake secret fails.
// 3. A short/legit-looking token is not flagged (no false positive).
//
// Run:  npx tsx test/bundle-secrets.spec.ts
// ============================================================================

import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SCRIPT = path.join(ROOT, "script", "check-bundle-secrets.ts");

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

async function runWith(distContents: Record<string, string>): Promise<{ code: number; out: string }> {
  const tmpRoot = fs.mkdtempSync("/tmp/vf-bundle-");
  const dist = path.join(tmpRoot, "dist", "public");
  fs.mkdirSync(dist, { recursive: true });
  for (const [name, body] of Object.entries(distContents)) {
    fs.writeFileSync(path.join(dist, name), body);
  }
  const proc = spawn("npx", ["tsx", SCRIPT], {
    cwd: tmpRoot,
    env: { ...process.env, VIDEOFORGE_DIST_OVERRIDE: dist },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
  proc.stderr.on("data", (d) => (out += d));
  await once(proc, "exit");
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  return { code: proc.exitCode ?? 0, out };
}

console.log("1) Clean bundle passes");
{
  const r = await runWith({
    "app.js": "const API_BASE=''; console.log('hello world');",
  });
  check("exit 0", r.code === 0, { code: r.code, out: r.out.slice(0, 300) });
}

console.log("2) Fake sk- key in bundle fails the build");
{
  const r = await runWith({
    "app.js": "const KEY='sk-abcdefabcdefabcdefabcdefabcdef';",
  });
  check("exit 1", r.code === 1, { code: r.code, out: r.out.slice(0, 300) });
  check("message names the file and rule", r.out.includes("app.js") && r.out.includes("sk-"), r.out.slice(0, 300));
}

console.log("3) AWS AKIA key in bundle fails");
{
  const r = await runWith({
    "vendor.js": "AWS_ACCESS_KEY_ID='AKIAIOSFODNN7EXAMPLE';",
  });
  check("exit 1", r.code === 1, { code: r.code, out: r.out.slice(0, 300) });
}

console.log("4) Private key block in bundle fails");
{
  const r = await runWith({
    "chunk.js": "-----BEGIN RSA PRIVATE KEY-----",
  });
  check("exit 1", r.code === 1, { code: r.code, out: r.out.slice(0, 300) });
}

console.log("5) Short non-secret token is NOT flagged (no false positive)");
{
  // A short base64-ish blob and an ordinary fetch call must not trigger.
  const r = await runWith({
    "app.js": "const t='sk-SHORT'; fetch('/api/x'); const id='abc123def456';",
  });
  check("exit 0", r.code === 0, { code: r.code, out: r.out.slice(0, 300) });
}

console.log("6) A JWT-like eyJhbGciOiJIUzI1NiIs prefix is flagged");
{
  const r = await runWith({
    "app.js": "const jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig';",
  });
  check("exit 1", r.code === 1, { code: r.code, out: r.out.slice(0, 300) });
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
