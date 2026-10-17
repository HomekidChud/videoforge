/**
 * One-off, explicit rebuild-recovery helper. NOT called on boot, see the
 * safety comment in server/durable.ts. Use only if a rebuild lost the DB:
 *
 *   VIDEOFORGE_DB=path/to/data.db VIDEOFORGE_SYNC_DIR=path/to/restore npm run durable:restore
 *
 * Merges only rows that are missing from the live DB; it never overwrites
 * or rewrites a row that already exists, and it never contains or writes a
 * plaintext API key (only hashes).
 */
import Database from "better-sqlite3";
import { restoreFromManifest } from "../server/durable";

const dbPath = process.env.VIDEOFORGE_DB;
if (!dbPath) { console.error("Set VIDEOFORGE_DB to the SQLite file to restore into."); process.exit(1); }
if (!process.env.VIDEOFORGE_SYNC_DIR) { console.error("Set VIDEOFORGE_SYNC_DIR to the manifest directory."); process.exit(1); }
const sqlite = new Database(dbPath);
const result = restoreFromManifest(sqlite as never);
console.log(result.restored ? `Restored from manifest: ${JSON.stringify(result.counts)}` : "Nothing to restore, the DB already has every row the manifest has.");
