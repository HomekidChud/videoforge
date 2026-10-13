import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { registerKeyRoutes, ensureOwnerKeyExists } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { getEnv, isCorsAllowed, maxUploadBytes } from "./env";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ---------------------------------------------------------------------------
// Security headers. Applied to every response. CSP is a default-deny baseline;
// the Vite dev server adds its own for HMR in development.
// ---------------------------------------------------------------------------
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'", // Vite injects inline styles in dev; production build is static
      "script-src 'self'",
      "connect-src 'self' ws: wss: http: https: blob: data:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  next();
});

// ---------------------------------------------------------------------------
// CORS — allowlist from CORS_ORIGIN. In development, an unset CORS_ORIGIN
// means "allow all" (Vite HMR). In production, an unset CORS_ORIGIN is a
// boot-time error (see server/env.ts).
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isCorsAllowed(origin)) {
    return res.status(403).json({ message: "Origin not allowed." });
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Range");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Body parsers. Bounded so an oversized JSON body can't exhaust memory.
// multipart is skipped so busboy can stream the raw body (media upload).
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }
  return express.json({
    limit: "4mb", // H-15 / H-16: previously unbounded
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })(req, _res, next);
});

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // strip querystring so signed media tokens never appear in logs
      const safePath = path.split("?")[0];
      let logLine = `${req.method} ${safePath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive fields before logging so media tokens and
        // newly-minted plaintext API keys never appear in logs.
        const safe = JSON.parse(JSON.stringify(capturedJsonResponse));
        if (typeof safe === "object" && safe !== null) {
          if (typeof safe.token === "string") safe.token = "<redacted>";
          if (typeof safe.key === "string") safe.key = "<redacted>";
          if (Array.isArray(safe.keys)) {
            for (const k of safe.keys) if (k && typeof k === "object") k.key = undefined;
          }
        }
        logLine += ` :: ${JSON.stringify(safe)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate env before anything else — fail fast on missing/invalid vars.
  const env = getEnv();

  // ensure an admin key exists on first boot (writes data/OWNER_KEY.txt)
  try { await ensureOwnerKeyExists(); } catch (e) { console.error("failed to create owner key:", e); }
  registerKeyRoutes(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  httpServer.listen(
    {
      port: env.PORT,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${env.PORT}`);
    },
  );
})();
