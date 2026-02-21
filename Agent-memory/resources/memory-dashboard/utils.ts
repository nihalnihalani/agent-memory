import type { Memory } from "./types";

// ── Agent Colors ─────────────────────────────────────────────
// Based on real clientInfo.name values from MCP Client Capabilities Index

export const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#f97316",
  "claude-ai": "#f97316",
  claude: "#f97316",
  "claude-desktop": "#f97316",
  chatgpt: "#22c55e",
  openai: "#22c55e",
  "cursor-vscode": "#3b82f6",
  cursor: "#3b82f6",
  gemini: "#a855f7",
  "gemini-cli-mcp-client": "#a855f7",
  cline: "#06B6D4",
  "roo-code": "#06B6D4",
  copilot: "#6B7280",
  "github-copilot": "#6B7280",
  goose: "#F97316",
  jetbrains: "#EF4444",
};

export const DEFAULT_AGENT_COLOR = "#374151";

export const AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-ai": "Claude",
  claude: "Claude",
  "claude-desktop": "Claude",
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  "cursor-vscode": "Cursor",
  cursor: "Cursor",
  gemini: "Gemini",
  "gemini-cli-mcp-client": "Gemini CLI",
  cline: "Cline",
  "roo-code": "Roo Code",
  copilot: "Copilot",
  "github-copilot": "Copilot",
  goose: "Goose",
  jetbrains: "JetBrains",
};

export const TYPE_COLORS: Record<string, string> = {
  decision: "#3B82F6",
  preference: "#8B5CF6",
  task: "#F59E0B",
  snippet: "#10B981",
  note: "#6B7280",
};

export const ACTION_VERBS: Record<string, string> = {
  remember: "stored",
  recall: "searched",
  forget: "deleted",
  list_memories: "browsed",
};

// ── Helper Functions ─────────────────────────────────────────

export function getAgentColor(agentId: string | null): string {
  if (!agentId) return DEFAULT_AGENT_COLOR;
  const id = agentId.toLowerCase();
  for (const key of Object.keys(AGENT_COLORS)) {
    if (id.includes(key)) return AGENT_COLORS[key];
  }
  return DEFAULT_AGENT_COLOR;
}

export function getAgentName(agentId: string | null): string {
  if (!agentId) return "Unknown";
  const id = agentId.toLowerCase();
  for (const key of Object.keys(AGENT_NAMES)) {
    if (id.includes(key)) return AGENT_NAMES[key];
  }
  return agentId;
}

export function fixTimezone(dateStr: string): string {
  return dateStr + (dateStr.endsWith("Z") ? "" : "Z");
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(fixTimezone(dateStr));
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}

export function getFreshnessColor(memory: Memory): string {
  const dateStr = memory.updated_at || memory.created_at;
  const d = new Date(fixTimezone(dateStr));
  const hoursAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - hoursAgo / 168); // 7 days
  const accessScore = Math.min(1, memory.access_count / 10);
  const freshness = recencyScore * 0.6 + accessScore * 0.4;
  if (freshness > 0.6) return "#22c55e";
  if (freshness > 0.3) return "#eab308";
  return "#6b7280";
}
