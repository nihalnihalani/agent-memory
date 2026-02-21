/**
 * Shared helpers for tool response formatting.
 */

/**
 * Map raw clientInfo.name values to human-readable display names.
 */
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  "claude-ai": "Claude (web)",
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  "ChatGPT": "ChatGPT",
  "cursor-vscode": "Cursor",
  "Visual Studio Code": "VS Code",
  "Cline": "Cline",
  "Codex": "OpenAI Codex",
  "goose": "Goose",
  "gemini-cli-mcp-client": "Gemini CLI",
  "github-copilot-developer": "GitHub Copilot",
  "Roo-Code": "Roo Code",
  "Q-DEV-CLI": "Amazon Q",
  "unknown": "Unknown Agent",
};

export function agentDisplayName(agentId: string): string {
  return AGENT_DISPLAY_NAMES[agentId] || agentId;
}

/**
 * Convert an ISO timestamp string to a human-friendly relative time string.
 * Examples: "just now", "2m ago", "3h ago", "5d ago"
 */
export function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp + (isoTimestamp.endsWith("Z") ? "" : "Z")).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/**
 * Truncate a string to maxLen characters, adding "..." if truncated.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}

/**
 * Extract the agent ID from the MCP tool context.
 */
export function getAgentId(ctx: any): string {
  return ctx?._meta?.clientInfo?.name
    || ctx?.meta?.clientInfo?.name
    || "unknown";
}
