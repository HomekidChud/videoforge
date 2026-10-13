import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Docs (static SSG, no JS) — /docs/*, /home. Explicit so the SPA fallback
  // doesn't swallow them and so hash routes stay untouched.
  const docsPath = path.resolve(distPath, "docs");
  if (fs.existsSync(docsPath)) {
    app.use("/docs", (req, res, next) => {
      // Serve the directory index for /docs and /docs/<page>/ (trailing slash or not).
      let p = req.path.replace(/^\/+/, "");
      if (p === "") p = "index.html";
      else if (!path.extname(p)) p = path.join(p, "index.html");
      const file = path.resolve(docsPath, p);
      if (!file.startsWith(docsPath)) return next();
      res.sendFile(file, err => err ? next() : undefined);
    });
  }

  // Home — static, not the SPA.
  if (fs.existsSync(path.resolve(distPath, "docs", "home.html"))) {
    app.get("/home", (_req, res) => res.sendFile(path.resolve(distPath, "docs", "home.html")));
  }

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
