# Agent Memory

Shared persistent memory layer for AI coding agents. Built with [mcp-use](https://mcp-use.com) for the MCP Apps Hackathon 2026.

Any MCP-compatible client (Claude, ChatGPT, Cursor, VS Code, etc.) can store, recall, and hand off knowledge that persists across conversations and agents.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/inspector](http://localhost:3000/inspector) to test the server and widget.

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with key, value, type, tags, and context |
| `recall` | Full-text search across memories (FTS5 with BM25 ranking) |
| `forget` | Delete a memory by key |
| `list-memories` | Browse all memories with filtering by type and tags |
| `handoff` | Create an agent-to-agent work handoff |
| `pickup` | Pick up a pending handoff |
| `complete-handoff` | Mark a handoff as completed |

## Resources

| URI | Description |
|-----|-------------|
| `memory://current-context` | Decisions, preferences, recent tasks, and stats |
| `memory://agent-activity` | Feed of agent actions |
| `memory://{key}` | Lookup a specific memory by key |
| `memory://handoff-queue` | Pending handoffs for pickup |
| `memory://changelog` | Recent memory changes |
| `memory://dashboard` | Interactive memory dashboard widget |
| `memory://dashboard-dynamic` | Dynamic dashboard with context props |

## Prompts

| Name | Description |
|------|-------------|
| `session-briefing` | Quick context briefing for a new agent session |

## Stack

- **Framework** - [mcp-use](https://mcp-use.com) with React widgets
- **Database** - SQLite via `better-sqlite3` with FTS5 full-text search (WAL mode)
- **UI** - React dashboard widget with memory browser, handoff viewer, activity feed
- **Runtime** - Node.js + TypeScript

## Project Structure

```
index.ts                 # MCP server (tools, resources, prompts)
src/db/                  # Database schema, queries, seed data
src/tools/               # Shared tool helpers
resources/               # React widget components
  memory-dashboard/
    widget.tsx           # Main dashboard widget
    components/          # ActivityFeed, HandoffCard, MemoryCard, etc.
    types.ts             # TypeScript interfaces
    utils.ts             # Shared constants and helpers
docs/                    # Planning and research documents
data/                    # SQLite database (runtime)
public/                  # Static assets
```

## Deploy

```bash
npm run deploy
```
