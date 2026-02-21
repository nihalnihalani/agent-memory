# Agent Memory — Design Document

> MCP Apps Hackathon @ Y Combinator | February 21, 2026
> Team: nihalnihalani + yhinai

---

## Vision

Agent Memory is a seamless context continuity layer for AI agents. When you close Cursor and open Claude Code, it feels like you never left — your project context, decisions, preferences, and current tasks are instantly available. No setup, no prompting, no manual recall. It just knows.

## Differentiators

1. **MCP Apps inline dashboard** — memory UI renders inside conversations as an iframe widget
2. **Cross-agent collaboration awareness** — agents see what other agents are doing, when, and why
3. **Auto-context on connect** — `memory://current-context` resource loads working state automatically
4. **Agent attribution** — color-coded visual proof of which agent stored what

---

## Architecture

```
MCP CLIENTS (Claude, ChatGPT, Cursor, VS Code)
        │
        ▼
mcp-use Server (Express + Streamable HTTP)
        │
        ├── MCP Tools: remember, recall, forget, list_memories
        ├── MCP Resources: memory://current-context, memory://agent-activity
        └── MCP App Widget: resources/memory-dashboard/widget.tsx
        │
        ▼
SQLite (better-sqlite3) + FTS5 full-text search
```

### Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SDK | mcp-use (`create-mcp-use-app`) | Hackathon sponsor's tool, fastest scaffold, React widget support |
| Widget approach | mcp-use React widgets (auto-discovery in `resources/`) | Built-in bundling, inspector, postMessage plumbing handled |
| Agent attribution | MCP protocol `clientInfo.name` from initialize handshake | Automatic, reliable, no extra tool parameters |
| Search | SQLite FTS5 with BM25 ranking | Zero dependencies, fast, good enough for hackathon scope |
| Persistence | SQLite file, fallback to in-memory + seed on startup | Accept cloud persistence risk, test early |
| Wow feature | Memory timeline visualization (SVG) | High visual impact, relatively simple to build |

---

## Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'note',           -- decision/preference/task/snippet/note
  context TEXT,                       -- why this was stored, what alternative was considered
  agent_id TEXT,                      -- from clientInfo.name
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0
);

CREATE TABLE tags (
  memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (memory_id, tag)
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,               -- remember/recall/forget/list_memories
  target_key TEXT,
  detail TEXT,                        -- human-readable description of what and why
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_memories_key ON memories(key);
CREATE INDEX idx_memories_created ON memories(created_at);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_activity_agent ON activity_log(agent_id);
CREATE INDEX idx_activity_time ON activity_log(created_at);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  key, value, context,
  content='memories',
  content_rowid='id'
);
```

---

## MCP Tools

### remember — Store a memory

```json
{
  "name": "remember",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": { "type": "string", "description": "Short descriptive identifier (e.g., 'project-db-schema', 'user-prefers-dark-mode')" },
      "value": { "type": "string", "description": "The content to remember. Can be plain text, code, JSON, or any string." },
      "type": { "type": "string", "enum": ["decision", "preference", "task", "snippet", "note"], "description": "Memory type. 'decision' for architectural choices, 'preference' for user prefs, 'task' for current work, 'snippet' for code, 'note' for general." },
      "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags for categorization" },
      "context": { "type": "string", "description": "Why you're storing this — what problem you're solving, what alternative you considered, what you're working on right now" }
    },
    "required": ["key", "value"]
  }
}
```

Upserts by key. Stores `agent_id` from `clientInfo.name`. Logs to `activity_log`. Returns widget with updated dashboard.

### recall — Search and retrieve memories

FTS5 search on key+value+context. Optional tag and type filters. Returns ranked results with BM25 relevance. Logs the query to `activity_log`.

### forget — Delete a memory

Deletes by key. Cascades to tags. Removes from FTS5 index. Logs to `activity_log`.

### list_memories — Browse all memories

Paginated list. Filters by tags, type. Ordered by `updated_at` desc.

---

## MCP Resources

### memory://current-context

Auto-surfaced when any agent connects. Returns formatted summary:

- All `decision` type memories
- All `preference` type memories
- Recent `task` type memories (last 5)
- Last agent activity (who did what, when)

This is what makes switching tools seamless — the new agent reads this resource and immediately has full working context.

### memory://agent-activity

Recent activity feed showing all agent actions:

- Which agent did what
- When they did it
- What memory they affected
- Why (from the context field)

---

## Dashboard Widget

React component at `resources/memory-dashboard/widget.tsx`.

### Layout (~600x400px iframe)

```
┌──────────────────────────────────────────────────────┐
│  Agent Memory                            [search]    │
├──────────┬───────────────────────────────────────────┤
│ [Memory] │ [Activity]                                │
├──────────┴───────────────────────────────────────────┤
│                                                      │
│  Memory Tab:                                         │
│  - Scrollable memory cards                           │
│  - Each card: agent icon, key, value preview,        │
│    type badge, tags, timestamp                       │
│  - Tag filter pills                                  │
│  - Type filter tabs (All/Decisions/Tasks/Prefs)      │
│                                                      │
│  Activity Tab:                                       │
│  - Live feed of agent actions                        │
│  - Agent icon + action + target + timestamp          │
│  - "Why" context shown beneath each action           │
│                                                      │
├──────────────────────────────────────────────────────┤
│  TIMELINE ──●────●──────●───●────────●──── now       │
│  N agents · N memories · N actions this session      │
└──────────────────────────────────────────────────────┘
```

### Interactive features

- Search: calls `app.callServerTool("recall", { query })`
- Tag filter: calls `app.callServerTool("list_memories", { tags: [tag] })`
- Type filter: calls `app.callServerTool("list_memories", { type })`
- Delete: calls `app.callServerTool("forget", { key })`

### Agent icon mapping

| clientInfo.name | Color | Display |
|---|---|---|
| claude-desktop / claude | Purple | Claude Code |
| chatgpt / openai | Green | ChatGPT |
| cursor | Blue | Cursor |
| vscode / copilot | Gray | VS Code |
| unknown | Dark gray | Unknown |

---

## File Structure

```
agent-memory/
├── package.json
├── tsconfig.json
├── server.ts
├── resources/
│   └── memory-dashboard/
│       ├── widget.tsx
│       ├── components/
│       │   ├── MemoryList.tsx
│       │   ├── SearchBar.tsx
│       │   ├── TagFilter.tsx
│       │   ├── ActivityFeed.tsx
│       │   ├── Timeline.tsx
│       │   └── AgentIcon.tsx
│       └── styles.css
├── src/
│   ├── tools/
│   │   ├── remember.ts
│   │   ├── recall.ts
│   │   ├── forget.ts
│   │   └── list.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── queries.ts
│   │   └── seed.ts
│   └── context/
│       └── resource.ts
├── data/
│   ├── memories.db (gitignored)
│   └── seed.json
├── docs/
│   └── plans/
│       └── 2026-02-21-agent-memory-design.md
├── .gitignore
├── HACKATHON_PLAN.md
└── README.md
```

---

## Team Split

| Time | Person A (nihalnihalani) | Person B (yhinai) |
|------|---|---|
| Hour 1 (10:30-11:30) | Scaffold with create-mcp-use-app. Implement remember + recall with SQLite + FTS5. | Write seed.json (15 demo memories). Write memory://current-context resource. |
| Hour 2-3 (11:30-1:00) | Implement forget + list_memories. Wire agent attribution via clientInfo. Test in Inspector. | Build dashboard: MemoryList, SearchBar, AgentIcon. Get widget rendering in Claude. |
| Hour 4-5 (1:00-3:00) | Deploy to Manufact Cloud. Connect ChatGPT. Test cross-agent. | Add TagFilter, ActivityFeed, Timeline. Polish styling. |
| Hour 6 (3:00-4:30) | Stress test, edge cases, activity_log. Fix deploy/cross-agent bugs. | Timeline animation. Memory creation highlight. Activity tab polish. |
| Hour 7 (4:30-6:00) | BOTH: Demo prep, practice 3-min script, record backup video, seed final data. |

---

## Progressive Delivery

| After | Demoable state |
|---|---|
| Hour 1 | 4 working tools via Inspector |
| Hour 3 | Tools + dashboard widget in Claude |
| Hour 5 | Cross-agent + deploy + activity awareness + timeline |
| Hour 6 | Polish + animations |

Never more than 1 hour from a demoable state.

---

## Risk Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| MCP Apps widget doesn't render | HIGH | Test in first 15 min. Fallback: conversation-only demo + Inspector as dashboard. |
| clientInfo.name missing/inconsistent | MEDIUM | Log all values during testing. Hardcode fallback to "unknown". |
| SQLite not persisting on cloud | MEDIUM | Run seed.ts on startup. Demo works within single session. |
| ChatGPT MCP connection fails | MEDIUM | Use Claude + Cursor as the two-agent pair instead. |
| Time runs out | LOW | Progressive delivery — always have something demoable. |

---

## Demo Script (3 min)

**Opening (30s):**
"Every AI agent has amnesia. You're in Claude Code, you make a decision, you switch to Cursor — gone. Agent Memory fixes that. One MCP server. Every agent. Seamless context continuity."

**Act 1 — Remember (45s):**
Open Claude Code. "Remember that our project uses PostgreSQL 16 — we chose it over MySQL for JSONB support." Dashboard widget pops up, shows the new memory with Claude's purple icon, the decision type badge, and the reasoning.

**Act 2 — Cross-Agent Awareness (60s):**
Switch to ChatGPT (same server). "What database does our project use?" ChatGPT instantly recalls "PostgreSQL 16 on port 5433." Click Activity tab — ChatGPT can see Claude made this decision, when, and why. "They're collaborating through shared memory. No API. No Slack. They just know."

**Act 3 — Dashboard (30s):**
Show full dashboard: timeline with agent-colored dots, activity feed showing parallel work, tag cloud, type filters.

**Closing (15s):**
"Agent Memory. Switch tools like switching tabs. Nothing lost. Nothing forgotten."
