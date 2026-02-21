# Competitive Deep Dive: Agent Memory vs. The Field

> Generated: 2026-02-21
> Purpose: Identify features and patterns from competitors that could make Agent Memory significantly better

---

## Table of Contents

1. [Agent Memory Summary](#agent-memory-summary)
2. [Direct MCP Memory Competitors](#direct-mcp-memory-competitors)
3. [Broader AI Memory Systems](#broader-ai-memory-systems)
4. [Feature Gap Analysis](#feature-gap-analysis)
5. [MCP Apps Widget Inspiration](#mcp-apps-widget-inspiration)
6. [Prioritized Feature Recommendations](#prioritized-feature-recommendations)

---

## Agent Memory Summary

**What we have today:**
- 4 MCP tools: `remember`, `recall`, `forget`, `list_memories`
- SQLite + FTS5 full-text search with BM25 ranking
- 5 memory types: decision, preference, task, snippet, note
- Tags system for categorization
- Agent attribution via `clientInfo.name`
- Activity log for cross-agent awareness
- MCP Resources: `memory://current-context`, `memory://agent-activity`
- MCP Apps dashboard widget (React, inline in conversations)
- `access_count` tracking on memories

**What makes us unique:**
- MCP Apps inline dashboard (visual UI inside conversations)
- Cross-agent collaboration awareness
- Auto-context on connect via `memory://current-context`
- Agent-attributed color-coded memories

---

## Direct MCP Memory Competitors

### 1. @modelcontextprotocol/server-memory (Anthropic Official)

**Repo:** https://github.com/modelcontextprotocol/servers/tree/main/src/memory
**NPM:** https://www.npmjs.com/package/@modelcontextprotocol/server-memory

**Architecture:** Knowledge graph with entities, relations, and observations. Stores everything in a local JSON file. No database, no embeddings.

**Tools (9 total):**
| Tool | Description |
|------|-------------|
| `create_entities` | Create nodes with name, entityType, observations[] |
| `create_relations` | Directed edges: from, to, relationType (active voice) |
| `add_observation` | Append facts to existing entities |
| `delete_entities` | Remove nodes + cascading relations |
| `delete_observations` | Remove specific facts from entities |
| `delete_relations` | Remove specific edges |
| `read_graph` | Retrieve entire knowledge graph |
| `search_nodes` | Search entities by name, type, or observation content |
| `open_nodes` | Retrieve specific entities by name |

**Key differences from Agent Memory:**
- **Knowledge graph model** vs. our flat key-value model. Entities have typed relationships (e.g., "Alice works_at Acme Corp"). We have no relational structure between memories.
- **Observations** -- granular facts attached to entities, vs. our single `value` field per memory.
- **No search ranking** -- simple string matching, no FTS5/BM25.
- **No dashboard** -- CLI/conversation only.
- **No agent attribution** -- no tracking of which agent stored what.
- **JSON file storage** -- no database at all. Simple but not scalable.

**Features we should steal:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Entity-relation model (knowledge graph) | HIGH | HIGH -- enables "what does X relate to?" queries |
| Observation append (add facts to existing memories) | LOW | MEDIUM -- currently we overwrite entire value on upsert |
| Entity types (person, project, concept) | LOW | MEDIUM -- we have memory types but not entity types |

---

### 2. Mem0 / OpenMemory MCP (mem0.ai)

**Repo:** https://github.com/mem0ai/mem0 (41k+ GitHub stars)
**OpenMemory MCP:** https://github.com/mem0ai/mem0/tree/main/openmemory
**Funding:** $24M (YC, Peak XV, Basis Set) -- October 2025
**Users:** 80k+ developers on cloud, 186M API calls/quarter

**Architecture:** Hybrid vector + graph + key-value. Uses Qdrant (vector DB) + Neo4j/Memgraph (graph) + Postgres (relational metadata). LLM-powered memory extraction.

**Memory Scopes:**
| Scope | Description |
|-------|-------------|
| User Memory | Persists across all conversations with a specific person |
| Session Memory | Context within a single conversation |
| Agent Memory | Info specific to a particular AI agent instance |
| Organizational Memory | Shared context across multiple agents/teams |

**Memory Categories:**
| Category | Description |
|----------|-------------|
| Factual | User preferences, domain facts |
| Episodic | Summaries of past interactions |
| Semantic | Relationships between concepts |

**OpenMemory MCP Tools:**
- `add_memories(text)` -- stores text, auto-extracts facts via LLM
- `search_memory(query)` -- vector similarity search + optional filters
- `list_memories()` -- retrieve all stored memories
- `delete_all_memories()` -- wipe everything

**Advanced Cloud Features:**
- Memory metadata: `includes`, `excludes`, `immutable`, `expiration_date`, `custom_instructions`
- Advanced filtering: AND/OR logical operators, comparison operators
- Graph Memory: auto-extracts entities and relationships from every write
- `rerank`, `keywordSearch`, `filterMemories` on search
- `topK` control on results

**Key differences from Agent Memory:**
- **Vector/semantic search** (embeddings) vs. our FTS5 keyword search. Semantic search finds "login problems" when you search "authentication issues."
- **LLM-powered extraction** -- Mem0 uses an LLM to extract discrete facts from free text. We store raw text as-is.
- **Memory scopes** -- user/session/agent/org isolation. We have no namespace or scope concept.
- **Expiration dates** -- memories can have TTL. We have no expiry mechanism.
- **Immutable memories** -- mark facts as unchangeable. We have no immutability flag.
- **Graph memory** -- auto-builds knowledge graph from text. We have none.
- **Dashboard** -- OpenMemory has a web dashboard at localhost:3000 with memories view, connected apps view.

**Features we should steal:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Semantic/vector search (embeddings) | HIGH | VERY HIGH -- fundamental search quality improvement |
| Memory namespaces/scopes (user, project) | MEDIUM | HIGH -- essential for multi-project use |
| Memory expiry / TTL | LOW | MEDIUM -- auto-cleanup of stale memories |
| Immutable memories | LOW | LOW -- niche but useful for critical facts |
| LLM-powered fact extraction | HIGH | HIGH -- but adds latency and cost |
| Advanced search filters (AND/OR operators) | MEDIUM | MEDIUM |

---

### 3. CaviraOSS/OpenMemory

**Repo:** https://github.com/CaviraOSS/OpenMemory
**Docs:** https://openmemory.cavira.app/docs/introduction

**Architecture:** Hierarchical Memory Decomposition (HMD) with temporal knowledge graph. Most sophisticated memory architecture of any open-source MCP server.

**Key Innovations:**
- **Multi-sector embeddings:** episodic, semantic, procedural, emotional, reflective -- five different embedding spaces per memory
- **Single-waypoint linking:** sparse, biologically-inspired graph connections
- **Composite similarity retrieval:** sector fusion + activation spreading
- **Temporal Knowledge Graph:** `valid_from` / `valid_to` timestamps, point-in-time truth, evolution tracking
- **Adaptive decay engine:** per-sector forgetting instead of hard TTLs
- **Composite scoring:** salience + recency + coactivation (not just cosine distance)

**Performance Claims:**
- 2-3x faster than Zep and Supermemory
- 6-10x cheaper than cloud solutions
- 95% recall vs 68-78% for vector DBs

**Key differences from Agent Memory:**
- **Multi-dimensional memory** -- 5 cognitive sectors vs. our 5 simple types. Their sectors represent different cognitive aspects of the same memory; our types are just categories.
- **Temporal graph** -- tracks when facts were true. We only track `created_at` / `updated_at`.
- **Decay engine** -- memories fade based on access patterns. We have `access_count` but don't use it for anything.
- **Composite scoring** -- multi-factor relevance. We use BM25 only.

**Features we should steal:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Memory decay / adaptive forgetting | MEDIUM | HIGH -- prevents memory bloat |
| Temporal validity (valid_from/valid_to) | LOW | MEDIUM -- "this was true until..." |
| Composite scoring (recency + relevance + access) | MEDIUM | HIGH -- much better recall quality |
| Activation spreading (related memories surface) | HIGH | HIGH -- serendipitous discovery |

---

### 4. mcp-memory-service (doobidoo)

**Repo:** https://github.com/doobidoo/mcp-memory-service
**Dashboard:** https://github.com/doobidoo/mcp-memory-dashboard

**Architecture:** Semantic search via sentence-transformers / ONNX embeddings, backed by SQLite-vec or ChromaDB. REST API + MCP tools. Most mature MCP memory server with 13+ client support.

**Key Features:**
- **Semantic search** using AI embeddings (sentence-transformers or ONNX)
- **5ms retrieval speed** via optimized caching
- **Knowledge Graph Dashboard** with D3.js force-directed visualization
- **Dream-inspired consolidation:**
  - Decay scoring
  - Association discovery
  - Compression
  - Archival
  - 24/7 automatic scheduling (daily/weekly/monthly)
- **Multi-backend storage:** SQLite-vec (local), Cloudflare (cloud sync), or hybrid
- **8-tab web dashboard:** Dashboard, Search, Browse, Documents, Manage, Analytics, Quality, API Docs
- **External embedding API support** (vLLM, Ollama, TEI, OpenAI)
- **Natural language time expressions** in recall (e.g., "memories from last week")
- **Token-efficient API** with 90% token reduction vs MCP tools

**Key differences from Agent Memory:**
- **Embedding-based semantic search** vs. our FTS5 keyword search
- **Dream consolidation** -- automatic memory compression and archival. We have nothing like this.
- **Rich dashboard** -- 8 tabs with D3.js knowledge graph visualization vs. our 2-tab widget.
- **External embedding support** -- can use any embedding model. We have none.
- **Time-based recall** -- "memories from last week." We only filter by tags/type.
- **Analytics tab** -- memory quality metrics, usage patterns. We have basic stats only.

**Features we should steal:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Memory consolidation / auto-summarization | HIGH | HIGH -- reduces bloat, improves quality |
| D3.js knowledge graph visualization | MEDIUM | HIGH -- impressive visual for demos |
| Natural language time queries | MEDIUM | MEDIUM -- convenient UX |
| Analytics / quality metrics | MEDIUM | MEDIUM -- dashboard differentiator |
| External embedding API support | HIGH | HIGH -- enables semantic search |

---

## Broader AI Memory Systems

### 5. Letta (formerly MemGPT)

**Repo:** https://github.com/letta-ai/letta
**Docs:** https://docs.letta.com/concepts/memgpt/

**Core Concept:** Treat LLM context windows like OS memory. Agents self-manage memory by moving data between "RAM" (in-context core memory) and "disk" (archival/recall storage).

**Memory Architecture:**
| Tier | Analogy | Description |
|------|---------|-------------|
| Core Memory | RAM | In-context, always visible. Has `persona` and `human` blocks. |
| Archival Memory | Disk | Large, searchable via `archival_memory_search`. Uses embeddings. |
| Recall Memory | Conversation Log | Past messages, searchable by text or date. |

**Key Tools:**
- `memory_replace` -- edit core memory blocks
- `memory_insert` -- add to core memory
- `memory_rethink` -- agent reflects on and updates its own memory
- `archival_memory_insert` -- push to long-term storage
- `archival_memory_search` -- semantic search over archival
- `conversation_search` / `conversation_search_date` -- search past messages

**Key Innovation: Self-Editing Memory**
Agents don't just store and retrieve -- they actively curate, update, and restructure their own memory. The agent decides what's worth keeping and how to organize it.

**Relevance to Agent Memory:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Memory tiers (core/archival/recall) | HIGH | HIGH -- tiered storage is powerful |
| Self-editing memory (agent curates) | MEDIUM | HIGH -- agent decides what matters |
| Memory blocks (structured sections) | MEDIUM | HIGH -- better than flat key-value |
| Conversation search by date | LOW | MEDIUM -- we only have FTS5 |
| `memory_rethink` (self-reflection) | MEDIUM | MEDIUM -- novel but complex |

---

### 6. Zep (Graphiti)

**Repo:** https://github.com/getzep/graphiti
**Paper:** https://arxiv.org/abs/2501.13956
**Product:** https://www.getzep.com/

**Core Innovation:** Temporal knowledge graph with bitemporal timestamps. Three-tier hierarchical subgraph.

**Three Subgraph Tiers:**
| Tier | Purpose | Details |
|------|---------|---------|
| Episode Subgraph | Raw events | Messages, JSON docs, transaction snapshots. Ground truth. |
| Semantic Entity Subgraph | Extracted entities | 1024D embeddings, entity extraction from episodes. |
| Community Subgraph | Clustered groups | Entities with strong connections grouped into communities. |

**Bitemporal Tracking:**
- **Event Time (T):** when a fact actually occurred
- **Ingestion Time (T'):** when it was added to memory
- Enables reasoning about retroactive data, corrections, fact supersession

**Hybrid Search (No LLM at retrieval):**
- Cosine semantic similarity
- Okapi BM25 full-text search
- Breadth-first graph traversal
- Combined without any LLM calls during retrieval

**Performance:**
- 18.5% accuracy improvement over baselines
- 90% latency reduction vs baseline implementations
- State-of-the-art on Deep Memory Retrieval benchmark

**Relevance to Agent Memory:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Bitemporal timestamps | LOW | MEDIUM -- "when did we learn this?" |
| Hybrid search (BM25 + semantic + graph) | HIGH | VERY HIGH -- best retrieval quality |
| Community detection (auto-clustering) | HIGH | MEDIUM -- nice for visualization |
| Episode tracking (raw event log) | LOW | MEDIUM -- our activity_log is similar |
| Fact supersession / versioning | MEDIUM | HIGH -- "this used to be true, now it's not" |

---

### 7. LangChain Memory Modules

**Docs:** https://docs.langchain.com/oss/python/concepts/memory

**Memory Types Catalog:**
| Type | Description | Relevance |
|------|-------------|-----------|
| ConversationBufferMemory | Store all messages | We don't store conversations |
| ConversationBufferWindowMemory | Last K messages | Sliding window concept |
| ConversationSummaryMemory | LLM-generated summary | Auto-summarization pattern |
| ConversationSummaryBufferMemory | Hybrid: recent + summary | Best of both worlds |
| Entity Memory | Facts about entities (people, places) | Entity extraction pattern |
| ConversationKnowledgeGraphMemory | Build KG from conversation | Knowledge graph from chat |
| VectorStoreRetrieverMemory | Semantic search over history | Vector search pattern |

**Key Pattern: Summarization**
When memory exceeds a threshold, older entries are summarized by an LLM, keeping the semantic essence while reducing token count. This is the most practical anti-bloat mechanism.

**Relevance to Agent Memory:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Auto-summarization of old memories | MEDIUM | HIGH -- prevents unbounded growth |
| Entity extraction from text | HIGH | MEDIUM -- enriches knowledge graph |
| Window-based memory (last K) | LOW | LOW -- simple but useful |

---

### 8. LlamaIndex Memory

**Docs:** https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/

**Architecture:** Composable memory blocks with token-aware management.

**Key Components:**
| Component | Description |
|-----------|-------------|
| Memory (new) | Flexible, composable memory with short-term + long-term |
| FactExtractionMemoryBlock | Extracts discrete facts from chat history |
| VectorMemoryBlock | Stores/retrieves message batches from vector DB |
| Static memory blocks | Fixed core user information |
| ChatMemoryBuffer (deprecated) | Simple FIFO message buffer |

**Key Innovation: Token-Aware Flushing**
When short-term memory exceeds `chat_history_token_ratio`, oldest messages are flushed to long-term memory blocks for processing. Automatic overflow handling.

**Relevance to Agent Memory:**
| Feature | Difficulty | Impact |
|---------|-----------|--------|
| Composable memory blocks | HIGH | MEDIUM -- over-engineered for MCP |
| Fact extraction from text | HIGH | HIGH -- discrete facts from prose |
| Token-aware management | MEDIUM | LOW -- less relevant for persistence |

---

## Feature Gap Analysis

### Features Agent Memory Lacks (Sorted by Priority)

#### Tier 1: High Impact, Achievable at Hackathon

| # | Feature | Who Has It | Difficulty | Why It Matters |
|---|---------|-----------|-----------|----------------|
| 1 | **Composite relevance scoring** (recency + access_count + BM25) | CaviraOSS, Zep | LOW | We already have `access_count` and `created_at`; combining them with BM25 is a few lines of SQL. Dramatically improves recall quality. |
| 2 | **Memory decay / aging** | CaviraOSS, mcp-memory-service | LOW | Use `access_count` + `updated_at` to calculate a decay score. Surface frequently-accessed memories higher, let unused ones fade. |
| 3 | **Observation append** (add facts to existing memory) | @modelcontextprotocol/server-memory | LOW | Currently `remember` overwrites entire value. An `add_observation` mode would append facts to existing memories without losing context. |
| 4 | **Natural language time filtering** | mcp-memory-service | LOW | "Memories from last week" -- parse relative time expressions into SQL date filters. |
| 5 | **Memory links / relations** | @modelcontextprotocol/server-memory, Zep, Mem0 | MEDIUM | A `relations` table linking memories to each other. "This decision relates to that preference." |
| 6 | **Memory namespaces / project isolation** | Mem0, OpenMemory | MEDIUM | A `namespace` column on memories. Agents can store/recall per-project context. Essential for multi-project use. |
| 7 | **Export/Import (JSON)** | Listed in our Nice-to-Have | LOW | `export_memories` tool that dumps all memories as JSON. `import_memories` tool to restore. |

#### Tier 2: High Impact, Harder to Add

| # | Feature | Who Has It | Difficulty | Why It Matters |
|---|---------|-----------|-----------|----------------|
| 8 | **Semantic/vector search** | Mem0, mcp-memory-service, CaviraOSS, Zep | HIGH | The single biggest gap. FTS5 can't find "auth problems" when you search "login issues." Requires an embedding model. |
| 9 | **Knowledge graph visualization** | mcp-memory-service (D3.js) | MEDIUM | Force-directed graph of memory relationships in the dashboard. Major wow factor. |
| 10 | **Auto-summarization of old memories** | LangChain, mcp-memory-service | MEDIUM | When memory count exceeds threshold, LLM summarizes oldest memories. Prevents bloat. Requires LLM call. |
| 11 | **Fact supersession / versioning** | Zep | MEDIUM | Track that "we used Postgres" was superseded by "we switched to MySQL." History of truth. |
| 12 | **Memory importance scoring** | CaviraOSS, Mem0 | MEDIUM | Assign importance scores to memories (agent-determined or heuristic). Weight in recall. |

#### Tier 3: Nice-to-Have, Lower Priority

| # | Feature | Who Has It | Difficulty | Why It Matters |
|---|---------|-----------|-----------|----------------|
| 13 | **Memory expiry / TTL** | Mem0 | LOW | `expires_at` column. Auto-cleanup of temporary memories. |
| 14 | **Immutable memories** | Mem0 | LOW | `immutable` flag. Critical facts that should never be overwritten. |
| 15 | **Conflict resolution** | Zep, Letta | HIGH | When two agents store conflicting facts, detect and resolve. |
| 16 | **Self-editing memory** | Letta (MemGPT) | HIGH | Agent proactively curates its own memory -- reflects, updates, reorganizes. |
| 17 | **Memory sharing / collaboration** | Mem0 (org memory) | MEDIUM | Share memory spaces between users/teams. |
| 18 | **Community detection** | Zep (Graphiti) | HIGH | Auto-cluster related entities into communities. |
| 19 | **Multi-sector embeddings** | CaviraOSS | VERY HIGH | 5 cognitive dimensions per memory. Research-grade, likely overkill. |
| 20 | **LLM-powered fact extraction** | Mem0, LlamaIndex | HIGH | Extract discrete facts from prose. Adds latency and cost. |

---

## MCP Apps Widget Inspiration

### What Makes Great MCP Apps Widgets

Based on research of the ext-apps ecosystem (https://github.com/modelcontextprotocol/ext-apps):

**Standout example servers from the official ext-apps repo:**
| Server | What It Does | Why It's Impressive |
|--------|-------------|---------------------|
| `threejs-server` | 3D visualization | Interactive 3D scenes inside conversations |
| `map-server` | CesiumJS interactive globe | Real geographic data rendered inline |
| `system-monitor-server` | Real-time system dashboards | Live-updating metrics with charts |
| `cohort-heatmap-server` | Data heatmaps | Dense data visualization |
| `customer-segmentation-server` | Business analytics | Interactive filters and drill-downs |
| `scenario-modeler-server` | What-if modeling | Interactive parameter adjustment |
| `sheet-music-server` | Music notation | Specialized rendering |

**What makes them stand out:**
1. **Interactivity** -- users can filter, drill down, adjust parameters without leaving the conversation
2. **Real-time updates** -- data changes reflected immediately in the widget
3. **Visual density** -- show a lot of information in a compact iframe
4. **Domain-specific rendering** -- maps, 3D, charts, music -- things text can't convey
5. **Tool integration** -- widget actions call server tools via `app.callServerTool()`

**For Agent Memory's dashboard, we should consider:**
- **Force-directed graph** of memory relationships (like mcp-memory-service's D3.js visualization)
- **Interactive timeline** with agent-colored dots (we have this planned)
- **Memory heatmap** showing access patterns over time
- **Live activity feed** with animated entries (we have this planned)
- **Sparklines** for memory creation rate, recall frequency
- **Memory detail drawer** -- click a memory card to see full context, related memories, access history
- **Drag-to-link** -- visually connect related memories in the graph view

---

## Prioritized Feature Recommendations

### For the Hackathon (Today)

These can be added in 1-2 hours and make Agent Memory demonstrably better:

1. **Composite scoring in `recall`** -- Modify BM25 ranking to factor in `access_count` and `updated_at` recency. ~30 min.
   ```sql
   -- Example: score = bm25_rank + (access_count * 0.1) + (recency_hours < 24 ? 0.5 : 0)
   ```

2. **Memory namespaces** -- Add `namespace TEXT DEFAULT 'default'` to memories table. Filter by namespace in all tools. ~30 min.

3. **Export/Import tools** -- `export_memories` returns all memories as JSON. `import_memories` accepts JSON array. ~20 min.

4. **Memory relations** -- Simple `memory_relations` table with `from_key`, `to_key`, `relation_type`. New `link_memories` tool. ~45 min.

5. **D3.js graph visualization** in dashboard -- Render memories as nodes, relations as edges. Major demo wow factor. ~60 min.

### Post-Hackathon Roadmap

| Priority | Feature | Estimated Effort |
|----------|---------|------------------|
| P0 | Semantic/vector search (embeddings via ONNX or OpenAI API) | 2-3 days |
| P0 | Memory decay engine (fade unused memories) | 1 day |
| P1 | Auto-summarization of old memories (LLM call) | 1-2 days |
| P1 | Fact supersession / versioning | 1 day |
| P1 | Memory importance scoring | 1 day |
| P2 | Knowledge graph extraction from text | 2-3 days |
| P2 | Natural language time queries | 1 day |
| P2 | Conflict detection between agents | 2 days |
| P3 | Self-editing memory (Letta-style) | 3-5 days |
| P3 | Community detection / auto-clustering | 3-5 days |

---

## Competitive Positioning Summary

| Dimension | Agent Memory | @mcp/server-memory | Mem0/OpenMemory | mcp-memory-service | CaviraOSS | Letta | Zep |
|-----------|-------------|-------------------|-----------------|-------------------|-----------|-------|-----|
| **Search** | FTS5 + BM25 | String match | Vector + graph | Semantic embeddings | Multi-sector embeddings | Embeddings | Hybrid (BM25 + vector + graph) |
| **Storage** | SQLite | JSON file | Qdrant + Neo4j + Postgres | SQLite-vec / ChromaDB | Custom | Postgres + embeddings | Neo4j + embeddings |
| **Dashboard** | MCP Apps widget (inline) | None | Web dashboard | Web dashboard + D3.js graph | CLI | Web UI | Web UI |
| **Agent Attribution** | Yes (color-coded) | No | Partial (agent scope) | No | No | No | No |
| **Cross-Agent** | Yes (activity feed) | No | Via shared user_id | Multi-client | No | Via shared server | No |
| **Knowledge Graph** | No | Yes (core) | Yes (graph memory) | Yes (D3.js) | Yes (temporal) | No | Yes (Graphiti) |
| **Memory Decay** | No | No | No | Yes (dream consolidation) | Yes (adaptive) | No | No |
| **Namespaces** | No | No | Yes (scopes) | No | No | No | No |
| **Temporal** | created/updated only | No | No | No | Yes (valid_from/to) | No | Yes (bitemporal) |
| **Open Source** | Yes | Yes | Partially (OSS + Cloud) | Yes | Yes | Yes | Partially |
| **GitHub Stars** | New | Part of servers repo | 41k+ | ~1k | ~3k | ~15k | ~3k |

**Agent Memory's strongest differentiators remain:**
1. **MCP Apps inline dashboard** -- no competitor has this. It's the visual wow factor.
2. **Cross-agent awareness** -- activity feed showing which agent did what, when, and why.
3. **Auto-context on connect** -- `memory://current-context` is unique.

**Agent Memory's biggest gaps:**
1. **No semantic search** -- every serious competitor has embeddings.
2. **No knowledge graph** -- can't express relationships between memories.
3. **No memory decay** -- memories accumulate forever with no aging.
4. **No namespaces** -- can't isolate memories per project.

The good news: gaps #2-4 are addressable at the hackathon with modest effort. Gap #1 (semantic search) is the strategic priority for post-hackathon.
