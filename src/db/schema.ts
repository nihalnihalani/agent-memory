import Database from "better-sqlite3";
import path from "path";

let fts5Available = false;

export function initializeDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  const fs = require("fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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

    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);
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
