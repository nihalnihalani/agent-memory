# Project Rules for Claude Code

## Auto-Commit and Push Rule

**MANDATORY**: After every change you make to any file in this repository, you MUST:

1. Stage the changed files: `git add <specific files you changed>`
2. Commit with a clear message describing what changed: `git commit -m "description of change"`
3. Push to Nihal's branch (`nihal`):
   - First, check if the `nihal` branch exists on the remote: `git ls-remote --heads origin nihal`
   - If the branch does NOT exist, create it and push: `git checkout -b nihal && git push -u origin nihal`
   - If the branch already exists, push to it: `git push origin HEAD:nihal`

This applies to EVERY change — no exceptions. Do not batch changes. Commit and push immediately after each logical change.

- Always push to the `nihal` branch — never directly to `main`
- If you are not currently on the `nihal` branch, switch to it or push to it using `HEAD:nihal`
- Never force push
- Never push to main without explicit permission
- Use descriptive commit messages that explain the "why"
- If a pre-commit hook fails, fix the issue and create a NEW commit (never amend)
