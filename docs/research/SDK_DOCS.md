# SDK Documentation Research

Research compiled for Agent Memory hackathon project. Last updated: 2026-02-21.

---

## 1. @modelcontextprotocol/sdk (TypeScript MCP SDK)

**Package:** `@modelcontextprotocol/sdk` (v1.26.0+)
**Repo:** https://github.com/modelcontextprotocol/typescript-sdk

### Creating an MCP Server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({
  name: "agent-memory",
  version: "1.0.0",
});
```

With capabilities:

```typescript
const server = new McpServer(
  { name: "agent-memory", version: "1.0.0" },
  { capabilities: { logging: {} } }
);
```

### Registering Tools (registerTool)

**IMPORTANT:** The method is `server.registerTool()` (not `server.tool()`).
Tools MUST be registered BEFORE calling `server.connect(transport)`.

```typescript
import { z } from "zod";

server.registerTool(
  "remember",
  {
    title: "Remember",
    description: "Store a memory for future recall",
    inputSchema: z.object({
      content: z.string().describe("The content to remember"),
      metadata: z.object({
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }).optional(),
    }),
  },
  async (params, ctx) => {
    // params = { content, metadata }
    // ctx.mcpReq.log('info', 'Remembering...') for logging
    const result = await storeMemory(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);
```

With output schema:

```typescript
server.registerTool(
  "recall",
  {
    title: "Recall",
    description: "Search memories",
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({
      memories: z.array(z.object({
        id: z.string(),
        content: z.string(),
        relevance: z.number(),
      })),
    }),
  },
  async ({ query }) => {
    const memories = await searchMemories(query);
    return {
      content: [{ type: "text", text: JSON.stringify({ memories }) }],
      structuredContent: { memories },
    };
  }
);
```

### Tool Handler Context

The second argument to tool handlers is `ctx` (ServerContext):

```typescript
async (params, ctx) => {
  // Logging
  await ctx.mcpReq.log("info", "Processing request...");
  await ctx.mcpReq.log("debug", `Query: ${params.query}`);

  // Auth info (if available)
  // ctx.authInfo - authentication context from RequestHandlerExtra

  return { content: [{ type: "text", text: "result" }] };
};
```

**Note on clientInfo.name:** The SDK does not directly expose `clientInfo.name`
in tool handlers. Client info is received in the `initialize` request. To access
it, you would need to store it during server initialization or use the low-level
Server class instead of McpServer.

### Registering Resources (registerResource)

Static resource:

```typescript
server.registerResource(
  "current-context",           // resource name
  "memory://current-context",  // resource URI
  {
    title: "Current Context",
    description: "Current agent context and recent memories",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify({ recentMemories: [], context: {} }),
    }],
  })
);
```

Dynamic resource with URI templates:

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.registerResource(
  "memory-by-id",
  new ResourceTemplate("memory://{memoryId}", {
    list: async () => ({
      resources: memories.map(m => ({
        uri: `memory://${m.id}`,
        name: m.content.substring(0, 50),
      })),
    }),
  }),
  {
    title: "Memory by ID",
    description: "Individual memory entry",
    mimeType: "application/json",
  },
  async (uri, { memoryId }) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify(getMemory(memoryId)),
    }],
  })
);
```

### Streamable HTTP Transport (with Express)

#### Stateless (simpler, for serverless or single-instance)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";

const server = new McpServer({ name: "agent-memory", version: "1.0.0" });

// Register ALL tools and resources BEFORE connect
server.registerTool("remember", { /* ... */ }, async (params) => { /* ... */ });

const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3001, () => {
  console.log("MCP server at http://localhost:3001/mcp");
});
```

#### Stateful (with session management)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Store active sessions
const transports: Record<string, StreamableHTTPServerTransport> = {};

function createServer() {
  const server = new McpServer({ name: "agent-memory", version: "1.0.0" });
  // Register tools here...
  return server;
}

// POST: Client requests
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    const server = createServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No valid session" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET: SSE stream for server notifications
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid session");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE: Session cleanup
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid session");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(3001);
```

---

## 2. @modelcontextprotocol/ext-apps (MCP Apps)

**Package:** `@modelcontextprotocol/ext-apps` (v1.0.1+)
**Repo:** https://github.com/modelcontextprotocol/ext-apps
**Spec:** https://modelcontextprotocol.io/docs/extensions/apps

### Installation

```bash
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk
npm install -D vite vite-plugin-singlefile
```

### Sub-packages

- `@modelcontextprotocol/ext-apps` - Core App class (UI side)
- `@modelcontextprotocol/ext-apps/server` - Server-side helpers (registerAppTool, registerAppResource)
- `@modelcontextprotocol/ext-apps/react` - React hooks (useApp, useHostStyles)
- `@modelcontextprotocol/ext-apps/app-bridge` - Host-side iframe bridge

### Server Side: Declaring UI Tools + Resources

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";

const server = new McpServer({ name: "Agent Memory", version: "1.0.0" });

// The ui:// scheme tells hosts this is an MCP App resource
const dashboardUri = "ui://agent-memory/dashboard.html";

// Register tool with UI metadata
registerAppTool(
  server,
  "show-dashboard",
  {
    title: "Memory Dashboard",
    description: "Show the agent memory dashboard",
    inputSchema: {},
    _meta: { ui: { resourceUri: dashboardUri } },
  },
  async () => {
    const stats = await getMemoryStats();
    return {
      content: [{ type: "text", text: JSON.stringify(stats) }],
    };
  }
);

// Register the HTML resource
registerAppResource(
  server,
  dashboardUri,                    // resource name
  dashboardUri,                    // resource URI
  { mimeType: RESOURCE_MIME_TYPE },  // "text/html"
  async () => {
    const html = await fs.readFile(
      path.join(import.meta.dirname, "dist", "dashboard.html"),
      "utf-8"
    );
    return {
      contents: [{ uri: dashboardUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    };
  }
);
```

### UI Side: App Class

```typescript
// src/dashboard.ts
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "Memory Dashboard", version: "1.0.0" });

// Connect to host (call once on init)
app.connect();

// Receive initial tool result from host
app.ontoolresult = (result) => {
  const data = result.content?.find((c) => c.type === "text")?.text;
  if (data) {
    renderDashboard(JSON.parse(data));
  }
};

// Call server tools from the UI
async function refreshData() {
  const result = await app.callServerTool({
    name: "list_memories",
    arguments: { limit: 50 },
  });
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (text) renderMemoryList(JSON.parse(text));
}

// Update model context from UI
async function updateContext(data: unknown) {
  await app.updateContext(data);
}
```

### App Class API

```typescript
class App {
  constructor(info: { name: string; version: string });

  // Establish connection with host
  connect(): void;

  // Callback: receives tool result from host
  ontoolresult: (result: ToolResult) => void;

  // Call a tool on the MCP server (round-trip through host)
  callServerTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<ToolResult>;

  // Read a resource from the MCP server
  readServerResource(params: { uri: string }): Promise<ResourceResult>;

  // Send a message to the chat
  sendMessage(params: { text: string }): Promise<void>;

  // Update model context with structured data
  updateContext(data: unknown): Promise<void>;

  // Open a link in the host
  openLink(params: { url: string }): Promise<void>;
}
```

### Available Host-to-App interactions (JSON-RPC methods)

- `tools/call` - Call server tools
- `resources/read` - Read server resources
- `ui/message` - Send chat messages
- `ui/update-model-context` - Update context
- `ui/open-link` - Open links
- `ui/initialize` - Initialize the app

### Iframe Sandboxing

All views run in sandboxed iframes:
- No access to host DOM, cookies, or storage
- Communication only through `postMessage` (JSON-RPC)
- Pre-declared HTML templates reviewed before rendering
- Host can restrict which tools an app can call

### Vite Config for Single-File Build

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: process.env.INPUT,
    },
  },
});
```

Build command: `INPUT=dashboard.html vite build`

### Project Structure (Manual Setup)

```
my-mcp-app/
  package.json
  tsconfig.json
  vite.config.ts
  server.ts          # MCP server with tools + resources
  dashboard.html     # UI entry point
  src/
    dashboard.ts     # UI logic (uses App class)
```

### React Integration

```typescript
// Using ext-apps React hooks
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";

function Dashboard() {
  const app = useApp();
  const styles = useHostStyles(); // Mirror host styling

  const handleRefresh = async () => {
    const result = await app.callServerTool({
      name: "list_memories",
      arguments: {},
    });
    // process result...
  };

  return <div style={styles}>...</div>;
}
```

---

## 3. mcp-use SDK / create-mcp-use-app

**Package:** `mcp-use` (monorepo)
**Repo:** https://github.com/mcp-use/mcp-use-ts
**Docs:** https://manufact.com/docs/typescript/

### Scaffolding

```bash
npx create-mcp-use-app my-app
npx create-mcp-use-app my-app --template advanced
```

### Server SDK

```typescript
import { createMCPServer } from "mcp-use/server";
import { z } from "zod";

const server = createMCPServer("agent-memory", {
  version: "1.0.0",
  description: "Agent Memory MCP server",
});

server.tool("remember", {
  description: "Store a memory",
  parameters: z.object({
    content: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  execute: async ({ content, tags }) => {
    const memory = await storeMemory(content, tags);
    return memory;
  },
});

server.resource("dashboard", {
  description: "Memory dashboard",
  uri: "widget://dashboard",
  mimeType: "text/html",
  fetch: async () => getDashboardHTML(),
});

server.listen(3000);
// Inspector: http://localhost:3000/inspector
// MCP endpoint: http://localhost:3000/mcp
```

### React Widgets (resources/ auto-discovery)

Files in `resources/` are auto-discovered and served as HTML pages.
No manual registration needed.

```
resources/
  dashboard.tsx        -> http://localhost:3000/dashboard
  settings-panel.tsx   -> http://localhost:3000/settings-panel
```

### useMcp Hook

```typescript
import { useMcp } from "mcp-use/react";

function MyWidget() {
  const { callTool, status } = useMcp();

  const refresh = async () => {
    const result = await callTool("list_memories", { limit: 50 });
    // result is the tool response
  };

  return <div>Status: {status}</div>;
}
```

### useWidget Hook

```typescript
import { useWidget } from "mcp-use/react";

function Dashboard() {
  const { props, isPending, theme } = useWidget<{
    memoryCount: number;
    recentActivity: string[];
  }>();

  if (isPending) return <div>Loading...</div>;

  return (
    <div data-theme={theme}>
      <h1>Memories: {props.memoryCount}</h1>
      {props.recentActivity.map((a) => <p key={a}>{a}</p>)}
    </div>
  );
}
```

### McpUseProvider

```typescript
import { McpUseProvider } from "mcp-use/react";

function App() {
  return (
    <McpUseProvider
      debugger={false}
      viewControls={false}
      autoSize={true}
    >
      <Dashboard />
    </McpUseProvider>
  );
}
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| children | ReactNode | required | Widget content |
| debugger | boolean | false | Debug button |
| viewControls | boolean or "pip" or "fullscreen" | false | View mode controls |
| autoSize | boolean | false | Height notifications |

### Dev Commands

```bash
mcp-use dev     # Hot reload + inspector
mcp-use build   # Production build
mcp-use start   # Production server
```

---

## 4. use-mcp (React Hook for MCP Clients)

**Package:** `use-mcp`
**Repo:** https://github.com/modelcontextprotocol/use-mcp

This is a DIFFERENT package from mcp-use. It's a React hook for connecting
React apps to MCP servers as a CLIENT.

```typescript
import { useMcp } from "use-mcp/react";

function App() {
  const { state, tools, callTool, error, retry } = useMcp({
    url: "https://my-mcp-server.com/mcp",
    clientName: "My App",
    autoReconnect: true,
    debug: false,
  });

  if (state === "ready") {
    return (
      <div>
        {tools.map((tool) => (
          <button
            key={tool.name}
            onClick={() => callTool(tool.name, {})}
          >
            {tool.name}
          </button>
        ))}
      </div>
    );
  }

  return <div>State: {state} {error && `Error: ${error}`}</div>;
}
```

**States:** `discovering` -> `authenticating` -> `connecting` -> `loading` -> `ready` | `failed`

**Return values:**
- `state` - Connection state
- `tools` - Available tools array
- `callTool(name, args)` - Execute a tool
- `error` - Error message if failed
- `retry()` - Retry connection
- `disconnect()` - Disconnect
- `authenticate()` - Trigger auth
- `clearStorage()` - Clear auth data
- `authUrl` - Manual auth URL
- `log` - Debug log entries

---

## 5. better-sqlite3

**Package:** `better-sqlite3`
**Repo:** https://github.com/WiseLibs/better-sqlite3

### Database Constructor

```typescript
import Database from "better-sqlite3";

const db = new Database("agent-memory.db", {
  verbose: console.log,  // optional: log every SQL
});

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("cache_size = 32000");
```

**Options:**
- `readonly: boolean` (default: false)
- `fileMustExist: boolean` (default: false)
- `timeout: number` (default: 5000ms for locked db)
- `verbose: Function | null` (default: null)

### prepare(), run(), get(), all()

```typescript
// prepare() -> Statement
const insert = db.prepare(`
  INSERT INTO memories (content, agent_id, created_at)
  VALUES (@content, @agentId, @createdAt)
`);

// run() -> { changes, lastInsertRowid }
const result = insert.run({
  content: "User prefers dark mode",
  agentId: "claude-desktop",
  createdAt: Date.now(),
});
console.log(result.lastInsertRowid); // bigint

// get() -> single row object or undefined
const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(1);

// all() -> array of row objects
const memories = db.prepare("SELECT * FROM memories WHERE agent_id = ?").all("claude-desktop");
```

### Transactions

```typescript
const insertMany = db.transaction((memories: Memory[]) => {
  for (const m of memories) {
    insert.run(m);
  }
});

insertMany([
  { content: "fact 1", agentId: "a", createdAt: Date.now() },
  { content: "fact 2", agentId: "a", createdAt: Date.now() },
]);
```

### FTS5 Full-Text Search

#### Create FTS5 table synced with main table

```sql
-- Main table
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  access_count INTEGER DEFAULT 0,
  last_accessed INTEGER
);

-- FTS5 virtual table (external content, synced via triggers)
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  category,
  tags,
  content='memories',
  content_rowid='id',
  tokenize='porter unicode61'
);
```

#### Sync Triggers

```sql
-- Keep FTS in sync with main table
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
  VALUES ('delete', old.id, old.content, old.category, old.tags);
  INSERT INTO memories_fts(rowid, content, category, tags)
  VALUES (new.id, new.content, new.category, new.tags);
END;
```

**IMPORTANT:** There is a known issue with better-sqlite3: triggers that insert
into FTS5 tables fail when the triggering statement uses a RETURNING clause.
Error: "cannot commit - no transaction is active". Avoid RETURNING clauses
with FTS5 triggers.

#### FTS5 Search Queries

```sql
-- Basic search
SELECT m.* FROM memories m
JOIN memories_fts fts ON m.id = fts.rowid
WHERE memories_fts MATCH 'search terms'
ORDER BY bm25(memories_fts);

-- With column weights (content=10.0, category=5.0, tags=3.0)
SELECT m.*, bm25(memories_fts, 10.0, 5.0, 3.0) AS relevance
FROM memories m
JOIN memories_fts fts ON m.id = fts.rowid
WHERE memories_fts MATCH ?
ORDER BY relevance;

-- Prefix search
WHERE memories_fts MATCH 'dark*'

-- Phrase search
WHERE memories_fts MATCH '"dark mode"'

-- Boolean
WHERE memories_fts MATCH 'dark AND mode'
WHERE memories_fts MATCH 'dark OR light'
WHERE memories_fts MATCH 'dark NOT light'

-- Column-specific
WHERE memories_fts MATCH 'content:dark'
WHERE memories_fts MATCH '{content tags}:preferences'
```

### Complete better-sqlite3 + FTS5 Setup Pattern

```typescript
import Database from "better-sqlite3";

function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(agent_id, category);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      category,
      tags,
      content='memories',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, category, tags)
      VALUES (new.id, new.content, new.category, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
      VALUES ('delete', old.id, old.content, old.category, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category, tags)
      VALUES ('delete', old.id, old.content, old.category, old.tags);
      INSERT INTO memories_fts(rowid, content, category, tags)
      VALUES (new.id, new.content, new.category, new.tags);
    END;
  `);

  return db;
}
```

---

## 6. Streamable HTTP + Express: Complete Pattern

### CORS Configuration

```typescript
import cors from "cors";

app.use(cors({
  origin: "*",                // or specific origins
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "mcp-session-id"],
  exposedHeaders: ["mcp-session-id"],
}));
```

### Key HTTP Methods

| Method | Purpose |
|--------|---------|
| POST /mcp | Client sends requests (initialize, tools/call, etc.) |
| GET /mcp | Server-to-client SSE stream for notifications |
| DELETE /mcp | Session termination |

### Session ID Flow

1. Client sends POST with `initialize` request (no session ID)
2. Server creates transport with `sessionIdGenerator: () => randomUUID()`
3. Server returns session ID in response header `mcp-session-id`
4. Client includes `mcp-session-id` header in all subsequent requests
5. Client sends DELETE to clean up session

---

## 7. Key Decisions & Gotchas

### MCP SDK Gotchas

1. **registerTool vs tool:** The McpServer class uses `registerTool()`, NOT `tool()`.
   Some older docs or wrapper frameworks (like mcp-use) use `tool()` syntax.

2. **Register before connect:** All tools and resources MUST be registered
   before `server.connect(transport)`. Registering after connect throws
   "Cannot register capabilities after connecting."

3. **Stateless vs Stateful:** For a hackathon, use stateless mode
   (`sessionIdGenerator: undefined`) with `enableJsonResponse: true`.
   Much simpler. Each request creates a fresh transport.

4. **Import paths:** Always use subpath imports:
   - `@modelcontextprotocol/sdk/server/mcp.js`
   - `@modelcontextprotocol/sdk/server/streamableHttp.js`
   - `@modelcontextprotocol/sdk/types.js`

### ext-apps Gotchas

1. **RESOURCE_MIME_TYPE:** Use the constant from the package, not a raw string.

2. **registerAppTool vs registerTool:** Use `registerAppTool` from ext-apps/server
   (not the SDK's `registerTool`) to properly set `_meta.ui` fields.

3. **Single-file build:** Use `vite-plugin-singlefile` to bundle HTML+CSS+JS
   into one file for the resource. Otherwise you need CSP configuration.

4. **app.connect():** Must be called once on UI initialization. Without it,
   no communication with the host.

### better-sqlite3 Gotchas

1. **No RETURNING with FTS5 triggers:** Triggers inserting into FTS5 fail with
   RETURNING clauses. Use separate queries.

2. **lastInsertRowid is bigint:** Cast with `Number()` if needed.

3. **WAL mode:** Set it immediately after opening. Significantly improves
   concurrent read performance.

4. **Prepared statements are cached:** Prepare once, reuse many times.
   Don't prepare inside loops.

### mcp-use vs ext-apps

These are DIFFERENT approaches:
- **mcp-use** (by Manufact): Higher-level framework with its own server SDK,
  React hooks, auto-discovery, inspector. Uses `createMCPServer`, `server.tool()`.
- **ext-apps** (by MCP org): Official extension spec. Lower-level. Uses the
  official `@modelcontextprotocol/sdk` directly. Uses `registerAppTool`.

For the hackathon, we can use either. ext-apps is the official standard and
works with Claude directly. mcp-use adds nice DX but is a third-party framework.

**Recommendation:** Use the official `@modelcontextprotocol/sdk` + `ext-apps`
for maximum compatibility. The ext-apps approach is what Claude natively supports.
