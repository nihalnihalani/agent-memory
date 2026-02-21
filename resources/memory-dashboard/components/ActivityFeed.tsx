import React from "react";
import type { Activity } from "../types";
import {
  ACTION_VERBS,
  getAgentColor,
  getAgentName,
  timeAgo,
  fixTimezone,
} from "../utils";

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
      const da = new Date(fixTimezone(a.created_at));
      const db = new Date(fixTimezone(b.created_at));
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
