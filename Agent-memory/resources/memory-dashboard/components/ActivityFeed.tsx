import React from "react";
import type { Activity } from "../types";

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#f97316",
  "claude-ai": "#f97316",
  claude: "#f97316",
  chatgpt: "#22c55e",
  "cursor-vscode": "#3b82f6",
  cursor: "#3b82f6",
  gemini: "#a855f7",
  "gemini-cli-mcp-client": "#a855f7",
  cline: "#06B6D4",
  copilot: "#6B7280",
  goose: "#F97316",
  jetbrains: "#EF4444",
};

const AGENT_NAMES: Record<string, string> = {
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

const ACTION_VERBS: Record<string, string> = {
  remember: "stored",
  recall: "searched",
  forget: "deleted",
  list_memories: "browsed",
};

function getAgentColor(agentId: string | null): string {
  if (!agentId) return "#374151";
  const id = agentId.toLowerCase();
  for (const key of Object.keys(AGENT_COLORS)) {
    if (id.includes(key)) return AGENT_COLORS[key];
  }
  return "#374151";
}

function getAgentName(agentId: string | null): string {
  if (!agentId) return "Unknown";
  const id = agentId.toLowerCase();
  for (const key of Object.keys(AGENT_NAMES)) {
    if (id.includes(key)) return AGENT_NAMES[key];
  }
  return agentId;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}

interface ActivityFeedProps {
  activities: Activity[];
  isDark: boolean;
}

export default function ActivityFeed({
  activities,
  isDark,
}: ActivityFeedProps) {
  const sorted = [...activities]
    .sort((a, b) => {
      const da = new Date(
        a.created_at + (a.created_at.endsWith("Z") ? "" : "Z"),
      );
      const db = new Date(
        b.created_at + (b.created_at.endsWith("Z") ? "" : "Z"),
      );
      return db.getTime() - da.getTime();
    })
    .slice(0, 20);

  if (sorted.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          gap: 8,
          color: isDark ? "#64748b" : "#94a3b8",
        }}
      >
        <div style={{ fontSize: 30, opacity: 0.5 }}>&#128202;</div>
        <div style={{ fontSize: 13 }}>No activity yet</div>
        <div style={{ fontSize: 11 }}>
          Agent actions will appear here as they happen
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px" }}>
      {sorted.map((act, i) => {
        const color = getAgentColor(act.agent_id);
        return (
          <div
            key={act.id || i}
            style={{
              borderLeft: `2px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              paddingLeft: 12,
              position: "relative",
              paddingTop: 4,
              paddingBottom: 4,
              marginTop: i > 0 ? 12 : 0,
            }}
          >
            {/* Timeline dot */}
            <div
              style={{
                position: "absolute",
                left: -5,
                top: 10,
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: color,
              }}
            />
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{ fontSize: 11, fontWeight: 500, color }}
              >
                {getAgentName(act.agent_id)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                {ACTION_VERBS[act.action] || act.action}
              </span>
              {act.target_key && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily:
                      "'SF Mono', Monaco, 'Cascadia Code', monospace",
                    color: isDark ? "#cbd5e1" : "#475569",
                  }}
                >
                  {act.target_key}
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  color: isDark ? "#475569" : "#94a3b8",
                  marginLeft: "auto",
                }}
              >
                {timeAgo(act.created_at)}
              </span>
            </div>
            {act.detail && (
              <div
                style={{
                  fontSize: 11,
                  color: isDark ? "#64748b" : "#94a3b8",
                  marginTop: 2,
                }}
              >
                {act.detail.length > 100
                  ? act.detail.slice(0, 100) + "..."
                  : act.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
