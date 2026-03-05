import type Database from "better-sqlite3";
import { isFts5Available } from "./schema.js";

const MAX_KEY_LENGTH = 255;
const MAX_VALUE_LENGTH = 10240; // ~10KB
const MAX_CONTEXT_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;

// Key must start with alphanumeric, then allow alphanumeric, hyphens, underscores, dots, slashes
const KEY_FORMAT_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9\-_./]*$/;

// ========================
// RATE LIMITER
// ========================

interface RateLimitEntry {
  timestamps: number[];
}

const RATE_LIMIT_MAX = 100;       // max operations per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000).unref();

export function checkRateLimit(agentId: string): void {
  const now = Date.now();
  let entry = rateLimitMap.get(agentId);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(agentId, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    throw new Error(
      `Rate limit exceeded: max ${RATE_LIMIT_MAX} operations per minute. Try again in ${retryAfterSec}s.`
    );
  }

  entry.timestamps.push(now);
}

/**
 * Safely parse a JSON array from a string. Returns empty array on failure.
 */
export function safeParseJsonArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
  if (!key || key.trim().length === 0) {
    throw new Error("Key must not be empty");
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Key must be ${MAX_KEY_LENGTH} characters or less (got ${key.length})`);
  }
  if (!KEY_FORMAT_REGEX.test(key)) {
    throw new Error(
      `Invalid key format: '${key.substring(0, 50)}'. Keys must start with a letter or number and contain only letters, numbers, hyphens, underscores, dots, or slashes.`
    );
  }
  if (Buffer.byteLength(value, "utf-8") > MAX_VALUE_LENGTH) {
    throw new Error(`Value must be ${MAX_VALUE_LENGTH} bytes or less (~10KB)`);
  }
}

const VALID_TYPES = ["decision", "preference", "task", "snippet", "note"];

function validateType(type: string | undefined): void {
  if (type && !VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}`);
  }
}

const MAX_AGENT_ID_LENGTH = 200;
const MAX_QUERY_LENGTH = 1000;

export function validateAgentId(agentId: string): string {
  if (agentId.length > MAX_AGENT_ID_LENGTH) {
    return agentId.substring(0, MAX_AGENT_ID_LENGTH);
  }
  return agentId;
}

function sanitizeFtsQuery(query: string): string {
  // Truncate overly long queries
  const truncated = query.length > MAX_QUERY_LENGTH ? query.substring(0, MAX_QUERY_LENGTH) : query;
  // Strip FTS5 special characters
  let sanitized = truncated.replace(/[*"'(){}[\]:^~!@#$%&+\-]/g, ' ');
  // Strip FTS5 boolean operators (AND, OR, NOT, NEAR) as standalone tokens
  sanitized = sanitized.replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ');
  return sanitized.replace(/\s+/g, ' ').trim();
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
  const insertHistory = db.prepare(`
    INSERT INTO memory_history (memory_id, old_value, old_type, old_context, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // Record history if updating an existing memory
    const existing = getMemory.get(params.key) as MemoryRow | undefined;
    if (existing && existing.value !== params.value) {
      insertHistory.run(existing.id, existing.value, existing.type, existing.context, params.agent_id || null);
    }

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

  const escapedQuery = params.query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const likePattern = `%${escapedQuery}%`;
  sql += ` AND (m.key LIKE ? ESCAPE '\\' OR m.value LIKE ? ESCAPE '\\' OR m.context LIKE ? ESCAPE '\\')`;
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
  const transaction = db.transaction(() => {
    const memory = db.prepare(`SELECT * FROM memories WHERE key = ?`).get(key) as MemoryRow | undefined;
    if (!memory) return null;
    db.prepare(`DELETE FROM memories WHERE key = ?`).run(key);
    return memory;
  });
  return transaction();
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

// ========================
// HANDOFFS
// ========================

export interface HandoffRow {
  id: number;
  from_agent: string;
  to_agent: string | null;
  status: string;
  summary: string;
  stuck_reason: string | null;
  next_steps: string;
  context_keys: string | null;
  picked_up_by: string | null;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
}

interface CreateHandoffParams {
  from_agent: string;
  to_agent?: string;
  summary: string;
  stuck_reason?: string;
  next_steps: string;
  context_keys?: string[];
}

export function createHandoff(db: Database.Database, params: CreateHandoffParams): HandoffRow {
  const result = db.prepare(`
    INSERT INTO handoffs (from_agent, to_agent, summary, stuck_reason, next_steps, context_keys)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.from_agent,
    params.to_agent || null,
    params.summary,
    params.stuck_reason || null,
    params.next_steps,
    params.context_keys ? JSON.stringify(params.context_keys) : null
  );
  return db.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(result.lastInsertRowid) as HandoffRow;
}

export function getPendingHandoffs(db: Database.Database): HandoffRow[] {
  return db.prepare(
    `SELECT * FROM handoffs WHERE status = 'pending' ORDER BY created_at DESC`
  ).all() as HandoffRow[];
}

export function getAllHandoffs(db: Database.Database, limit: number = 20): HandoffRow[] {
  return db.prepare(
    `SELECT * FROM handoffs ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as HandoffRow[];
}

export function pickupHandoff(db: Database.Database, handoffId: number, agentId: string): HandoffRow | null {
  const transaction = db.transaction(() => {
    // Atomic: only update if still pending (prevents TOCTOU race condition)
    const result = db.prepare(`
      UPDATE handoffs SET status = 'in_progress', picked_up_by = ?, picked_up_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(agentId, handoffId);

    if (result.changes === 0) return null;

    return db.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(handoffId) as HandoffRow;
  });

  return transaction();
}

export function completeHandoff(db: Database.Database, handoffId: number, agentId?: string): HandoffRow | null {
  // If agentId is provided, only allow the agent that picked up the handoff to complete it
  let sql = `UPDATE handoffs SET status = 'completed', completed_at = datetime('now') WHERE id = ? AND status = 'in_progress'`;
  const bindings: (string | number)[] = [handoffId];

  if (agentId) {
    sql += ` AND picked_up_by = ?`;
    bindings.push(agentId);
  }

  const result = db.prepare(sql).run(...bindings);
  if (result.changes === 0) return null;

  return db.prepare(`SELECT * FROM handoffs WHERE id = ?`).get(handoffId) as HandoffRow;
}

// ========================
// MEMORY HISTORY
// ========================

export interface MemoryHistoryRow {
  id: number;
  memory_id: number;
  old_value: string;
  old_type: string | null;
  old_context: string | null;
  changed_by: string | null;
  changed_at: string;
}

export function getMemoryHistory(db: Database.Database, memoryId: number): MemoryHistoryRow[] {
  return db.prepare(
    `SELECT * FROM memory_history WHERE memory_id = ? ORDER BY changed_at DESC`
  ).all(memoryId) as MemoryHistoryRow[];
}

export function getRecentChanges(db: Database.Database, limit: number = 10): (MemoryHistoryRow & { key: string })[] {
  return db.prepare(`
    SELECT mh.*, m.key FROM memory_history mh
    JOIN memories m ON m.id = mh.memory_id
    ORDER BY mh.changed_at DESC LIMIT ?
  `).all(limit) as (MemoryHistoryRow & { key: string })[];
}

// ========================
// EXPORT / IMPORT / STATS
// ========================

export interface ExportFilters {
  agent_id?: string;
  type?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
}

export interface ExportedMemory {
  key: string;
  value: string;
  type: string;
  context: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
  access_count: number;
  tags: string[];
}

export function exportMemories(db: Database.Database, filters: ExportFilters): ExportedMemory[] {
  let sql = `SELECT m.* FROM memories m WHERE 1=1`;
  const bindings: (string | number)[] = [];

  if (filters.agent_id) {
    sql += ` AND m.agent_id = ?`;
    bindings.push(filters.agent_id);
  }

  if (filters.type) {
    sql += ` AND m.type = ?`;
    bindings.push(filters.type);
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagPlaceholders = filters.tags.map(() => "?").join(",");
    sql += ` AND m.id IN (SELECT memory_id FROM tags WHERE tag IN (${tagPlaceholders}))`;
    bindings.push(...filters.tags);
  }

  if (filters.date_from) {
    sql += ` AND m.created_at >= ?`;
    bindings.push(filters.date_from);
  }

  if (filters.date_to) {
    sql += ` AND m.created_at <= ?`;
    bindings.push(filters.date_to);
  }

  sql += ` ORDER BY m.created_at ASC`;

  const memories = db.prepare(sql).all(...bindings) as MemoryRow[];
  const tagsMap = getTagsForMemories(db, memories.map(m => m.id));

  return memories.map(m => ({
    key: m.key,
    value: m.value,
    type: m.type,
    context: m.context,
    agent_id: m.agent_id,
    created_at: m.created_at,
    updated_at: m.updated_at,
    access_count: m.access_count,
    tags: tagsMap.get(m.id) || [],
  }));
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function importMemories(db: Database.Database, memories: ExportedMemory[], agentId: string): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  const getExisting = db.prepare(`SELECT id FROM memories WHERE key = ?`);
  const insertMemory = db.prepare(`
    INSERT INTO memories (key, value, type, context, agent_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (memory_id, tag) VALUES (?, ?)`);

  const transaction = db.transaction(() => {
    for (const mem of memories) {
      // Validate
      if (!mem.key || !mem.value) {
        result.errors.push(`Skipped entry with missing key or value`);
        result.skipped++;
        continue;
      }

      if (mem.key.length > MAX_KEY_LENGTH) {
        result.errors.push(`Key too long: ${mem.key.substring(0, 50)}...`);
        result.skipped++;
        continue;
      }

      if (Buffer.byteLength(mem.value, "utf-8") > MAX_VALUE_LENGTH) {
        result.errors.push(`Value too large for key: ${mem.key}`);
        result.skipped++;
        continue;
      }

      if (mem.type && !VALID_TYPES.includes(mem.type)) {
        result.errors.push(`Invalid type '${mem.type}' for key: ${mem.key}`);
        result.skipped++;
        continue;
      }

      // Skip duplicates
      const existing = getExisting.get(mem.key) as { id: number } | undefined;
      if (existing) {
        result.skipped++;
        continue;
      }

      const insertResult = insertMemory.run(
        mem.key,
        mem.value,
        mem.type || "note",
        mem.context || null,
        mem.agent_id || agentId,
      );

      const memoryId = insertResult.lastInsertRowid as number;

      if (mem.tags && Array.isArray(mem.tags)) {
        for (const tag of mem.tags.slice(0, MAX_TAGS)) {
          if (tag.length <= MAX_TAG_LENGTH) {
            insertTag.run(memoryId, tag);
          }
        }
      }

      result.imported++;
    }
  });

  transaction();
  return result;
}

export interface MemoryStats {
  totalMemories: number;
  memoriesByType: Record<string, number>;
  memoriesPerAgent: { agent_id: string; count: number }[];
  mostAccessed: MemoryRow[];
  storageSizeEstimate: number;
  activeHandoffs: number;
  ftsHealthy: boolean;
  totalTags: number;
  totalActivityLogs: number;
}

export function getMemoryStats(db: Database.Database): MemoryStats {
  const totalMemories = (db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number }).c;

  const memoriesByType = getMemoryCountsByType(db);

  const memoriesPerAgent = db.prepare(
    `SELECT agent_id, COUNT(*) as count FROM memories WHERE agent_id IS NOT NULL GROUP BY agent_id ORDER BY count DESC`
  ).all() as { agent_id: string; count: number }[];

  const mostAccessed = getMostAccessedMemories(db, 10);

  // Estimate storage: sum of key + value + context byte lengths
  const sizeRow = db.prepare(`
    SELECT COALESCE(SUM(LENGTH(key) + LENGTH(value) + COALESCE(LENGTH(context), 0)), 0) as total_bytes
    FROM memories
  `).get() as { total_bytes: number };

  const activeHandoffs = (db.prepare(
    `SELECT COUNT(*) as c FROM handoffs WHERE status IN ('pending', 'in_progress')`
  ).get() as { c: number }).c;

  // Check FTS health
  let ftsHealthy = false;
  try {
    db.prepare(`SELECT COUNT(*) FROM memories_fts`).get();
    ftsHealthy = true;
  } catch {
    ftsHealthy = false;
  }

  const totalTags = (db.prepare(`SELECT COUNT(*) as c FROM tags`).get() as { c: number }).c;
  const totalActivityLogs = (db.prepare(`SELECT COUNT(*) as c FROM activity_log`).get() as { c: number }).c;

  return {
    totalMemories,
    memoriesByType,
    memoriesPerAgent,
    mostAccessed,
    storageSizeEstimate: sizeRow.total_bytes,
    activeHandoffs,
    ftsHealthy,
    totalTags,
    totalActivityLogs,
  };
}
