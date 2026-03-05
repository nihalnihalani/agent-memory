# Project Rules for Claude Code

## Auto-Commit and Push Rule

**MANDATORY**: After every change you make to any file in this repository, you MUST:

1. Stage the changed files: `git add <specific files you changed>`
2. Commit with a clear message describing what changed: `git commit -m "description of change"`
3. Push to `main`: `git push origin main`

This applies to EVERY change — no exceptions. Do not batch changes. Commit and push immediately after each logical change.

- Always push to `main`
- Never force push
- Use descriptive commit messages that explain the "why"
- If a pre-commit hook fails, fix the issue and create a NEW commit (never amend)

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Agent Team Strategy
- For complex, multi-faceted tasks: use **agent teams** (not just subagents)
- Agent teams let teammates communicate directly with each other, share a task list, and self-coordinate
- Use subagents for quick focused tasks where only the result matters
- Use agent teams when work requires discussion, collaboration, or parallel implementation

**When to spawn an agent team:**
- Research and review (multiple angles simultaneously)
- New features with independent modules (each teammate owns separate files)
- Debugging with competing hypotheses (teammates challenge each other's theories)
- Cross-layer coordination (frontend, backend, tests — each owned by a different teammate)
- Code review (security, performance, test coverage reviewers in parallel)

**Team composition best practices:**
- Start with 3-5 teammates; more adds coordination overhead with diminishing returns
- Aim for 5-6 tasks per teammate to keep everyone productive
- Always include a **devil's advocate** teammate to challenge decisions and find flaws
- Assign each teammate a distinct domain — avoid file overlap to prevent conflicts
- Include a **verification/QA** teammate to run tests and check integration after implementation

**Teammate configuration:**
- Give each teammate a detailed spawn prompt with task-specific context (teammates don't inherit the lead's conversation history)
- Use `plan_mode_required` for risky or complex tasks — teammate must get plan approved before implementing
- Use `isolation: "worktree"` for teammates that modify overlapping files
- Pre-approve common operations in permission settings to reduce prompt interruptions
- Teammates inherit CLAUDE.md, MCP servers, and skills automatically

**Coordination rules:**
- The lead coordinates — it creates tasks, assigns work, synthesizes results
- Teammates self-claim unassigned, unblocked tasks after completing their current work
- Task dependencies auto-unblock when upstream tasks complete
- Always shut down teammates gracefully before cleaning up the team
- Monitor progress and redirect teammates that aren't making progress

**Token efficiency:**
- Agent teams use significantly more tokens than single sessions — use only when parallel work adds genuine value
- For sequential tasks, same-file edits, or heavily dependent work: use a single session or subagents instead
- Broadcast messages sparingly (costs scale linearly with team size) — prefer direct messages

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
