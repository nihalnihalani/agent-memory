import type Database from "better-sqlite3";

export function initializeSessionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      source_agent TEXT NOT NULL DEFAULT 'claude-code',
      project_path TEXT,
      git_branch TEXT,
      objective TEXT,
      current_state TEXT,
      completed_steps TEXT,   -- JSON array
      pending_tasks TEXT,     -- JSON array
      key_decisions TEXT,     -- JSON array
      file_changes TEXT,      -- JSON array
      token_count INTEGER DEFAULT 0,
      raw_context TEXT,       -- full universal JSON blob
      captured_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON context_sessions(source_agent);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON context_sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_sessions_captured ON context_sessions(captured_at);
  `);
}

export interface SessionRow {
  id: number;
  session_id: string;
  source_agent: string;
  project_path: string | null;
  git_branch: string | null;
  objective: string | null;
  current_state: string | null;
  completed_steps: string | null;
  pending_tasks: string | null;
  key_decisions: string | null;
  file_changes: string | null;
  token_count: number;
  raw_context: string | null;
  captured_at: string;
}

export function upsertSession(
  db: Database.Database,
  session: {
    session_id: string;
    source_agent: string;
    project_path?: string;
    git_branch?: string;
    objective?: string;
    current_state?: string;
    completed_steps?: string[];
    pending_tasks?: string[];
    key_decisions?: string[];
    file_changes?: unknown[];
    token_count?: number;
    raw_context?: unknown;
  }
): SessionRow {
  const stmt = db.prepare(`
    INSERT INTO context_sessions
      (session_id, source_agent, project_path, git_branch, objective, current_state,
       completed_steps, pending_tasks, key_decisions, file_changes, token_count, raw_context)
    VALUES
      (@session_id, @source_agent, @project_path, @git_branch, @objective, @current_state,
       @completed_steps, @pending_tasks, @key_decisions, @file_changes, @token_count, @raw_context)
    ON CONFLICT(session_id) DO UPDATE SET
      source_agent = excluded.source_agent,
      project_path = excluded.project_path,
      git_branch = excluded.git_branch,
      objective = excluded.objective,
      current_state = excluded.current_state,
      completed_steps = excluded.completed_steps,
      pending_tasks = excluded.pending_tasks,
      key_decisions = excluded.key_decisions,
      file_changes = excluded.file_changes,
      token_count = excluded.token_count,
      raw_context = excluded.raw_context,
      captured_at = datetime('now')
    RETURNING *
  `);

  return stmt.get({
    session_id: session.session_id,
    source_agent: session.source_agent,
    project_path: session.project_path ?? null,
    git_branch: session.git_branch ?? null,
    objective: session.objective ?? null,
    current_state: session.current_state ?? null,
    completed_steps: JSON.stringify(session.completed_steps ?? []),
    pending_tasks: JSON.stringify(session.pending_tasks ?? []),
    key_decisions: JSON.stringify(session.key_decisions ?? []),
    file_changes: JSON.stringify(session.file_changes ?? []),
    token_count: session.token_count ?? 0,
    raw_context: session.raw_context ? JSON.stringify(session.raw_context) : null,
  }) as SessionRow;
}

export function getSession(db: Database.Database, sessionId: string): SessionRow | null {
  return (db.prepare("SELECT * FROM context_sessions WHERE session_id = ?").get(sessionId) ?? null) as SessionRow | null;
}

export function listSessions(
  db: Database.Database,
  opts: { source_agent?: string; limit?: number } = {}
): SessionRow[] {
  let sql = "SELECT * FROM context_sessions";
  const params: unknown[] = [];
  if (opts.source_agent) {
    sql += " WHERE source_agent = ?";
    params.push(opts.source_agent);
  }
  sql += " ORDER BY captured_at DESC LIMIT ?";
  params.push(opts.limit ?? 20);
  return db.prepare(sql).all(...params) as SessionRow[];
}

export function getLatestSession(db: Database.Database, sourceAgent?: string): SessionRow | null {
  if (sourceAgent) {
    return (db.prepare(
      "SELECT * FROM context_sessions WHERE source_agent = ? ORDER BY captured_at DESC LIMIT 1"
    ).get(sourceAgent) ?? null) as SessionRow | null;
  }
  return (db.prepare(
    "SELECT * FROM context_sessions ORDER BY captured_at DESC LIMIT 1"
  ).get() ?? null) as SessionRow | null;
}
