/**
 * On-demand MongoDB connectivity check: `npm run mongo:check`.
 *
 * Connects to the configured MONGODB_URI (if any), pings the database and
 * prints the result. Exit code 0 on ok / not-configured, 1 on error — so it
 * can be used in deploy hooks and health scripts. Deliberately separate from
 * /api/health so an unreachable integration can never affect app liveness.
 */
import { mongoConfigured, mongoHealth, closeMongo } from "../server/mongo";

const result = await mongoHealth();

if (!mongoConfigured()) {
  console.log("MongoDB is not configured (MONGODB_URI is unset) — nothing to check. Exit 0.");
} else {
  switch (result.status) {
    case "ok":
      console.log(`MongoDB OK — connected and pinged database "${result.database}".`);
      break;
    case "error":
      console.error(`MongoDB ERROR — ${result.error}`);
      break;
  }
}

await closeMongo();
if (result.status === "error") process.exit(1);
