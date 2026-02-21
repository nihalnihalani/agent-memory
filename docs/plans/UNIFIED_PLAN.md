# Agent Memory -- Unified Plan

> **MCP Apps Hackathon @ Y Combinator | February 21, 2026**
> Team: nihalnihalani + yhinai
> Built with mcp-use SDK | Deployed on Manufact MCP Cloud

> **Note**: This document merges two prior plans:
> - `docs/plans/2026-02-21-agent-memory-design.md` (the "Design Doc")
> - `HACKATHON_PLAN.md` (the "Hackathon Plan")
>
> Where they diverge, decisions are noted inline.

---

## Vision

Agent Memory is a seamless context continuity layer for AI agents. When you close Cursor and open Claude Code, it feels like you never left -- your project context, decisions, preferences, and current tasks are instantly available. No setup, no prompting, no manual recall. It just knows.

*[Source: Design Doc, refined in Hackathon Plan]*

## Differentiators

1. **MCP Apps inline dashboard** -- memory UI renders inside conversations as an iframe widget
2. **Cross-agent collaboration awareness** -- agents see what other agents are doing, when, and why
3. **Auto-context on connect** -- `memory://current-context` resource loads working state automatically
4. **Agent attribution** -- color-coded visual proof of which agent stored what

*[Source: Design Doc. Hackathon Plan lists similar points but without the `memory://current-context` auto-context feature.]*

---

## Architecture

```
MCP CLIENTS (Claude, ChatGPT, Cursor, VS Code Copilot, Gemini CLI)
        |
        v
mcp-use Server (Express + Streamable HTTP, /mcp endpoint + CORS)
        |
        +-- MCP Tools: remember, recall, forget, list_memories
        +-- MCP Resources: memory://current-context, memory://agent-activity
        +-- MCP App Widget: resources/memory-dashboard/widget.tsx
        |
        v
SQLite (better-sqlite3) + FTS5 full-text search
```

*[Merged from both. The Hackathon Plan has a more detailed ASCII diagram; the Design Doc adds MCP Resources.]*

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Language** | TypeScript | MCP TS SDK is most mature |
| **MCP SDK** | `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` | Official SDK, required for MCP Apps UI |
| **Framework** | `mcp-use` (`create-mcp-use-app`) | Hackathon sponsor's tool; fastest scaffold; built-in inspector |
| **Transport** | Streamable HTTP | Required for remote access + Manufact Cloud |
| **Storage** | SQLite via `better-sqlite3` + FTS5 | Zero config, single file, fast |
| **UI** | **mcp-use React widgets** (auto-discovery in `resources/`) | See decision below |
| **Styling** | Tailwind CSS (CDN) | Beautiful with minimal effort |
| **Deploy** | Manufact MCP Cloud | Hackathon requirement |
| **Tunnel (dev)** | `cloudflared` | Free, for testing with Claude/ChatGPT during dev |

*[Source: Hackathon Plan tech stack table, augmented with Design Doc choices]*

### UI Approach Decision

**Contradiction**: The Design Doc specifies mcp-use React widgets (`resources/memory-dashboard/widget.tsx` with auto-discovery), while the Hackathon Plan specifies Vanilla TS + Vite + `vite-plugin-singlefile` with `mcp-app.html` as entry point.

**Decision**: Use **mcp-use React widgets**. Rationale:
- mcp-use's `create-mcp-use-app` scaffolding handles widget bundling, inspector integration, and `postMessage` plumbing automatically
- React components are faster to compose for the dashboard UI (memory cards, filters, tabs)
- Auto-discovery in `resources/` means no manual wiring
- The Vite approach requires more manual setup (vite config, singlefile plugin, manual postMessage handling) with no clear advantage for this scope

If React widgets fail to render (test in first 15 minutes), fall back to the Vanilla TS + Vite approach from the Hackathon Plan.

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

-- Full-text search for recall queries
CREATE VIRTUAL TABLE memories_fts USING fts5(
  key, value, context,
  content='memories',
  content_rowid='id'
);
```

### Schema Decisions

**`type` field on `memories`**: The Design Doc includes a `type TEXT DEFAULT 'note'` column with enum values `decision/preference/task/snippet/note`. The Hackathon Plan omits this field. **Decision**: Include it. It enables the `memory://current-context` resource to categorize memories (show all decisions, all preferences, recent tasks) and powers type filter tabs in the dashboard. Minimal cost to add.

**`activity_log` table**: The Design Doc includes a dedicated `activity_log` table. The Hackathon Plan does not have one. **Decision**: Include it. It powers the Activity tab in the dashboard, the `memory://agent-activity` resource, and the cross-agent awareness differentiator. It is a simple append-only table with low implementation cost.

*[Source: Design Doc schema is the superset; Hackathon Plan schema is a subset. Unified schema uses Design Doc version.]*

---

## MCP Tools

### 1. `remember` -- Store a memory

```json
{
  "name": "remember",
  "description": "Store a memory that can be recalled later by any AI agent. Use this to save important facts, decisions, user preferences, code snippets, or any information worth remembering across conversations.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "Short descriptive identifier (e.g., 'project-db-schema', 'user-prefers-dark-mode')"
      },
      "value": {
        "type": "string",
        "description": "The content to remember. Can be plain text, code, JSON, or any string."
      },
      "type": {
        "type": "string",
        "enum": ["decision", "preference", "task", "snippet", "note"],
        "description": "Memory type. 'decision' for architectural choices, 'preference' for user prefs, 'task' for current work, 'snippet' for code, 'note' for general."
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional tags for categorization (e.g., ['preference', 'ui'], ['code', 'python'])"
      },
      "context": {
        "type": "string",
        "description": "Why you're storing this -- what problem you're solving, what alternative you considered, what you're working on right now"
      }
    },
    "required": ["key", "value"]
  }
}
```

Behavior: Upserts by key. Stores `agent_id` from `clientInfo.name` (automatic, not a tool parameter). Logs to `activity_log`. Returns widget with updated dashboard.

*[Merged: Design Doc adds `type` field; Hackathon Plan has richer `description` text. Both included.]*

### 2. `recall` -- Search and retrieve memories

```json
{
  "name": "recall",
  "description": "Search and retrieve stored memories. Uses full-text search to find relevant memories by topic, or filter by tags.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language search query (e.g., 'What database does the project use?')"
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional: filter to memories with these tags"
      },
      "type": {
        "type": "string",
        "enum": ["decision", "preference", "task", "snippet", "note"],
        "description": "Optional: filter to memories of this type"
      },
      "limit": {
        "type": "number",
        "description": "Max results to return (default: 5, max: 20)"
      }
    },
    "required": ["query"]
  }
}
```

Behavior: FTS5 search on key+value+context. BM25 relevance ranking. Optional tag and type filters. Logs the query to `activity_log`. Increments `access_count` on returned memories.

*[Merged: Hackathon Plan schema + Design Doc `type` filter and BM25 mention.]*

### 3. `forget` -- Delete a memory

```json
{
  "name": "forget",
  "description": "Remove a specific memory by its key. Use when information is outdated or user requests deletion.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "key": {
        "type": "string",
        "description": "The key of the memory to delete"
      }
    },
    "required": ["key"]
  }
}
```

Behavior: Deletes by key. Cascades to tags. Removes from FTS5 index. Logs to `activity_log`.

### 4. `list_memories` -- Browse all memories

```json
{
  "name": "list_memories",
  "description": "Browse all stored memories with optional filtering by tags and type.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional: filter to memories with these tags"
      },
      "type": {
        "type": "string",
        "enum": ["decision", "preference", "task", "snippet", "note"],
        "description": "Optional: filter by memory type"
      },
      "limit": {
        "type": "number",
        "description": "Max results (default: 10, max: 50)"
      },
      "offset": {
        "type": "number",
        "description": "Skip N results for pagination"
      }
    }
  }
}
```

Behavior: Paginated list, ordered by `updated_at` desc. Logs to `activity_log`.

*[Merged: Hackathon Plan pagination + Design Doc type filter.]*

---

## MCP Resources

### `memory://current-context`

Auto-surfaced when any agent connects. Returns formatted summary:

- All `decision` type memories
- All `preference` type memories
- Recent `task` type memories (last 5)
- Last agent activity (who did what, when)

This is what makes switching tools seamless -- the new agent reads this resource and immediately has full working context.

### `memory://agent-activity`

Recent activity feed showing all agent actions:

- Which agent did what
- When they did it
- What memory they affected
- Why (from the context field)

*[Source: Design Doc only. The Hackathon Plan does not mention MCP Resources. These are high-value differentiators and straightforward to implement using the `activity_log` table.]*

---

## Dashboard Widget

React component at `resources/memory-dashboard/widget.tsx`.

### Layout (~600x400px iframe)

```
+------------------------------------------------------+
|  Agent Memory                            [search]     |
+----------+-------------------------------------------+
| [Memory] | [Activity]                                 |
+----------+-------------------------------------------+
|                                                       |
|  Memory Tab:                                          |
|  - Scrollable memory cards                            |
|  - Each card: agent icon, key, value preview,         |
|    type badge, tags, timestamp                        |
|  - Tag filter pills                                   |
|  - Type filter tabs (All/Decisions/Tasks/Prefs)       |
|                                                       |
|  Activity Tab:                                        |
|  - Live feed of agent actions                         |
|  - Agent icon + action + target + timestamp           |
|  - "Why" context shown beneath each action            |
|                                                       |
+-------------------------------------------------------+
|  TIMELINE ----*------*--------*---*----------*-- now   |
|  N agents - N memories - N actions this session       |
+-------------------------------------------------------+
```

### Interactive features

- Search: calls `app.callServerTool("recall", { query })`
- Tag filter: calls `app.callServerTool("list_memories", { tags: [tag] })`
- Type filter: calls `app.callServerTool("list_memories", { type })`
- Delete: calls `app.callServerTool("forget", { key })`

### Agent icon mapping

| clientInfo.name | Color | Display |
|---|---|---|
| claude-desktop / claude | Purple | Claude |
| chatgpt / openai | Green | ChatGPT |
| cursor | Blue | Cursor |
| vscode / copilot | Gray | VS Code |
| unknown | Dark gray | Unknown |

*[Source: Design Doc has the detailed layout, icon mapping, and interactive features. Hackathon Plan mentions similar elements (timeline, tag cloud, search) but less structured.]*

---

## File Structure

```
agent-memory/
+-- package.json
+-- tsconfig.json
+-- server.ts                  # MCP server entry point
+-- resources/
|   +-- memory-dashboard/
|       +-- widget.tsx         # Dashboard entry point (React, auto-discovered by mcp-use)
|       +-- components/
|       |   +-- MemoryList.tsx
|       |   +-- SearchBar.tsx
|       |   +-- TagFilter.tsx
|       |   +-- ActivityFeed.tsx
|       |   +-- Timeline.tsx
|       |   +-- AgentIcon.tsx
|       +-- styles.css
+-- src/
|   +-- tools/
|   |   +-- remember.ts
|   |   +-- recall.ts
|   |   +-- forget.ts
|   |   +-- list.ts
|   +-- db/
|   |   +-- schema.ts
|   |   +-- queries.ts
|   |   +-- seed.ts
|   +-- search/
|   |   +-- relevance.ts       # FTS5 search + BM25 ranking logic
|   +-- context/
|       +-- resource.ts        # memory://current-context, memory://agent-activity
+-- data/
|   +-- memories.db            # SQLite database (gitignored)
|   +-- seed.json              # 15 pre-loaded demo memories
+-- dist/                      # Built output (gitignored)
+-- docs/
|   +-- plans/
|       +-- 2026-02-21-agent-memory-design.md
|       +-- UNIFIED_PLAN.md
+-- .gitignore
+-- HACKATHON_PLAN.md
+-- README.md
```

### File Structure Decisions

**Contradiction**: The Design Doc uses `resources/memory-dashboard/widget.tsx` (mcp-use convention with React component tree). The Hackathon Plan uses `mcp-app.html` + `src/mcp-app.ts` + `src/ui/` (Vite convention with vanilla TS).

**Decision**: Use the Design Doc's `resources/` structure. It aligns with the mcp-use React widget approach selected above. The `src/search/relevance.ts` from the Hackathon Plan is kept as a useful separation of search logic.

**Addition from Hackathon Plan**: `src/search/relevance.ts` for FTS5 ranking logic, and `dist/` directory.

**Addition from Design Doc**: `src/context/resource.ts` for MCP Resources, `src/db/seed.ts` for startup seeding, `resources/memory-dashboard/components/` with the full component breakdown.

---

## Team Split

| Time | Person A (nihalnihalani) | Person B (yhinai) |
|------|---|---|
| Hour 1 (10:30-11:30) | Scaffold with `create-mcp-use-app`. Implement `remember` + `recall` with SQLite + FTS5. Test widget rendering in first 15 min. | Write `seed.json` (15 demo memories). Write `memory://current-context` resource. Implement `forget` + `list_memories`. |
| Hour 2-3 (11:30-1:00) | Wire agent attribution via `clientInfo`. Wire `activity_log` logging in all tools. Test in Inspector. LUNCH at 12:15 while testing. | Build dashboard: MemoryList, SearchBar, AgentIcon, type badges. Get widget rendering in Claude via `cloudflared`. |
| Hour 4-5 (1:00-3:00) | Deploy to Manufact Cloud. Connect ChatGPT. Test cross-agent. Polish recall (highlight matches, relevance scores). | Add TagFilter, ActivityFeed, Timeline. Dashboard stats. Polish styling. |
| Hour 6 (3:00-4:30) | Stress test, edge cases. Fix deploy/cross-agent bugs. `memory://agent-activity` resource. | Timeline animation. Memory creation highlight. Activity tab polish. Dark/light mode if time. |
| Hour 7 (4:30-6:00) | BOTH: Demo prep, practice 3-min script, record backup video, seed final data. |

*[Merged: Design Doc team split + Hackathon Plan schedule details (lunch timing, cloudflared testing). The Hackathon Plan's more granular 15-minute blocks from Phase 1 are incorporated.]*

---

## Progressive Delivery

| After | Demoable state |
|---|---|
| Hour 1 | 4 working tools via Inspector |
| Hour 3 | Tools + dashboard widget in Claude |
| Hour 5 | Cross-agent + deploy + activity awareness + timeline |
| Hour 6 | Polish + animations |

Never more than 1 hour from a demoable state.

*[Source: Design Doc]*

---

## MVP vs. Nice-to-Have

### MVP (MUST work for demo)
- [ ] `remember` tool stores to SQLite with `type` field
- [ ] `recall` tool with FTS5 search + BM25 ranking
- [ ] `forget` tool deletes by key
- [ ] `list_memories` tool with tag + type filtering
- [ ] MCP App dashboard UI showing memory list + search
- [ ] Agent attribution (icons/colors per source agent)
- [ ] Works in Claude (via cloudflared or Manufact Cloud)
- [ ] Deployed to Manufact Cloud

### Should Have (makes demo great)
- [ ] `memory://current-context` resource for auto-context
- [ ] `activity_log` table + Activity tab in dashboard
- [ ] Tag cloud visualization
- [ ] Timeline view of memory creation
- [ ] Works in ChatGPT
- [ ] Dashboard stats (counts, activity feed)
- [ ] `memory://agent-activity` resource

### Nice to Have (wow factor)
- [ ] Animated memory creation in dashboard
- [ ] Dark mode / light mode
- [ ] Export/import memories as JSON
- [ ] Memory namespaces (per-project isolation)

*[Merged: Hackathon Plan MVP checklist + Design Doc features. Agent attribution promoted to MVP as it is a key differentiator.]*

---

## Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP Apps widget doesn't render | HIGH | Test in first 15 min. Fallback: Vanilla TS + Vite approach (Hackathon Plan). Second fallback: conversation-only demo + Inspector as dashboard. |
| Manufact Cloud deploy fails | HIGH | Test TONIGHT. Fallback: local server + `cloudflared`. |
| `clientInfo.name` missing/inconsistent | MEDIUM | Log all values during testing. Hardcode fallback to "unknown". |
| SQLite not persistent on cloud | MEDIUM | Run `seed.ts` on startup. Fallback: in-memory + JSON file. Demo works within single session. |
| ChatGPT MCP connection fails | MEDIUM | Not essential. Demo with Claude + Cursor as the two-agent pair. |
| WiFi dies during demo | MEDIUM | Record backup video before demos. |
| Time runs out | LOW | Progressive delivery -- always have something demoable. |

*[Merged: Both plans have similar risk tables. Combined all unique mitigations.]*

---

## "Oh Shit" Fallback

If by 2:00 PM the UI doesn't work:
1. Drop the MCP App UI entirely
2. Focus on making the 4 tools rock-solid
3. Demo through Claude/ChatGPT conversations only
4. Use MCP Inspector as the "developer dashboard"
5. Narrative: "It works transparently -- agents just remember"

*[Source: Hackathon Plan]*

---

## Demo Script (3 Minutes)

### Opening (30s)
"Every AI agent has amnesia. You're in Claude Code, you make a decision, you switch to Cursor -- gone. Agent Memory fixes that. One MCP server. Every agent. Seamless context continuity."

### Act 1 -- Remember (45s)
- Open Claude Desktop (connected to our MCP server)
- "Remember that our project uses PostgreSQL 16 -- we chose it over MySQL for JSONB support."
- Dashboard widget pops up showing the new memory with Claude's purple icon, the `decision` type badge, and the reasoning context.
- "Also remember that I prefer TypeScript, dark mode, and tabs over spaces."
- Dashboard updates in real-time.

### Act 2 -- Cross-Agent Awareness (60s)
- Switch to ChatGPT (connected to SAME server)
- "What database does our project use?"
- ChatGPT calls `recall` -- returns "PostgreSQL 16 on port 5433"
- Click Activity tab -- ChatGPT can see Claude made this decision, when, and why.
- "They're collaborating through shared memory. No API. No Slack. They just know."

### Act 3 -- Dashboard (30s)
- Show full dashboard: timeline with agent-colored dots, activity feed, tag cloud, type filters.
- "Full visibility into what your agents know. You're in control."

### Closing (15s)
"Agent Memory. Switch tools like switching tabs. Nothing lost. Nothing forgotten."

*[Merged: Design Doc demo is tighter (3 acts, agent-colored timeline); Hackathon Plan demo has more detail (two remember calls, real-time animation). Combined best elements.]*

---

## Pre-Hackathon Checklist (DO TONIGHT)

### Accounts and Access
- [ ] Manufact Cloud account created and verified
- [ ] Deploy a hello-world MCP server to Manufact Cloud -- verify pipeline
- [ ] Claude Pro/Max account for custom connectors
- [ ] ChatGPT developer mode enabled
- [ ] VS Code Insiders installed (for MCP Apps support)
- [ ] `cloudflared` installed for local tunneling
- [ ] Node.js 18+ on hackathon machine

### Project Setup
- [ ] Run `npx create-mcp-use-app agent-memory` -- verify it runs
- [ ] Install all deps: `@modelcontextprotocol/sdk`, `ext-apps`, `better-sqlite3`, `express`, `cors`, `zod`
- [ ] TypeScript config working
- [ ] Empty file structure created (per unified file structure above)
- [ ] Push to GitHub, connect to Manufact Cloud
- [ ] SQLite schema file written
- [ ] 15 demo memories pre-written in `data/seed.json`
- [ ] `npm run dev` starts without errors

### References (bookmark these)
- MCP Apps spec + examples: `github.com/modelcontextprotocol/ext-apps`
- mcp-use TypeScript SDK: `github.com/mcp-use/mcp-use-ts`
- Official MCP Inspector: `github.com/modelcontextprotocol/inspector`
- mcp-use docs: `docs.mcp-use.io`

*[Source: Hackathon Plan only. The Design Doc did not include a pre-hackathon checklist. This is critical for day-of readiness.]*

---

## MCP Configuration

Add to any MCP client's config:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory-mcp"],
      "env": {}
    }
  }
}
```

Or for remote (Manufact Cloud):

```json
{
  "mcpServers": {
    "agent-memory": {
      "url": "https://agent-memory.manufact.cloud/mcp",
      "transport": "streamable-http"
    }
  }
}
```

*[Source: Hackathon Plan only. Useful for quick reference during the hackathon.]*

---

## Gaps Identified (Neither Plan Fully Addresses)

1. **FTS5 sync triggers**: Neither plan specifies the SQLite triggers needed to keep the `memories_fts` virtual table in sync with the `memories` table on INSERT/UPDATE/DELETE. These must be created in `schema.ts`.

2. **Error handling in tools**: Neither plan defines what happens when `recall` finds no results, `forget` targets a non-existent key, or `remember` receives invalid `type` values. Define graceful responses for each.

3. **Widget data flow**: How does the dashboard get fresh data? Does it poll, or do tool responses push state? Recommendation: each tool response includes the full memory list (or a diff) so the widget updates on every tool call via `postMessage`.

4. **CORS configuration**: The Hackathon Plan mentions CORS but neither plan specifies which origins to allow. For hackathon: use `*` (wildcard). For production: restrict to known MCP client origins.

5. **`seed.ts` trigger**: When does seeding run? Recommendation: on startup, only if the `memories` table is empty. This handles the cloud persistence risk.

6. **`access_count` usage**: Both schemas include `access_count` on memories but neither plan describes how it is surfaced in the UI or used for ranking. Consider showing "most accessed" in dashboard stats.

---

## Team

- **nihalnihalani** -- Project lead
- **yhinai** -- Collaborator

## Hackathon

- **Event**: ChatGPT / MCP Apps Hackathon
- **Host**: Manufact (YC S25) at Y Combinator, San Francisco
- **Sponsors**: OpenAI, Anthropic, Cloudflare, Puzzle, WorkOS
- **Prizes**: YC interview, Mac Minis, tens of thousands in credits
