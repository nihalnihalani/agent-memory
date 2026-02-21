# Competitive Landscape & MCP Apps Patterns Research

> Researched: 2026-02-21 | Agent Memory Hackathon

---

## 1. Existing MCP Memory Servers

### 1.1 @modelcontextprotocol/server-memory (Official)

**What it is**: Anthropic's official MCP memory server. Knowledge graph-based persistent memory stored as JSONL.

**Tools exposed (9 tools)**:
| Tool | Description |
|------|-------------|
| `create_entities` | Add entities with name, entityType, observations[] |
| `create_relations` | Connect entities (from, to, relationType) |
| `add_observations` | Append facts to existing entities |
| `delete_entities` | Remove entities + cascading relations |
| `delete_observations` | Remove specific facts from entities |
| `delete_relations` | Remove connections between entities |
| `read_graph` | Return entire knowledge graph |
| `search_nodes` | Query across names, types, observations |
| `open_nodes` | Get specific entities by name with connections |

**Storage**: JSONL file (`memory.jsonl`), configurable via `MEMORY_FILE_PATH` env var. Entities have name, entityType, and observations array. Relations are directed edges (from, to, relationType).

**Key limitation**: Knowledge graph model is powerful but complex. Users/agents must think in terms of entities and relations rather than natural key-value pairs. No UI. No agent attribution. No activity tracking.

### 1.2 Mem0

**What it is**: VC-backed ($24M from YC, Peak XV) "memory layer for AI apps." The most well-funded competitor. Hybrid cloud/local architecture.

**Tools exposed (MCP)**:
| Tool | Description |
|------|-------------|
| `add_memories` | Save text/conversation for a user/agent |
| `search_memory` | Semantic search across memories |
| `list_memories` | List with filters and pagination |
| `get_memory` | Retrieve single memory by ID |
| `update_memory` | Overwrite a memory's text |
| `delete_memory` | Delete single memory by ID |
| `delete_all_memories` | Bulk delete in scope |
| `list_entities` | List entity types |

**Storage**: Hybrid datastore -- graph + vector + key-value. Cloud-first (186M+ API calls/month by Q3 2025). Local option via OpenMemory.

**Key features**:
- 66.9% LOCOMO benchmark accuracy (vs. OpenAI Memory's 52.9%)
- 91% lower latency, 90% reduced token usage vs. baseline
- Memory categorization: user_preferences, implementation, troubleshooting, component_context, project_overview, incident_rca
- Automatic memory curation (update, enrich, clean as new info arrives)

**Key limitation**: Cloud dependency for full features. Complexity of hybrid architecture. No inline UI dashboard. Enterprise-focused pricing model.

### 1.3 OpenMemory MCP (by Mem0)

**What it is**: Mem0's local-first, privacy-focused MCP memory server. Runs entirely on-device.

**Tools exposed**:
| Tool | Description |
|------|-------------|
| `add_memories` | Store memories locally |
| `search_memory` | Search stored memories |
| `list_memories` | Browse memories |
| `delete_all_memories` | Clear all memories |

**Storage**: Local only, no cloud sync. Built-in dashboard UI (separate web app, not inline MCP App).

**Key features**:
- Privacy-first (all data on device)
- Cross-tool: Cursor, VS Code, Claude, ChatGPT, JetBrains
- Built-in management dashboard (web app)
- Auto-captures coding preferences and patterns

**Key limitation**: Dashboard is a separate web app (not inline in conversations). Limited tool set compared to full Mem0. No agent attribution or activity tracking.

### 1.4 mcp-memory-service (doobidoo)

**What it is**: Open-source persistent memory with knowledge graph, REST API, and autonomous consolidation.

**Tools**: 12 consolidated tools including memory management, graph traversal, health monitoring.

**Storage**: Multiple backends -- SQLite (default), SQLite-vec, hybrid (local + Cloudflare cloud sync), Cloudflare Workers. Local embeddings via ONNX models.

**Key features**:
- Knowledge graph with typed edges (causes, fixes, contradicts)
- Autonomous consolidation (decay + summarization of old memories)
- Agent-specific features (X-Agent-ID header, conversation_id)
- Framework-agnostic REST API (LangGraph, CrewAI, AutoGen)

**Key limitation**: Complex setup. No MCP App UI. REST API approach is different from pure MCP.

### 1.5 Other Notable Mentions

| Server | Approach | Notable Feature |
|--------|----------|-----------------|
| **mcp-memory-keeper** | Session-based context management | Session branching, merging with conflict resolution, journal entries |
| **fremem** | Vector memory with LanceDB | Multi-project isolation, Sentence Transformers |
| **mcp-memory (Puliczek)** | Vector search memory | Cloudflare-based, semantic search |
| **memory-bank-mcp** | Cline Memory Bank inspired | Remote memory bank management |
| **basic-memory** (CaviraOSS) | Local persistent store | Works with Claude Desktop, GitHub Copilot, Codex |

---

## 2. MCP Apps Widget Patterns

### 2.1 Architecture Overview

MCP Apps are an official MCP extension that lets tools return interactive HTML UIs rendered in sandboxed iframes within conversations. Supported by Claude (web), Claude Desktop, VS Code Insiders, Goose, Postman, and MCPJam.

### 2.2 Key APIs

**Server-side registration** (using `@modelcontextprotocol/ext-apps`):
```typescript
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

const resourceUri = "ui://tool-name/mcp-app.html";

registerAppTool(server, "tool-name", {
  title: "Tool Title",
  description: "...",
  inputSchema: {},
  _meta: { ui: { resourceUri } }
}, async () => {
  return { content: [{ type: "text", text: "result" }] };
});

registerAppResource(server, resourceUri, resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile("dist/mcp-app.html", "utf-8");
    return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
  }
);
```

**Client-side App class** (in widget code):
```typescript
import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "My App", version: "1.0.0" });
app.connect();

// Receive initial tool result from host
app.ontoolresult = (result) => {
  const data = result.content?.find(c => c.type === "text")?.text;
  // render data
};

// Proactively call server tools from UI
const result = await app.callServerTool({
  name: "tool-name",
  arguments: { key: "value" }
});
```

### 2.3 Widget Lifecycle

1. LLM decides to call a tool with `_meta.ui.resourceUri`
2. Host preloads the UI resource (can stream tool inputs to app)
3. Host fetches HTML from server via `registerAppResource`
4. HTML renders in sandboxed iframe (postMessage communication)
5. `app.ontoolresult` fires with initial tool result
6. User interacts with UI -> `app.callServerTool()` for fresh data
7. App can update model context via `app.updateContext()`

### 2.4 mcp-use Framework Alternative

mcp-use provides a higher-level React framework:
```typescript
import { useMcp } from "mcp-use/react";

export default function Dashboard() {
  const { callTool, status, error } = useMcp();
  // callTool("tool-name", { args }) to interact with server
}
```

Widget files in `resources/` directory are auto-discovered.

### 2.5 Existing Example Apps (from ext-apps repo)

**Data exploration / dashboards**:
- `cohort-heatmap-server` - heatmap visualization
- `customer-segmentation-server` - segmentation dashboard
- `wiki-explorer-server` - wiki navigation
- `scenario-modeler-server` - business scenario modeling
- `budget-allocator-server` - budget allocation UI

**3D / visualization**: map-server (CesiumJS), threejs-server, shadertoy-server

**Utilities**: qr-server, system-monitor-server, transcript-server

**Framework templates**: React, Vue, Svelte, Preact, Solid, vanilla JS

### 2.6 Project Structure (typical)

```
my-mcp-app/
  server.ts           # MCP server with registerAppTool + registerAppResource
  mcp-app.html        # UI entry point
  src/
    mcp-app.ts         # App class usage, UI logic
  vite.config.ts       # Vite + vite-plugin-singlefile for bundling
  dist/
    mcp-app.html       # Bundled single-file HTML
```

### 2.7 Security Model

- Sandboxed iframe (no parent DOM access, no cookies, no navigation)
- All communication via postMessage (abstracted by App class)
- Host controls which tools the app can call
- CSP configurable via `_meta.ui.csp` for external resources

---

## 3. clientInfo.name in MCP Protocol

### 3.1 How It Works

During the MCP initialize handshake, clients send their identity:
```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    },
    "capabilities": { ... }
  }
}
```

### 3.2 Known clientInfo.name Values

Data sourced from the [Apify MCP Client Capabilities Index](https://github.com/apify/mcp-client-capabilities), which maps actual `params.clientInfo.name` values from initialize requests:

| clientInfo.name | Display Name | Notes |
|-----------------|-------------|-------|
| `claude-ai` | Claude.ai (web) | Web version of Claude |
| `claude-code` | Claude Code | CLI agent |
| `cursor-vscode` | Cursor | IDE |
| `ChatGPT` | ChatGPT | OpenAI desktop/web |
| `Visual Studio Code` | VS Code | With Copilot MCP support |
| `Cline` | Cline | VS Code extension |
| `Codex` | OpenAI Codex | CLI agent |
| `goose` | Goose | Block's agent |
| `Roo-Code` | Roo Code | VS Code extension |
| `Kilo-Code` | Kilo Code | VS Code extension |
| `gemini-cli-mcp-client` | Gemini CLI | Google's CLI agent |
| `github-copilot-developer` | GitHub Copilot CLI | GitHub's agent |
| `JetBrains-IU-copilot-intellij` | JetBrains AI Assistant | IntelliJ-based |
| `Q-DEV-CLI` | Amazon Q Developer CLI | AWS agent |
| `Glama` | Glama | MCP playground |
| `Mistral` | Mistral AI: Le Chat | Mistral's chat |
| `antigravity-client` | Google Antigravity | Google's agent |

### 3.3 Extracting Server-Side (TypeScript SDK)

The clientInfo is available after the initialize handshake. In the MCP TypeScript SDK, the server receives this during initialization. The recommended approach:

```typescript
// The server object stores client info after initialize
// Access via the transport/session context
// Exact API depends on SDK version - check current docs
```

**Important note for our project**: The `clientInfo.name` values are inconsistent across clients (some use kebab-case like `claude-ai`, some use PascalCase like `ChatGPT`, some use full phrases like `Visual Studio Code`). Our agent icon mapping in the dashboard should handle all these variants.

### 3.4 Recommended Agent Icon Mapping (Updated)

Based on actual clientInfo.name values:

| clientInfo.name pattern | Color | Display Label |
|------------------------|-------|---------------|
| `claude-ai`, `claude-code` | Purple (#8B5CF6) | Claude |
| `ChatGPT`, `Codex` | Green (#10B981) | ChatGPT/OpenAI |
| `cursor-vscode` | Blue (#3B82F6) | Cursor |
| `Visual Studio Code`, `github-copilot-developer` | Gray (#6B7280) | VS Code / Copilot |
| `Cline`, `Roo-Code`, `Kilo-Code` | Cyan (#06B6D4) | Cline/Roo/Kilo |
| `gemini-cli-mcp-client`, `antigravity-client` | Yellow (#F59E0B) | Google |
| `goose` | Orange (#F97316) | Goose |
| `JetBrains-*` | Red (#EF4444) | JetBrains |
| `Q-DEV-CLI` | Amber (#D97706) | Amazon Q |
| unknown / fallback | Dark Gray (#374151) | Unknown |

---

## 4. Differentiation Strategy

### 4.1 Competitive Positioning Matrix

| Feature | Official Memory | Mem0 | OpenMemory | mcp-memory-service | **Agent Memory (ours)** |
|---------|----------------|------|------------|--------------------|-----------------------|
| Storage model | Knowledge graph (JSONL) | Hybrid (graph+vector+kv) | Local vector | SQLite + embeddings | SQLite + FTS5 |
| Inline UI dashboard | No | No | No (separate web app) | No | **Yes (MCP App widget)** |
| Agent attribution | No | No | No | Partial (X-Agent-ID) | **Yes (visual, color-coded)** |
| Cross-agent activity feed | No | No | No | No | **Yes (activity_log + Activity tab)** |
| Auto-context on connect | No | No | No | No | **Yes (memory://current-context)** |
| Setup complexity | Low (JSONL) | High (cloud API) | Medium | High (embeddings) | **Low (single SQLite file)** |
| Cloud dependency | No | Yes (for full features) | No | Optional | **No** |
| Open source | Yes | Partially | Yes | Yes | **Yes** |

### 4.2 The Experience Story (Key Differentiator)

**"Every other memory server is invisible. Ours shows you what your agents know."**

The strongest differentiation is NOT about storage technology (everyone has storage). It is about **EXPERIENCE**:

1. **Visible intelligence**: When you ask an agent to remember something, you SEE it appear in the dashboard right there in your conversation. You see the purple Claude icon, the "decision" badge, the tags, the reasoning context. Other servers silently write to a file -- you have no idea what's there.

2. **Collaboration made tangible**: Switch from Claude to ChatGPT. The Activity tab shows "Claude stored 'project uses PostgreSQL' 5 minutes ago with reasoning: chose over MySQL for JSONB support." No other memory server shows you the WHO and WHY of each memory. Cross-agent collaboration goes from invisible to visible.

3. **Zero-friction context handoff**: `memory://current-context` auto-loads when any agent connects. Other servers require the agent to actively search. Ours pushes context proactively -- the new agent already knows everything before the user says a word.

4. **Simple mental model**: Key-value with types and tags. Not knowledge graphs (entities? relations? observations?). Not vector embeddings. Just: "remember this as a decision, tag it with 'database'." Natural language in, structured data out.

### 4.3 One-Sentence Pitch Variations

- **For judges**: "Agent Memory is the first MCP server that gives you a live dashboard of what your AI agents know and do -- visible, attributed, cross-agent intelligence."
- **For developers**: "It's memory for AI agents with a UI -- you see what they remember, who stored it, and why, right inside your conversation."
- **For users**: "Switch between Claude and ChatGPT without losing context. See everything your agents know in one dashboard."

### 4.4 What NOT to Compete On

- **Don't compete on AI/ML sophistication**: Mem0 has $24M and vector embeddings. We have FTS5. That's fine. Our story is about experience, not algorithms.
- **Don't compete on scale**: Mem0 processes 186M API calls/month. We're a hackathon project. Focus on the demo experience.
- **Don't compete on enterprise features**: No auth, no multi-tenant, no compliance. Focus on developer delight.

---

## 5. Key Takeaways for Implementation

1. **Widget rendering is the hero feature** -- get it working in the first 15 minutes. If it fails, the entire differentiation collapses.

2. **Agent icon mapping must handle real clientInfo.name values** -- they are inconsistent (PascalCase, kebab-case, full words). Build a flexible matcher, not exact string comparison.

3. **The Activity tab is the demo moment** -- when you show ChatGPT seeing Claude's activity, that's the "wow." Prioritize `activity_log` implementation.

4. **FTS5 is good enough** -- don't waste time on vector embeddings. BM25 ranking on key+value+context gives excellent results for the demo scale.

5. **`memory://current-context` is the "magic" feature** -- agents proactively loading context on connect is the smoothest possible user experience. Implement this as a high-priority "should have."
