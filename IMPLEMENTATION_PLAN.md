# Agent Memory - MCP Apps Hackathon Implementation Plan

## Executive Summary

**Event**: MCP Apps Hackathon 2026 @ Y Combinator, San Francisco (Feb 21)
**Sponsors**: Cloudflare, Anthropic, OpenAI, Puzzle, WorkOS
**Prizes**: 1st = $10K OpenAI + $100K Cloudflare + Mac Mini + **YC INTERVIEW**

### CRITICAL FINDING

The current implementation (`server.ts` using `@modelcontextprotocol/sdk` + Express) **DOES NOT MEET HACKATHON REQUIREMENTS**. All projects **MUST** be built as MCP Apps using the `mcp-use` SDK and deployed on Manufact MCP Cloud. The `Agent-memory/` subdirectory has mcp-use scaffolded but only contains boilerplate.

### Scoring System (100 points)

| Criteria | Weight | Our Current Score | Target Score |
|----------|--------|-------------------|--------------|
| **Originality** | 30pt | ~22 (cross-agent is novel) | 27+ |
| **Real-World Usefulness** | 30pt | ~20 (works but raw SDK) | 26+ |
| **Widget-Model Interaction** | 20pt | ~3 (vanilla HTML, no callTool) | 16+ |
| **User Experience & UI** | 10pt | ~4 (dark theme but bugs) | 8+ |
| **Production Readiness** | 10pt | ~3 (no onboarding) | 7+ |
| **TOTAL** | 100pt | ~52 | **84+** |

### Competitive Positioning

- **Main threat**: Mem0/OpenMemory (dashboard + ACLs) and doobidoo/mcp-memory-service (D3 knowledge graph)
- **Our unique advantage**: **Inline MCP App widget** — NO competitor has this. Plus cross-agent attribution.
- **Killer demo moment**: "Store in Claude, recall in ChatGPT" with the widget showing live updates

---

## Phase 0: Pre-Flight (15 min)

### 0.1 Clone starter repo and verify mcp-use toolchain
```bash
# Verify mcp-use CLI works
cd Agent-memory/
npm install
npx mcp-use dev  # Should start dev server
```

### 0.2 Verify better-sqlite3 compatibility
- Test that `better-sqlite3` installs and runs within mcp-use's build system
- If it fails: fallback plan is to use mcp-use's Hono routes to proxy to a separate SQLite process
- If it works: proceed normally

---

## Phase 1: Foundation — Port to mcp-use SDK (BLOCKING, ~2 hours)

> This phase is **BLOCKING**. Nothing else matters if we don't run on mcp-use.

### 1.1 Set up `Agent-memory/index.ts` with MCPServer

Replace the boilerplate weather example with:

```typescript
import { MCPServer, text, object, error, widget, markdown } from "mcp-use/server";
import { z } from "zod";
import { initializeDatabase } from "./src/db/schema.js";
import { seedDatabase } from "./src/db/seed.js";

const db = initializeDatabase("./data/memories.db");
seedDatabase(db);

const server = new MCPServer({
  name: "agent-memory",
  title: "Agent Memory",
  version: "1.0.0",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
});
```

### 1.2 Copy database layer (unchanged)

Copy these files from root into `Agent-memory/src/db/`:
- `src/db/schema.ts` — no changes needed
- `src/db/queries.ts` — no changes needed
- `src/db/seed.ts` — no changes needed
- `data/seed.json` — copy to `Agent-memory/data/seed.json`

### 1.3 Copy and clean helpers

Copy `src/tools/helpers.ts` to `Agent-memory/src/tools/helpers.ts`

Add a new helper to eliminate the repeated `(extra as any)` pattern:
```typescript
export function getAgentId(ctx: any): string {
  return ctx?._meta?.clientInfo?.name
    || ctx?.meta?.clientInfo?.name
    || "unknown";
}
```

### 1.4 Migrate `remember` tool

**Before** (registerAppTool + raw content): See `src/tools/remember.ts`
**After** (server.tool + response helpers):

```typescript
server.tool(
  {
    name: "remember",
    description: "Store a memory that persists across conversations and agents.",
    schema: z.object({
      key: z.string().describe("Short descriptive ID (e.g., 'project-db-choice')"),
      value: z.string().describe("Content to remember — text, code, JSON, anything"),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
        .describe("Memory type: decision, preference, task, snippet, or note"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      context: z.string().optional().describe("Why you're storing this"),
    }),
    widget: {
      name: "memory-dashboard",
      invoking: "Storing memory...",
      invoked: "Memory stored",
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async (params, ctx) => {
    const agentId = getAgentId(ctx);
    const existing = getMemoryByKey(db, params.key);
    const memory = upsertMemory(db, { ...params, agent_id: agentId });
    const tags = getTagsForMemory(db, memory.id);
    logActivity(db, { agent_id: agentId, action: "remember", target_key: params.key, detail: existing ? "updated" : "created" });

    return widget({
      props: { memory: { ...memory, tags }, action: existing ? "updated" : "created", agent: agentDisplayName(agentId) },
      output: text(existing
        ? `Updated memory '${memory.key}' (originally by ${agentDisplayName(existing.agent_id || "unknown")})`
        : `Stored new [${memory.type}] memory '${memory.key}'`
      ),
    });
  }
);
```

### 1.5 Migrate `recall` tool

Same pattern. Key change: return `widget()` instead of double-text-block hack.

```typescript
server.tool(
  {
    name: "recall",
    description: "Search and retrieve stored memories using full-text search.",
    schema: z.object({
      query: z.string().describe("Natural language search query"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional(),
      limit: z.number().min(1).max(20).optional().describe("Max results (default: 5)"),
    }),
    widget: { name: "memory-dashboard", invoking: "Searching memories...", invoked: "Results ready" },
    annotations: { readOnlyHint: true },
  },
  async (params, ctx) => {
    // ... existing composite scoring logic stays the same ...
    return widget({
      props: { memories: memoriesWithTags, query: params.query, total: results.length },
      output: text(`Found ${results.length} memories matching "${params.query}"`),
    });
  }
);
```

### 1.6 Migrate `forget` tool

**Critical fix**: Add `destructiveHint: true` annotation.

```typescript
server.tool(
  {
    name: "forget",
    description: "Remove a memory by its key. Use when information is outdated.",
    schema: z.object({ key: z.string().describe("Key of the memory to delete") }),
    widget: { name: "memory-dashboard", invoking: "Removing memory...", invoked: "Memory removed" },
    annotations: { destructiveHint: true, readOnlyHint: false },
  },
  async (params, ctx) => {
    const deleted = deleteMemory(db, params.key);
    if (!deleted) return error(`No memory found with key '${params.key}'`);
    logActivity(db, { agent_id: getAgentId(ctx), action: "forget", target_key: params.key });
    return widget({
      props: { deletedKey: params.key, deletedType: deleted.type },
      output: text(`Forgotten: '${params.key}' (was a [${deleted.type}])`),
    });
  }
);
```

### 1.7 Migrate `list_memories` tool

```typescript
server.tool(
  {
    name: "list-memories",  // Fix: kebab-case per mcp-use convention
    description: "Browse all stored memories with optional filtering.",
    schema: z.object({
      tags: z.array(z.string()).optional(),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional(),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().optional(),
    }),
    widget: { name: "memory-dashboard", invoking: "Loading memories...", invoked: "Memories loaded" },
    annotations: { readOnlyHint: true },
  },
  async (params, ctx) => {
    // CRITICAL FIX: Don't log activity for widget polls
    // Only log if this looks like a genuine user request (has filters or is first call)
    const { memories, total } = listMemories(db, params);
    const tagsMap = getTagsForMemories(db, memories.map(m => m.id));
    const activities = getRecentActivity(db, 30);

    return widget({
      props: { memories: memories.map(m => ({ ...m, tags: tagsMap.get(m.id) || [] })), activities, total },
      output: text(`${memories.length} of ${total} memories`),
    });
  }
);
```

### 1.8 Migrate resources

```typescript
server.resource(
  { uri: "memory://current-context", name: "Current Context", description: "Project state snapshot", mimeType: "text/plain" },
  async () => markdown(buildContextMarkdown(db))
);

server.resource(
  { uri: "memory://agent-activity", name: "Agent Activity", description: "Cross-agent activity feed", mimeType: "text/plain" },
  async () => markdown(buildActivityMarkdown(db))
);
```

### 1.9 Add resource template (NEW — mcp-use feature)

```typescript
server.resourceTemplate(
  { uriTemplate: "memory://{key}", name: "Memory by Key", description: "Fetch a specific memory", mimeType: "application/json" },
  async (uri, { key }) => {
    const memory = getMemoryByKey(db, key);
    if (!memory) return error(`Memory '${key}' not found`);
    return object(memory);
  }
);
```

### 1.10 Add health check route

```typescript
server.get("/api/health", (c) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM memories").get();
  return c.json({ status: "ok", memories: count.c });
});
```

### 1.11 Start server

```typescript
const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT);
```

### 1.12 Install dependencies

```bash
cd Agent-memory/
npm install better-sqlite3 zod
npm install -D @types/better-sqlite3
```

### 1.13 Test basic functionality

```bash
npx mcp-use dev
# Verify /api/health returns OK
# Test tools via MCP client
```

---

## Phase 2: React Widget — The Differentiator (~2 hours)

> This is where we win. The inline widget is our unique advantage over every competitor.
> Scoring: Widget-Model Interaction (20pts) + UX (10pts) = 30pts at stake.

### 2.1 Create widget structure

```
Agent-memory/resources/memory-dashboard/
  widget.tsx          # Main entry point
  components/
    MemoryCard.tsx     # Individual memory display
    ActivityFeed.tsx   # Activity timeline
    SearchBar.tsx      # Interactive search
    StatsBar.tsx       # Statistics panel
    TypeFilter.tsx     # Type filter pills
  hooks/
    useMemoryDashboard.ts  # Shared state logic
  types.ts            # Shared TypeScript types
```

### 2.2 Widget metadata

```tsx
// resources/memory-dashboard/widget.tsx
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive agent memory dashboard with search, filtering, and cross-agent activity tracking",
  props: z.object({
    memories: z.array(z.object({
      id: z.number(),
      key: z.string(),
      value: z.string(),
      type: z.string(),
      context: z.string().nullable(),
      agent_id: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
      access_count: z.number(),
      tags: z.array(z.string()),
    })),
    activities: z.array(z.object({
      id: z.number(),
      agent_id: z.string(),
      action: z.string(),
      target_key: z.string().nullable(),
      detail: z.string().nullable(),
      created_at: z.string(),
    })).optional(),
    total: z.number(),
    query: z.string().optional(),
    action: z.string().optional(),  // "created", "updated", "deleted"
    memory: z.any().optional(),     // Single memory for remember/forget responses
    deletedKey: z.string().optional(),
    deletedType: z.string().optional(),
  }),
};
```

### 2.3 Main widget component with full mcp-use integration

**KEY INTERACTIONS (scoring 20pts on Widget-Model Interaction):**

```tsx
export default function MemoryDashboard() {
  const { props, isPending, callTool, sendFollowUpMessage, state, setState, theme } = useWidget();

  // Persistent widget state (survives re-renders)
  const activeTab = state?.activeTab || "memories";
  const searchQuery = state?.searchQuery || "";
  const typeFilter = state?.typeFilter || null;

  // 1. callTool — search from within the widget
  const handleSearch = async (query: string) => {
    await setState(prev => ({ ...prev, searchQuery: query }));
    await callTool("recall", { query, limit: 20 });
  };

  // 2. callTool — delete from within the widget (with confirmation)
  const handleDelete = async (key: string) => {
    await callTool("forget", { key });
  };

  // 3. sendFollowUpMessage — ask AI to analyze memories
  const handleAnalyze = () => {
    sendFollowUpMessage("Analyze the memories shown in the dashboard and identify any patterns, conflicts, or gaps in the project context.");
  };

  // 4. sendFollowUpMessage — click a memory to inject it as context
  const handleMemoryClick = (memory) => {
    sendFollowUpMessage(`Based on the memory "${memory.key}": ${memory.value}\n\nHow should this inform our next steps?`);
  };

  // 5. setState — filter by type
  const handleTypeFilter = async (type: string | null) => {
    await setState(prev => ({ ...prev, typeFilter: type }));
    if (type) await callTool("list-memories", { type, limit: 50 });
    else await callTool("list-memories", { limit: 50 });
  };

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <LoadingSkeleton />
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider autoSize>
      <div className={theme === 'dark' ? 'dark-theme' : 'light-theme'}>
        <StatsBar memories={props.memories} total={props.total} />
        <SearchBar value={searchQuery} onSearch={handleSearch} />
        <TypeFilter active={typeFilter} onFilter={handleTypeFilter} />
        <TabBar active={activeTab} onChange={(tab) => setState(prev => ({ ...prev, activeTab: tab }))} />

        {activeTab === "memories" && (
          <MemoryList
            memories={filteredMemories}
            onDelete={handleDelete}
            onClick={handleMemoryClick}
          />
        )}
        {activeTab === "activity" && (
          <ActivityFeed activities={props.activities || []} />
        )}

        <button onClick={handleAnalyze} className="analyze-btn">
          Ask AI to Analyze
        </button>
      </div>
    </McpUseProvider>
  );
}
```

### 2.4 Widget design requirements

**Visual design (targeting 8+/10 on UX):**
- Dark theme with gradient backgrounds (match Claude/ChatGPT aesthetic)
- Smooth animations: card slide-in on new memory, pulse on update, fade on delete
- Agent color-coding: Claude = orange, ChatGPT = green, Cursor = blue, etc.
- Type badges: decision = purple, preference = blue, task = yellow, snippet = green, note = gray
- Compact cards with hover expansion for full content
- Tag pills with click-to-filter
- Activity feed with agent avatar dots and timeline connector lines

**Responsive considerations:**
- Widget will render inline in chat — optimize for ~400-600px width
- Use `autoSize` to grow/shrink with content
- Scrollable memory list with max-height
- Collapsible sections for mobile

### 2.5 Critical widget fixes from devil's advocate

1. **Delete confirmation**: Show confirm dialog before calling `forget`
2. **Timezone fix**: Always append 'Z' to SQLite datetime strings before `new Date()`
3. **No polling**: Use `callTool` responses instead of polling every 3 seconds
4. **Error states**: Show error UI when tool calls fail, with retry button
5. **Empty state**: Show welcoming message with example usage when no memories exist

---

## Phase 3: Critical Bug Fixes (~30 min)

> These fixes prevent demo embarrassment.

### 3.1 Suppress activity logging for widget polls

In the `list-memories` tool handler, add a check:
```typescript
// Only log non-widget calls (widget polls would flood the activity feed)
const isWidgetPoll = !params.tags && !params.type && !params.offset;
if (!isWidgetPoll) {
  logActivity(db, { agent_id: agentId, action: "list_memories", detail: `Listed ${memories.length}/${total}` });
}
```

### 3.2 Fix FTS5 special character crashes

In `queries.ts`, sanitize FTS5 queries:
```typescript
function sanitizeFtsQuery(query: string): string {
  // Escape FTS5 special characters
  return query.replace(/[*"(){}[\]:^~!@#$%&]/g, ' ').trim();
}
```

### 3.3 Add context field length limit

In `queries.ts`, add validation:
```typescript
const MAX_CONTEXT_LENGTH = 5000;
if (params.context && params.context.length > MAX_CONTEXT_LENGTH) {
  throw new Error(`Context too long (max ${MAX_CONTEXT_LENGTH} chars)`);
}
```

### 3.4 Add tag count/length limits

```typescript
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;
if (params.tags && params.tags.length > MAX_TAGS) {
  throw new Error(`Too many tags (max ${MAX_TAGS})`);
}
```

### 3.5 Fix duplicated agentDisplayName

Delete the local copy in `resource.ts` and import from `helpers.ts`.

---

## Phase 4: Demo Differentiators (~1 hour)

> These features score high on Originality (30pts) and make the demo memorable.

### 4.1 Memory conflict detection (HIGH IMPACT)

When storing a memory, check if a different agent stored a different value for the same key:

```typescript
if (existing && existing.agent_id !== agentId && existing.value !== params.value) {
  // Conflict detected — different agent, different value
  return widget({
    props: { memory, action: "conflict", previousAgent: agentDisplayName(existing.agent_id), previousValue: existing.value },
    output: text(`Updated '${memory.key}' (conflict: was "${existing.value}" by ${agentDisplayName(existing.agent_id)}, now "${memory.value}" by ${agentDisplayName(agentId)})`),
  });
}
```

Widget shows a visual diff: "Claude said PostgreSQL, ChatGPT changed to MySQL" with both values side-by-side.

### 4.2 Memory importance / freshness indicator

Add a visual "freshness" bar to each memory card based on the composite score:
- Access count + recency → freshness percentage
- Green bar = hot/active, fading to gray = stale
- Widget shows this as a subtle gradient on the card border

### 4.3 Agent summary stats in widget

Show a mini breakdown:
- "3 agents have contributed"
- Claude: 8 memories (last active 2m ago)
- ChatGPT: 4 memories (last active 15m ago)
- Cursor: 2 memories (last active 1h ago)
- Color-coded agent icons with activity sparklines

### 4.4 "Ask AI" integration (sendFollowUpMessage)

Prominent button in the widget:
- "Summarize project context" → sends all decisions/preferences to the model
- "Find conflicts" → asks model to analyze memories for inconsistencies
- "What's missing?" → asks model what context gaps exist

This scores heavily on **Widget-Model Interaction** (20pts).

---

## Phase 5: Production Readiness (~30 min)

> Worth 10pts. Low effort, high signal to judges.

### 5.1 First-time onboarding

When the dashboard widget loads with 0 memories:
- Show a welcoming card explaining what Agent Memory does
- Provide 3 example prompts the user can click:
  - "Remember my tech stack preferences"
  - "Store today's architecture decisions"
  - "Save this code snippet for later"
- Each click sends a `sendFollowUpMessage` to guide the AI

### 5.2 Configuration via environment variables

```typescript
const PORT = parseInt(process.env.PORT || "3000");
const DB_PATH = process.env.DB_PATH || "./data/memories.db";
const SEED_ON_EMPTY = process.env.SEED_ON_EMPTY !== "false";
```

### 5.3 Deploy to Manufact Cloud

```bash
cd Agent-memory/
npx mcp-use deploy
```

Verify it works on both Claude and ChatGPT clients.

---

## Phase 6: Demo Preparation (~30 min)

### 6.1 Demo script (2-3 minutes)

**[0:00-0:30] Problem statement**
"AI agents have amnesia. Every conversation starts from zero. Switch from Claude to ChatGPT and you lose all context. Agent Memory fixes this."

**[0:30-1:30] Live demo**
1. Open Claude with Agent Memory connected
2. Say: "Remember that we're building a Next.js app with PostgreSQL, and I prefer TypeScript with strict mode"
3. Widget animates showing 3 new memories appearing with type badges
4. Switch to ChatGPT
5. Say: "What's our tech stack?"
6. ChatGPT recalls the memories — widget shows "Originally stored by Claude" with cross-agent attribution
7. Click a memory in the widget → sendFollowUpMessage triggers AI analysis

**[1:30-2:15] Interactive widget showcase**
1. Show search from within the widget (callTool)
2. Click type filters (setState)
3. Show activity feed tab — Claude and ChatGPT actions interleaved
4. Click "Ask AI to Analyze" button → model summarizes project context
5. Delete a memory with confirmation → widget animates removal

**[2:15-2:45] Closing**
"One memory layer, every agent. Zero context lost. Built as an MCP App with mcp-use."

### 6.2 Pre-seed demo data

Update `seed.json` with a compelling project story:
- 5 decisions (tech stack, DB, auth, deploy, API style)
- 3 preferences (dark mode, TypeScript, testing approach)
- 3 tasks (current sprint items)
- 2 snippets (API endpoint, DB query)
- 2 notes (meeting notes, bug report)
- Activities showing Claude, ChatGPT, and Cursor all collaborating

### 6.3 Fallback plan

If Manufact Cloud deployment fails:
- Run locally with `npx mcp-use dev`
- Connect Claude Desktop + ChatGPT via local MCP config
- Demo still works, just explain "we'll deploy after the demo"

---

## Implementation Order (Time-Critical Path)

```
CRITICAL PATH (do these first, in order):
┌─────────────────────────────────────────────┐
│ Phase 1.1-1.3: Setup + DB layer      30min  │
│ Phase 1.4-1.7: Migrate 4 tools       45min  │
│ Phase 1.8-1.13: Resources + test     30min  │
│ Phase 2.1-2.3: React widget core     60min  │
│ Phase 2.4-2.5: Widget polish + fixes 30min  │
│ Phase 3.1-3.5: Critical bug fixes    20min  │
│ Phase 5.3: Deploy to Manufact Cloud  15min  │
│ Phase 6.1-6.3: Demo prep            20min  │
└─────────────────────────────────────────────┘
Total critical path: ~4.5 hours

NICE TO HAVE (if time permits):
┌─────────────────────────────────────────────┐
│ Phase 4.1: Conflict detection         20min  │
│ Phase 4.2: Freshness indicator        15min  │
│ Phase 4.3: Agent summary stats        15min  │
│ Phase 4.4: "Ask AI" buttons           15min  │
│ Phase 5.1: Onboarding flow            15min  │
│ Phase 5.2: Env var config             10min  │
└─────────────────────────────────────────────┘
Total nice-to-have: ~1.5 hours
```

---

## Files to Create/Modify

### New files in `Agent-memory/`:
```
Agent-memory/
├── index.ts                              # Rewrite (replace boilerplate)
├── src/
│   ├── db/
│   │   ├── schema.ts                     # Copy from root (unchanged)
│   │   ├── queries.ts                    # Copy from root (+ bug fixes)
│   │   └── seed.ts                       # Copy from root (unchanged)
│   └── tools/
│       └── helpers.ts                    # Copy from root (+ getAgentId)
├── resources/
│   └── memory-dashboard/
│       ├── widget.tsx                    # NEW: Main React widget
│       ├── components/
│       │   ├── MemoryCard.tsx            # NEW: Memory display card
│       │   ├── ActivityFeed.tsx          # NEW: Activity timeline
│       │   ├── SearchBar.tsx             # NEW: Search with callTool
│       │   ├── StatsBar.tsx              # NEW: Stats panel
│       │   └── TypeFilter.tsx            # NEW: Type filter pills
│       └── types.ts                      # NEW: Shared types
├── data/
│   └── seed.json                         # Copy from root (updated)
└── package.json                          # Update dependencies
```

### Files NOT modified (root project preserved):
- `server.ts` — keep original as reference
- `src/` — keep original, copy to Agent-memory/
- `resources/memory-dashboard/widget.html` — keep as reference

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `better-sqlite3` fails in mcp-use | Medium | Critical | Test in Phase 0. Fallback: use Cloudflare D1 |
| Manufact Cloud deploy fails | Medium | High | Fallback: demo locally with `mcp-use dev` |
| Widget doesn't render in ChatGPT | Low | Critical | Test early in Phase 2. Use Claude as primary demo client |
| Demo runs over 3 minutes | High | Medium | Practice script, have hard cuts ready |
| Cross-agent demo fails live | Medium | High | Pre-record backup video of the cross-agent moment |
| FTS5 query crashes on weird input | Medium | Low | Phase 3.2 sanitizes queries |

---

## Success Metrics

To win, we need to nail:
1. **"I didn't know you could build that"** — The inline widget showing cross-agent memory is genuinely novel
2. **Widget interactivity** — callTool, sendFollowUpMessage, setState must all work live
3. **The cross-agent moment** — Claude stores → ChatGPT recalls, with visual proof in the widget
4. **Polish** — No bugs, no ugly states, smooth animations, clear data
5. **2-minute story** — Problem → Solution → Live Demo → Close. No wasted seconds.
