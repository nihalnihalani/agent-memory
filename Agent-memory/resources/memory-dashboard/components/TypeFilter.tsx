import React from "react";

const TYPES = [
  { label: "All", value: null },
  { label: "Decisions", value: "decision", color: "#3B82F6" },
  { label: "Prefs", value: "preference", color: "#8B5CF6" },
  { label: "Tasks", value: "task", color: "#F59E0B" },
  { label: "Snippets", value: "snippet", color: "#10B981" },
  { label: "Notes", value: "note", color: "#6B7280" },
];

interface TypeFilterProps {
  activeType: string | null;
  isDark: boolean;
  onFilter: (type: string | null) => void;
}

export default function TypeFilter({
  activeType,
  isDark,
  onFilter,
}: TypeFilterProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 12px",
        borderBottom: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
        background: isDark ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.5)",
        overflowX: "auto",
      }}
    >
      {TYPES.map((t) => {
        const isActive =
          (t.value === null && activeType === null) ||
          t.value === activeType;
        return (
          <button
            key={t.label}
            onClick={() => onFilter(t.value)}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              color: isActive
                ? isDark
                  ? "#e2e8f0"
                  : "#1e293b"
                : isDark
                  ? "#94a3b8"
                  : "#64748b",
              background: isActive
                ? t.color
                  ? t.color + "22"
                  : isDark
                    ? "#334155"
                    : "#e2e8f0"
                : "transparent",
              border: isActive && t.color
                ? `1px solid ${t.color}44`
                : "1px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
              fontWeight: isActive ? 500 : 400,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
