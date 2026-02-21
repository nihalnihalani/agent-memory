# Agent Memory - Codebase Exploration

Deep analysis of the entire codebase. Every source file read, server tested, edge cases catalogued.

---

## 1. Architecture Overview

### File Structure & Data Flow

```
server.ts                         -- Entry point: Express + MCP server setup
  |-> src/db/schema.ts            -- SQLite init (WAL mode, FTS5, triggers)
  |-> src/db/seed.ts              -- One-time seed from data/seed.json
  |-> src/db/queries.ts           -- All SQL operations (upsert, search, list, delete, stats)
  |-> src/tools/remember.ts       -- MCP tool: store a memory
  |-> src/tools/recall.ts         -- MCP tool: search memories (FTS5/LIKE fallback)
  |-> src/tools/forget.ts         -- MCP tool: delete by key
  |-> src/tools/list.ts           -- MCP tool: paginated browse
  |-> src/context/resource.ts     -- MCP resources: current-context, agent-activity
  |-> resources/memory-dashboard/widget.html  -- MCP Apps dashboard (single HTML)
```

### How it connects:

1. `server.ts` initializes SQLite DB, seeds it, creates Express app
2. For each MCP session, a new `McpServer` instance is created via `createMcpServer()`
3. Each McpServer registers 4 tools + 2 resources + 1 app resource (dashboard)
4. Tools call query functions in `queries.ts`, which are synchronous SQLite calls
5. Dashboard widget uses `postMessage` protocol (JSON-RPC 2.0) to call tools back through the MCP Apps framework
6. `test.html` provides a standalone test harness that mocks the MCP host

### Transport:
- Streamable HTTP on `/mcp` (POST for requests, GET for SSE, DELETE for close)
- Session management via `mcp-session-id` header
- Sessions stored in an in-memory `Map<string, StreamableHTTPServerTransport>`

### Database:
- SQLite via `better-sqlite3` (synchronous, single-process)
- WAL mode for concurrent reads
- 3 tables: `memories`, `tags`, `activity_log`
- FTS5 virtual table `memories_fts` with porter/unicode tokenizer
- Triggers keep FTS in sync on insert/update/delete

---

## 2. Strengths

### Well-designed database layer (`src/db/schema.ts`, `src/db/queries.ts`)
- **FTS5 with graceful fallback**: If FTS5 is unavailable, falls back to LIKE-based search. Good defensive coding. (`schema.ts:54-89`)
- **Proper triggers for FTS sync**: Insert, update, and delete triggers keep the FTS index current without manual intervention. (`schema.ts:66-83`)
- **WAL mode**: Correct choice for a server that may have concurrent reads. (`schema.ts:15`)
- **Transaction usage**: Upsert + tag operations wrapped in a transaction. (`queries.ts:94-113`)
- **Input validation**: Key length (500 chars) and value size (10KB) limits with clear errors. (`queries.ts:58-65`)
- **Type validation**: Whitelist of valid types prevents garbage data. (`queries.ts:67-73`)
- **BM25 ranking**: FTS5 search uses BM25 with weighted columns (key=1.0, value=2.0, context=0.5). Sensible weights. (`queries.ts:127`)
- **Pagination**: `listMemories` supports proper limit/offset with total count. (`queries.ts:187-218`)
- **Access counting**: `incrementAccessCount` tracks which memories are most useful. (`queries.ts:242-248`)

### Clean MCP integration
- Each tool uses `registerAppTool` from `@modelcontextprotocol/ext-apps`, tying tools to the dashboard widget via `_meta.ui.resourceUri`. This means the dashboard appears when tools are used.
- Agent ID extraction attempts multiple paths for clientInfo, with "unknown" fallback. (`remember.ts:29-31`)
- Activity logging on every action creates good observability.

### Thoughtful resource design (`src/context/resource.ts`)
- `memory://current-context` is a "magic" resource that gives any connecting agent an instant summary of all project state: decisions, preferences, tasks, snippets, most-accessed memories, recent activity. Very well structured.
- `agentDisplayName()` maps raw clientInfo strings to human-readable names for 12+ clients. (`resource.ts:20-38`)
- Empty state handled with a welcoming onboarding message. (`resource.ts:144-152`)

### Widget quality (`resources/memory-dashboard/widget.html`)
- Single-file HTML with no external dependencies -- loads instantly
- Dual protocol support (JSON-RPC 2.0 + simple postMessage) for maximum compatibility
- Debounced search (300ms)
- Tag filtering, type filtering, search -- all functional
- Agent color-coding with named agent mappings for 12+ clients
- Delete button with hover reveal (doesn't clutter UI)
- Loading skeletons for perceived performance
- Empty states with helpful messages
- Clean dark theme that looks professional

### Good test harness (`resources/memory-dashboard/test.html`)
- Fully functional mock MCP server
- Can add memories of each type, switch agents, clear data, push activities
- Message log shows all postMessage traffic
- Simulates realistic network delay (100-300ms)

### Seed data quality (`data/seed.json`)
- 15 diverse seed memories across all 5 types
- Realistic content (not lorem ipsum) -- actual tech decisions, preferences, tasks
- Multiple agents represented (claude-ai, cursor-vscode, ChatGPT)
- Tags are meaningful and overlapping -- good for demo filtering

---

## 3. Weaknesses

### BUG: Tags not deleted on upsert without tags (`queries.ts:103-108`)

```typescript
if (params.tags && params.tags.length > 0) {
  deleteTags.run(params.key);
  for (const tag of params.tags) {
    insertTag.run(params.key, tag);
  }
}
```

If you call `remember({ key: "foo", value: "bar" })` without tags on an existing memory that HAD tags, the old tags persist. The `deleteTags` only runs if new tags are provided. This is arguably intentional (don't wipe tags on update), but it means there's no way to clear tags from a memory. A user would need to pass `tags: []` and even that won't work because `params.tags.length > 0` would be false.

### BUG: FTS5 fallback also swallows real errors (`queries.ts:150-155`)

```typescript
try {
  return db.prepare(sql).all(...bindings) as MemoryRow[];
} catch {
  return searchWithLike(db, params, limit);
}
```

Any SQL error (not just FTS query syntax errors) silently falls back to LIKE search. A broken query due to a code bug would never surface as an error -- it would just silently return wrong results.

### No activity logging for seed data (`src/db/seed.ts`)

Seed data creates memories but no activity_log entries. The `memory://agent-activity` resource will show "No agent activity" even though 15 memories exist. This creates a confusing inconsistency in the demo.

### Session memory leak potential (`server.ts:65-96`)

Sessions are stored in `transports` Map. They're only cleaned up via `transport.onclose`. If a client never closes (just stops sending requests), the transport stays in memory forever. There's no TTL, no periodic cleanup, no max sessions limit.

### No graceful shutdown (`server.ts:123-127`)

```typescript
app.listen(PORT, () => { ... });
```

No SIGTERM/SIGINT handler. No DB close. In production, this means:
- Open SQLite WAL files may not be checkpointed
- Active SSE connections won't be properly closed
- Transport map won't be cleaned up

### Recall tool returns JSON, not human-readable text (`recall.ts:57-62`)

```typescript
const jsonData = JSON.stringify({ memories: memoriesWithTags, total: results.length });
return { content: [{ type: "text", text: jsonData }] };
```

The `remember` tool returns nicely formatted text. But `recall` returns raw JSON. This inconsistency means agents get different response formats from different tools. The remember tool's format is better for LLM consumption.

### List tool always fetches 30 recent activities (`list.ts:52`)

```typescript
const activities = getRecentActivity(db, 30);
```

Every `list_memories` call also fetches 30 activity records regardless of whether the client needs them. This is wasteful and couples the activity feed to the memory listing unnecessarily.

### `getMemoriesByType` has no LIMIT (`queries.ts:236-240`)

```typescript
export function getMemoriesByType(db: Database.Database, type: string): MemoryRow[] {
  return db.prepare(
    `SELECT * FROM memories WHERE type = ? ORDER BY updated_at DESC`
  ).all(type) as MemoryRow[];
}
```

If a user stores 10,000 decisions, `current-context` resource will try to format ALL of them. Called in `resource.ts:53` for decisions and `resource.ts:54` for preferences.

### No CORS origin restriction (`server.ts:62`)

```typescript
app.use(cors());
```

Wide-open CORS. Any webpage can hit this API. For a local dev server this is fine, but should be noted.

---

## 4. Performance Concerns

### N+1 query for tags

In `recall.ts:52-55` and `list.ts:47-49`:
```typescript
const memoriesWithTags = results.map((m) => ({
  ...m,
  tags: getTagsForMemory(db, m.id),
}));
```

Each memory triggers a separate `SELECT tag FROM tags WHERE memory_id = ?`. For 50 memories, that's 50 extra queries. Should be a single JOIN or a bulk query with `WHERE memory_id IN (...)`.

Same pattern in `resource.ts:82`, `resource.ts:97`, `resource.ts:108` -- every section of `current-context` does N+1 tag lookups.

### current-context resource is expensive

`resource.ts:53-61` makes 8 separate database calls:
1. `getMemoriesByType(db, "decision")` -- unbounded
2. `getMemoriesByType(db, "preference")` -- unbounded
3. `listMemories(db, { type: "task", limit: 5 })` -- bounded
4. `listMemories(db, { type: "snippet", limit: 3 })` -- bounded
5. `getMostAccessedMemories(db, 3)` -- bounded
6. `getRecentActivity(db, 5)` -- bounded
7. `getStats(db)` -- 3 COUNT queries
8. `getMemoryCountsByType(db)` -- GROUP BY

Then N+1 tag queries on top. For a large database, this resource read could be slow.

### SQLite single-writer bottleneck

SQLite allows one writer at a time. With WAL mode, concurrent reads are fine, but concurrent writes will serialize. Under heavy write load (multiple agents storing memories simultaneously), writes will queue.

### Prepared statements re-created on every call

In `queries.ts`, `db.prepare(...)` is called inline in each function. While `better-sqlite3` caches prepared statements internally, the explicit pattern of calling `db.prepare` on every invocation is less clear than storing statements once.

---

## 5. Security Gaps

### No authentication or authorization

Anyone who can reach port 3001 can read, write, and delete all memories. No API keys, no auth tokens, no agent verification. The `agent_id` is self-reported -- any client can claim to be any agent.

### FTS5 query injection

In `queries.ts:131`:
```typescript
const bindings: (string | number)[] = [params.query];
```

The query is parameterized, so SQL injection is prevented. However, FTS5 has its own query syntax (AND, OR, NOT, NEAR, etc.). User input goes directly to `MATCH ?` without sanitization. Malformed FTS5 syntax will throw, which is caught and falls back to LIKE. But intentionally malformed queries could be used to probe the system.

### No rate limiting

No rate limiting on any endpoint. An aggressive client could spam the remember tool and fill the database or DoS the server.

### Tag values not sanitized (`queries.ts:105-106`)

Tags are stored as-is. No length limit, no character restriction. A tag could be an extremely long string or contain SQL-meaningful characters (though parameterized queries prevent injection).

### postMessage with wildcard origin (`widget.html:314`)

```javascript
window.parent.postMessage({ ... }, '*');
```

The widget sends postMessages to `'*'` (any origin). In the MCP Apps context this is standard practice, but worth noting.

### DB path uses `process.cwd()` (`server.ts:19`)

```typescript
const dbPath = path.join(process.cwd(), "data", "memories.db");
```

If the server is started from a different directory, the DB file and seed data will be looked for relative to that directory, not relative to the project root. Could cause confusion or data loss.

---

## 6. UX Issues (from an agent's perspective)

### Inconsistent tool response formats

- `remember` returns formatted text: "Remembered: {key}\nType: {type}\n..."
- `recall` returns JSON: `{"memories":[...],"total":5}`
- `forget` returns text: "Forgot memory: {key}"
- `list_memories` returns JSON: `{"memories":[...],"activities":[...],"total":15}`

An agent parsing these needs different logic for each tool. All tools should return the same format (preferably structured JSON that's also human-readable).

### Recall search UX for agents

FTS5 query syntax is powerful but error-prone. An agent sending `"What database does the project use?"` as a query will likely get poor FTS5 results because it's a natural language question, not keyword terms. The porter tokenizer helps somewhat, but questions with stop words will be noisy.

### No way to update a memory's tags without providing all tags

As noted in the bugs section, you can't add a tag without knowing existing tags, and you can't remove tags at all (without also providing a value). There should be an explicit "update tags" operation or the upsert should always replace tags.

### Key naming convention is unclear

The seed data uses kebab-case keys like "db-choice-postgresql" and "user-prefers-dark-mode". But there's no enforcement or guidance. Two agents might create "db-choice" and "database-choice" without knowing they're duplicating.

### No memory update feedback

When `remember` is called with an existing key (upsert), the response says "Remembered: {key}" -- same as a new insert. The agent doesn't know if it updated an existing memory or created a new one. Should say "Updated: {key}" vs "Stored: {key}".

### Type enum is too restrictive

Only 5 types: decision, preference, task, snippet, note. Missing obvious categories: bug, question, blocker, context, person, meeting. A more flexible approach would allow custom types or at least a broader set.

### No memory expiration

Tasks and notes get stale. There's no TTL, no archival, no staleness indicator. A task from 6 months ago still shows up in `current-context` the same as one from today.

---

## 7. Widget Assessment

### Strengths for demo
- Looks polished -- dark theme, smooth animations, responsive layout
- Agent color-coding is visually effective (different colored dots)
- Search works in real-time with debounce
- Type and tag filtering both functional
- Delete on hover is clean UX
- Activity timeline with colored dots is nice visualization
- Stats bar gives quick overview
- Loading skeletons feel professional

### Weaknesses
- **No real-time updates**: The widget only refreshes data when the user explicitly searches, filters, or switches tabs. If another agent stores a memory, it won't appear until the user takes action. There's a `state_update` listener, but only the test harness pushes those.
- **No expand/detail view**: Memory values are truncated to 120 chars. No way to see the full value, context, or metadata without using the MCP tool directly.
- **No edit capability**: Can delete but can't edit. Would be useful for the demo to show editing a memory's tags or value.
- **Stats are client-side calculated**: `updateStats()` counts from the local `memories` array, not from the server. If the array only has 50 items (limit), the stats say "50 memories" even if there are 200 on the server.
- **Activity tab requires extra load**: Switching to Activity tab triggers a `list_memories` call just to get activities. Wasteful and semantically wrong.
- **timeAgo is client-local**: The `timeAgo()` function compares server timestamps (which are UTC without timezone) to local client time. If the client is in a different timezone, "just now" and "5h ago" will be wrong.
- **Memory card value truncation cuts mid-word**: `truncate()` slices at character count, not word boundary.
- **No keyboard navigation**: Can't tab through memories or use arrow keys.

### Demo readiness: 7/10
Good enough for a demo. Visually impressive. Main gap is no real-time updates and no detail view.

---

## 8. What Would Break Under Stress

### 1000+ memories
- `current-context` resource would explode -- `getMemoriesByType` for decisions/preferences has no limit, so all would be included in the text. Could produce a massive text blob.
- N+1 tag queries would make response times degrade linearly.
- Widget list with 50-item limit handles this OK, but stats would be wrong.

### 100+ concurrent sessions
- Each session creates a new `McpServer` + `StreamableHTTPServerTransport`. These are stored in a `Map` with no limit. Memory would grow unbounded.
- SQLite write contention would increase. WAL mode helps with reads but writers still serialize.

### Large values
- 10KB value limit is reasonable but `current-context` concatenates ALL decisions and preferences without truncation. 100 decisions x 10KB = 1MB text resource.

### Rapid fire writes
- No debounce on tool calls. An agent in a loop calling `remember` could fill the DB quickly.
- Activity log grows unbounded with no cleanup.

### FTS5 edge cases
- Query `"*"` will match everything but may be slow.
- Query with unbalanced quotes like `"hello` will throw, caught by fallback.
- Very long queries (> 500 chars) are not limited for search, only for keys.

### Network failures (widget)
- 15-second timeout on tool calls (`widget.html:326-330`). After timeout, the promise rejects but there's no retry logic. The widget just stops working silently.
- If the MCP host disconnects, the widget has no reconnection mechanism.

### Database corruption
- No backup mechanism.
- No integrity checks.
- If the process is killed during a write (despite WAL mode), `-wal` and `-shm` files may need recovery.

---

## Summary of Priority Issues

| Priority | Issue | File:Line |
|----------|-------|-----------|
| High | `getMemoriesByType` unbounded - `current-context` will explode at scale | `queries.ts:236`, `resource.ts:53-54` |
| High | N+1 tag queries on every tool response and resource read | `recall.ts:52`, `list.ts:47`, `resource.ts:82` |
| High | Session transport map has no TTL/cleanup/limit | `server.ts:65` |
| Medium | Tags can never be cleared from a memory | `queries.ts:103-108` |
| Medium | Inconsistent response formats across tools | `recall.ts:62` vs `remember.ts:51-59` |
| Medium | No graceful shutdown (SIGTERM, DB close) | `server.ts:123-127` |
| Medium | Recall returns JSON but remember returns text | `recall.ts:57-62` |
| Medium | FTS5 fallback swallows all errors, not just syntax | `queries.ts:150-155` |
| Low | No seed activity log entries | `seed.ts` |
| Low | Widget stats are client-calculated, not server-accurate | `widget.html:633-640` |
| Low | timeAgo timezone mismatch | `widget.html:479-489` |
| Low | No rate limiting | `server.ts` |
| Low | No authentication | `server.ts` |
