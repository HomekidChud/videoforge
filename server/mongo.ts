/**
 * Optional MongoDB configuration for VideoForge.
 *
 * MongoDB is NOT the application datastore — projects, media metadata and
 * API keys stay in SQLite (see storage.ts). This module provides a configured,
 * verified MongoDB connection for anything that wants to use it (analytics,
 * exports, integrations), driven entirely by the environment:
 *
 *   MONGODB_URI        connection string, e.g.
 *                      mongodb+srv://user:pass@cluster.example/videoforge
 *   MONGODB_DB         database name (default: "videoforge")
 *
 * Behaviour is explicit and safe:
 * - No MONGODB_URI → MongoDB is simply not configured. Nothing connects,
 *   no network access happens, and the app runs exactly as before.
 * - MONGODB_URI set → the connection is created lazily on first use, with
 *   bounded timeouts so a slow or dead cluster never hangs the server.
 * - A failed connection never falls back to another store and never crashes
 *   the process: callers get a thrown error and /api/health reports it.
 * - Credentials are never logged. Errors are redacted to the driver code.
 */
import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI?.trim() || "";
const MONGODB_DB = process.env.MONGODB_DB?.trim() || "videoforge";

/** True when the operator has explicitly configured a MongoDB connection. */
export function mongoConfigured(): boolean {
  return MONGODB_URI.length > 0;
}

/** Redact anything that looks like credentials from an error message. */
function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/(mongodb(\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/gi, "$1<redacted>:<redacted>@");
}

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

/**
 * Lazily create (and reuse) the MongoDB client. Bounded timeouts keep a bad
 * cluster from hanging callers: 5s to select a server, 10s overall socket.
 */
async function getClient(): Promise<MongoClient> {
  if (client) return client;
  if (!connecting) {
    connecting = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      socketTimeoutMS: 10_000,
      maxPoolSize: 10,
    })
      .connect()
      .then((c) => {
        client = c;
        return c;
      })
      .catch((e) => {
        connecting = null; // allow a retry on the next call
        throw e;
      });
  }
  return connecting;
}

/** Get the configured MongoDB database handle (connects on first use). */
export async function getMongoDb(): Promise<Db> {
  if (!mongoConfigured()) {
    throw new Error("MongoDB is not configured: set MONGODB_URI to enable it.");
  }
  const c = await getClient();
  return c.db(MONGODB_DB);
}

/**
 * Health probe for /api/health. Never throws.
 *  - notConfigured: no MONGODB_URI — nothing to report, nothing to connect to.
 *  - ok/error: a live ping result against the configured database.
 */
export async function mongoHealth(): Promise<
  | { status: "notConfigured" }
  | { status: "ok"; database: string }
  | { status: "error"; message: string }
> {
  if (!mongoConfigured()) return { status: "notConfigured" };
  try {
    const c = await getClient();
    await c.db(MONGODB_DB).command({ ping: 1 });
    return { status: "ok", database: MONGODB_DB };
  } catch (e) {
    return { status: "error", message: safeMessage(e) };
  }
}

/** Close the pool on shutdown. Safe to call when never configured. */
export async function closeMongo(): Promise<void> {
  const c = client;
  client = null;
  connecting = null;
  if (c) await c.close().catch(() => undefined);
}
