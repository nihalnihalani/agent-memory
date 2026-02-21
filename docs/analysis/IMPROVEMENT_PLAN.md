# Agent Memory - Improvement Plan

> Based on codebase exploration (CODEBASE_EXPLORATION.md) and competitive analysis (COMPETITIVE_DEEP_DIVE.md)
> Prioritized for the MCP Apps Hackathon @ Y Combinator, February 21, 2026

---

## Guiding Principles

1. **Demo impact first** -- every improvement is evaluated by: "Does this make the 3-minute demo better?"
2. **Ship over perfection** -- a working 80% feature beats a polished 0% feature
3. **Visual > invisible** -- judges see the dashboard, not the SQL. Prioritize things that show.
4. **Differentiate, don't duplicate** -- lean into what competitors lack (MCP Apps inline UI, cross-agent awareness), don't chase what they have (full embeddings pipeline)

---

## Quick Wins (< 30 min each, do first)

### QW-1: Fix Response Format Inconsistency
- **What:** Make `recall` return human-readable text like `remember` does, instead of raw JSON. Also return a structured JSON block for the dashboard. Both tools should have consistent format.
- **Why:** Right now an agent calling `recall` gets `{"memories":[...],"total":5}` while `remember` returns nicely formatted text. This confuses LLMs and looks bad in conversation. Judges will see both tool outputs during the demo.
- **How:** In `src/tools/recall.ts:51-62`, format each result as readable text (key, value, type, tags, agent, timestamp) similar to `remember.ts:51-59`. Keep the JSON payload as a second content block so the widget still works.
- **Effort:** 15 min
- **Priority:** P0 (must do)
- **Files:** `src/tools/recall.ts`, `src/tools/list.ts`

### QW-2: Add Seed Activity Log Entries
- **What:** When seeding demo data, also create corresponding `activity_log` entries so the Activity tab isn't empty on first load.
- **Why:** Currently the dashboard shows "No activity yet" even though 15 memories exist. This is jarring during the demo when you switch to the Activity tab. The cross-agent awareness story falls flat without activity data.
- **How:** In `src/db/seed.ts`, after calling `upsertMemory`, also call `logActivity` for each seed memory with realistic timestamps spread across the past 48 hours. Import `logActivity` from `queries.ts`.
- **Effort:** 15 min
- **Priority:** P0 (must do)
- **Files:** `src/db/seed.ts`, `src/db/queries.ts` (may need a version of logActivity that accepts a timestamp)

### QW-3: Composite Relevance Scoring for Recall
- **What:** Enhance the BM25 search to factor in `access_count` and recency, not just text relevance.
- **Why:** Every serious competitor (CaviraOSS, Zep, Mem0) uses composite scoring. Our `access_count` field is tracked but never used for ranking -- it's dead weight. With composite scoring, frequently-accessed recent memories rank higher, which is what users expect. This is the single cheapest way to dramatically improve recall quality.
- **How:** In `src/db/queries.ts:searchWithFts5`, modify the SQL to compute a composite score:
  ```sql
  SELECT m.*,
    bm25(memories_fts, 1.0, 2.0, 0.5) as bm25_rank,
    (bm25(memories_fts, 1.0, 2.0, 0.5)
     + (m.access_count * 0.1)
     + CASE WHEN (julianday('now') - julianday(m.updated_at)) < 1 THEN 0.5
            WHEN (julianday('now') - julianday(m.updated_at)) < 7 THEN 0.3
            ELSE 0 END
    ) as composite_rank
  FROM memories_fts fts JOIN memories m ON m.id = fts.rowid
  WHERE fts MATCH ?
  ORDER BY composite_rank
  ```
- **Effort:** 20 min
- **Priority:** P0 (must do)
- **Files:** `src/db/queries.ts` (searchWithFts5 function)
- **Inspired by:** CaviraOSS composite scoring, Zep hybrid ranking

### QW-4: Fix Tags Bug (Clear Tags on Empty Array)
- **What:** When `remember` is called with `tags: []` or without tags on an existing memory, clear existing tags.
- **Why:** Currently tags can never be removed. Once a memory has tags, they persist forever even if you upsert with no tags. This is a UX bug that will confuse agents.
- **How:** In `src/db/queries.ts:103-108`, change the condition to also delete tags when `params.tags` is provided but empty:
  ```typescript
  if (params.tags !== undefined) {
    deleteTags.run(params.key);
    if (params.tags.length > 0) {
      for (const tag of params.tags) {
        insertTag.run(params.key, tag);
      }
    }
  }
  ```
- **Effort:** 5 min
- **Priority:** P1 (should do)
- **Files:** `src/db/queries.ts`

### QW-5: Memory Update vs Create Feedback
- **What:** When `remember` updates an existing memory (upsert), say "Updated: {key}" instead of "Remembered: {key}".
- **Why:** Agents can't tell if they created or updated a memory. During the demo, if you update a decision, it should explicitly say "Updated" so the narrative is clear: "See? Claude just updated the database decision that was originally stored by ChatGPT."
- **How:** In `src/tools/remember.ts`, before the upsert, check if the key already exists with `getMemoryByKey`. Then format the response as "Updated" vs "Stored".
- **Effort:** 10 min
- **Priority:** P1 (should do)
- **Files:** `src/tools/remember.ts`
- **Inspired by:** Good UX practice from all competitors

### QW-6: Add Limits to getMemoriesByType
- **What:** Add LIMIT clause to `getMemoriesByType` to prevent `current-context` resource from exploding.
- **Why:** If there are 1000 decisions, the `memory://current-context` resource will try to return ALL of them in a text blob, potentially exceeding context limits. This is a ticking time bomb.
- **How:** In `src/db/queries.ts:236-240`, add a `limit` parameter (default 20). In `src/context/resource.ts:53-54`, pass `limit: 10` for decisions and preferences.
- **Effort:** 5 min
- **Priority:** P0 (must do)
- **Files:** `src/db/queries.ts`, `src/context/resource.ts`

### QW-7: Fix N+1 Tag Queries with Bulk Fetch
- **What:** Replace per-memory tag lookups with a single bulk query.
- **Why:** Every `list_memories` and `recall` call does N separate `SELECT tag FROM tags WHERE memory_id = ?` queries. For 50 memories, that's 50 extra queries. This is a classic N+1 problem that will cause visible lag during the demo.
- **How:** Add a `getTagsForMemories(db, ids: number[]): Map<number, string[]>` function that does a single `SELECT memory_id, tag FROM tags WHERE memory_id IN (...)` query. Use it in `recall.ts`, `list.ts`, and `resource.ts`.
- **Effort:** 20 min
- **Priority:** P1 (should do)
- **Files:** `src/db/queries.ts`, `src/tools/recall.ts`, `src/tools/list.ts`, `src/context/resource.ts`

### QW-8: Graceful Shutdown
- **What:** Add SIGTERM/SIGINT handlers that close the database and clean up transports.
- **Why:** Without this, killing the server can leave SQLite WAL files in a dirty state. Also important for Manufact Cloud deployments where containers get SIGTERM.
- **How:** In `server.ts`, add:
  ```typescript
  process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });
  ```
- **Effort:** 5 min
- **Priority:** P1 (should do)
- **Files:** `server.ts`

---

## Core Improvements (1-2 hours each)

### CI-1: Memory Namespaces (Project Isolation)
- **What:** Add a `namespace` column to the `memories` table. All tools accept an optional `namespace` parameter. Default namespace is `"default"`. Memories are isolated per namespace -- recall only searches within the active namespace.
- **Why:** This is the #1 missing feature for real-world use. Without namespaces, memories from different projects bleed into each other. In the demo, you could show: "I'm working on Project A -- all my memories are here. Now let me switch to Project B -- completely different context, same server." Mem0 has this via scopes. No other MCP memory server has it.
- **How:**
  1. Add `namespace TEXT DEFAULT 'default' NOT NULL` to memories table in `schema.ts`
  2. Add `namespace` parameter to all tool schemas (remember, recall, forget, list_memories)
  3. Add namespace filter to all SQL queries in `queries.ts`
  4. Add namespace filter to `current-context` resource
  5. Add FTS5 rebuild for namespace column
  6. Add namespace selector to dashboard widget (dropdown in header)
- **Effort:** 90 min
- **Priority:** P1 (should do)
- **Files:** `src/db/schema.ts`, `src/db/queries.ts`, `src/tools/remember.ts`, `src/tools/recall.ts`, `src/tools/forget.ts`, `src/tools/list.ts`, `src/context/resource.ts`, `resources/memory-dashboard/widget.html`
- **Inspired by:** Mem0 scopes (user/session/agent/org)

### CI-2: Memory Relations (Lightweight Knowledge Graph)
- **What:** Add a `memory_relations` table linking memories to each other with a `relation_type`. New `link_memories` tool. Recall returns related memories alongside search results.
- **Why:** The #1 feature of Anthropic's official `@modelcontextprotocol/server-memory` is its knowledge graph. Every competitor has some form of relational structure. Our memories are currently isolated islands. With relations, an agent can say "link the database decision to the hosting decision" and recall will show related memories when you search for either one. This enables the demo moment: "Not only does it remember, it understands how things connect."
- **How:**
  1. Add `memory_relations` table:
     ```sql
     CREATE TABLE memory_relations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       from_key TEXT NOT NULL REFERENCES memories(key),
       to_key TEXT NOT NULL REFERENCES memories(key),
       relation_type TEXT NOT NULL, -- 'relates_to', 'depends_on', 'supersedes', 'contradicts'
       created_at TEXT DEFAULT (datetime('now')),
       UNIQUE(from_key, to_key, relation_type)
     );
     ```
  2. New `link_memories` tool: `{ from_key, to_key, relation_type }`
  3. In `recall`, after search results, also query `memory_relations` for related memories and include them as a "Related" section
  4. In dashboard widget, show relation badges on memory cards ("2 related")
- **Effort:** 75 min
- **Priority:** P1 (should do)
- **Files:** `src/db/schema.ts`, `src/db/queries.ts`, new `src/tools/link.ts`, `src/tools/recall.ts`, `resources/memory-dashboard/widget.html`
- **Inspired by:** @modelcontextprotocol/server-memory (entity-relation model), Zep Graphiti

### CI-3: Memory Importance Scoring
- **What:** Add an `importance` score (0.0-1.0) to each memory, computed from heuristics: type weight, access frequency, recency, value length, presence of context. Use importance in recall ranking and in `current-context` to show the most important memories first.
- **Why:** Not all memories are equal. A decision about the database is more important than a note about a standup. Currently everything is treated equally. With importance scoring, `current-context` can show "Top decisions" and recall can prioritize high-importance memories. CaviraOSS uses "salience" for this. During the demo: "Watch how it automatically knows which memories matter most."
- **How:**
  1. Add `importance REAL DEFAULT 0.5` column to memories table
  2. Compute importance on insert/update:
     ```typescript
     function computeImportance(memory: { type: string; value: string; context: string | null; access_count: number }): number {
       let score = 0.5;
       if (memory.type === 'decision') score += 0.2;
       if (memory.type === 'preference') score += 0.15;
       if (memory.context) score += 0.1;
       if (memory.value.length > 200) score += 0.05;
       score += Math.min(memory.access_count * 0.02, 0.2);
       return Math.min(score, 1.0);
     }
     ```
  3. Factor importance into composite recall ranking
  4. In `current-context`, sort by importance within each section
  5. Show importance as a visual indicator on memory cards (e.g., thin color bar)
- **Effort:** 60 min
- **Priority:** P2 (nice to have)
- **Files:** `src/db/schema.ts`, `src/db/queries.ts`, `src/tools/remember.ts`, `src/tools/recall.ts`, `src/context/resource.ts`, `resources/memory-dashboard/widget.html`
- **Inspired by:** CaviraOSS salience scoring, Mem0 importance metadata

### CI-4: Memory Detail Drawer in Dashboard
- **What:** Clicking a memory card in the dashboard opens a slide-out drawer showing full details: complete value (no truncation), context/rationale, all tags, agent info, access count, created/updated timestamps, and related memories (if CI-2 is done).
- **Why:** Currently memory values are truncated to 120 characters with no way to see the full content. During the demo, when you store a code snippet or a detailed decision, the dashboard shows "Using PostgreSQL 16 on port 5433. Chosen over MySQL for JSONB su..." -- the most interesting part is cut off. The drawer lets judges see the full story.
- **How:**
  1. Add a `.memory-drawer` panel to the widget HTML (positioned right, slides in on click)
  2. On memory card click, populate drawer with full memory data
  3. Show related memories section (if `memory_relations` exists)
  4. Add a "Copy" button for the value
  5. Show access history timeline (times accessed, by which agents)
  6. Add close button and click-outside-to-close
- **Effort:** 90 min
- **Priority:** P1 (should do)
- **Files:** `resources/memory-dashboard/widget.html`
- **Inspired by:** mcp-memory-service 8-tab dashboard, every modern data dashboard

### CI-5: Real-Time Dashboard Updates via SSE Notifications
- **What:** When any tool modifies data (remember, forget), push a notification to all connected dashboard widgets so they refresh automatically.
- **Why:** The widget currently only updates when the user explicitly searches or filters. If you're watching the dashboard in Claude and ChatGPT stores a memory, nothing happens. The demo story is "watch this dashboard update in real-time when another agent acts" -- but it doesn't actually do that. This is the biggest gap in the demo narrative.
- **How:**
  1. In `server.ts`, maintain a list of active SSE connections (from the GET /mcp endpoint)
  2. After each tool execution (remember, forget), send a server notification via MCP's notification mechanism
  3. In the widget, listen for `notifications/resources/updated` events and re-fetch data
  4. Alternative simpler approach: have the widget poll `list_memories` every 5 seconds when visible
- **Effort:** 90 min (MCP notification approach) or 20 min (polling approach)
- **Priority:** P0 (must do -- critical for demo)
- **Files:** `server.ts`, `src/tools/remember.ts`, `src/tools/forget.ts`, `resources/memory-dashboard/widget.html`

---

## Advanced Features (2-4 hours)

### AF-1: Semantic Search with Embeddings
- **What:** Add vector similarity search alongside FTS5. Use a lightweight embedding model (all-MiniLM-L6-v2 via transformers.js or OpenAI's text-embedding-3-small API) to embed memory values. Store embeddings in a new column or via sqlite-vec. Recall combines BM25 + cosine similarity for hybrid search.
- **Why:** This is the single biggest gap vs. every competitor. FTS5 can't find "authentication problems" when you search "login issues." Semantic search is the difference between a toy and a real tool. During the demo: "Watch -- I search for 'frontend framework' and it finds our React decision even though the key says 'frontend-framework-react' and the value says 'React 19'... that's semantic understanding, not just keyword matching."
- **How:**
  1. Option A (Local, no API key): Use `@xenova/transformers` to run all-MiniLM-L6-v2 in-process. ~22M model, ~50ms per embedding.
  2. Option B (API, requires key): Use OpenAI `text-embedding-3-small` API. 1536 dimensions, very fast.
  3. Add `embedding BLOB` column to memories table
  4. On `remember`, compute embedding and store alongside the memory
  5. On `recall`, compute query embedding, then:
     ```sql
     -- Hybrid: combine BM25 rank with cosine similarity
     SELECT *, (bm25_score * 0.6 + cosine_similarity * 0.4) as hybrid_score
     ```
  6. If using sqlite-vec extension, can do vector search in SQLite natively
- **Effort:** 3-4 hours
- **Priority:** P2 (nice to have for hackathon, P0 for post-hackathon)
- **Files:** `src/db/schema.ts`, `src/db/queries.ts`, new `src/search/embeddings.ts`, `src/tools/remember.ts`, `src/tools/recall.ts`, `package.json`
- **Inspired by:** Mem0 (Qdrant), mcp-memory-service (ONNX embeddings), Zep (hybrid BM25 + vector)

### AF-2: D3.js Knowledge Graph Visualization
- **What:** Add a third tab "Graph" to the dashboard that renders memories as a force-directed graph using D3.js. Nodes are memories (colored by type), edges are relations (from CI-2) or co-tag connections. Clicking a node highlights it and shows its details. Zooming and panning supported.
- **Why:** This is the ultimate demo wow factor. When a judge sees an interactive knowledge graph of agent memories, with Claude-purple and ChatGPT-green nodes connected by lines labeled "relates_to" and "depends_on," they lean forward. No other MCP memory server has this in an MCP Apps inline widget. mcp-memory-service has it in a separate web dashboard, but not inline.
- **How:**
  1. Include D3.js via CDN in the widget HTML
  2. Add "Graph" tab alongside "Memories" and "Activity"
  3. On tab activation, fetch all memories + relations
  4. Render force-directed graph:
     - Nodes = memories, sized by importance, colored by type
     - Edges = explicit relations (CI-2) + implicit co-tag connections
     - Agent dots on each node (same color scheme as memory cards)
  5. Click node -> show memory detail (or open drawer from CI-4)
  6. Hover node -> highlight connected nodes and edges
  7. Add zoom controls
- **Effort:** 3 hours
- **Priority:** P1 (should do -- major demo differentiator)
- **Dependencies:** CI-2 (Memory Relations) makes this much better, but can work without it by using co-tag connections
- **Files:** `resources/memory-dashboard/widget.html`
- **Inspired by:** mcp-memory-service D3.js dashboard, Zep Graphiti visualization

### AF-3: Smart Context Summarization
- **What:** When `memory://current-context` exceeds a token threshold (e.g., 2000 tokens), automatically summarize older/less-important memories instead of listing them all. Use an LLM call to generate a concise summary of decisions, preferences, and tasks.
- **Why:** As memories accumulate, the `current-context` resource becomes a wall of text that agents struggle to parse. Summarization keeps it concise and useful. LangChain's ConversationSummaryMemory pattern is proven. During the demo: "Even with 50 memories, the context is always crisp and readable."
- **How:**
  1. In `src/context/resource.ts`, after building the context text, count approximate tokens
  2. If over threshold, group memories by type and summarize each group:
     - Keep the 3 most important/recent memories in full
     - Summarize the rest as "There are also N other decisions including: {brief list}"
  3. For hackathon: use a simple heuristic summarizer (no LLM call needed):
     - Top N memories by importance get full display
     - Rest get one-line summaries: "key: first 50 chars of value"
  4. Post-hackathon: add LLM-powered summarization
- **Effort:** 60 min (heuristic) or 3 hours (LLM-powered)
- **Priority:** P2 (nice to have)
- **Files:** `src/context/resource.ts`, `src/db/queries.ts`
- **Inspired by:** LangChain ConversationSummaryMemory, mcp-memory-service dream consolidation

### AF-4: Memory Decay and Auto-Archival
- **What:** Compute a "freshness" score for each memory based on age and access patterns. Memories that haven't been accessed in N days start decaying. Heavily decayed memories are automatically archived (marked as archived, excluded from default queries but still searchable).
- **Why:** CaviraOSS and mcp-memory-service both have decay engines. Without decay, old stale memories clutter recall results and `current-context`. A task from 6 months ago shouldn't rank alongside today's active tasks. During the demo: "Notice how it automatically surfaces the most relevant, active memories."
- **How:**
  1. Add `decay_score REAL DEFAULT 1.0` and `archived INTEGER DEFAULT 0` columns
  2. Decay formula: `decay = 1.0 / (1.0 + days_since_access * 0.1)`
  3. On server startup and periodically (every hour), recalculate decay scores
  4. Memories with decay < 0.2 get archived
  5. Default queries exclude archived memories; `list_memories` gets an `include_archived` param
  6. Dashboard shows decayed memories with reduced opacity
- **Effort:** 2 hours
- **Priority:** P2 (nice to have)
- **Files:** `src/db/schema.ts`, `src/db/queries.ts`, `src/tools/recall.ts`, `src/tools/list.ts`, `resources/memory-dashboard/widget.html`
- **Inspired by:** CaviraOSS adaptive decay, mcp-memory-service dream consolidation

### AF-5: Export/Import with Memory Sharing
- **What:** Two new tools: `export_memories` returns all memories (with tags, relations, activity log) as a structured JSON blob. `import_memories` accepts that JSON and loads it, handling conflicts (skip, overwrite, rename).
- **Why:** Listed in the unified plan as "Nice to Have." Enables: (1) backup/restore, (2) sharing memory between users, (3) migrating between servers, (4) seeding new projects from templates. During the demo: "Here's a project template with all the decisions pre-loaded -- import it and your agents instantly know your stack."
- **How:**
  1. New `src/tools/export.ts`: `export_memories({ namespace?, types?, format? })` returns JSON
  2. New `src/tools/import.ts`: `import_memories({ data, conflict_strategy: 'skip'|'overwrite'|'rename' })`
  3. JSON format includes memories, tags, relations, and metadata
  4. Add export/import buttons to dashboard
- **Effort:** 90 min
- **Priority:** P2 (nice to have)
- **Files:** new `src/tools/export.ts`, new `src/tools/import.ts`, `server.ts`, `resources/memory-dashboard/widget.html`

---

## Architecture Improvements

### AI-1: Fix FTS5 Error Swallowing
- **What:** In `queries.ts:150-155`, the catch block that falls back to LIKE search catches ALL errors, not just FTS5 syntax errors. Change it to only catch FTS5-specific errors.
- **Why:** A genuine SQL bug or corruption error would be silently swallowed, returning wrong results instead of an error. This can cause silent data issues that are impossible to debug.
- **How:** Check the error message for FTS5-specific patterns:
  ```typescript
  try {
    return db.prepare(sql).all(...bindings) as MemoryRow[];
  } catch (err: any) {
    if (err.message?.includes('fts5') || err.message?.includes('MATCH')) {
      return searchWithLike(db, params, limit);
    }
    throw err; // Re-throw non-FTS errors
  }
  ```
- **Effort:** 10 min
- **Priority:** P1 (should do)
- **Files:** `src/db/queries.ts`

### AI-2: Session Cleanup with TTL
- **What:** Add a TTL (30 minutes) to transport sessions and a periodic cleanup interval that removes stale sessions.
- **Why:** The `transports` Map grows unbounded. If a client connects and never cleanly disconnects, the transport stays in memory forever. Under load (many demo connections), this is a memory leak.
- **How:**
  ```typescript
  const SESSION_TTL_MS = 30 * 60 * 1000;
  const sessionTimestamps = new Map<string, number>();

  setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of sessionTimestamps) {
      if (now - ts > SESSION_TTL_MS) {
        transports.delete(id);
        sessionTimestamps.delete(id);
      }
    }
  }, 60 * 1000);
  ```
  Update timestamp on every request.
- **Effort:** 15 min
- **Priority:** P1 (should do)
- **Files:** `server.ts`

### AI-3: Request Logging Middleware
- **What:** Add a simple logging middleware that logs MCP method calls, session IDs, and response times.
- **Why:** During the demo, if something goes wrong, having logs is critical for debugging. Also useful for showing the audience: "Look at these live logs -- Claude just called remember, ChatGPT just called recall."
- **How:** Add middleware in `server.ts` that logs `{ timestamp, method, sessionId, durationMs }` to console.
- **Effort:** 15 min
- **Priority:** P2 (nice to have)
- **Files:** `server.ts`

### AI-4: Database Path from Environment Variable
- **What:** Allow DB path to be set via `DATABASE_PATH` environment variable, falling back to the current `process.cwd()/data/memories.db`.
- **Why:** The current `process.cwd()` approach breaks if the server is started from a different directory. Essential for Manufact Cloud deployment where the working directory may not be the project root.
- **How:** In `server.ts:19`:
  ```typescript
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "memories.db");
  ```
- **Effort:** 2 min
- **Priority:** P1 (should do)
- **Files:** `server.ts`

---

## Dashboard Enhancements

### DE-1: Interactive Timeline View
- **What:** Replace the static stats bar with an interactive SVG timeline showing memory creation events as colored dots on a time axis. Each dot's color indicates the agent. Hovering shows the memory key and agent. Clicking navigates to the memory.
- **Why:** The unified plan specifically calls for a timeline. It's a powerful visual that shows the history of agent collaboration at a glance. During the demo: "This timeline shows the entire collaboration history -- purple dots are Claude, green are ChatGPT, blue are Cursor. See how they built on each other's work."
- **How:**
  1. Add a `.timeline-bar` div above the stats bar
  2. Render an SVG with a horizontal time axis
  3. Plot memory creation events as circles
  4. Color by agent, size by importance (if CI-3 is done)
  5. Tooltip on hover with key + agent + time
  6. Click to scroll to that memory in the list
- **Effort:** 90 min
- **Priority:** P1 (should do -- called out in unified plan and demo script)
- **Files:** `resources/memory-dashboard/widget.html`

### DE-2: Memory Creation Animation
- **What:** When a new memory is created (detected via refresh or push), animate the new memory card sliding in from the top with a glow effect. Also pulse the corresponding dot on the timeline.
- **Why:** The unified plan lists "Animated memory creation in dashboard" as a nice-to-have, but it's actually critical for the demo. The moment you say "remember this" and the dashboard visually reacts with a glowing new card sliding in -- that's the "wow" moment judges remember.
- **How:**
  1. Track previous memory list. On refresh, detect new entries by key.
  2. Apply a `@keyframes glow` animation to new cards:
     ```css
     @keyframes glow {
       0% { box-shadow: 0 0 0 rgba(139, 92, 246, 0); transform: translateY(-20px); opacity: 0; }
       50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); }
       100% { box-shadow: 0 0 0 rgba(139, 92, 246, 0); transform: translateY(0); opacity: 1; }
     }
     ```
  3. Auto-scroll to new card
  4. Play a subtle pulse on the timeline dot
- **Effort:** 45 min
- **Priority:** P1 (should do -- major demo impact)
- **Files:** `resources/memory-dashboard/widget.html`

### DE-3: Agent Activity Sparklines
- **What:** In the stats bar, show tiny inline sparkline charts next to each agent showing their activity over time (last 24h).
- **Why:** Sparklines are visually dense and impressive. They tell the story "Claude was active this morning, ChatGPT joined in the afternoon" without any text. Great for the "cross-agent awareness" narrative.
- **How:**
  1. Fetch activity timestamps grouped by agent
  2. Render as 60px wide SVG path in the stats bar
  3. One sparkline per unique agent
- **Effort:** 45 min
- **Priority:** P2 (nice to have)
- **Files:** `resources/memory-dashboard/widget.html`

### DE-4: Tag Cloud Visualization
- **What:** Show a tag cloud above the memory list where tag size reflects usage count. Clicking a tag filters the list (already supported).
- **Why:** The unified plan mentions "tag cloud visualization" as a Should Have. It's a quick visual that shows what topics are covered at a glance. During the demo: "You can see at a glance -- 'architecture' and 'database' are the most-discussed topics."
- **How:**
  1. Count tag occurrences from the current memory list
  2. Render as inline flex-wrapped buttons with font-size proportional to count
  3. Min font-size: 10px, max: 18px
  4. Use the existing `.tag-pill` styling with size variation
- **Effort:** 30 min
- **Priority:** P2 (nice to have)
- **Files:** `resources/memory-dashboard/widget.html`

### DE-5: Dashboard Search Results Highlighting
- **What:** When search results are displayed, highlight the matching terms in the memory key and value with a colored background.
- **Why:** Makes it visually clear why each result matched. When the demo shows a search for "database," seeing "database" highlighted in each result card makes the search feel responsive and precise.
- **How:**
  1. After search, get the query terms
  2. In `renderMemories()`, wrap matching substrings in `<mark>` tags
  3. Style: `mark { background: rgba(139, 92, 246, 0.3); color: inherit; border-radius: 2px; }`
- **Effort:** 20 min
- **Priority:** P2 (nice to have)
- **Files:** `resources/memory-dashboard/widget.html`

### DE-6: Light Mode Toggle
- **What:** Add a sun/moon icon toggle in the dashboard header that switches between dark and light themes.
- **Why:** Listed in the unified plan as nice-to-have. Shows polish and attention to detail. Some judges may be viewing on bright screens where dark mode is hard to read.
- **How:**
  1. Define CSS custom properties for all colors (already using hard-coded hex)
  2. Add a `.light` class on body that overrides the properties
  3. Add toggle button in header
  4. Persist preference in localStorage
- **Effort:** 30 min
- **Priority:** P2 (nice to have)
- **Files:** `resources/memory-dashboard/widget.html`

---

## Implementation Priority Order

Given the hackathon time constraints, here is the recommended execution order. Each item builds on the previous ones, and the project is demoable after each group.

### Phase 1: Foundation Fixes (1 hour)
Ship these first -- they fix bugs and inconsistencies that would undermine the demo:

| # | Item | Time | Cumulative |
|---|------|------|------------|
| 1 | QW-6: Add limits to getMemoriesByType | 5 min | 5 min |
| 2 | QW-4: Fix tags bug | 5 min | 10 min |
| 3 | QW-8: Graceful shutdown | 5 min | 15 min |
| 4 | AI-4: DB path from env var | 2 min | 17 min |
| 5 | QW-5: Update vs create feedback | 10 min | 27 min |
| 6 | QW-1: Fix response format | 15 min | 42 min |
| 7 | QW-2: Seed activity log | 15 min | 57 min |
| 8 | QW-3: Composite scoring | 20 min | 77 min |

**Demoable state after Phase 1:** All tools work consistently, recall is smarter, activity tab has data, no silent bugs.

### Phase 2: Demo Differentiators (2 hours)
These are what make judges say "wow":

| # | Item | Time | Cumulative |
|---|------|------|------------|
| 9 | CI-5: Real-time updates (polling approach) | 20 min | 20 min |
| 10 | QW-7: Fix N+1 tag queries | 20 min | 40 min |
| 11 | DE-2: Memory creation animation | 45 min | 85 min |
| 12 | DE-1: Interactive timeline | 90 min | 175 min |

**Demoable state after Phase 2:** Dashboard updates in real-time with animations, interactive timeline shows collaboration history.

### Phase 3: Knowledge Features (2 hours)
These add depth and differentiation:

| # | Item | Time | Cumulative |
|---|------|------|------------|
| 13 | CI-2: Memory relations | 75 min | 75 min |
| 14 | CI-1: Memory namespaces | 90 min | 165 min |

**Demoable state after Phase 3:** Agents can link memories and work in isolated project namespaces.

### Phase 4: Visual Polish (1.5 hours)
Only if time permits:

| # | Item | Time | Cumulative |
|---|------|------|------------|
| 15 | CI-4: Memory detail drawer | 90 min | 90 min |
| 16 | DE-4: Tag cloud | 30 min | 120 min |
| 17 | DE-5: Search highlighting | 20 min | 140 min |

### Phase 5: Advanced (time permitting)
These are stretch goals:

| # | Item | Time |
|---|------|------|
| 18 | AF-2: D3.js knowledge graph | 3 hours |
| 19 | CI-3: Importance scoring | 60 min |
| 20 | AF-1: Semantic search | 3-4 hours |

---

## Post-Hackathon Priorities

If Agent Memory continues beyond the hackathon:

| Priority | Feature | Effort | Why |
|----------|---------|--------|-----|
| P0 | AF-1: Semantic/vector search | 3-4 hours | Biggest competitive gap |
| P0 | AF-4: Memory decay + auto-archival | 2 hours | Prevents memory bloat |
| P1 | AF-3: Smart context summarization (LLM-powered) | 3 hours | Keeps current-context useful at scale |
| P1 | AF-2: D3.js knowledge graph | 3 hours | Major visual differentiator |
| P1 | AF-5: Export/Import with sharing | 90 min | Essential for adoption |
| P2 | AI-1: Fix FTS5 error handling | 10 min | Correctness |
| P2 | AI-2: Session TTL cleanup | 15 min | Production readiness |
| P2 | Fact supersession / versioning | 2 hours | Track truth over time |
| P3 | LLM-powered fact extraction | 4 hours | Auto-extract structured data from prose |
| P3 | Conflict detection between agents | 3 hours | When two agents disagree |

---

## Summary

**Total estimated time for all improvements:** ~20 hours

**Realistic hackathon target (6-7 hours):** Phases 1-3 = ~5 hours of implementation, leaving time for testing, debugging, and demo prep.

**What the demo looks like after Phases 1-3:**
1. All four tools work consistently with composite scoring, proper feedback, and namespace isolation
2. Dashboard updates in real-time with glowing animations when memories are created
3. Interactive timeline shows the full collaboration history with agent-colored dots
4. Agents can link memories together, building a knowledge web
5. Activity tab is populated with realistic cross-agent activity from the start
6. `current-context` resource is bounded, well-formatted, and sorted by importance

**Key differentiators vs. competitors after improvements:**
1. **Only inline MCP Apps dashboard** with real-time animations and interactive timeline
2. **Only cross-agent awareness** with agent attribution, activity feed, and sparklines
3. **Knowledge graph via memory relations** -- simpler than Zep/CaviraOSS but visually compelling
4. **Namespace isolation** for multi-project use -- only Mem0 has this among MCP servers
5. **Composite scoring** that actually uses access_count and recency -- smarter than basic BM25
