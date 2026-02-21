# Devil's Advocate Review: Agent Memory

> Constructive critique of the Design Document and Hackathon Plan
> Reviewer: devils-advocate | Date: 2026-02-21

---

## 1. Plan Contradictions -- The Two Documents Disagree

The design doc (`2026-02-21-agent-memory-design.md`) and the hackathon plan (`HACKATHON_PLAN.md`) contradict each other on multiple fundamental decisions. If the team does not reconcile these BEFORE writing code, they will waste precious hackathon hours resolving conflicts mid-build.

### 1.1 UI Approach -- React vs Vanilla TS

| | Design Doc | Hackathon Plan |
|---|---|---|
| **UI tech** | mcp-use React widgets (auto-discovery in `resources/`) | Vanilla TS + Vite + `vite-plugin-singlefile` |
| **Widget path** | `resources/memory-dashboard/widget.tsx` | `mcp-app.html` + `src/mcp-app.ts` |
| **Styling** | `styles.css` (in resources/) | Tailwind CSS (CDN) |

**Impact**: These are completely different build pipelines. React widgets use JSX, component trees, and mcp-use's built-in bundling. Vanilla TS + Vite + singlefile is a different approach entirely. The team cannot start coding the UI until they pick ONE. Time wasted: potentially 30-60 minutes of confusion if they start with the wrong one.

**Recommendation**: Decide NOW. If mcp-use's React widget scaffold actually works, use it -- it handles bundling and postMessage plumbing. If the team has tested Vanilla TS + Vite and knows it works, go with that. Do NOT try both.

### 1.2 File Structure Differences

The design doc has:
```
resources/
  memory-dashboard/
    widget.tsx
    components/
      MemoryList.tsx, SearchBar.tsx, TagFilter.tsx, ActivityFeed.tsx, Timeline.tsx, AgentIcon.tsx
    styles.css
```

The hackathon plan has:
```
mcp-app.html
src/
  mcp-app.ts
  ui/
    styles.css, timeline.ts, tagcloud.ts, search.ts
```

These are not two views of the same project. These are two different projects. Someone needs to pick one and delete the other.

### 1.3 Database Schema Differences

| Feature | Design Doc | Hackathon Plan |
|---|---|---|
| `type` column on memories | YES (`decision/preference/task/snippet/note`) | NO |
| `activity_log` table | YES (full table with indexes) | NO |
| `idx_memories_type` index | YES | NO (column doesn't exist) |
| `idx_activity_agent` index | YES | NO (table doesn't exist) |
| `idx_activity_time` index | YES | NO (table doesn't exist) |

**Impact**: The design doc's demo script relies on filtering by `type` (e.g., showing all `decision` type memories). The `memory://current-context` resource explicitly references filtering by type. If the hackathon plan's simpler schema is used, these features silently break. The `activity_log` table is also needed for the Activity Tab in the dashboard and the `memory://agent-activity` resource.

**Recommendation**: Use the design doc's schema. The `type` column and `activity_log` table are small additions but they power the Activity Tab, the `memory://current-context` resource, and the type-filter UI -- all key demo differentiators.

### 1.4 SDK Reference Confusion

The design doc says the SDK is `mcp-use` (`create-mcp-use-app`). The hackathon plan's tech stack table says it uses both `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps` AND `mcp-use`. These are different packages. Which one is actually being used for what?

### 1.5 Team Split vs Solo Schedule

The design doc has a two-person team split (Person A and Person B with parallel tasks). The hackathon plan has a single-track sequential schedule. If there are two people, the hackathon plan's schedule wastes one person's time. If there is one person, the design doc's team split is fiction.

---

## 2. Technical Risks

### 2.1 SQLite Concurrent Access

Both plans show multiple MCP clients (Claude, ChatGPT, Cursor, VS Code) hitting the same server simultaneously. `better-sqlite3` is synchronous and single-threaded. This is actually FINE for reads (SQLite handles concurrent reads well) and writes are serialized by the Node.js event loop. But there are edge cases:

- If two agents call `remember` with the same key at nearly the same time, one will silently overwrite the other (upsert behavior). This could cause data loss during the demo if not careful.
- WAL mode should be enabled explicitly for better concurrent read performance. Neither document mentions this.

**Recommendation**: Add `PRAGMA journal_mode=WAL;` to the schema initialization. This is one line and significantly improves concurrency.

### 2.2 better-sqlite3 on Manufact Cloud

`better-sqlite3` is a native Node.js addon. It requires compilation for the target platform. If Manufact Cloud uses a containerized environment (likely), the native binary compiled locally on macOS will NOT work on a Linux container.

**Mitigation options**:
- Use `sql.js` instead (pure WASM, zero native deps, works everywhere). Downside: slower, no FTS5.
- Ensure Manufact Cloud's build step runs `npm install` with `node-gyp` available.
- Test deployment TONIGHT as the hackathon plan suggests. This is genuinely critical.

### 2.3 FTS5 Availability

FTS5 is an extension to SQLite. It is included in most SQLite builds but NOT all. If Manufact Cloud's SQLite build does not include FTS5, the entire `recall` tool breaks silently. There is no fallback in either plan.

**Recommendation**: Write a fallback search using `LIKE '%query%'` on key+value+context. It is slower and less relevant but it works everywhere. Add it as a safety net that activates if FTS5 table creation fails.

### 2.4 Memory Leak Risks

The server is long-running. If the dashboard widget polls for updates or if the server maintains state per-connection, there is a risk of memory leaks over a 7.5-hour hackathon. Neither plan mentions connection cleanup, event listener removal, or garbage collection.

This is probably fine for the hackathon (restart the server if it gets sluggish), but worth noting.

---

## 3. Scope and Timeline

### 3.1 Is 7.5 Hours Realistic?

The hackathon plan allocates time as if every step succeeds on the first try. Here is a more realistic assessment:

| Task | Planned | Realistic | Why |
|---|---|---|---|
| Scaffold + deps | 15 min | 30-45 min | `create-mcp-use-app` may not work as expected, dependency conflicts, TypeScript config issues |
| 4 MCP tools | 45 min | 1.5-2 hours | SQLite schema, FTS5 triggers, upsert logic, agent_id extraction from clientInfo, testing each tool |
| Dashboard UI | 1.5 hours | 2-3 hours | UI is always slower than planned; iframe communication, CSS, state management |
| Cross-agent testing | 45 min | 1-2 hours | Configuring ChatGPT MCP, debugging connection issues, cloudflared setup |
| Manufact deploy | 15 min | 30-60 min | Native dep issues (better-sqlite3), environment variables, debugging |
| Demo prep | 1.5 hours | 1 hour | This is actually reasonable |
| **TOTAL** | 7.5 hours | 8-11 hours | 30-45% over budget |

**Verdict**: The plan is 30-45% over-scoped. Something must be cut.

### 3.2 What to Ruthlessly Cut

**Cut immediately (save 1-2 hours)**:
1. Timeline visualization (SVG). High effort, medium visual impact. Replace with a simple "last 5 actions" list.
2. Tag cloud component. Just use clickable text pills.
3. Animated memory creation. Just show the new memory at the top of the list.
4. Dark mode / light mode toggle.

**Cut if behind by 1:00 PM**:
1. Activity Tab entirely. Focus on memory list + search only.
2. Agent icons. Just show the agent name as text.

**Never cut**:
1. The 4 core tools. They are the product.
2. FTS5 search. It is the "recall" wow factor.
3. Cross-agent demo. It is the pitch.
4. Deployment. Required by hackathon.

### 3.3 The Real Schedule

```
10:30 - 11:30  Scaffold, schema, remember + recall (skip forget/list for now)
11:30 - 12:30  forget + list_memories, test all 4 in Inspector, DEPLOY NOW
12:30 - 1:00   LUNCH (eat while deploying)
1:00  - 2:30   Dashboard UI (memory list, search, basic styling ONLY)
2:30  - 3:30   Cross-agent testing (Claude + ChatGPT on deployed server)
3:30  - 4:30   Agent attribution, polish, bug fixes
4:30  - 5:30   Demo prep, seed data, practice
5:30  - 6:00   Buffer for fires
```

Key difference: Deploy early (hour 2, not hour 5). Every hour of delay on deployment is another hour of risk that native deps or cloud issues block you.

---

## 4. Demo Vulnerabilities

### 4.1 WiFi Failure

Both plans mention recording a backup video. Good. But neither plan specifies WHEN to record it. If the team records it at 5:00 PM and WiFi dies at 5:15 PM, they are fine. If they plan to record it at 5:30 PM and WiFi is already dead, they are not.

**Recommendation**: Record a backup video the moment the cross-agent demo works, even if the UI is ugly. Record a prettier one later if time permits.

### 4.2 API Rate Limits

MCP tool calls go through the LLM provider. If Claude or ChatGPT rate-limits during the demo:
- Claude: 5 tool calls/minute on free tier, more on Pro/Max. Should be fine on Pro.
- ChatGPT: MCP tool call limits are not well-documented. Could be throttled.

**Recommendation**: Pre-test the exact demo flow 3 times in a row to verify rate limits are not hit. Have a pre-seeded database so the demo does not depend on live `remember` calls.

### 4.3 Cross-Agent Demo Requires Two Simultaneous MCP Connections

The wow moment is "Claude remembers, ChatGPT recalls." This requires:
1. Claude connected to the MCP server AND working
2. ChatGPT connected to the SAME MCP server AND working
3. Both connections stable simultaneously

If either connection drops during the demo, the cross-agent story collapses. This is a single point of failure for the entire pitch.

**Recommendation**: Have a fallback "simulated cross-agent" demo. Use two Claude windows (Claude Desktop + Claude Code) connecting to the same server. Same story, lower risk. If ChatGPT works, great -- use it. If not, two Claudes still proves the concept.

### 4.4 Dashboard Widget Rendering

MCP Apps is new technology. The widget might not render in Claude. The hackathon plan acknowledges this (test by 12:00 PM). But neither plan has a concrete fallback for what the demo LOOKS like without the widget.

**Recommendation**: Prepare 2-3 beautiful screenshots of the dashboard. If the live widget fails, show screenshots while the tools work in conversation. "The dashboard renders inline, but let me show you what it looks like."

---

## 5. Differentiation Weaknesses

### 5.1 How Is This Different from Existing Solutions?

**@modelcontextprotocol/server-memory**: Official MCP memory server. Has `remember`, `recall`, `forget`. Open source. Free.

**mem0**: Production-grade memory layer with embeddings, vector search, and multi-tenant support. Well-funded company.

**OpenMemory**: Community MCP memory server.

Agent Memory's claimed differentiators:
1. "MCP Apps inline dashboard" -- This is a UI feature, not a memory feature. A judge might say "you built a dashboard on top of the official server."
2. "Cross-agent attribution" -- This is `clientInfo.name` stored as a column. It is 10 lines of code.
3. "One server, every client" -- This is true of literally every MCP server.

### 5.2 Would a YC Judge Find This Compelling?

**Honest answer**: It depends on execution. The concept ("agents share memory") is simple and easy to understand -- that is good. But a sharp YC judge will ask:

- "Why not just use the official MCP memory server?" -- Answer must be about the UX, the dashboard, the activity awareness.
- "How is this a business?" -- Neither plan addresses monetization or go-to-market.
- "What's the moat?" -- A dashboard UI is not a moat. Cross-agent attribution is not a moat.

**Recommendation**: Lean into the WORKFLOW story, not the technology. "We're not building a database. We're building the first tool that makes AI agents feel like a team. Today, your agents are isolated contractors. Agent Memory makes them colleagues who share context." The demo should feel magical. The technology should be invisible.

### 5.3 Is "Agents Sharing Memory" a Solved Problem?

Partially. The MCP protocol itself enables this -- any MCP server that stores data is shareable across agents. But the EXPERIENCE of agents sharing memory is not solved. Nobody has made it feel seamless. That is the opportunity.

However, the judges may not appreciate this nuance. The team needs a strong answer prepared for "this already exists."

---

## 6. Missing Pieces

### 6.1 No Authentication

Anyone who discovers the Manufact Cloud URL can read AND write to the memory store. They can:
- Read all stored memories (potentially containing project secrets, credentials, API keys)
- Write malicious memories ("delete the production database")
- Delete all memories
- Flood the store with garbage

**For the hackathon**: This is probably acceptable. Nobody will find the URL in 7 hours. But it should be acknowledged as a limitation.

**For any post-hackathon use**: This is a critical security flaw.

### 6.2 No Data Size Limits

Neither plan puts limits on the `value` field. An agent could store a 10MB string. Or 100MB. SQLite can handle it (up to 1GB per row by default), but:
- FTS5 indexing on very large values will be slow
- The dashboard will choke trying to render it
- Memory usage will spike

**Recommendation**: Add a 10KB limit on `value` and a 500-character limit on `key`. Trivial to implement, prevents demo-breaking edge cases.

### 6.3 No Rate Limiting

An agent in a loop could call `remember` thousands of times per second. `better-sqlite3` is fast enough to handle this, but the database will grow unboundedly.

**For the hackathon**: Probably fine. No agent will loop that fast in a 3-minute demo.

### 6.4 No Backup or Export Strategy

If the SQLite file gets corrupted or the server crashes, all memories are gone. Neither plan mentions backup.

**Recommendation**: The seed.json file IS the backup. On startup, if the database is empty, load seed data. This is already mentioned in the design doc. Make sure it works.

### 6.5 No Privacy Controls

All memories are visible to all agents. There is no concept of private vs. shared memories. If a user stores a password via Claude ("remember that my database password is hunter2"), ChatGPT can recall it.

**For the hackathon**: This is actually a FEATURE for the demo -- it shows cross-agent sharing.

**For production**: This is a serious privacy concern.

### 6.6 No Input Sanitization

Neither plan mentions sanitizing inputs. If an agent stores a `key` containing SQL injection payloads or XSS payloads, what happens? `better-sqlite3` uses prepared statements (safe from SQL injection by default), but the dashboard widget could be vulnerable to XSS if it renders `value` as HTML.

**Recommendation**: Escape HTML in all values rendered in the dashboard. Use `textContent` instead of `innerHTML`.

---

## 7. Architecture Concerns

### 7.1 Is SQLite the Right Choice?

**For the hackathon**: Yes. SQLite is the right choice. It is zero-config, fast, single-file, and the team knows it. PostgreSQL would add 30-60 minutes of setup and a running database to manage. A JSON file would lack search capabilities.

**For multi-client production**: No. SQLite is single-writer. A PostgreSQL or even a managed service like Turso (SQLite-compatible, distributed) would be better.

**Verdict**: SQLite is correct for the hackathon. Do not second-guess this decision.

### 7.2 Streamable HTTP vs stdio

The plans use Streamable HTTP transport. This is correct for remote access and multi-client support. stdio would only work for local, single-client connections. No issue here.

### 7.3 Express as HTTP Server

Both plans mention Express. This is fine but potentially unnecessary. The MCP SDK's Streamable HTTP adapter may handle the HTTP layer. Adding Express means another dependency, more code, and more things that can break.

**Recommendation**: Use Express only if the MCP SDK requires it for Streamable HTTP. If the SDK can serve HTTP directly, skip Express.

---

## 8. Summary: Top 5 Action Items

These are the five most critical things the team must do BEFORE or at the very start of the hackathon:

1. **Reconcile the two plans**. Pick ONE UI approach (React or Vanilla TS), ONE file structure, ONE schema. Delete the other. Time cost: 15 minutes. Time saved: 1-2 hours of confusion.

2. **Deploy early, not late**. Push the scaffold to Manufact Cloud in hour 1, not hour 5. Every hour of delay is compounding deployment risk.

3. **Test better-sqlite3 on Manufact Cloud TONIGHT**. If native deps fail, switch to `sql.js` before the hackathon starts. Do not discover this at 2:00 PM.

4. **Write the FTS5 fallback**. A `LIKE '%query%'` fallback is 5 lines of code and protects against FTS5 not being available on the cloud platform.

5. **Prepare a compelling answer for "how is this different from the official MCP memory server?"**. The answer is the EXPERIENCE, not the storage. Practice saying it.

---

## 9. Final Verdict

The idea is sound. Cross-agent memory with a visual dashboard is a compelling hackathon project. The execution risk is manageable IF the team reconciles the plans, deploys early, and cuts scope aggressively.

The biggest threat is not a technical failure. It is running out of time because of scope creep and plan ambiguity. The two contradictory documents are a symptom of this -- the project has been planned twice, differently, and neither plan has been validated against reality.

**Grade: B-**. Good concept, strong demo narrative, but the plans need immediate reconciliation and the timeline is 30-45% over-scoped. With the fixes above, this becomes a solid A- project.
