# Agent Memory

Shared memory layer for AI agents. Any MCP-compatible client (Claude, ChatGPT, Cursor, VS Code, etc.) can store and recall knowledge that persists across conversations and agents.

## Quick Start

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3001/mcp` with a health check at `http://localhost:3001/health`.

## MCP Client Config

### Local (stdio via npx)

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["tsx", "server.ts"],
      "cwd": "/path/to/agent-memory"
    }
  }
}
```

### Remote (Streamable HTTP)

```json
{
  "mcpServers": {
    "agent-memory": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with a key, value, type, tags, and context |
| `recall` | Full-text search across memories (FTS5 with BM25 ranking) |
| `forget` | Delete a memory by key |
| `list_memories` | Browse all memories with filtering by type and tags |

## Resources

| URI | Description |
|-----|-------------|
| `memory://current-context` | Decisions, preferences, recent tasks, and activity stats |
| `memory://agent-activity` | Feed of which agents did what and when |

## Stack

- **MCP SDK** - `@modelcontextprotocol/sdk` with Streamable HTTP transport
- **Database** - SQLite via `better-sqlite3` with FTS5 full-text search (WAL mode)
- **Dashboard** - MCP Apps widget with postMessage protocol (`resources/memory-dashboard/`)
- **Runtime** - Node.js + Express + TypeScript
