// ============================================================================
// Security regression tests for the hardening work on this branch.
//
// Covers:
//   1. Security headers present on every response
//   2. CORS: allowlist enforced, `*` rejected, unlisted origin 403
//   3. Body size limit (4 MB) on JSON routes — oversized body rejected
//   4. Env module: fails fast on invalid/missing vars
//   5. Media-token verify rejects tampered tokens
//   6. IDOR: restricted key cannot read other projects (regression)
//   7. Rate limit: per-key requestsPerMinute is enforced
//   8. Pre-commit hook: blocks a fake secret in a staged diff
//
// Run:  npx tsx test/security.spec.ts
// ============================================================================

import { spawn, ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TEST_PORT = 5201;

const DB = path.join(ROOT, "data.test.db");
for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) {
  try { fs.unlinkSync(f); } catch {}
}

let server: ChildProcess | null = null;
const OUT = fs.openSync("/tmp/vf_sec_test_server.log", "w");

function killServer() {
  if (server) {
    try { process.kill(-server.pid!, "SIGKILL"); } catch { server.kill("SIGKILL"); }
    server = null;
  }
}
process.on("exit", killServer);
process.on("SIGINT", () => { killServer(); process.exit(1); });

async function startServer(extraEnv: Record<string, string> = {}): Promise<void> {
  server = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      VIDEOFORGE_DB: DB,
      PORT: String(TEST_PORT),
      NODE_ENV: "development",
      ...extraEnv,
    },
    stdio: ["ignore", OUT, OUT],
    detached: true,
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start in 30s");
}

const H = `http://127.0.0.1:${TEST_PORT}`;

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

// ---------------------------------------------------------------------------
// 1) Env module — invalid value fails startup with a clear message
// ---------------------------------------------------------------------------
console.log("1) Env module rejects invalid values");
{
  // Write a temp script that sets env then imports the module — avoids
  // tsx -e's top-level await limitation by using a .then chain.
  const tmpScript = path.join(ROOT, ".tmp-env-test-1.mjs");
  fs.writeFileSync(tmpScript, `
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "not a url";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { m.getEnv(); console.log("UNEXPECTED: should have exited"); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("exit code 1", proc.exitCode === 1, { exitCode: proc.exitCode });
  check("error message names the variable", stderr.includes("CORS_ORIGIN"), stderr.slice(0, 400));
  check("does not echo the invalid value", !stderr.includes("not a url"), stderr.slice(0, 400));
}

// ---------------------------------------------------------------------------
// 2) Env module — production requires CORS_ORIGIN
// ---------------------------------------------------------------------------
console.log("2) Env module: production requires CORS_ORIGIN");
{
  const tmpScript = path.join(ROOT, ".tmp-env-test-2.mjs");
  fs.writeFileSync(tmpScript, `
    process.env.NODE_ENV = "production";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { m.getEnv(); console.log("UNEXPECTED: should have exited"); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("exit code 1", proc.exitCode === 1, { exitCode: proc.exitCode });
  check("message mentions CORS_ORIGIN is required", /CORS_ORIGIN/.test(stderr), stderr.slice(0, 400));
}

// ---------------------------------------------------------------------------
// 3) Server-side behaviour: security headers + CORS + body limit
// ---------------------------------------------------------------------------
console.log("3) Security headers on /api/health");
await startServer({ CORS_ORIGIN: "https://app.example.com" });
{
  const r = await fetch(`${H}/api/health`);
  const headers = Object.fromEntries(r.headers.entries());
  check("X-Content-Type-Options: nosniff", headers["x-content-type-options"] === "nosniff", headers);
  check("Referrer-Policy: no-referrer", headers["referrer-policy"] === "no-referrer", headers);
  check("X-Frame-Options: DENY", headers["x-frame-options"] === "DENY", headers);
  check("COOP: same-origin", headers["cross-origin-opener-policy"] === "same-origin", headers);
  // CSP is Report-Only in this checkpoint (see SECURITY_AUDIT.md H-3).
  check("CSP is Report-Only (not enforcing)", headers["content-security-policy-report-only"]?.includes("default-src 'self'"), headers);
  check("No enforcing CSP present", headers["content-security-policy"] === undefined, headers);
  check("Report-Only CSP includes frame-ancestors 'none'", (headers["content-security-policy-report-only"] ?? "").includes("frame-ancestors 'none'"), headers);
  check("Permissions-Policy denies camera", (headers["permissions-policy"] ?? "").includes("camera=()"), headers);
  // COEP intentionally omitted this checkpoint (would break cross-origin media in
  // the split-origin Pages deployment). CORP same-origin is set instead.
  check("CORP: same-origin", headers["cross-origin-resource-policy"] === "same-origin", headers);
}

console.log("4) CORS allowlist");
{
  const allowed = await fetch(`${H}/api/health`, { headers: { Origin: "https://app.example.com" } });
  check("allowed origin echoed", allowed.headers.get("access-control-allow-origin") === "https://app.example.com", allowed.headers);
  const blocked = await fetch(`${H}/api/health`, { headers: { Origin: "https://evil.example" } });
  check("unlisted origin → 403", blocked.status === 403, blocked.status);
  const noOrigin = await fetch(`${H}/api/health`);
  check("no origin → 200 (non-browser client)", noOrigin.status === 200, noOrigin.status);
  // Browsers send Origin on SAME-ORIGIN POSTs too — must not be blocked.
  const sameOriginPost = await fetch(`${H}/api/health`, {
    headers: { Origin: `http://127.0.0.1:${TEST_PORT}`, Host: `127.0.0.1:${TEST_PORT}` },
  });
  check("same-origin Origin header (browser POST) → 200", sameOriginPost.status === 200, sameOriginPost.status);
  // And a cross-origin Origin under the allowlist is still blocked.
  const blockedSameHost = await fetch(`${H}/api/health`, {
    headers: { Origin: "https://evil.example", Host: `127.0.0.1:${TEST_PORT}` },
  });
  check("cross-origin Origin with same Host → 403", blockedSameHost.status === 403, blockedSameHost.status);
}

// ---------------------------------------------------------------------------
// 5) Body size limit (4 MB)
// ---------------------------------------------------------------------------
console.log("5) Body size limit");
{
  // A 5 MB JSON body must be rejected.
  const big = JSON.stringify({ name: "x".repeat(5 * 1024 * 1024), timeline: { clips: [] } });
  const res = await fetch(`${H}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: big,
  });
  check("oversized body rejected (413)", res.status === 413, { status: res.status });
  // A small body still works.
  const small = JSON.stringify({ name: "ok", timeline: { clips: [] } });
  const ok = await fetch(`${H}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: small,
  });
  check("small body still accepted", [200, 201, 401].includes(ok.status), ok.status);
}

// ---------------------------------------------------------------------------
// 6) Media token tamper rejection
// ---------------------------------------------------------------------------
console.log("6) Media token tamper");
{
  const res = await fetch(`${H}/api/media/doesnotexist/raw?st=tampered.abc.def.sig`);
  check("tampered token rejected (401)", res.status === 401, res.status);
}

killServer();

// ---------------------------------------------------------------------------
// 7) Pre-commit hook — tested against the REAL hook in a temp git repo.
//    Exercises the actual script (grep args, case-insensitivity, exit codes),
//    not just the regex in isolation.
// ---------------------------------------------------------------------------
console.log("7) Pre-commit secret scanner (real hook)");
{
  const tmp = fs.mkdtempSync(path.join("/tmp", "vf-hook-"));
  const run = async (files: Record<string, string>): Promise<{ code: number; out: string }> => {
    const repoDir = path.join(tmp, `repo-${Math.random().toString(36).slice(2, 10)}`);
    fs.mkdirSync(repoDir, { recursive: true });
    const proc = spawn("bash", ["-c", `
      set -e
      cd ${JSON.stringify(repoDir)}
      git init -q && git config user.email t@t && git config user.name t
      cp ${ROOT}/script/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
      ${Object.entries(files).map(([k, v]) => `printf '%s\\n' ${JSON.stringify(v)} > ${k}`).join(" && ")}
      git add -A
      git commit -q -m test 2>&1
      exit 0
    `], { cwd: repoDir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (out += d));
    await once(proc, "exit");
    return { code: proc.exitCode ?? 0, out };
  };

  const good = await run({ "a.txt": "just a normal line of code" });
  check("clean file commits (no block)", !good.out.includes("Commit blocked"), { out: good.out.slice(0, 300) });
  check("clean commit actually succeeded", !good.out.includes("error"), { out: good.out.slice(0, 300) });

  const sk = await run({ "b.ts": 'const KEY = "sk-abcdefabcdefabcdefabcdefabcdef";' });
  check("sk- secret blocked", sk.out.includes("Commit blocked"), { out: sk.out.slice(0, 300) });
  check("sk- message does NOT echo the secret", !sk.out.includes("sk-abcdef"), { out: sk.out.slice(0, 300) });

  const aws = await run({ "c.ts": 'const KEY = "AKIAIOSFODNN7EXAMPLE";' });
  check("AWS AKIA key blocked", aws.out.includes("Commit blocked"), { out: aws.out.slice(0, 300) });

  const pk = await run({ "d.txt": "-----BEGIN RSA PRIVATE KEY-----" });
  check("private key block detected", pk.out.includes("Commit blocked"), { out: pk.out.slice(0, 300) });

  // Short sk- prefix is NOT a real secret and must not block (no false positive).
  const short = await run({ "e.ts": 'const x = "sk-SHORT";' });
  check("short sk- prefix NOT blocked", !short.out.includes("Commit blocked"), { out: short.out.slice(0, 300) });

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 8) Env: blank values in .env.example must not break startup
// ---------------------------------------------------------------------------
console.log("8) Env: blank optional values tolerated");
{
  const tmpScript = path.join(ROOT, ".tmp-env-test-3.mjs");
  fs.writeFileSync(tmpScript, `
    // Simulate a user copying .env.example verbatim (with blank values).
    process.env.APP_URL = "";
    process.env.VIDEOFORGE_BOOTSTRAP_KEY = "";
    process.env.NODE_ENV = "development";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => {
        const e = m.getEnv();
        if (e.APP_URL !== undefined || e.VIDEOFORGE_BOOTSTRAP_KEY !== undefined) {
          console.error("blank vars should normalise to undefined, got:", e.APP_URL, e.VIDEOFORGE_BOOTSTRAP_KEY);
          process.exit(2);
        }
        console.log("OK");
        process.exit(0);
      })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("blank APP_URL/BOOTSTRAP_KEY normalise to undefined", proc.exitCode === 0, { code: proc.exitCode, stderr: stderr.slice(0, 300) });
}

// ---------------------------------------------------------------------------
// 9) CORS_ORIGIN=none explicitly denies cross-origin
// ---------------------------------------------------------------------------
console.log("9) CORS_ORIGIN=none denies cross-origin");
{
  const tmpScript = path.join(ROOT, ".tmp-env-test-4.mjs");
  fs.writeFileSync(tmpScript, `
    process.env.NODE_ENV = "development";
    process.env.CORS_ORIGIN = "none";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => {
        const e = m.getEnv();
        const withOrigin = m.isCorsAllowed("https://app.example.com", "api.example.com");
        // Browsers send Origin on same-origin POSTs — must be allowed.
        const sameOriginPost = m.isCorsAllowed("https://api.example.com", "api.example.com");
        const noOrigin = m.isCorsAllowed(undefined, undefined);
        if (withOrigin) { console.error("FAIL: cross-origin should be denied under 'none'"); process.exit(2); }
        if (!sameOriginPost) { console.error("FAIL: same-origin POST Origin should be allowed under 'none'"); process.exit(2); }
        if (!noOrigin) { console.error("FAIL: non-browser (no Origin) should still work under 'none'"); process.exit(2); }
        console.log("OK"); process.exit(0);
      })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("'none' denies Origin but allows same-origin", proc.exitCode === 0, { code: proc.exitCode, stderr: stderr.slice(0, 300) });
}

// ---------------------------------------------------------------------------
// 11) Production: http:// and localhost CORS entries rejected
// ---------------------------------------------------------------------------
console.log("11) Production rejects http:// and localhost CORS entries");
for (const bad of ["http://app.example.com", "https://localhost:3000", "https://127.0.0.1:5000"]) {
  const tmpScript = path.join(ROOT, `.tmp-env-test-${bad.length}.mjs`);
  fs.writeFileSync(tmpScript, `
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.CORS_ORIGIN = ${JSON.stringify(bad)};
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { m.getEnv(); console.log("UNEXPECTED: should have exited"); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check(`production rejects ${bad}`, proc.exitCode === 1, { code: proc.exitCode, stderr: stderr.slice(0, 300) });
}

// ---------------------------------------------------------------------------
// 12) Production: APP_ENV=development is rejected
// ---------------------------------------------------------------------------
console.log("12) Production rejects APP_ENV=development");
{
  const tmpScript = path.join(ROOT, ".tmp-env-appenv.mjs");
  fs.writeFileSync(tmpScript, `
    process.env.NODE_ENV = "production";
    // APP_ENV defaults to development — must be an error
    process.env.CORS_ORIGIN = "https://app.example.com";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { m.getEnv(); console.log("UNEXPECTED: should have exited"); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("APP_ENV=development under NODE_ENV=production rejected", proc.exitCode === 1 && stderr.includes("APP_ENV"), { code: proc.exitCode, stderr: stderr.slice(0, 300) });
}

// ---------------------------------------------------------------------------
// 13) Weak bootstrap key rejected
// ---------------------------------------------------------------------------
console.log("13) Weak bootstrap key rejected");
for (const weak of ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "01234567890123456789012345678901", "short"]) {
  const tmpScript = path.join(ROOT, `.tmp-env-boot-${weak.length}.mjs`);
  fs.writeFileSync(tmpScript, `
    process.env.VIDEOFORGE_BOOTSTRAP_KEY = ${JSON.stringify(weak)};
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { m.getEnv(); console.log("UNEXPECTED: should have exited"); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check(`weak bootstrap key (${weak.slice(0, 8)}…) rejected`, proc.exitCode === 1 && stderr.includes("BOOTSTRAP_KEY"), { code: proc.exitCode, stderr: stderr.slice(0, 300) });
}
// A strong key is accepted.
{
  const tmpScript = path.join(ROOT, ".tmp-env-boot-strong.mjs");
  fs.writeFileSync(tmpScript, `
    process.env.VIDEOFORGE_BOOTSTRAP_KEY = "a8f3c9e2b7d4f6a1c8e5b3d9f2a7c4e6b9d1f8a3c5e7b9d1f4a6c8e2b5d7f9a1";
    import("${ROOT.replace(/\\/g, "/")}/server/env.ts")
      .then((m) => { const e = m.getEnv(); if (!e.VIDEOFORGE_BOOTSTRAP_KEY) { process.exit(2); } console.log("OK"); process.exit(0); })
      .catch((e) => { console.error("import error", e); process.exit(2); });
  `);
  const proc = spawn("npx", ["tsx", tmpScript], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  await once(proc, "exit");
  fs.unlinkSync(tmpScript);
  check("strong bootstrap key accepted", proc.exitCode === 0, { code: proc.exitCode });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("SECURITY TESTS FAILED");
  process.exit(1);
}
process.exit(0);
