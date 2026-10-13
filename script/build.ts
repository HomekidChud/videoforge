import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { spawn } from "node:child_process";
import { rm, readFile } from "node:fs/promises";
import path from "node:path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building docs (SSG)...");
  // Static site for /docs and /home — real URLs, no JS required.
  await new Promise<void>((resolve, reject) => {
    const p = spawn("npx", ["tsx", "script/build-docs.ts"], {
      cwd: path.resolve(import.meta.dirname ?? ".", ".."),
      stdio: "inherit",
    });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`build-docs failed (exit ${c})`))));
    p.on("error", reject);
  });

  console.log("checking client bundle for secrets...");
  // Post-build secret check on the produced bundle.
  await new Promise<void>((resolve, reject) => {
    const p = spawn("npx", ["tsx", "script/check-bundle-secrets.ts"], {
      cwd: path.resolve(import.meta.dirname ?? ".", ".."),
      stdio: "inherit",
    });
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`check-bundle-secrets failed (exit ${c})`))));
    p.on("error", reject);
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
