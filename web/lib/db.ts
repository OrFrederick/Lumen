import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";

// Singleton SQLite handle, opened read-only against ../data/library.db.
// The Python pipeline owns writes; the web app is read-only.

let _db: Database.Database | null = null;
let _missing = false;

function resolveDbPath(): string {
  // Allow override for deployments; default relative to repo root.
  const envPath = process.env.LUMEN_DB_PATH;
  if (envPath && envPath.length > 0) return envPath;
  return path.resolve(process.cwd(), "..", "data", "library.db");
}

export function getDb(): Database.Database | null {
  if (_db) return _db;
  if (_missing) return null;
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    _missing = true;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[lumen] library.db not found at ${dbPath} — pages will render empty states.`);
    }
    return null;
  }
  try {
    _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    _db.pragma("journal_mode = WAL");
    return _db;
  } catch (err) {
    _missing = true;
    // eslint-disable-next-line no-console
    console.warn("[lumen] failed to open library.db:", err);
    return null;
  }
}

/** Helper: run a query and always return an array (empty if db missing). */
export function safeAll<T = unknown>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  } catch (err) {
    // reason: schema may be missing virtual tables (e.g. vec0) in some environments
    // eslint-disable-next-line no-console
    console.warn("[lumen] query failed:", (err as Error).message);
    return [];
  }
}

/** Helper: get a single row, or null. */
export function safeGet<T = unknown>(sql: string, params: unknown[] = []): T | null {
  const db = getDb();
  if (!db) return null;
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(...params);
    return (row as T) ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[lumen] query failed:", (err as Error).message);
    return null;
  }
}
