import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import os from "os";

export interface ContextTurn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; input: Record<string, unknown> }[];
  timestamp?: string;
}

export interface FileChange {
  path: string;
  action: "created" | "modified" | "deleted" | "executed";
  summary: string;
}

export interface UniversalContext {
  metadata: {
    source_agent: string;
    session_id: string;
    timestamp: string;
    token_count: number;
    project_path: string;
    git_branch?: string;
  };
  conversation_summary: {
    objective: string;
    completed_steps: string[];
    current_state: string;
    pending_tasks: string[];
    key_decisions: string[];
  };
  file_changes: FileChange[];
  raw_turns: ContextTurn[];
}

interface RawLine {
  type: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
    usage?: { output_tokens?: number; input_tokens?: number };
  };
  sessionId?: string;
  uuid?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | ContentBlock[] }
  | { type: "thinking"; thinking: string };

function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

/** Encode a filesystem path the same way Claude Code does (replace / with -) */
function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/** Find all JSONL session files for a given project directory */
export function findSessionFiles(projectPath?: string): { sessionFile: string; encodedDir: string }[] {
  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const results: { sessionFile: string; encodedDir: string }[] = [];

  const encoded = projectPath ? encodeProjectPath(projectPath) : null;
  const dirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => !encoded || d.name === encoded)
    .map(d => d.name);

  for (const dir of dirs) {
    const dirPath = path.join(projectsDir, dir);
    try {
      const files = readdirSync(dirPath)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => ({ sessionFile: path.join(dirPath, f), encodedDir: dir }));
      results.push(...files);
    } catch {
      // skip unreadable dirs
    }
  }

  return results;
}

/** Get the most recently modified JSONL file for a project */
export function findLatestSessionFile(projectPath?: string): { sessionFile: string; encodedDir: string } | null {
  const files = findSessionFiles(projectPath);
  if (!files.length) return null;

  let latest = files[0];
  let latestMtime = 0;

  for (const f of files) {
    try {
      const { mtimeMs } = require("fs").statSync(f.sessionFile);
      if (mtimeMs > latestMtime) {
        latestMtime = mtimeMs;
        latest = f;
      }
    } catch {
      // skip
    }
  }

  return latest;
}

function extractTextFromContent(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}

function extractToolCalls(blocks: ContentBlock[]): { name: string; input: Record<string, unknown> }[] {
  return blocks
    .filter(b => b.type === "tool_use")
    .map(b => {
      const tb = b as { type: "tool_use"; name: string; input: Record<string, unknown> };
      return { name: tb.name, input: tb.input };
    });
}

function toolCallToFileChange(call: { name: string; input: Record<string, unknown> }): FileChange | null {
  const { name, input } = call;
  if (name === "Write") {
    const p = input.file_path as string | undefined;
    if (!p) return null;
    return { path: p, action: "created", summary: `Wrote ${path.basename(p)}` };
  }
  if (name === "Edit") {
    const p = input.file_path as string | undefined;
    if (!p) return null;
    return { path: p, action: "modified", summary: `Edited ${path.basename(p)}` };
  }
  if (name === "NotebookEdit") {
    const p = input.notebook_path as string | undefined;
    if (!p) return null;
    return { path: p, action: "modified", summary: `Edited notebook ${path.basename(p)}` };
  }
  if (name === "Bash") {
    const cmd = (input.command as string | undefined) || "";
    const short = cmd.length > 60 ? cmd.slice(0, 60) + "…" : cmd;
    return { path: "", action: "executed", summary: `$ ${short}` };
  }
  return null;
}

function deriveObjective(turns: ContextTurn[]): string {
  // First non-empty user message is usually the objective
  for (const t of turns) {
    if (t.role === "user" && t.content.length > 10) {
      const first = t.content.split("\n")[0].trim();
      return first.length > 120 ? first.slice(0, 120) + "…" : first;
    }
  }
  return "Unknown objective";
}

function deriveCompletedSteps(turns: ContextTurn[]): string[] {
  const steps: string[] = [];
  for (const t of turns) {
    if (t.role === "assistant" && t.toolCalls) {
      for (const c of t.toolCalls) {
        if (c.name === "Write" && c.input.file_path) {
          steps.push(`Created ${path.basename(c.input.file_path as string)}`);
        } else if (c.name === "Edit" && c.input.file_path) {
          steps.push(`Modified ${path.basename(c.input.file_path as string)}`);
        } else if (c.name === "Bash" && c.input.command) {
          const cmd = (c.input.command as string).split("&&")[0].trim();
          if (cmd.length < 60) steps.push(`Ran: ${cmd}`);
        }
      }
    }
  }
  // Deduplicate while preserving order
  return [...new Set(steps)].slice(0, 20);
}

function deriveCurrentState(turns: ContextTurn[]): string {
  // Last assistant text message gives current state
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "assistant" && t.content.length > 10) {
      const snippet = t.content.slice(0, 200).trim();
      return snippet.length < t.content.length ? snippet + "…" : snippet;
    }
  }
  return "No state captured";
}

/** Parse a Claude Code JSONL session file into the universal context format */
export function parseClaudeCodeSession(sessionFile: string): UniversalContext {
  const raw = readFileSync(sessionFile, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());

  const turns: ContextTurn[] = [];
  const fileChanges: FileChange[] = [];
  let sessionId = "";
  let cwd = "";
  let gitBranch: string | undefined;
  let timestamp = new Date().toISOString();
  let tokenCount = 0;

  for (const line of lines) {
    let parsed: RawLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // Skip noise lines
    if (
      parsed.type === "file-history-snapshot" ||
      parsed.type === "progress" ||
      parsed.isMeta ||
      parsed.isSidechain
    ) {
      continue;
    }

    // Capture session metadata from first real line
    if (!sessionId && parsed.sessionId) sessionId = parsed.sessionId;
    if (!cwd && parsed.cwd) cwd = parsed.cwd;
    if (!gitBranch && parsed.gitBranch) gitBranch = parsed.gitBranch;
    if (parsed.timestamp) timestamp = parsed.timestamp;

    const msg = parsed.message;
    if (!msg || !msg.role || !msg.content) continue;

    const role = msg.role as "user" | "assistant";
    // content can be a string or an array of blocks
    const blocks: ContentBlock[] = Array.isArray(msg.content)
      ? (msg.content as ContentBlock[])
      : [{ type: "text", text: msg.content as unknown as string }];

    const text = extractTextFromContent(blocks);
    const toolCalls = role === "assistant" ? extractToolCalls(blocks) : [];

    // Track token usage
    if (msg.usage?.output_tokens) tokenCount += msg.usage.output_tokens;

    // Collect file changes from tool calls
    for (const call of toolCalls) {
      const change = toolCallToFileChange(call);
      if (change) fileChanges.push(change);
    }

    if (text || toolCalls.length > 0) {
      turns.push({
        role,
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: parsed.timestamp,
      });
    }
  }

  // Deduplicate file changes (keep last action per path)
  const seenPaths = new Map<string, FileChange>();
  for (const fc of fileChanges) {
    if (fc.path) seenPaths.set(fc.path, fc);
    else seenPaths.set(fc.summary, fc); // for bash commands use summary as key
  }
  const dedupedChanges = [...seenPaths.values()];

  return {
    metadata: {
      source_agent: "claude-code",
      session_id: sessionId || path.basename(sessionFile, ".jsonl"),
      timestamp,
      token_count: tokenCount,
      project_path: cwd,
      git_branch: gitBranch,
    },
    conversation_summary: {
      objective: deriveObjective(turns),
      completed_steps: deriveCompletedSteps(turns),
      current_state: deriveCurrentState(turns),
      pending_tasks: [],
      key_decisions: [],
    },
    file_changes: dedupedChanges,
    raw_turns: turns,
  };
}
