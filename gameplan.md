# Cross-Agent Context Bridge — YC Hackathon Game Plan

## The Idea (30-second pitch)

Every time you switch between AI coding tools (Claude Code, Codex, Cursor, Gemini CLI), you lose your entire conversation history, decisions, and context. You start from scratch. Our MCP server acts as a universal memory layer — it reads your session from one tool, converts it to a standard format, and injects it into another. The AI picks up exactly where the last one left off.

---

## How It Works (Architecture)

```
You're coding in Claude Code
        │
        ▼
"Save my context" ──► Context Bridge MCP Server
                            │
                      ┌─────┴─────┐
                      │ Universal  │
                      │  Context   │
                      │  Format    │
                      │  (JSON)    │
                      └─────┬─────┘
                            │
                      "Load context"
                            │
                            ▼
                  Continue in Codex CLI
                  (knows everything Claude knew)
```

### What the MCP Server Exposes

| Tool | What It Does |
|------|-------------|
| `save-context` | Reads current agent's session files, converts to universal JSON format |
| `load-context` | Loads saved context into current agent, auto-summarizes for window size |
| `list-sessions` | Browse all saved context snapshots across tools |
| `diff-context` | Compare what transfers vs what gets trimmed between different window sizes |

### The Universal Context Format (JSON)

```json
{
  "metadata": {
    "source_agent": "claude-code",
    "session_id": "abc-123",
    "timestamp": "2026-02-21T15:30:00Z",
    "token_count": 45000
  },
  "conversation_summary": {
    "objective": "Refactor auth module to OAuth2",
    "completed_steps": ["Created token service", "Updated middleware"],
    "current_state": "Token refresh implemented, testing pending",
    "pending_tasks": ["Write integration tests", "Update API docs"],
    "key_decisions": ["Chose PKCE flow over implicit", "Redis for token cache"]
  },
  "file_changes": [
    { "path": "src/auth/oauth.ts", "action": "created", "summary": "OAuth2 client" },
    { "path": "src/auth/session.ts", "action": "modified", "summary": "Added refresh logic" }
  ]
}
```

### How Each Tool Is Handled

**Claude Code (Reader):** Parse JSONL from `~/.claude/projects/<path>/<uuid>.jsonl`
**Claude Code (Writer):** Generate a `CLAUDE.local.md` with the transferred context

**Codex CLI (Reader):** Parse JSONL from `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
**Codex CLI (Writer):** Create an `AGENTS.md` with structured context + launch with `codex exec`

**Gemini CLI (Reader):** Parse JSON from `~/.gemini/tmp/<hash>/chats/`
**Gemini CLI (Writer):** Write to project-level `GEMINI.md`

**Cursor (Reader):** Parse SQLite from workspace storage or exported Markdown
**Cursor (Writer):** Create `.cursor/rules/context-transfer.mdc` with `alwaysApply: true`

---

## Team Split (3 People, 10 Hours: 9 AM — 7 PM)

### Person 1: MCP Server Core + Universal Format
**Morning (9 AM — 12 PM)**
- Set up the mcp-use project scaffold
- Define the universal JSON context schema
- Implement `save-context` and `load-context` tool skeletons
- Set up local storage at `~/.ctx-bridge/contexts/`

**Afternoon (12 PM — 4 PM)**
- Implement `list-sessions` tool
- Build the tiered summarization logic (Tier 1: 5K tokens always, Tier 2: 20K if space, Tier 3: full history)
- Handle token budget calculation for different target windows
- Write `diff-context` tool showing what transfers vs what gets trimmed

**Final stretch (4 PM — 6 PM)**
- Integration testing with Person 2's adapters
- Bug fixes and edge cases
- Help with demo prep

### Person 2: Tool Adapters (Readers + Writers)
**Morning (9 AM — 12 PM)**
- Build Claude Code reader: parse JSONL session files, extract turns, tool calls, file changes
- Build Codex CLI reader: parse JSONL session files (similar format)
- Test with real session files from both tools

**Afternoon (12 PM — 4 PM)**
- Build Claude Code writer: generate CLAUDE.local.md with context
- Build Codex CLI writer: generate AGENTS.md + launch command
- Build Gemini CLI reader/writer (stretch goal)
- Build Cursor reader/writer (stretch goal — SQLite parsing)

**Final stretch (4 PM — 6 PM)**
- Integration with Person 1's MCP server
- End-to-end testing: Claude Code → save → load → Codex CLI
- Create sample session files for demo if real ones aren't available

### Person 3: Widget UI + Demo + Pitch
**Morning (9 AM — 12 PM)**
- Build the mcp-use widget: visual dashboard showing saved sessions
- Display: source agent, timestamp, token count, objective, status
- Add a "transfer preview" view showing what gets included/trimmed per target

**Afternoon (12 PM — 4 PM)**
- Add side-by-side comparison widget (Gemini 1M → Claude 200K: what survives?)
- Polish the UI, add agent logos/icons, make it visually impressive
- Start preparing the demo script and pitch deck (2-3 slides max)

**Final stretch (4 PM — 6 PM)**
- Record backup demo video (in case live demo fails)
- Practice the 2-minute pitch
- Final polish on widget visuals

---

## Demo Script (2 Minutes)

### Setup (15 seconds)
"How many of you use more than one AI coding tool? Claude Code, Cursor, Codex? Every time you switch, you lose everything and start over. We built Context Bridge."

### Live Demo (90 seconds)

**Step 1: Show the problem (20 sec)**
- Open Claude Code, show an ongoing session where you've been refactoring auth
- "I've been working with Claude for 30 minutes. It knows my codebase, my decisions, everything."

**Step 2: Save context (20 sec)**
- Type: "Save my current context"
- Claude calls `save-context` via MCP
- Show the widget: session saved, 45K tokens, objective captured

**Step 3: Switch tools (20 sec)**
- Open Codex CLI on the same project
- Type: "Load context from my last Claude Code session"
- Codex calls `load-context` via MCP

**Step 4: The magic moment (30 sec)**
- Ask Codex: "What was I working on?"
- Codex responds with full awareness: the objective, completed steps, pending tasks, key decisions
- "It knows everything Claude knew. Zero copy-paste. Zero re-explaining."

### Close (15 seconds)
"Context Bridge eliminates the context-switching tax. One MCP server, any AI tool can plug in. We're building the universal memory layer for AI-assisted development."

---

## What Makes This Win

1. **Directly serves the sponsors** — OpenAI (Codex) and Anthropic (Claude) both benefit from interoperability
2. **Solves a real pain point** — every developer who uses multiple AI tools feels this daily
3. **Built on the hackathon's own stack** — MCP + mcp-use framework, exactly what they asked for
4. **Great demo story** — the before/after is immediately obvious
5. **Technically impressive but explainable** — tiered summarization, multi-tool adapters, universal format

---

## Backup Plan

If the full adapter system takes too long, scope down to:
- **MVP:** Claude Code → Codex CLI only (both JSONL, simplest path)
- **Mock data fallback:** Pre-generate realistic session files for demo
- **Widget-only fallback:** Even if the adapters aren't perfect, a polished widget showing the concept wins points

---

## Tonight's Checklist

- [ ] All 3 teammates install mcp-use framework and run the quickstart
- [ ] Read the mcp-use SKILL.md foundations (concepts.md, architecture.md, quickstart.md)
- [ ] Generate real session files in Claude Code and Codex CLI to use as test data
- [ ] Agree on the universal JSON schema (use the one above as starting point)
- [ ] Set up a shared GitHub repo
- [ ] Decide who is Person 1, 2, and 3