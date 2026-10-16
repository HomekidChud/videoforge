import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { registerKeyRoutes, ensureOwnerKeyExists } from "./auth";
import { registerAccountRoutes } from "./accounts";
import { storageDegraded } from "./storage";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
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

// CORS — a specific origin when CORS_ORIGIN is set; otherwise reflect the
// request's Origin (needed for cookie sign-in: credentialed responses may not
// use "*"). Same-origin requests have no Origin header and don't need CORS.
app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN ?? (typeof req.headers.origin === "string" ? req.headers.origin : "*");
  res.setHeader("Access-Control-Allow-Origin", origin);
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
  // If the configured database could not be opened (e.g. the env points
  // outside the mounted Render disk), the server boots on an in-memory DB for
  // reads and health, but every mutating /api request is rejected with a 503
  // that says exactly what to fix. Writes are REFUSED, never silently accepted
  // into a disposable database that would lose them on redeploy.
  if (storageDegraded) {
    console.error(
      "[boot] storage is degraded: the configured VIDEOFORGE_DB could not be opened. " +
      "API write requests will be rejected with 503 until VIDEOFORGE_DB points at a " +
      "writable file inside a mounted persistent disk. No owner key is created in this state."
    );
    app.use("/api", (req, res, next) => {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating) {
        return res.status(503).json({
          message:
            "storage is degraded: the configured database path is not writable, so nothing can be saved. " +
            "Point VIDEOFORGE_DB at a file inside a mounted, writable persistent disk (e.g. /var/lib/<disk>/data.db) and redeploy.",
        });
      }
      next();
    });
  } else {
    // ensure an admin key exists on first boot (writes data/OWNER_KEY.txt)
    try { await ensureOwnerKeyExists(); } catch (e) { console.error("failed to create owner key:", e); }
  }
  registerKeyRoutes(app);
  registerAccountRoutes(app);
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

  // Graceful shutdown: close the optional MongoDB pool (no-op when not
  // configured) and stop accepting connections.
  const shutdown = async (signal: string) => {
    log(`received ${signal}, shutting down`);
    const { closeMongo } = await import("./mongo");
    await closeMongo().catch(() => undefined);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref?.();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
})();
