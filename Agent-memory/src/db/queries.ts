import type Database from "better-sqlite3";
import { isFts5Available } from "./schema.js";

const MAX_KEY_LENGTH = 500;
const MAX_VALUE_LENGTH = 10240;
const MAX_CONTEXT_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;

interface UpsertMemoryParams {
  key: string;
  value: string;
  type?: string;
  context?: string;
  agent_id?: string;
  tags?: string[];
}

interface SearchParams {
  query: string;
  tags?: string[];
  type?: string;
  limit?: number;
}

interface ListParams {
  tags?: string[];
  type?: string;
  limit?: number;
  offset?: number;
}

interface ActivityParams {
  agent_id: string;
  action: string;
  target_key?: string;
  detail?: string;
}

export interface MemoryRow {
  id: number;
  key: string;
  value: string;
  type: string;
  context: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
  access_count: number;
}

export interface SearchResultRow extends MemoryRow {
  rank: number;
}

export interface ActivityRow {
  id: number;
  agent_id: string;
  action: string;
  target_key: string | null;
  detail: string | null;
  created_at: string;
}

function validateInput(key: string, value: string): void {
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Key must be ${MAX_KEY_LENGTH} characters or less`);
  }
  if (Buffer.byteLength(value, "utf-8") > MAX_VALUE_LENGTH) {
    throw new Error(`Value must be ${MAX_VALUE_LENGTH} bytes or less`);
  }
}

const VALID_TYPES = ["decision", "preference", "task", "snippet", "note"];

function validateType(type: string | undefined): void {
  if (type && !VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}`);
  }
}

function sanitizeFtsQuery(query: string): string {
  return query.replace(/[*"(){}[\]:^~!@#$%&]/g, ' ').trim();
}

export function upsertMemory(db: Database.Database, params: UpsertMemoryParams): MemoryRow {
  validateInput(params.key, params.value);
  validateType(params.type);

  if (params.context && params.context.length > MAX_CONTEXT_LENGTH) {
    throw new Error(`Context must be ${MAX_CONTEXT_LENGTH} characters or less`);
  }

  if (params.tags) {
    if (params.tags.length > MAX_TAGS) {
      throw new Error(`Maximum of ${MAX_TAGS} tags allowed`);
    }
    for (const tag of params.tags) {
      if (tag.length > MAX_TAG_LENGTH) {
        throw new Error(`Each tag must be ${MAX_TAG_LENGTH} characters or less`);
      }
    }
  }

  const upsert = db.prepare(`
    INSERT INTO memories (key, value, type, context, agent_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      type = COALESCE(excluded.type, memories.type),
      context = COALESCE(excluded.context, memories.context),
      agent_id = COALESCE(excluded.agent_id, memories.agent_id),
      updated_at = datetime('now')
  `);

  const deleteTags = db.prepare(`DELETE FROM tags WHERE memory_id = (SELECT id FROM memories WHERE key = ?)`);
  const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (memory_id, tag) VALUES ((SELECT id FROM memories WHERE key = ?), ?)`);
  const getMemory = db.prepare(`SELECT * FROM memories WHERE key = ?`);

  const transaction = db.transaction(() => {
    upsert.run(
      params.key,
      params.value,
      params.type || "note",
      params.context || null,
      params.agent_id || null
    );

    if (params.tags !== undefined) {
      deleteTags.run(params.key);
      for (const tag of params.tags) {
        insertTag.run(params.key, tag);
      }
    }

    return getMemory.get(params.key) as MemoryRow;
  });

  return transaction();
}

export function searchMemories(db: Database.Database, params: SearchParams): SearchResultRow[] {
  const limit = Math.min(Math.max(params.limit || 5, 1), 20);

  if (isFts5Available()) {
    return searchWithFts5(db, params, limit);
  }
  return searchWithLike(db, params, limit);
}

function searchWithFts5(db: Database.Database, params: SearchParams, limit: number): SearchResultRow[] {
  const sanitizedQuery = sanitizeFtsQuery(params.query);
  if (!sanitizedQuery) {
    return searchWithLike(db, params, limit);
  }

  let sql = `
    SELECT m.*, bm25(memories_fts, 1.0, 2.0, 0.5) as rank
    FROM memories_fts fts
    JOIN memories m ON m.id = fts.rowid
  `;
  const conditions: string[] = [`fts MATCH ?`];
  const bindings: (string | number)[] = [sanitizedQuery];

  if (params.type) {
    conditions.push(`m.type = ?`);
    bindings.push(params.type);
  }

  if (params.tags && params.tags.length > 0) {
    conditions.push(
      `m.id IN (SELECT memory_id FROM tags WHERE tag IN (${params.tags.map(() => "?").join(",")}))`
    );
    bindings.push(...params.tags);
  }

  sql += ` WHERE ${conditions.join(" AND ")}`;
  // Fetch more than limit to allow composite re-ranking in application layer
  sql += ` ORDER BY rank LIMIT ?`;
  bindings.push(limit * 3);

  try {
    return db.prepare(sql).all(...bindings) as SearchResultRow[];
  } catch {
    // If FTS query syntax fails, fall back to LIKE
    return searchWithLike(db, params, limit);
  }
}

function searchWithLike(db: Database.Database, params: SearchParams, limit: number): SearchResultRow[] {
  let sql = `SELECT *, 0.0 as rank FROM memories m WHERE 1=1`;
  const bindings: (string | number)[] = [];

  const likePattern = `%${params.query}%`;
  sql += ` AND (m.key LIKE ? OR m.value LIKE ? OR m.context LIKE ?)`;
  bindings.push(likePattern, likePattern, likePattern);

  if (params.type) {
    sql += ` AND m.type = ?`;
    bindings.push(params.type);
  }

  if (params.tags && params.tags.length > 0) {
    sql += ` AND m.id IN (SELECT memory_id FROM tags WHERE tag IN (${params.tags.map(() => "?").join(",")}))`;
    bindings.push(...params.tags);
  }

  sql += ` ORDER BY m.updated_at DESC LIMIT ?`;
  bindings.push(limit);

  return db.prepare(sql).all(...bindings) as SearchResultRow[];
}

export function deleteMemory(db: Database.Database, key: string): MemoryRow | null {
  const memory = db.prepare(`SELECT * FROM memories WHERE key = ?`).get(key) as MemoryRow | undefined;
  if (!memory) return null;
  db.prepare(`DELETE FROM memories WHERE key = ?`).run(key);
  return memory;
}

export function listMemories(db: Database.Database, params: ListParams): { memories: MemoryRow[]; total: number } {
  const limit = Math.min(Math.max(params.limit || 10, 1), 50);
  const offset = Math.max(params.offset || 0, 0);

  let countSql = `SELECT COUNT(*) as total FROM memories m WHERE 1=1`;
  let sql = `SELECT m.* FROM memories m WHERE 1=1`;
  const bindings: (string | number)[] = [];
  const countBindings: (string | number)[] = [];

  if (params.type) {
    sql += ` AND m.type = ?`;
    countSql += ` AND m.type = ?`;
    bindings.push(params.type);
    countBindings.push(params.type);
  }

  if (params.tags && params.tags.length > 0) {
    const tagPlaceholders = params.tags.map(() => "?").join(",");
    sql += ` AND m.id IN (SELECT memory_id FROM tags WHERE tag IN (${tagPlaceholders}))`;
    countSql += ` AND m.id IN (SELECT memory_id FROM tags WHERE tag IN (${tagPlaceholders}))`;
    bindings.push(...params.tags);
    countBindings.push(...params.tags);
  }

  sql += ` ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const total = (db.prepare(countSql).get(...countBindings) as { total: number }).total;
  const memories = db.prepare(sql).all(...bindings) as MemoryRow[];

  return { memories, total };
}

export function getMemoryByKey(db: Database.Database, key: string): MemoryRow | undefined {
  return db.prepare(`SELECT * FROM memories WHERE key = ?`).get(key) as MemoryRow | undefined;
}

export function logActivity(db: Database.Database, params: ActivityParams): void {
  db.prepare(
    `INSERT INTO activity_log (agent_id, action, target_key, detail) VALUES (?, ?, ?, ?)`
  ).run(params.agent_id, params.action, params.target_key || null, params.detail || null);
}

export function getRecentActivity(db: Database.Database, limit: number = 20): ActivityRow[] {
  return db.prepare(
    `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as ActivityRow[];
}

export function getMemoriesByType(db: Database.Database, type: string, limit: number = 50): MemoryRow[] {
  return db.prepare(
    `SELECT * FROM memories WHERE type = ? ORDER BY updated_at DESC LIMIT ?`
  ).all(type, limit) as MemoryRow[];
}

export function incrementAccessCount(db: Database.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE memories SET access_count = access_count + 1 WHERE id IN (${placeholders})`
  ).run(...ids);
}

export function getTagsForMemory(db: Database.Database, memoryId: number): string[] {
  const rows = db.prepare(`SELECT tag FROM tags WHERE memory_id = ?`).all(memoryId) as { tag: string }[];
  return rows.map((r) => r.tag);
}

export function getTagsForMemories(db: Database.Database, memoryIds: number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (memoryIds.length === 0) return result;
  const placeholders = memoryIds.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT memory_id, tag FROM tags WHERE memory_id IN (${placeholders}) ORDER BY memory_id`
  ).all(...memoryIds) as { memory_id: number; tag: string }[];
  for (const id of memoryIds) {
    result.set(id, []);
  }
  for (const row of rows) {
    result.get(row.memory_id)!.push(row.tag);
  }
  return result;
}

export function getStats(db: Database.Database): { totalMemories: number; uniqueAgents: number; totalActions: number } {
  const memCount = (db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number }).c;
  const agentCount = (db.prepare(`SELECT COUNT(DISTINCT agent_id) as c FROM memories WHERE agent_id IS NOT NULL`).get() as { c: number }).c;
  const actionCount = (db.prepare(`SELECT COUNT(*) as c FROM activity_log`).get() as { c: number }).c;
  return { totalMemories: memCount, uniqueAgents: agentCount, totalActions: actionCount };
}

export function getMemoryCountsByType(db: Database.Database): Record<string, number> {
  const rows = db.prepare(`SELECT type, COUNT(*) as c FROM memories GROUP BY type`).all() as { type: string; c: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.type] = row.c;
  }
  return counts;
}

export function getMostAccessedMemories(db: Database.Database, limit: number = 5): MemoryRow[] {
  return db.prepare(
    `SELECT * FROM memories WHERE access_count > 0 ORDER BY access_count DESC LIMIT ?`
  ).all(limit) as MemoryRow[];
}

export function getDistinctAgents(db: Database.Database): string[] {
  const rows = db.prepare(
    `SELECT DISTINCT agent_id FROM activity_log WHERE agent_id IS NOT NULL ORDER BY agent_id`
  ).all() as { agent_id: string }[];
  return rows.map((r) => r.agent_id);
}

export function getActivityByAgent(db: Database.Database, agentId: string, limit: number = 10): ActivityRow[] {
  return db.prepare(
    `SELECT * FROM activity_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(agentId, limit) as ActivityRow[];
}
