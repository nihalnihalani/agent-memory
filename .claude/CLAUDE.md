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
