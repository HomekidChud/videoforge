import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { registerKeyRoutes, ensureOwnerKeyExists } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
// trust proxy configuration for IP allowlists (clientIp()).
// VIDEOFORGE_TRUST_PROXY can be "true", a number of hops, or a specific
// proxy IP/CIDR. If unset, Express ignores X-Forwarded-For entirely
// (spoofed headers cannot satisfy an IP allowlist).
if (process.env.VIDEOFORGE_TRUST_PROXY) {
  const tp = process.env.VIDEOFORGE_TRUST_PROXY.trim();
  if (/^\d+$/.test(tp)) app.set("trust proxy", parseInt(tp, 10));
  else app.set("trust proxy", tp); // "true", IP, or CIDR
}
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// JSON body parsing (skip multipart so busboy can stream the raw body)
app.use((req, _res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }
  return express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })(req, _res, next);
});

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// CORS — allow the Pages origin (or any origin if CORS_ORIGIN unset in dev)
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
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
      // update the in-flight usage log row (written by the auth middleware
      // with status=0) to the ACTUAL response status code so usage logs show
      // real 2xx/4xx/5xx, not a placeholder.
      const key = (req as any).apiKey;
      const usageRowId = (req as any).vfUsageRowId;
      if (key && typeof key === "object" && typeof key.id === "string" && !key.id.startsWith("st:") && typeof usageRowId === "number") {
        try {
          // update ONLY the specific row for this request (prevents concurrent
          // requests sharing a key/method/path from having their statuses
          // corrupted together)
          const { updateKeyUsageStatus } = require("./storage");
          updateKeyUsageStatus(usageRowId, res.statusCode);
        } catch (e) { console.error("[usage-status] update failed:", e); /* non-fatal */ }
      }
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
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
