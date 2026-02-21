# Agent Memory: Complete Multi-Phase Implementation Plan

> Generated 2026-02-21 after deep research of `@modelcontextprotocol/ext-apps` SDK,
> `mcp-use` framework, and `doobidoo/mcp-memory-service` (1,200+ stars).

---

## Current State Assessment

### What We Have (Working)
- 4 MCP tools: `remember`, `recall`, `forget`, `list_memories`
- 2 MCP resources: `memory://current-context`, `memory://agent-activity`
- 1 MCP App widget: dashboard with real-time polling, filtering, search
- SQLite + FTS5 full-text search with composite scoring (BM25 + recency + access + type)
- Cross-agent awareness (13 agent display names, color-coded)
- Express server with Streamable HTTP transport

### Issues Found & Fixed (Today)
1. Widget sent BOTH JSON-RPC and simple protocol on every call (fixed: JSON-RPC only)
2. Never sent `ui/notifications/initialized` after handshake (fixed)
3. No notification handlers for `tool-result`, `host-context-changed`, `resource-teardown` (fixed)
4. Polling spammed activity log every 3s (fixed: `silent` parameter)
5. `remember`/`forget` didn't return structured JSON for widget (fixed)
6. No `updateModelContext()` for widget-model interaction (fixed)
7. No fullscreen toggle or auto-resize notifications (fixed)
8. Test harness still used simple protocol (fixed: JSON-RPC only)

### Remaining Issues to Fix
9. `ui/initialize` params missing `protocolVersion` and proper `clientInfo` structure
10. `updateModelContext()` uses wrong param format (should use `content` ContentBlocks, not raw string)
11. `ui/resource-teardown` is a **request** (has `id`) - widget must respond with JSON-RPC response
12. No `structuredContent` in tool responses (spec separates model vs widget data)
13. No tool `visibility` metadata (delete should be `["app"]` only)
14. No `sendMessage()` capability (widget can't trigger model responses)
15. Widget doesn't apply host CSS variables (`useHostStyles` pattern)
16. No `ontoolinput`/`ontoolinputpartial` handling for streaming previews

---

## Feature Gap Analysis: Us vs. mcp-memory-service

| Feature | Us | mcp-memory-service | Priority |
|---------|----|--------------------|----------|
| **Vector embeddings** | None | MiniLM-L6-v2 via ONNX | P1 |
| **Hybrid search** (BM25 + vector) | BM25 only | 30% BM25 + 70% vector | P1 |
| **Natural language time queries** | None | "yesterday", "last week" | P2 |
| **Semantic deduplication** | None | Within 24hr windows | P2 |
| **Knowledge graph** | None | Typed relationships + BFS | P3 |
| **Memory quality scoring** | None | DeBERTa classifier | P3 |
| **Memory consolidation/decay** | None | Dream-inspired system | P3 |
| **Document ingestion** | None | PDF/TXT/MD/JSON chunking | P3 |
| **Database backup tool** | None | `create_backup` tool | P2 |
| **Stats as MCP tool** | Resource only | `get_stats` tool | P1 |
| **Delete by tag** | None | `delete_by_tag` tool | P2 |
| **DB health/optimize** | `/health` endpoint | MCP tools | P2 |
| **OAuth authentication** | None | OAuth 2.1 + API keys | P3 |
| **In-client widget (MCP App)** | Yes | No (standalone web) | Our advantage |
| **Key-value schema** | Yes | Content-hash only | Our advantage |
| **Context/rationale field** | Yes | No | Our advantage |
| **Auto-surfaced resources** | Yes | No | Our advantage |
| **Cross-agent activity feed** | Yes | No | Our advantage |

---

## Phase 1: Fix Protocol Compliance (Hackathon Critical)

**Goal**: Score maximum on "Widget-Model Interaction" (20 pts) and "Production Readiness" (10 pts)

### 1.1 Fix `ui/initialize` Handshake

**File**: `resources/memory-dashboard/widget.html`

Current:
```js
params: { name: 'Agent Memory Dashboard', version: '1.0.0' }
```

Should be (per ext-apps spec):
```js
params: {
  protocolVersion: '2026-01-26',
  clientInfo: { name: 'Agent Memory Dashboard', version: '1.0.0' },
  appCapabilities: {
    tools: { listChanged: false },
    availableDisplayModes: ['inline', 'fullscreen']
  }
}
```

### 1.2 Fix `updateModelContext()` Format

Current sends `params: { context: string }`. Spec requires:
```js
params: {
  content: [{ type: 'text', text: '...' }],
  structuredContent: {
    activeTab: 'memories',
    typeFilter: 'all',
    searchQuery: '',
    visibleCount: 15,
    topTags: ['database', 'auth']
  }
}
```

### 1.3 Handle `ui/resource-teardown` as Request

`ui/resource-teardown` has an `id` — it's a request that needs a response:
```js
case 'ui/resource-teardown':
  stopPolling();
  // Must send JSON-RPC response back
  window.parent.postMessage({
    jsonrpc: '2.0', id: data.id,
    result: {}
  }, '*');
  break;
```

### 1.4 Add `structuredContent` to Tool Responses

Per the spec, `content` is for the model, `structuredContent` is for the widget:

**File**: `src/tools/list.ts`, `src/tools/recall.ts`, `src/tools/remember.ts`, `src/tools/forget.ts`

```typescript
return {
  content: [{ type: "text", text: formattedText }],
  structuredContent: {
    memories: memoriesWithTags,
    activities,
    total,
  },
};
```

This replaces the current hack of putting JSON in a second text block.

### 1.5 Add Tool Visibility Metadata

**File**: `src/tools/forget.ts` - Delete should be app-only:
```typescript
_meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } }
```

**File**: `src/tools/list.ts` - Widget polling tool, both model and app:
```typescript
_meta: { ui: { resourceUri: WIDGET_URI, visibility: ["model", "app"] } }
```

### 1.6 Add `sendMessage()` for Widget-to-Model Communication

When the user performs actions in the widget (like deleting a memory), notify the model:
```js
function sendChatMessage(text) {
  window.parent.postMessage({
    jsonrpc: '2.0', id: ++rpcIdCounter,
    method: 'ui/message',
    params: { role: 'user', content: [{ type: 'text', text: text }] }
  }, '*');
}
```

Use after delete: `sendChatMessage('I just deleted the memory "' + key + '" from the dashboard.');`

### 1.7 Apply Host Theme CSS Variables

Listen for `hostContext.styles.variables` and apply them:
```js
function applyHostStyles(ctx) {
  if (!ctx || !ctx.styles || !ctx.styles.variables) return;
  var vars = ctx.styles.variables;
  for (var key in vars) {
    if (vars[key]) document.documentElement.style.setProperty(key, vars[key]);
  }
  if (ctx.theme) document.documentElement.setAttribute('data-theme', ctx.theme);
}
```

### 1.8 Update Test Harness with Full Protocol

**File**: `resources/memory-dashboard/test.html`

- Return proper `protocolVersion` in init response
- Return `hostContext` with theme and `containerDimensions`
- Return `hostCapabilities` with `serverTools`, `openLinks`
- Send `ui/notifications/tool-result` after simulated model actions
- Handle `ui/message` from widget and display in log
- Handle `ui/update-model-context` and display structured content

---

## Phase 2: High-Impact Feature Additions

**Goal**: Score maximum on "Originality" (30 pts) and "Real-World Usefulness" (30 pts)

### 2.1 Add `get_stats` Tool

New file: `src/tools/stats.ts`

```typescript
registerAppTool(server, "get_stats", {
  description: "Get memory system statistics",
  inputSchema: {},
  _meta: { ui: { resourceUri: WIDGET_URI } },
}, async () => {
  const stats = getStats(db);
  return {
    content: [{ type: "text", text: `${stats.total} memories...` }],
    structuredContent: stats,
  };
});
```

### 2.2 Add `delete_by_tag` Tool

New file: `src/tools/deleteByTag.ts`

```typescript
registerAppTool(server, "delete_by_tag", {
  description: "Delete all memories with a specific tag",
  inputSchema: { tag: z.string() },
  _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
}, async (params) => {
  const count = deleteMemoriesByTag(db, params.tag);
  return {
    content: [{ type: "text", text: `Deleted ${count} memories tagged "${params.tag}"` }],
    structuredContent: { deleted: count, tag: params.tag },
  };
});
```

### 2.3 Add `create_backup` Tool

```typescript
registerAppTool(server, "create_backup", {
  description: "Create a backup of the memory database",
  inputSchema: {},
  _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["app"] } },
}, async () => {
  const backupPath = createBackup(db);
  return {
    content: [{ type: "text", text: `Backup created: ${backupPath}` }],
    structuredContent: { path: backupPath, timestamp: new Date().toISOString() },
  };
});
```

### 2.4 Add Natural Language Time Queries

Install `chrono-node` for time parsing:
```bash
npm install chrono-node
```

Add to `recall` tool:
```typescript
time_expression: z.string().optional()
  .describe("Natural language time (e.g., 'yesterday', 'last week', '3 days ago')"),
```

Parse in handler:
```typescript
import * as chrono from 'chrono-node';

if (params.time_expression) {
  const parsed = chrono.parseDate(params.time_expression);
  if (parsed) {
    // Add date range filter to SQL query
  }
}
```

### 2.5 Add Semantic Deduplication to `remember`

Before storing, check if a very similar memory exists:
```typescript
// In remember handler, before upsertMemory:
const existing = searchMemories(db, { query: params.value, limit: 1 });
if (existing.length > 0 && existing[0].rank < -10) {
  // High BM25 match = likely duplicate
  return {
    content: [{ type: "text", text: `Similar memory already exists: "${existing[0].key}"` }],
    structuredContent: { duplicate: true, existingKey: existing[0].key },
  };
}
```

### 2.6 Add Dashboard Stats Tab

Add a third tab to the widget showing:
- Total memories by type (pie/bar visualization using CSS)
- Most active agents
- Memory growth over time
- Top tags
- Most accessed memories

### 2.7 Add `ui/message` for Critical Actions

When user deletes from widget, inform the model:
```js
// After successful delete
sendChatMessage('Memory "' + key + '" was deleted from the dashboard.');
```

When user searches, let model know:
```js
// After search completes with results
updateModelContext(); // silent update, not a message
```

---

## Phase 3: Vector Embeddings & Semantic Search

**Goal**: Close the biggest feature gap with mcp-memory-service

### 3.1 Add `@xenova/transformers` for Local Embeddings

```bash
npm install @xenova/transformers
```

### 3.2 Create Embedding Service

New file: `src/embeddings/service.ts`

```typescript
import { pipeline } from '@xenova/transformers';

let embeddingPipeline: any = null;

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );
  }
  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### 3.3 Add Embedding Column to Schema

```sql
ALTER TABLE memories ADD COLUMN embedding BLOB;
```

### 3.4 Embed on Store, Search by Similarity

In `remember.ts`:
```typescript
const embedding = await getEmbedding(params.value);
// Store embedding blob alongside memory
```

In `recall.ts`:
```typescript
const queryEmbedding = await getEmbedding(params.query);
// Fetch all embeddings, compute cosine similarity
// Combine: 0.3 * bm25_score + 0.7 * vector_similarity
```

### 3.5 Semantic Deduplication (Enhanced)

```typescript
const embedding = await getEmbedding(params.value);
const allEmbeddings = getAllEmbeddings(db);
for (const existing of allEmbeddings) {
  if (cosineSimilarity(embedding, existing.embedding) > 0.92) {
    // Near-duplicate detected
  }
}
```

---

## Phase 4: Knowledge Graph

**Goal**: Enable relationship discovery between memories

### 4.1 Add Relationships Table

```sql
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN (
    'causes', 'fixes', 'supports', 'opposes', 'follows', 'related', 'contradicts'
  )),
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_memory_id, to_memory_id, relationship_type)
);
```

### 4.2 Add `link_memories` Tool

```typescript
registerAppTool(server, "link_memories", {
  description: "Create a relationship between two memories",
  inputSchema: {
    from_key: z.string(),
    to_key: z.string(),
    relationship: z.enum(['causes', 'fixes', 'supports', 'opposes', 'follows', 'related', 'contradicts']),
  },
});
```

### 4.3 Add `find_related` Tool

```typescript
registerAppTool(server, "find_related", {
  description: "Find memories related to a given memory (1-2 hops)",
  inputSchema: {
    key: z.string(),
    max_hops: z.number().optional().describe("Max relationship hops (1 or 2, default 1)"),
  },
});
```

### 4.4 Add Graph Visualization to Dashboard

Use simple CSS/SVG force-directed layout (no D3 dependency):
- Show selected memory as center node
- Connected memories as satellite nodes
- Relationship types as colored edges
- Click nodes to navigate

---

## Phase 5: Memory Lifecycle & Quality

### 5.1 Memory Quality Scoring

Simple heuristic (no ML dependency):
```typescript
function computeQualityScore(memory): number {
  let score = 0;
  if (memory.value.length > 50) score += 0.2;   // Has substance
  if (memory.context) score += 0.2;              // Has rationale
  if (memory.tags?.length > 0) score += 0.2;     // Categorized
  if (memory.type !== 'note') score += 0.1;      // Typed specifically
  if (memory.access_count > 3) score += 0.3;     // Actually used
  return Math.min(score, 1.0);
}
```

### 5.2 Memory Decay & Consolidation

```typescript
// Run periodically (e.g., daily)
function consolidateMemories(db) {
  const stale = db.prepare(`
    SELECT * FROM memories
    WHERE updated_at < datetime('now', '-30 days')
    AND access_count < 2
  `).all();
  // Archive or delete low-quality stale memories
}
```

### 5.3 Auto-Tagging

Use FTS5 to extract top terms from memory content and suggest tags:
```typescript
function suggestTags(content: string): string[] {
  // Tokenize, remove stop words, find top 3 terms
}
```

---

## Phase 6: Production Hardening

### 6.1 Authentication

- Add API key middleware to Express
- Support `Authorization: Bearer <key>` header
- Store keys in environment variables

### 6.2 Rate Limiting

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';
app.use('/mcp', rateLimit({ windowMs: 60000, max: 100 }));
```

### 6.3 Input Sanitization

- Max key length: 500 chars (already in DB layer)
- Max value length: 10KB (already in DB layer)
- XSS prevention in widget (already using textContent, not innerHTML for user data)

### 6.4 Database Migrations

Create `src/db/migrations/` directory with versioned SQL files.

### 6.5 Comprehensive Logging

```bash
npm install pino
```

### 6.6 MCP Manifest

Create `.mcp.json`:
```json
{
  "name": "agent-memory",
  "version": "1.0.0",
  "description": "Universal shared memory layer for AI agents",
  "tools": ["remember", "recall", "forget", "list_memories", "get_stats"],
  "resources": ["memory://current-context", "memory://agent-activity"],
  "apps": ["ui://agent-memory/dashboard.html"],
  "transport": "streamable-http",
  "port": 3001
}
```

---

## Phase 7: Deployment & Distribution

### 7.1 Manufact Deployment

```bash
npx @mcp-use/cli login
npx @mcp-use/cli deploy
```

### 7.2 Docker Container

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY data/seed.json ./data/
COPY resources/ ./resources/
CMD ["node", "dist/server.js"]
```

### 7.3 One-Line Install

Add to README:
```bash
npx agent-memory
# or
docker run -p 3001:3001 ghcr.io/nihalnihalani/agent-memory
```

---

## Implementation Priority for Hackathon

### Must Complete Today (Scoring Impact: HIGH)

| Task | Scoring Category | Points Impact |
|------|-----------------|---------------|
| Phase 1.1-1.3: Fix protocol compliance | Widget-Model Interaction | +10 |
| Phase 1.4: `structuredContent` in responses | Widget-Model Interaction | +5 |
| Phase 1.6: `sendMessage()` for widget actions | Widget-Model Interaction | +5 |
| Phase 1.7: Host theme CSS variables | UX & UI | +3 |
| Phase 2.1: `get_stats` tool | Real-World Usefulness | +3 |
| Phase 2.6: Stats tab in widget | UX & UI | +3 |

### Should Complete Today (Scoring Impact: MEDIUM)

| Task | Scoring Category | Points Impact |
|------|-----------------|---------------|
| Phase 1.5: Tool visibility metadata | Production Readiness | +2 |
| Phase 2.4: Natural language time queries | Originality | +5 |
| Phase 2.5: Semantic deduplication | Real-World Usefulness | +3 |
| Phase 1.8: Full test harness update | Production Readiness | +2 |

### Nice to Have (Scoring Impact: LOW, but impressive)

| Task | Scoring Category | Points Impact |
|------|-----------------|---------------|
| Phase 3: Vector embeddings | Originality | +5 |
| Phase 4: Knowledge graph | Originality | +5 |
| Phase 6.6: MCP manifest | Production Readiness | +2 |

---

## Files to Modify/Create

### Modify
| File | Phase | Changes |
|------|-------|---------|
| `resources/memory-dashboard/widget.html` | 1, 2 | Protocol fixes, stats tab, sendMessage |
| `resources/memory-dashboard/test.html` | 1 | Full protocol compliance |
| `src/tools/list.ts` | 1 | structuredContent |
| `src/tools/recall.ts` | 1, 2 | structuredContent, time queries |
| `src/tools/remember.ts` | 1, 2 | structuredContent, dedup check |
| `src/tools/forget.ts` | 1 | structuredContent, visibility |
| `server.ts` | 2 | Register new tools |
| `src/db/queries.ts` | 2 | New query functions |

### Create
| File | Phase | Purpose |
|------|-------|---------|
| `src/tools/stats.ts` | 2 | Statistics tool |
| `src/tools/deleteByTag.ts` | 2 | Bulk delete by tag |
| `src/tools/backup.ts` | 2 | Database backup |
| `src/embeddings/service.ts` | 3 | Vector embedding service |
| `src/db/migrations/` | 6 | Database migrations |
| `.mcp.json` | 6 | MCP manifest |

---

## Key Architectural Decisions

1. **No React**: Keep vanilla JS widget. Adds zero dependencies, loads instantly, avoids build complexity. React would require Vite bundling, which the hack-yc starter uses but we don't need.

2. **No ONNX runtime**: Use `@xenova/transformers` (WebAssembly-based) if we add embeddings. Much lighter than Python+PyTorch.

3. **SQLite stays**: No need for ChromaDB or Cloudflare. SQLite + FTS5 is already fast. Add a `BLOB` column for embeddings if needed.

4. **Single HTML file**: Keep the widget as one file. `registerAppResource` serves it directly. No build step needed for the widget.

5. **structuredContent over text JSON**: Per the spec, `structuredContent` is the proper way to send data to the widget. Stop encoding JSON inside text blocks.

---

## Verification Checklist

- [ ] `npm run build` passes
- [ ] `npm run dev` starts on port 3001
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok"}`
- [ ] Test harness loads widget, shows memories
- [ ] Activity tab shows NO constant "browsed" entries from polling
- [ ] Widget sends `ui/notifications/initialized` on startup
- [ ] Widget sends `ui/update-model-context` with structuredContent on filter change
- [ ] Widget sends `ui/message` when user deletes a memory
- [ ] Widget handles `ui/notifications/tool-result` from host
- [ ] Widget handles `ui/resource-teardown` and responds
- [ ] Tool responses have both `content` (for model) and `structuredContent` (for widget)
- [ ] `forget` tool has `visibility: ["app"]`
- [ ] Stats tool works and returns data
- [ ] Test harness returns proper `protocolVersion` and `hostContext`
