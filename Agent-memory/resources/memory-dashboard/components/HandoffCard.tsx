import React, { useState } from "react";
import type { Handoff } from "../types";
import {
  getAgentColor,
  getAgentName,
  timeAgo,
  HANDOFF_STATUS_COLORS,
} from "../utils";

interface HandoffCardProps {
  handoff: Handoff;
  isDark: boolean;
  onPickup?: (id: number) => void;
}

export default function HandoffCard({
  handoff,
  isDark,
  onPickup,
}: HandoffCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fromColor = getAgentColor(handoff.from_agent);
  const toColor = handoff.picked_up_by
    ? getAgentColor(handoff.picked_up_by)
    : handoff.to_agent
      ? getAgentColor(handoff.to_agent)
      : "#6B7280";
  const statusColor = HANDOFF_STATUS_COLORS[handoff.status] || "#6B7280";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: 8,
        padding: 12,
        background: isHovered
          ? isDark
            ? "#1e293b"
            : "#f1f5f9"
          : isDark
            ? "rgba(30,41,59,0.5)"
            : "#ffffff",
        border: `1px solid ${isDark ? (isHovered ? "#64748b" : "#334155") : isHovered ? "#cbd5e1" : "#e2e8f0"}`,
        transition: "all 0.2s ease",
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      {/* Agent flow: From → To */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: fromColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: fromColor,
          }}
        >
          {getAgentName(handoff.from_agent)}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isDark ? "#475569" : "#94a3b8"}
          strokeWidth="2"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: toColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: toColor,
          }}
        >
          {handoff.picked_up_by
            ? getAgentName(handoff.picked_up_by)
            : handoff.to_agent
              ? getAgentName(handoff.to_agent)
              : "Any agent"}
        </span>
        <div style={{ flex: "1 1 0%" }} />
        <span
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 9999,
            fontWeight: 500,
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
            backgroundColor: statusColor + "22",
            color: statusColor,
          }}
        >
          {handoff.status === "in_progress" ? "active" : handoff.status}
        </span>
      </div>

      {/* Summary */}
      <div
        style={{
          fontSize: 11,
          color: isDark ? "#e2e8f0" : "#1e293b",
          marginBottom: 6,
          lineHeight: 1.625,
          fontWeight: 500,
        }}
      >
        {handoff.summary}
      </div>

      {/* Stuck reason */}
      {handoff.stuck_reason && (
        <div
          style={{
            fontSize: 10,
            color: "#f87171",
            marginBottom: 6,
            padding: "4px 8px",
            background: isDark ? "rgba(248,113,113,0.08)" : "rgba(248,113,113,0.06)",
            borderRadius: 6,
            borderLeft: "2px solid #f87171",
          }}
        >
          Stuck: {handoff.stuck_reason}
        </div>
      )}

      {/* Next steps */}
      <div
        style={{
          fontSize: 10,
          color: isDark ? "#94a3b8" : "#64748b",
          marginBottom: 6,
          padding: "4px 8px",
          background: isDark ? "rgba(15,23,42,0.5)" : "#f8fafc",
          borderRadius: 6,
          borderLeft: "2px solid #3B82F6",
          whiteSpace: "pre-wrap",
        }}
      >
        {handoff.next_steps}
      </div>

      {/* Context keys */}
      {handoff.context_keys && handoff.context_keys.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          {handoff.context_keys.map((key) => (
            <span
              key={key}
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 9999,
                background: isDark ? "#1e293b" : "#f1f5f9",
                border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                color: isDark ? "#94a3b8" : "#64748b",
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
              }}
            >
              {key}
            </span>
          ))}
        </div>
      )}

      {/* Bottom row: time + pickup button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 10, color: isDark ? "#475569" : "#94a3b8" }}>
          {timeAgo(handoff.created_at)}
        </span>
        {handoff.status === "pending" && onPickup && (
          <button
            onClick={() => onPickup(handoff.id)}
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              color: "#ffffff",
              background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
            }}
          >
            Pick up
          </button>
        )}
        {handoff.status === "completed" && handoff.completed_at && (
          <span style={{ fontSize: 10, color: "#22c55e" }}>
            Completed {timeAgo(handoff.completed_at)}
          </span>
        )}
      </div>
    </div>
  );
}
