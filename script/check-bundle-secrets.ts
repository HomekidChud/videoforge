// ============================================================================
// Post-build bundle secret check.
//
// Runs after `vite build` and scans dist/public for values that look like
// credentials. Fails the build (exit 1) if any are found.
//
// This is the "CI check that scans the built bundle for secret values" — it
// can only run on the produced artifact, not on source.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
// Tests override the dist path with VIDEOFORGE_DIST_OVERRIDE.
const DIST = process.env.VIDEOFORGE_DIST_OVERRIDE
  ? path.resolve(process.env.VIDEOFORGE_DIST_OVERRIDE)
  : path.resolve(ROOT, "dist", "public");

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "OpenAI-style sk- key", re: /sk-[A-Za-z0-9_\-]{20,}/g },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
  { name: "GitHub personal token", re: /gh[pousr]_[0-9a-zA-Z]{36}/g },
  { name: "Google API key", re: /AIza[0-9A-Za-z_\-]{35}/g },
  { name: "GitLab PAT", re: /glpat-[0-9a-zA-Z_\-]{20,}/g },
  { name: "Slack token", re: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g },
  { name: "private key block", re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { name: "JWT (HS256 prefix)", re: /eyJhbGciOiJIUzI1NiIs/g },
];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|css|html|json|svg|txt)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk(DIST);
if (!files.length) {
  console.error(`✗ check-bundle-secrets: no built files found at ${DIST}. Run 'vite build' first.`);
  process.exit(1);
}

let hits = 0;
for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  for (const { name, re } of PATTERNS) {
    const matches = content.match(re);
    if (matches?.length) {
      hits++;
      console.error(`✗ ${path.relative(ROOT, file)}: ${matches.length} match(es) of "${name}"`);
    }
  }
}

if (hits) {
  console.error(`\n✗ check-bundle-secrets: ${hits} file(s) contain secret-looking values. Failing build.`);
  console.error("  These must be removed from the client bundle before deploying.");
  process.exit(1);
}

console.log(`✓ check-bundle-secrets: scanned ${files.length} file(s), no secrets found.`);
process.exit(0);
