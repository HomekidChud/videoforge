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
 *   the process: callers get a thrown error, and `npm run mongo:check`
 *   (or mongoHealth()) reports it.
 * - /api/health reports only whether MongoDB is CONFIGURED — it never pings
 *   the cluster, so an unreachable integration cannot delay or fail the
 *   liveness of an otherwise healthy app. Use `npm run mongo:check` to verify
 *   connectivity on demand.
 * - Credentials and raw driver messages are never logged or returned: errors
 *   are reduced to the driver error name and code.
 */
import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI?.trim() || "";
const MONGODB_DB = process.env.MONGODB_DB?.trim() || "videoforge";

/** True when the operator has explicitly configured a MongoDB connection. */
export function mongoConfigured(): boolean {
  return MONGODB_URI.length > 0;
}

/**
 * A safe, generic description of a driver error: the error NAME and CODE only.
 * Driver messages can embed connection strings (with credentials) and server
 * topology details, so they are never passed through.
 */
function safeErrorKind(e: unknown): string {
  const name = e instanceof Error && e.name ? e.name : "MongoError";
  const code = (e as any)?.code ?? (e as any)?.codeName;
  return code ? `${name} (${code})` : name;
}

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;
let closed = false;

/**
 * Lazily create (and reuse) the MongoDB client. Bounded timeouts keep a bad
 * cluster from hanging callers: 5s to select a server, 10s overall socket.
 * After closeMongo() the module stays closed (no silent reconnect).
 */
async function getClient(): Promise<MongoClient> {
  if (client) return client;
  if (closed) throw new Error("MongoDB client was closed; restart the process to reconnect.");
  if (!connecting) {
    connecting = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      socketTimeoutMS: 10_000,
      maxPoolSize: 10,
    })
      .connect()
      .then(async (c) => {
        if (closed) {
          // closeMongo() ran while this connection was pending — close it
          // (awaited, so closeMongo can rely on it) and never repopulate
          // the module state.
          await c.close().catch(() => undefined);
          throw new Error("MongoDB client was closed while connecting.");
        }
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

/** Whether a live connection is currently established. */
export function isMongoConnected(): boolean {
  return client !== null;
}

/**
 * Verify the configured connection with a ping. Never throws; returns a
 * status object. Used by `npm run mongo:check` — deliberately NOT used by
 * /api/health, so liveness never depends on the optional integration.
 */
export async function mongoHealth(): Promise<
  | { status: "notConfigured" }
  | { status: "ok"; database: string }
  | { status: "error"; error: string }
> {
  if (!mongoConfigured()) return { status: "notConfigured" };
  try {
    const c = await getClient();
    await c.db(MONGODB_DB).command({ ping: 1 });
    return { status: "ok", database: MONGODB_DB };
  } catch (e) {
    return { status: "error", error: safeErrorKind(e) };
  }
}

/**
 * Close the pool on shutdown. Safe to call when never configured. If a
 * connection attempt is still pending, it is awaited (its result is closed
 * immediately by getClient) so nothing can repopulate the module afterwards.
 */
export async function closeMongo(): Promise<void> {
  closed = true;
  const pending = connecting;
  const c = client;
  client = null;
  connecting = null;
  if (pending) await pending.catch(() => undefined);
  if (c) await c.close().catch(() => undefined);
}
