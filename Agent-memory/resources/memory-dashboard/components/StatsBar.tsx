import React from "react";
import type { Memory } from "../types";

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#f97316",
  "claude-ai": "#f97316",
  claude: "#f97316",
  chatgpt: "#22c55e",
  "cursor-vscode": "#3b82f6",
  cursor: "#3b82f6",
  gemini: "#a855f7",
  cline: "#06B6D4",
  copilot: "#6B7280",
};

function getAgentColor(agentId: string): string {
  const id = agentId.toLowerCase();
  for (const key of Object.keys(AGENT_COLORS)) {
    if (id.includes(key)) return AGENT_COLORS[key];
  }
  return "#374151";
}

const TOKENS_PER_RECALL = 750;
const COST_PER_MILLION = 3;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

interface StatsBarProps {
  memories: Memory[];
  total: number;
  isDark: boolean;
}

export default function StatsBar({ memories, total, isDark }: StatsBarProps) {
  const agents = new Map<string, string>();
  const typeCounts: Record<string, number> = {};
  let totalAccessCount = 0;

  for (const m of memories) {
    if (m.agent_id && !agents.has(m.agent_id)) {
      agents.set(m.agent_id, getAgentColor(m.agent_id));
    }
    if (m.type) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
    }
    totalAccessCount += m.access_count || 0;
  }

  const tokensSaved = totalAccessCount * TOKENS_PER_RECALL;
  const costSaved = (tokensSaved / 1_000_000) * COST_PER_MILLION;

  const textColor = isDark ? "#64748b" : "#94a3b8";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderBottom: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        background: isDark ? "#0f172a" : "#f8fafc",
        fontSize: 11,
        color: textColor,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 500 }}>
        {total} {total === 1 ? "memory" : "memories"}
      </span>
      <span style={{ opacity: 0.5 }}>&middot;</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {Array.from(agents.entries())
          .slice(0, 5)
          .map(([id, color]) => (
            <span
              key={id}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: color,
                display: "inline-block",
              }}
              title={id}
            />
          ))}
        <span>{agents.size} {agents.size === 1 ? "agent" : "agents"}</span>
      </span>
      {tokensSaved > 0 && (
        <>
          <span style={{ opacity: 0.5 }}>&middot;</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#10B981",
              fontWeight: 500,
            }}
            title={`Each memory recall saves ~${TOKENS_PER_RECALL} tokens vs re-explaining context. ${totalAccessCount} total recalls across ${memories.length} memories.`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            ~{formatTokens(tokensSaved)} tokens saved
            <span style={{ color: textColor, fontWeight: 400 }}>
              (${costSaved.toFixed(2)})
            </span>
          </span>
        </>
      )}
    </div>
  );
}
