# Agent Memory -- Universal Shared Memory for AI Agents

> **MCP Apps Hackathon @ Y Combinator | February 21, 2026**
> Built with mcp-use SDK | Deployed on Manufact MCP Cloud

---

## The Problem

Every AI agent has amnesia. Claude forgets you after each conversation. ChatGPT loses your preferences. Your coding agents start from scratch every session. When you switch between Claude, ChatGPT, Cursor, and VS Code Copilot, your context is lost.

## The Solution

**Agent Memory** is a universal MCP server that gives ANY AI agent persistent, shared memory. Claude remembers something -- ChatGPT can recall it. A beautiful dashboard renders directly inside conversations via MCP Apps.

## What Makes This Different

There are existing memory MCP servers (`@modelcontextprotocol/server-memory`, OpenMemory, etc). Agent Memory differentiates with:

1. **MCP Apps inline dashboard** -- memory UI renders *inside* Claude/ChatGPT conversations as a widget
2. **Cross-agent attribution** -- visual proof of which agent stored what (color-coded icons)
3. **Beautiful visualization** -- timeline view + tag cloud + agent breakdown, not just raw text
4. **One server, every client** -- works in Claude, ChatGPT, VS Code, Cursor simultaneously

---

## Architecture

```
+------------------------------------------------------------------+
|                      MCP CLIENTS                                  |
|  +------------+  +------------+  +------------+  +------------+  |
|  | Claude     |  | ChatGPT    |  | VS Code    |  | Cursor/    |  |
|  | Desktop    |  | (Apps SDK) |  | Copilot    |  | Gemini CLI |  |
|  +-----+------+  +-----+------+  +-----+------+  +-----+------+  |
|        |               |               |               |          |
+--------+---------------+---------------+---------------+----------+
         |               |               |               |
         v               v               v               v
+------------------------------------------------------------------+
|              STREAMABLE HTTP TRANSPORT (/mcp)                     |
|                  (Express + CORS)                                 |
+------------------------------------------------------------------+
         |                                          |
         v                                          v
+------------------------+          +-------------------------------+
|    MCP TOOL LAYER      |          |    MCP APP UI LAYER           |
|                        |          |                               |
|  remember(key, value,  |          |  ui://memory-dashboard/       |
|    tags[], context)    |          |                               |
|                        |          |  - Memory timeline view       |
|  recall(query, tags[], |          |  - Tag cloud / filter         |
|    limit)              |          |  - Search across memories     |
|                        |          |  - Agent usage breakdown      |
|  forget(key)           |          |  - Real-time updates          |
|                        |          |                               |
|  list_memories(        |          +-------------------------------+
|    tags[], limit)      |
+----------+-------------+
           |
           v
+------------------------------------------------------------------+
|                    STORAGE LAYER                                   |
|  +------------------+    +------------------------------------+   |
|  | SQLite            |    | FTS5 Full-Text Search             |   |
|  | (better-sqlite3)  |    | (keyword + relevance ranking)     |   |
|  +------------------+    +------------------------------------+   |
+------------------------------------------------------------------+
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Language** | TypeScript | MCP TS SDK is most mature; MCP Apps widgets are React/TS |
| **MCP SDK** | `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` | Official SDK, required for MCP Apps UI |
| **Framework** | `mcp-use` (`create-mcp-use-app`) | Hackathon sponsor's tool; fastest scaffold; built-in inspector |
| **Transport** | Streamable HTTP | Required for remote access + Manufact Cloud |
| **Storage** | SQLite via `better-sqlite3` + FTS5 | Zero config, single file, fast |
| **UI** | Vanilla TS + Vite + `vite-plugin-singlefile` | Fastest to build; bundles to single HTML |
| **Styling** | Tailwind CSS (CDN) | Beautiful with minimal effort |
| **Deploy** | Manufact MCP Cloud | Hackathon requirement |
| **Tunnel (dev)** | `cloudflared` | Free, for testing with Claude/ChatGPT during dev |

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
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional tags for categorization (e.g., ['preference', 'ui'], ['code', 'python'])"
      },
      "context": {
        "type": "string",
        "description": "Optional context about when/why this was stored"
      }
    },
    "required": ["key", "value"]
  }
}
```

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
      "limit": {
        "type": "number",
        "description": "Max results to return (default: 5, max: 20)"
      }
    },
    "required": ["query"]
  }
}
```

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

### 4. `list_memories` -- Browse all memories

```json
{
  "name": "list_memories",
  "description": "Browse all stored memories with optional filtering by tags.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Optional: filter to memories with these tags"
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

---

## Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  context TEXT,
  agent_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0
);

CREATE TABLE tags (
  memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (memory_id, tag)
);

CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_memories_key ON memories(key);
CREATE INDEX idx_memories_created ON memories(created_at);

-- Full-text search for recall queries
CREATE VIRTUAL TABLE memories_fts USING fts5(
  key, value, context,
  content='memories',
  content_rowid='id'
);
```

---

## File Structure

```
agent-memory/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── server.ts                  # MCP server entry point
├── mcp-app.html               # UI entry point (dashboard widget)
├── src/
│   ├── mcp-app.ts             # UI logic (vanilla TS)
│   ├── tools/
│   │   ├── remember.ts        # remember tool handler
│   │   ├── recall.ts          # recall tool handler
│   │   ├── forget.ts          # forget tool handler
│   │   └── list.ts            # list_memories tool handler
│   ├── db/
│   │   ├── schema.ts          # SQLite schema + migrations
│   │   └── queries.ts         # Database query helpers
│   ├── search/
│   │   └── relevance.ts       # FTS5 search + ranking
│   └── ui/
│       ├── styles.css          # Tailwind-enhanced styles
│       ├── timeline.ts         # Timeline visualization
│       ├── tagcloud.ts         # Tag cloud component
│       └── search.ts           # Search UI component
├── data/
│   ├── memories.db            # SQLite database (gitignored)
│   └── seed.json              # Pre-loaded demo memories
├── dist/                      # Built output (gitignored)
├── .gitignore
├── HACKATHON_PLAN.md          # This file
└── README.md
```

---

## Build Schedule (7.5 Hours)

### Phase 1: Foundation (10:30 AM - 11:30 AM)

| Time | Task | Deliverable |
|------|------|-------------|
| 10:30-10:45 | Scaffold project, install deps, push to GitHub, connect Manufact Cloud | Running scaffold |
| 10:45-11:15 | Implement `remember` + `recall` tools with SQLite + FTS5 | Core tools working |
| 11:15-11:30 | Implement `forget` + `list_memories`, test all 4 in Inspector | All tools working |

**Milestone**: All 4 MCP tools work. Can remember and recall via Inspector.

### Phase 2: Dashboard UI (11:30 AM - 1:00 PM)

| Time | Task | Deliverable |
|------|------|-------------|
| 11:30-12:15 | Build dashboard: memory list, search bar, tag filters. Wire `app.callServerTool()` | Interactive dashboard |
| 12:15-12:45 | LUNCH -- eat while testing. Run cloudflared tunnel. Test with Claude. | Verified in Claude |
| 12:45-1:00 | Fix integration bugs | Clean Claude integration |

**Milestone**: Dashboard renders in Claude. Can remember/recall through the UI.

### Phase 3: Cross-Agent + Deploy (1:00 PM - 3:00 PM)

| Time | Task | Deliverable |
|------|------|-------------|
| 1:00-1:30 | Polish recall: highlight matches, relevance scores | Polished recall |
| 1:30-2:15 | Agent attribution: detect source agent, show icons in UI | Agent icons |
| 2:15-2:45 | Timeline visualization + dashboard stats | Visual polish |
| 2:45-3:00 | Deploy to Manufact Cloud, verify remote URL | Production deploy |

**Milestone**: Full working product deployed. Works in Claude + ideally ChatGPT.

### Phase 4: Polish (3:00 PM - 4:30 PM)

| Time | Task | Deliverable |
|------|------|-------------|
| 3:00-3:30 | Nice-to-have: animated memory creation, transitions | Animations |
| 3:30-4:00 | Stress test, edge cases, loading states, error handling | Robust system |
| 4:00-4:30 | Buffer for surprises | Stable product |

### Phase 5: Demo Prep (4:30 PM - 6:00 PM)

| Time | Task | Deliverable |
|------|------|-------------|
| 4:30-5:00 | Write demo script, pre-load demo memories, practice | Demo script |
| 5:00-5:30 | Record backup video, prepare slides (2-3 max) | Backup ready |
| 5:30-6:00 | Final practice + buffer | Ready to present |

---

## MVP vs. Nice-to-Have

### MVP (MUST work for demo)
- [ ] `remember` tool stores to SQLite
- [ ] `recall` tool with FTS5 search
- [ ] `forget` tool deletes by key
- [ ] `list_memories` tool with tag filtering
- [ ] MCP App dashboard UI showing memory list + search
- [ ] Works in Claude (via cloudflared or Manufact Cloud)
- [ ] Deployed to Manufact Cloud

### Should Have (makes demo great)
- [ ] Agent attribution (icons/colors per source agent)
- [ ] Tag cloud visualization
- [ ] Timeline view of memory creation
- [ ] Works in ChatGPT
- [ ] Dashboard stats (counts, activity feed)

### Nice to Have (wow factor)
- [ ] Animated memory creation in dashboard
- [ ] Dark mode / light mode
- [ ] Export/import memories as JSON
- [ ] Memory namespaces (per-project isolation)

### "Oh Shit" Fallback
If by 2:00 PM the UI doesn't work:
1. Drop the MCP App UI entirely
2. Focus on making the 4 tools rock-solid
3. Demo through Claude/ChatGPT conversations only
4. Use MCP Inspector as the "developer dashboard"
5. Narrative: "It works transparently -- agents just remember"

---

## Demo Script (3 Minutes)

### Opening (30s)
> "Every AI agent has amnesia. Claude forgets you after each conversation. ChatGPT loses your preferences. We built Agent Memory -- a universal memory layer that lets ANY AI agent remember, and share knowledge with every other agent."

### Act 1: Remember (60s)
- Open Claude Desktop (connected to our MCP server)
- "Remember that our project uses PostgreSQL 16 on port 5433"
- Dashboard widget pops up showing the new memory with animation
- "Also remember that I prefer TypeScript, dark mode, and tabs over spaces"
- Dashboard updates in real-time

### Act 2: Cross-Agent Recall (90s) -- THE WOW MOMENT
- Switch to ChatGPT (connected to SAME server)
- "What database does our project use?"
- ChatGPT calls `recall` -- returns "PostgreSQL 16 on port 5433"
- Dashboard shows ChatGPT's icon in the access log
- **Key line**: "ChatGPT instantly knows what Claude learned. Memory persists across agents, conversations, and time."

### Act 3: Dashboard (45s)
- Show full dashboard: timeline, tag cloud, agent breakdown
- **Key line**: "Full visibility into what your agents know. You're in control."

### Closing (15s)
> "Agent Memory. One MCP server. Every AI agent. No more amnesia."

---

## Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP App UI doesn't render | HIGH | Test by 12:00 PM. Fallback: demo with Inspector + conversations |
| Manufact Cloud deploy fails | HIGH | Test TONIGHT. Fallback: local server + ngrok |
| ChatGPT connector doesn't work | MEDIUM | Not essential. Demo with Claude only |
| SQLite not persistent on cloud | MEDIUM | Fallback: in-memory + JSON file. Pre-seed on startup |
| WiFi dies during demo | MEDIUM | Record backup video before demos |
| "How is this different?" | MEDIUM | MCP Apps inline UI + cross-agent attribution = unique |
| Time runs out | LOW | Build fallback first (hour 1), UI second (hours 2-3) |

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
- [ ] Install all deps: `@modelcontextprotocol/sdk`, `ext-apps`, `better-sqlite3`, `express`, `cors`, `vite`, `zod`
- [ ] TypeScript + Vite config working
- [ ] Empty file structure created
- [ ] Push to GitHub, connect to Manufact Cloud
- [ ] SQLite schema file written
- [ ] 15 demo memories pre-written in `data/seed.json`
- [ ] `npm run dev` starts without errors

### References (bookmark these)
- MCP Apps spec + examples: `github.com/modelcontextprotocol/ext-apps`
- mcp-use TypeScript SDK: `github.com/mcp-use/mcp-use-ts`
- Official MCP Inspector: `github.com/modelcontextprotocol/inspector`
- mcp-use docs: `docs.mcp-use.io`

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

---

## Team

- **nihalnihalani** -- Project lead
- **yhinai** -- Collaborator

## Hackathon

- **Event**: ChatGPT / MCP Apps Hackathon
- **Host**: Manufact (YC S25) at Y Combinator, San Francisco
- **Sponsors**: OpenAI, Anthropic, Cloudflare, Puzzle, WorkOS
- **Prizes**: YC interview, Mac Minis, tens of thousands in credits
