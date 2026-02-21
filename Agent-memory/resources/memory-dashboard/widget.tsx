import React from "react";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import type { Memory } from "./types";
import MemoryCard from "./components/MemoryCard";
import SearchBar from "./components/SearchBar";
import TypeFilter from "./components/TypeFilter";
import StatsBar from "./components/StatsBar";
import ActivityFeed from "./components/ActivityFeed";

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive agent memory dashboard with search, filtering, and AI analysis",
  props: z.object({
    memories: z.array(
      z.object({
        id: z.number(),
        key: z.string(),
        value: z.string(),
        type: z.string(),
        context: z.string().nullable(),
        agent_id: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        access_count: z.number(),
        tags: z.array(z.string()),
      }),
    ),
    activities: z
      .array(
        z.object({
          id: z.number(),
          agent_id: z.string(),
          action: z.string(),
          target_key: z.string().nullable(),
          detail: z.string().nullable(),
          created_at: z.string(),
        }),
      )
      .optional(),
    total: z.number(),
    query: z.string().optional(),
    action: z.string().optional(),
    memory: z.any().optional(),
    deletedKey: z.string().optional(),
    deletedType: z.string().optional(),
    agent: z.string().optional(),
  }),
};

function MemoryDashboardInner() {
  const { props, isPending, callTool, sendFollowUpMessage, state, setState, theme } =
    useWidget();

  const isDark = theme !== "light";

  const activeTab = (state?.activeTab as string) || "memories";
  const searchQuery = (state?.searchQuery as string) || "";
  const typeFilter = (state?.typeFilter as string | null) || null;

  // ---- Handlers ----

  const handleSearch = async (query: string) => {
    await setState((prev: any) => ({ ...prev, searchQuery: query }));
    await callTool("recall", { query, limit: 20 });
  };

  const handleDelete = async (key: string) => {
    await callTool("forget", { key });
  };

  const handleMemoryClick = (memory: Memory) => {
    sendFollowUpMessage(
      `Based on the memory "${memory.key}": ${memory.value}\n\nHow should this inform our next steps?`,
    );
  };

  const handleTypeFilter = async (type: string | null) => {
    await setState((prev: any) => ({ ...prev, typeFilter: type }));
    if (type) await callTool("list-memories", { type, limit: 50 });
    else await callTool("list-memories", { limit: 50 });
  };

  const handleTabSwitch = async (tab: string) => {
    await setState((prev: any) => ({ ...prev, activeTab: tab }));
  };

  const handleAnalyze = () => {
    sendFollowUpMessage(
      "Analyze the memories in my Agent Memory dashboard. Identify patterns, potential conflicts between decisions, and any gaps in the project context.",
    );
  };

  // ---- Styles ----

  const bg = isDark ? "#0f172a" : "#f8fafc";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const textPrimary = isDark ? "#e2e8f0" : "#1e293b";
  const textMuted = isDark ? "#94a3b8" : "#64748b";

  const containerStyle: React.CSSProperties = {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    lineHeight: 1.5,
    color: textPrimary,
    background: bg,
    backgroundImage: isDark
      ? "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, transparent 40%), linear-gradient(225deg, rgba(59,130,246,0.06) 10%, transparent 50%), linear-gradient(315deg, rgba(16,185,129,0.05) 0%, transparent 40%)"
      : "none",
    backgroundSize: "400% 400%",
    borderRadius: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    maxHeight: 600,
  };

  // ---- Loading state ----

  if (isPending) {
    return (
      <div style={containerStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>&#129504;</span>
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "-0.025em",
                background:
                  "linear-gradient(90deg, #c4b5fd, #8B5CF6, #3B82F6, #10B981)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Agent Memory
            </span>
          </div>
        </div>
        <div style={{ padding: "8px 12px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: isDark
                  ? "linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)"
                  : "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
                borderRadius: 8,
                height: 64,
                width: "100%",
                marginTop: i > 1 ? 8 : 0,
              }}
            />
          ))}
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  const memories = props?.memories || [];
  const activities = props?.activities || [];
  const total = props?.total ?? memories.length;

  // Filter by type client-side when typeFilter is set
  const filteredMemories = typeFilter
    ? memories.filter((m: Memory) => m.type === typeFilter)
    : memories;

  return (
    <div style={containerStyle}>
      {/* ---- Header ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${borderColor}`,
          background: bg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>&#129504;</span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "-0.025em",
              background:
                "linear-gradient(90deg, #c4b5fd, #8B5CF6, #3B82F6, #10B981, #8B5CF6, #c4b5fd)",
              backgroundSize: "300% 100%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Agent Memory
          </span>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              boxShadow: "0 0 6px rgba(34,197,94,0.6)",
            }}
            title="Live"
          />
        </div>
      </div>

      {/* ---- Stats ---- */}
      <StatsBar memories={memories} total={total} isDark={isDark} />

      {/* ---- Search ---- */}
      <SearchBar
        isDark={isDark}
        initialQuery={searchQuery}
        onSearch={handleSearch}
      />

      {/* ---- Type Filter ---- */}
      <TypeFilter
        activeType={typeFilter}
        isDark={isDark}
        onFilter={handleTypeFilter}
      />

      {/* ---- Tab Bar ---- */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${borderColor}`,
          background: bg,
        }}
      >
        {(["memories", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            style={{
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 500,
              color:
                activeTab === tab
                  ? textPrimary
                  : textMuted,
              borderBottom: `2px solid ${activeTab === tab ? "#8B5CF6" : "transparent"}`,
              background: "none",
              border: "none",
              borderBottomWidth: 2,
              borderBottomStyle: "solid",
              borderBottomColor:
                activeTab === tab ? "#8B5CF6" : "transparent",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              textTransform: "capitalize",
            }}
          >
            {tab === "memories" ? "Memories" : "Activity"}
          </button>
        ))}
      </div>

      {/* ---- Content ---- */}
      <div
        style={{
          flex: "1 1 0%",
          overflowY: "auto",
          maxHeight: 400,
        }}
      >
        {activeTab === "memories" ? (
          filteredMemories.length === 0 ? (
            <EmptyState isDark={isDark} onAction={sendFollowUpMessage} />
          ) : (
            <div style={{ padding: "8px 12px" }}>
              {filteredMemories.map((memory: Memory) => (
                <div key={memory.id} style={{ marginTop: 8 }}>
                  <MemoryCard
                    memory={memory}
                    isDark={isDark}
                    onDelete={handleDelete}
                    onMemoryClick={handleMemoryClick}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          <ActivityFeed activities={activities} isDark={isDark} />
        )}
      </div>

      {/* ---- Analyze Button ---- */}
      {memories.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${borderColor}`,
            background: bg,
          }}
        >
          <button
            onClick={handleAnalyze}
            style={{
              width: "100%",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              color: "#e2e8f0",
              background:
                "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(139,92,246,0.3)",
            }}
          >
            Ask AI to Analyze Memories
          </button>
        </div>
      )}

      {/* ---- Scrollbar & animation styles ---- */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? "#475569" : "#cbd5e1"}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${isDark ? "#64748b" : "#94a3b8"}; }
      `}</style>
    </div>
  );
}

function EmptyState({
  isDark,
  onAction,
}: {
  isDark: boolean;
  onAction: (msg: string) => void;
}) {
  const textColor = isDark ? "#64748b" : "#94a3b8";
  const prompts = [
    "Store a decision about our tech stack",
    "Remember my API key naming preference",
    "Save a code snippet for reuse",
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
        gap: 12,
        color: textColor,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 30, opacity: 0.5 }}>&#129504;</div>
      <div style={{ fontSize: 13 }}>No memories yet</div>
      <div style={{ fontSize: 11, textAlign: "center" }}>
        Memories stored by agents will appear here. Try one of these:
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          width: "100%",
          maxWidth: 280,
        }}
      >
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onAction(prompt)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 11,
              color: isDark ? "#94a3b8" : "#64748b",
              background: isDark ? "rgba(30,41,59,0.5)" : "#f1f5f9",
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              cursor: "pointer",
              transition: "all 0.2s ease",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MemoryDashboard() {
  return (
    <McpUseProvider autoSize>
      <MemoryDashboardInner />
    </McpUseProvider>
  );
}
