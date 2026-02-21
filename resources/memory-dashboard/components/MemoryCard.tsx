import React, { useState } from "react";
import type { Memory } from "../types";
import {
  TYPE_COLORS,
  getAgentColor,
  getAgentName,
  timeAgo,
  getFreshnessColor,
} from "../utils";

interface MemoryCardProps {
  memory: Memory;
  isDark: boolean;
  onDelete: (key: string) => void;
  onMemoryClick: (memory: Memory) => void;
}

export default function MemoryCard({
  memory,
  isDark,
  onDelete,
  onMemoryClick,
}: MemoryCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeColor = TYPE_COLORS[memory.type] || "#6B7280";
  const agentColor = getAgentColor(memory.agent_id);
  const freshnessColor = getFreshnessColor(memory);

  const cardStyle: React.CSSProperties = {
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
    cursor: "pointer",
    transform: isHovered ? "translateY(-1px)" : "none",
    boxShadow: isHovered
      ? isDark
        ? "0 4px 12px rgba(0,0,0,0.3)"
        : "0 4px 12px rgba(0,0,0,0.08)"
      : "none",
    borderLeft: `3px solid ${freshnessColor}`,
    position: "relative" as const,
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(memory.key);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setConfirmDelete(false);
      }}
      onClick={() => onMemoryClick(memory)}
    >
      {/* Top row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: agentColor,
            flexShrink: 0,
          }}
          title={getAgentName(memory.agent_id)}
        />
        <span
          style={{
            fontWeight: 600,
            fontSize: 11,
            color: isDark ? "#e2e8f0" : "#1e293b",
            flex: "1 1 0%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {memory.key}
        </span>
        {memory.type && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 9999,
              fontWeight: 500,
              textTransform: "uppercase" as const,
              letterSpacing: 0.5,
              backgroundColor: typeColor + "22",
              color: typeColor,
            }}
          >
            {memory.type}
          </span>
        )}
        <button
          onClick={handleDeleteClick}
          style={{
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.15s ease, color 0.15s ease",
            color: confirmDelete ? "#f87171" : isDark ? "#475569" : "#94a3b8",
            padding: 2,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 11,
            flexShrink: 0,
          }}
          title={confirmDelete ? "Click again to confirm delete" : "Delete"}
        >
          {confirmDelete ? (
            <span style={{ fontSize: 11, fontWeight: 500, color: "#f87171" }}>
              Confirm?
            </span>
          ) : (
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Value */}
      <div
        style={{
          fontSize: 11,
          color: isDark ? "#94a3b8" : "#64748b",
          marginBottom: 6,
          lineHeight: 1.625,
          overflow: isHovered ? "visible" : "hidden",
          textOverflow: isHovered ? "unset" : "ellipsis",
          whiteSpace: isHovered ? "normal" : "nowrap",
        }}
      >
        {isHovered ? memory.value : memory.value.length > 120 ? memory.value.slice(0, 120) + "..." : memory.value}
      </div>

      {/* Context (shown on hover) */}
      {isHovered && memory.context && (
        <div
          style={{
            fontSize: 10,
            color: isDark ? "#64748b" : "#94a3b8",
            marginBottom: 6,
            padding: "4px 8px",
            background: isDark ? "rgba(15,23,42,0.5)" : "#f8fafc",
            borderRadius: 6,
            borderLeft: `2px solid ${typeColor}`,
          }}
        >
          {memory.context}
        </div>
      )}

      {/* Bottom row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {(memory.tags || []).slice(0, 4).map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 11,
              padding: "1px 8px",
              borderRadius: 9999,
              background: isDark ? "#1e293b" : "#f1f5f9",
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              color: isDark ? "#94a3b8" : "#64748b",
            }}
          >
            {tag}
          </span>
        ))}
        {(memory.tags || []).length > 4 && (
          <span
            style={{ fontSize: 11, color: isDark ? "#475569" : "#94a3b8" }}
          >
            +{memory.tags.length - 4}
          </span>
        )}
        <div style={{ flex: "1 1 0%" }} />
        <span style={{ fontSize: 11, color: agentColor }}>
          {getAgentName(memory.agent_id)}
        </span>
        <span style={{ fontSize: 11, color: isDark ? "#475569" : "#94a3b8" }}>
          {timeAgo(memory.updated_at || memory.created_at)}
        </span>
      </div>
    </div>
  );
}
