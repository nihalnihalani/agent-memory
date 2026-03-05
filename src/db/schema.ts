import Database from "better-sqlite3";
import path from "path";
import { existsSync, mkdirSync } from "fs";

let fts5Available = false;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function openDatabaseWithRetry(dbPath: string): Database.Database {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      return db;
    } catch (err: any) {
      lastError = err;
      console.warn(`Database open attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        // Synchronous busy-wait for retry (better-sqlite3 is synchronous)
        const start = Date.now();
        while (Date.now() - start < RETRY_DELAY_MS * attempt) {
          // busy wait
        }
      }
    }
  }
  throw new Error(`Failed to open database after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export function initializeDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = openDatabaseWithRetry(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'note',
      context TEXT,
      agent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (memory_id, tag)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_key TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT,
      status TEXT DEFAULT 'pending',
      summary TEXT NOT NULL,
      stuck_reason TEXT,
      next_steps TEXT NOT NULL,
      context_keys TEXT,
      picked_up_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      picked_up_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
      old_value TEXT NOT NULL,
      old_type TEXT,
      old_context TEXT,
      changed_by TEXT,
      changed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
    CREATE INDEX IF NOT EXISTS idx_handoffs_from ON handoffs(from_agent);
    CREATE INDEX IF NOT EXISTS idx_memory_history_mid ON memory_history(memory_id);
  `);

  // Try to create FTS5 virtual table
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        key, value, context,
        content='memories',
        content_rowid='id',
        tokenize='porter unicode61'
      );
    `);

    // Create triggers to keep FTS5 in sync
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, key, value, context)
        VALUES (new.id, new.key, new.value, new.context);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, value, context)
        VALUES ('delete', old.id, old.key, old.value, old.context);
        INSERT INTO memories_fts(rowid, key, value, context)
        VALUES (new.id, new.key, new.value, new.context);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, key, value, context)
        VALUES ('delete', old.id, old.key, old.value, old.context);
      END;
    `);

    // Verify FTS5 index integrity; rebuild if corrupt
    try {
      db.prepare(`SELECT COUNT(*) FROM memories_fts`).get();
    } catch {
      console.warn("FTS5 index appears corrupt, rebuilding...");
      try {
        db.exec(`INSERT INTO memories_fts(memories_fts) VALUES('rebuild')`);
        console.log("FTS5 index rebuilt successfully");
      } catch (rebuildErr: any) {
        console.warn(`FTS5 rebuild failed: ${rebuildErr.message}, recreating FTS table...`);
        try {
          db.exec(`DROP TABLE IF EXISTS memories_fts`);
          db.exec(`
            CREATE VIRTUAL TABLE memories_fts USING fts5(
              key, value, context,
              content='memories',
              content_rowid='id',
              tokenize='porter unicode61'
            );
            INSERT INTO memories_fts(memories_fts) VALUES('rebuild');
          `);
          console.log("FTS5 table recreated and rebuilt successfully");
        } catch {
          console.warn("FTS5 completely unavailable, falling back to LIKE search");
          fts5Available = false;
          return db;
        }
      }
    }

    fts5Available = true;
  } catch {
    console.warn("FTS5 not available, falling back to LIKE-based search");
    fts5Available = false;
  }

  return db;
}

export function isFts5Available(): boolean {
  return fts5Available;
}

/**
 * Rebuild the FTS5 index. Call this if search results seem stale or incorrect.
 */
export function rebuildFtsIndex(db: Database.Database): boolean {
  if (!fts5Available) return false;
  try {
    db.exec(`INSERT INTO memories_fts(memories_fts) VALUES('rebuild')`);
    return true;
  } catch (err: any) {
    console.warn(`FTS5 rebuild failed: ${err.message}`);
    return false;
  }
}
