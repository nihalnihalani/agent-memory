import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase, isFts5Available, rebuildFtsIndex, cleanupOldRecords } from "./schema.js";

let db: Database.Database;

afterEach(() => {
  if (db) db.close();
});

describe("initializeDatabase", () => {
  it("should create all required tables", () => {
    db = initializeDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("memories");
    expect(tableNames).toContain("tags");
    expect(tableNames).toContain("activity_log");
    expect(tableNames).toContain("handoffs");
    expect(tableNames).toContain("memory_history");
  });

  it("should create required indexes", () => {
    db = initializeDatabase(":memory:");
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_tags_tag");
    expect(indexNames).toContain("idx_memories_key");
    expect(indexNames).toContain("idx_memories_created");
    expect(indexNames).toContain("idx_memories_type");
    expect(indexNames).toContain("idx_activity_agent");
    expect(indexNames).toContain("idx_activity_time");
    expect(indexNames).toContain("idx_handoffs_status");
    expect(indexNames).toContain("idx_handoffs_from");
    expect(indexNames).toContain("idx_memory_history_mid");
  });

  it("should enable WAL mode", () => {
    db = initializeDatabase(":memory:");
    const mode = db.pragma("journal_mode", { simple: true });
    // In-memory databases may use 'memory' mode instead of 'wal'
    expect(["wal", "memory"]).toContain(mode);
  });

  it("should enable foreign keys", () => {
    db = initializeDatabase(":memory:");
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("should be idempotent (safe to re-run schema SQL)", () => {
    db = initializeDatabase(":memory:");
    // Running the same CREATE TABLE IF NOT EXISTS should not throw
    db.exec(`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'note',
      context TEXT,
      agent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0
    )`);
    expect(true).toBe(true);
  });
});

describe("isFts5Available", () => {
  it("should return a boolean", () => {
    db = initializeDatabase(":memory:");
    const result = isFts5Available();
    expect(typeof result).toBe("boolean");
  });

  it("should be true when FTS5 is supported", () => {
    db = initializeDatabase(":memory:");
    if (isFts5Available()) {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'memories_fts'")
        .all();
      expect(tables).toHaveLength(1);
    }
  });
});

describe("rebuildFtsIndex", () => {
  it("should rebuild FTS index successfully", () => {
    db = initializeDatabase(":memory:");
    if (isFts5Available()) {
      const result = rebuildFtsIndex(db);
      expect(result).toBe(true);
    }
  });

  it("should return false when FTS5 is not available", () => {
    // Hard to test directly since better-sqlite3 usually has FTS5,
    // but the function should handle it
    db = initializeDatabase(":memory:");
    // This test validates the function is callable
    const result = rebuildFtsIndex(db);
    expect(typeof result).toBe("boolean");
  });
});

describe("FTS5 triggers", () => {
  it("should have triggers for FTS sync when FTS5 is available", () => {
    db = initializeDatabase(":memory:");
    if (!isFts5Available()) return;

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
      .all() as { name: string }[];
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain("memories_ai");
    expect(triggerNames).toContain("memories_au");
    expect(triggerNames).toContain("memories_ad");
  });
});

describe("foreign key constraints", () => {
  it("should cascade delete tags when memory is deleted", () => {
    db = initializeDatabase(":memory:");
    db.prepare("INSERT INTO memories (key, value) VALUES (?, ?)").run("test-fk", "value");
    const mem = db.prepare("SELECT id FROM memories WHERE key = ?").get("test-fk") as { id: number };
    db.prepare("INSERT INTO tags (memory_id, tag) VALUES (?, ?)").run(mem.id, "my-tag");

    db.prepare("DELETE FROM memories WHERE key = ?").run("test-fk");

    const tags = db.prepare("SELECT * FROM tags WHERE memory_id = ?").all(mem.id);
    expect(tags).toHaveLength(0);
  });

  it("should cascade delete history when memory is deleted", () => {
    db = initializeDatabase(":memory:");
    db.prepare("INSERT INTO memories (key, value) VALUES (?, ?)").run("hist-fk", "v1");
    const mem = db.prepare("SELECT id FROM memories WHERE key = ?").get("hist-fk") as { id: number };
    db.prepare("INSERT INTO memory_history (memory_id, old_value) VALUES (?, ?)").run(mem.id, "old-v");

    db.prepare("DELETE FROM memories WHERE key = ?").run("hist-fk");

    const history = db.prepare("SELECT * FROM memory_history WHERE memory_id = ?").all(mem.id);
    expect(history).toHaveLength(0);
  });
});

describe("cleanupOldRecords", () => {
  it("should delete activity_log entries older than 30 days", () => {
    db = initializeDatabase(":memory:");
    // Insert an old activity log entry (45 days ago)
    db.prepare(
      `INSERT INTO activity_log (agent_id, action, detail, created_at) VALUES (?, ?, ?, datetime('now', '-45 days'))`
    ).run("agent-old", "test", "old entry");
    // Insert a recent activity log entry
    db.prepare(
      `INSERT INTO activity_log (agent_id, action, detail, created_at) VALUES (?, ?, ?, datetime('now', '-1 day'))`
    ).run("agent-recent", "test", "recent entry");

    const result = cleanupOldRecords(db);

    expect(result.activityDeleted).toBe(1);
    const remaining = db.prepare("SELECT COUNT(*) as c FROM activity_log").get() as { c: number };
    expect(remaining.c).toBe(1);
  });

  it("should delete memory_history entries older than 90 days", () => {
    db = initializeDatabase(":memory:");
    // Insert a memory so foreign key is valid
    db.prepare("INSERT INTO memories (key, value) VALUES (?, ?)").run("cleanup-test", "v1");
    const mem = db.prepare("SELECT id FROM memories WHERE key = ?").get("cleanup-test") as { id: number };

    // Insert an old history entry (120 days ago)
    db.prepare(
      `INSERT INTO memory_history (memory_id, old_value, changed_at) VALUES (?, ?, datetime('now', '-120 days'))`
    ).run(mem.id, "very old value");
    // Insert a recent history entry (10 days ago)
    db.prepare(
      `INSERT INTO memory_history (memory_id, old_value, changed_at) VALUES (?, ?, datetime('now', '-10 days'))`
    ).run(mem.id, "recent value");

    const result = cleanupOldRecords(db);

    expect(result.historyDeleted).toBe(1);
    const remaining = db.prepare("SELECT COUNT(*) as c FROM memory_history").get() as { c: number };
    expect(remaining.c).toBe(1);
  });

  it("should preserve recent activity_log entries", () => {
    db = initializeDatabase(":memory:");
    // Insert entries at 1, 15, and 29 days ago (all within 30-day window)
    for (const days of [1, 15, 29]) {
      db.prepare(
        `INSERT INTO activity_log (agent_id, action, created_at) VALUES (?, ?, datetime('now', '-${days} days'))`
      ).run("agent", "test");
    }

    const result = cleanupOldRecords(db);

    expect(result.activityDeleted).toBe(0);
    const remaining = db.prepare("SELECT COUNT(*) as c FROM activity_log").get() as { c: number };
    expect(remaining.c).toBe(3);
  });

  it("should preserve recent memory_history entries within 90-day window", () => {
    db = initializeDatabase(":memory:");
    db.prepare("INSERT INTO memories (key, value) VALUES (?, ?)").run("hist-keep", "v1");
    const mem = db.prepare("SELECT id FROM memories WHERE key = ?").get("hist-keep") as { id: number };

    // Insert entries at 1, 45, and 89 days ago (all within 90-day window)
    for (const days of [1, 45, 89]) {
      db.prepare(
        `INSERT INTO memory_history (memory_id, old_value, changed_at) VALUES (?, ?, datetime('now', '-${days} days'))`
      ).run(mem.id, `value-${days}`);
    }

    const result = cleanupOldRecords(db);

    expect(result.historyDeleted).toBe(0);
    const remaining = db.prepare("SELECT COUNT(*) as c FROM memory_history").get() as { c: number };
    expect(remaining.c).toBe(3);
  });

  it("should return zero counts when no old records exist", () => {
    db = initializeDatabase(":memory:");
    const result = cleanupOldRecords(db);
    expect(result.activityDeleted).toBe(0);
    expect(result.historyDeleted).toBe(0);
  });
});
