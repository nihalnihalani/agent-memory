import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import type { Memory, Activity, Handoff, WidgetProps } from "./types";
import MemoryCard from "./components/MemoryCard";
import HandoffCard from "./components/HandoffCard";
import SearchBar from "./components/SearchBar";
import TypeFilter from "./components/TypeFilter";
import StatsBar from "./components/StatsBar";
import ActivityFeed from "./components/ActivityFeed";
import QuickAddForm from "./components/QuickAddForm";
import { getAgentName, getAgentColor } from "./utils";

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
    ).optional().default([]),
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
    total: z.number().optional().default(0),
    query: z.string().optional(),
    action: z.string().optional(),
    memory: z.any().optional(),
    handoff: z.any().optional(),
    contextMemories: z.array(z.any()).optional(),
    decisions: z.array(z.any()).optional(),
    preferences: z.array(z.any()).optional(),
  }),
};

function MemoryDashboardInner() {
  // ═══════════════════════════════════════════════════════════
  // useWidget() — core hook for props, state, and messaging
  // ═══════════════════════════════════════════════════════════
  const { props, isPending, sendFollowUpMessage, state, setState, theme } =
    useWidget();

  const isDark = theme !== "light";

  // ═══════════════════════════════════════════════════════════
  // useCallTool() — dedicated hooks per tool with loading states
  // ═══════════════════════════════════════════════════════════
  const {
    callTool: callListMemories,
    callToolAsync: listMemoriesAsync,
    isPending: isListingMemories,
  } = useCallTool<{ limit?: number; type?: string; tags?: string[]; offset?: number }>("list-memories");

  const {
    callTool: callRecall,
    callToolAsync: recallAsync,
    isPending: isSearching,
  } = useCallTool<{ query: string; limit?: number; tags?: string[] }>("recall");

  const {
    callTool: callRemember,
    callToolAsync: rememberAsync,
    isPending: isRemembering,
  } = useCallTool<{ key: string; value: string; type?: string; tags?: string[]; context?: string }>("remember");

  const {
    callToolAsync: forgetAsync,
    isPending: isForgetting,
  } = useCallTool<{ key: string }>("forget");

  const {
    callTool: callPickup,
    isPending: isPickingUp,
  } = useCallTool<{ handoff_id?: number }>("pickup");

  // ═══════════════════════════════════════════════════════════
  // setState() — persistent widget state across interactions
  // ═══════════════════════════════════════════════════════════
  const activeTab = (state?.activeTab as string) || "memories";
  const searchQuery = (state?.searchQuery as string) || "";
  const typeFilter = (state?.typeFilter as string | null) || null;
  const showAddForm = (state?.showAddForm as boolean) || false;
  const viewMode = (state?.viewMode as string) || "cards";
  const sortBy = (state?.sortBy as string) || "updated";
  const selectedIds = (state?.selectedIds as number[]) || [];
  const editingId = (state?.editingId as number | null) || null;
  const editValue = (state?.editValue as string) || "";
  const lastRefresh = (state?.lastRefresh as string) || "";

  // ═══════════════════════════════════════════════════════════
  // Local React state — optimistic updates & accumulated data
  // ═══════════════════════════════════════════════════════════
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: string }>>([]);

  // ═══════════════════════════════════════════════════════════
  // Helper to hydrate state from a tool result's structuredContent
  // ═══════════════════════════════════════════════════════════
  const hydrateFromResult = useCallback((result: any) => {
    const sc = result?.structuredContent;
    if (!sc) return;
    if (sc.memories) {
      setAllMemories(sc.memories);
      setTotalCount(sc.total ?? sc.memories.length);
      setHasLoaded(true);
    }
    if (sc.activities) {
      setAllActivities(sc.activities);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Auto-load on mount — callToolAsync to directly hydrate state
  // ═══════════════════════════════════════════════════════════
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      listMemoriesAsync({ limit: 50 })
        .then(hydrateFromResult)
        .catch(() => {});
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Merge incoming props into accumulated local state
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!props) return;
    const p = props as unknown as WidgetProps;

    // Full list updates (from list-memories or recall)
    if (p.memories && p.memories.length > 0) {
      setAllMemories(p.memories);
      setTotalCount(p.total ?? p.memories.length);
      setHasLoaded(true);
    }
    if (p.memories && p.memories.length === 0 && p.total === 0 && !p.action) {
      setAllMemories([]);
      setTotalCount(0);
      setHasLoaded(true);
    }

    if (p.activities) {
      setAllActivities(p.activities);
    }

    // Optimistic merge for single-memory actions
    if (p.action === "created" && p.memory) {
      const mem = p.memory as Memory;
      setAllMemories(prev => [mem, ...prev.filter(m => m.id !== mem.id)]);
      setTotalCount(prev => prev + 1);
      setHasLoaded(true);
      addToast(`Stored "${mem.key}"`, "success");
    }

    if ((p.action === "updated" || p.action === "conflict") && p.memory) {
      const mem = p.memory as Memory;
      setAllMemories(prev => prev.map(m => m.id === mem.id ? mem : m));
      setHasLoaded(true);
      addToast(
        p.action === "conflict" ? `Conflict on "${mem.key}" — updated` : `Updated "${mem.key}"`,
        p.action === "conflict" ? "warning" : "success"
      );
    }

    if (p.action === "deleted" && p.memory) {
      const mem = p.memory as Memory;
      setAllMemories(prev => prev.filter(m => m.id !== mem.id));
      setTotalCount(prev => Math.max(0, prev - 1));
      setHasLoaded(true);
      setDeletingKey(null);
      addToast(`Deleted "${mem.key}"`, "info");
    }

    // Update last refresh timestamp via setState
    setState((prev: any) => ({ ...prev, lastRefresh: new Date().toISOString() }));
  }, [props]);

  // ═══════════════════════════════════════════════════════════
  // Auto-refresh polling — silent background updates every 15s
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!hasLoaded) return;
    const interval = setInterval(() => {
      listMemoriesAsync({ limit: 50 })
        .then(hydrateFromResult)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [hasLoaded]);

  // ═══════════════════════════════════════════════════════════
  // Toast notifications helper
  // ═══════════════════════════════════════════════════════════
  const addToast = useCallback((message: string, type: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // HANDLERS — useCallTool() for server mutations
  // ═══════════════════════════════════════════════════════════

  const handleSearch = async (query: string) => {
    await setState((prev: any) => ({ ...prev, searchQuery: query }));
    recallAsync({ query, limit: 20 })
      .then(hydrateFromResult)
      .catch(() => {});
  };

  const handleDelete = async (key: string) => {
    // Optimistic: remove from UI immediately
    setDeletingKey(key);
    setAllMemories(prev => prev.filter(m => m.key !== key));
    setTotalCount(prev => Math.max(0, prev - 1));

    try {
      await forgetAsync({ key });
    } catch {
      // Revert on failure — refresh full list
      listMemoriesAsync({ limit: 50 }).then(hydrateFromResult).catch(() => {});
      setDeletingKey(null);
      addToast(`Failed to delete "${key}"`, "error");
    }
  };

  const handleTypeFilter = async (type: string | null) => {
    await setState((prev: any) => ({ ...prev, typeFilter: type }));
    const args = type ? { type, limit: 50 } : { limit: 50 };
    listMemoriesAsync(args).then(hydrateFromResult).catch(() => {});
  };

  const handleTabSwitch = async (tab: string) => {
    await setState((prev: any) => ({ ...prev, activeTab: tab }));
  };

  const handleToggleAddForm = async () => {
    await setState((prev: any) => ({ ...prev, showAddForm: !prev?.showAddForm }));
  };

  const handleQuickAdd = async (key: string, value: string, type: string) => {
    try {
      const result = await rememberAsync({ key, value, type });
      const sc = result?.structuredContent;
      if (sc?.action === "created" && sc?.memory) {
        const mem = sc.memory as Memory;
        setAllMemories(prev => [mem, ...prev.filter(m => m.id !== mem.id)]);
        setTotalCount(prev => prev + 1);
        addToast(`Stored "${mem.key}"`, "success");
      }
      setState((prev: any) => ({ ...prev, showAddForm: false }));
    } catch {
      addToast("Failed to store memory", "error");
    }
  };

  const handlePickup = async (handoffId: number) => {
    callPickup({ handoff_id: handoffId }, {
      onError: () => addToast("Failed to pick up handoff", "error"),
    });
  };

  const handleRefresh = () => {
    listMemoriesAsync({ limit: 50 }).then(hydrateFromResult).catch(() => {});
    addToast("Refreshing...", "info");
  };

  // ═══════════════════════════════════════════════════════════
  // INLINE EDIT — callTool("remember") + setState for edit mode
  // ═══════════════════════════════════════════════════════════

  const handleStartEdit = async (memory: Memory) => {
    await setState((prev: any) => ({
      ...prev,
      editingId: memory.id,
      editValue: memory.value,
    }));
  };

  const handleSaveEdit = async (memory: Memory) => {
    const newValue = editValue || memory.value;
    if (newValue !== memory.value) {
      // Optimistic update
      setAllMemories(prev => prev.map(m =>
        m.id === memory.id ? { ...m, value: newValue } : m
      ));

      try {
        await rememberAsync({ key: memory.key, value: newValue, type: memory.type });
      } catch {
        // Revert
        setAllMemories(prev => prev.map(m =>
          m.id === memory.id ? { ...m, value: memory.value } : m
        ));
        addToast("Failed to save edit", "error");
      }
    }
    await setState((prev: any) => ({ ...prev, editingId: null, editValue: "" }));
  };

  const handleCancelEdit = async () => {
    await setState((prev: any) => ({ ...prev, editingId: null, editValue: "" }));
  };

  // ═══════════════════════════════════════════════════════════
  // HANDLERS — sendFollowUpMessage() for AI conversation
  // ═══════════════════════════════════════════════════════════

  const handleMemoryClick = (memory: Memory) => {
    sendFollowUpMessage(
      `Based on the memory "${memory.key}": ${memory.value}\n\nHow should this inform our next steps?`,
    );
  };

  const handleAskAboutMemory = (memory: Memory) => {
    sendFollowUpMessage(
      `Analyze this memory in detail:\n\n` +
      `**Key:** ${memory.key}\n` +
      `**Type:** ${memory.type}\n` +
      `**Value:** ${memory.value}\n` +
      (memory.context ? `**Context:** ${memory.context}\n` : "") +
      (memory.tags.length > 0 ? `**Tags:** ${memory.tags.join(", ")}\n` : "") +
      `\nIs this still relevant? Should it be updated? Are there any conflicts with other memories?`,
    );
  };

  // ═══════════════════════════════════════════════════════════
  // MULTI-SELECT — setState for selection, callTool for bulk ops
  // ═══════════════════════════════════════════════════════════

  const handleToggleSelect = async (id: number) => {
    const current = selectedIds;
    const updated = current.includes(id)
      ? current.filter((i: number) => i !== id)
      : [...current, id];
    await setState((prev: any) => ({ ...prev, selectedIds: updated }));
  };

  const handleSelectAll = async () => {
    const allIds = sortedMemories.map(m => m.id);
    const allSelected = allIds.every(id => selectedIds.includes(id));
    await setState((prev: any) => ({
      ...prev,
      selectedIds: allSelected ? [] : allIds,
    }));
  };

  const handleBulkDelete = async () => {
    const toDelete = allMemories.filter(m => selectedIds.includes(m.id));
    for (const mem of toDelete) {
      await forgetAsync({ key: mem.key });
    }
    await setState((prev: any) => ({ ...prev, selectedIds: [] }));
  };

  const handleBulkAnalyze = () => {
    const selected = allMemories.filter(m => selectedIds.includes(m.id));
    const summary = selected.map(m => `- [${m.type}] **${m.key}**: ${m.value}`).join("\n");
    sendFollowUpMessage(
      `Analyze these ${selected.length} memories together:\n\n${summary}\n\n` +
      `Look for: conflicts, redundancies, patterns, and suggest improvements.`,
    );
  };

  const handleBulkSummarize = () => {
    const selected = allMemories.filter(m => selectedIds.includes(m.id));
    const summary = selected.map(m => `- [${m.type}] ${m.key}: ${m.value}`).join("\n");
    sendFollowUpMessage(
      `Summarize these ${selected.length} memories into a concise project brief:\n\n${summary}`,
    );
  };

  // ═══════════════════════════════════════════════════════════
  // VIEW MODE & SORT — setState for persistent UI preferences
  // ═══════════════════════════════════════════════════════════

  const handleViewMode = async (mode: string) => {
    await setState((prev: any) => ({ ...prev, viewMode: mode }));
  };

  const handleSort = async (sort: string) => {
    await setState((prev: any) => ({ ...prev, sortBy: sort }));
  };

  // ═══════════════════════════════════════════════════════════
  // COMPUTED — sort + filter memories client-side
  // ═══════════════════════════════════════════════════════════

  const sortedMemories = useMemo(() => {
    let filtered = typeFilter
      ? allMemories.filter(m => m.type === typeFilter)
      : allMemories;

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "alpha":
          return a.key.localeCompare(b.key);
        case "type":
          return a.type.localeCompare(b.type);
        case "accessed":
          return b.access_count - a.access_count;
        case "updated":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
  }, [allMemories, typeFilter, sortBy]);

  // ═══════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════

  const bg = isDark ? "#0f172a" : "#f8fafc";
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
    maxHeight: 700,
    position: "relative",
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 500,
    color: active ? "#fff" : textMuted,
    background: active
      ? "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)"
      : isDark ? "#1e293b" : "#f1f5f9",
    border: `1px solid ${active ? "transparent" : borderColor}`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontFamily: "inherit",
  });

  // ═══════════════════════════════════════════════════════════
  // LOADING — only show skeleton before first data load
  // ═══════════════════════════════════════════════════════════

  if (isPending && !hasLoaded) {
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

  const p = props as unknown as WidgetProps;

  return (
    <div style={containerStyle}>
      {/* ════════ Toast Notifications ════════ */}
      {toasts.length > 0 && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 100, display: "flex", flexDirection: "column", gap: 4 }}>
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                color: "#fff",
                background: t.type === "success" ? "#22c55e"
                  : t.type === "error" ? "#ef4444"
                  : t.type === "warning" ? "#f59e0b"
                  : "#3b82f6",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                animation: "fadeIn 0.2s ease",
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* ════════ Header ════════ */}
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
              background: isListingMemories || isSearching ? "#f59e0b" : "#22c55e",
              display: "inline-block",
              boxShadow: isListingMemories || isSearching
                ? "0 0 6px rgba(245,158,11,0.6)"
                : "0 0 6px rgba(34,197,94,0.6)",
              transition: "all 0.3s ease",
            }}
            title={isListingMemories || isSearching ? "Syncing..." : "Live"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isListingMemories}
            title="Refresh memories"
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isDark ? "#1e293b" : "#f1f5f9",
              border: `1px solid ${borderColor}`,
              color: textMuted,
              cursor: isListingMemories ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              fontSize: 13,
              fontFamily: "inherit",
              opacity: isListingMemories ? 0.5 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: isListingMemories ? "spin 1s linear infinite" : "none" }}>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              <path d="M21 3v9h-9" />
            </svg>
          </button>
          {/* Add button */}
          <button
            onClick={handleToggleAddForm}
            title="Add a memory"
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: showAddForm
                ? "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)"
                : isDark
                  ? "#1e293b"
                  : "#f1f5f9",
              border: `1px solid ${showAddForm ? "transparent" : borderColor}`,
              color: showAddForm ? "#ffffff" : textMuted,
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1,
              fontFamily: "inherit",
            }}
          >
            {showAddForm ? "\u00D7" : "+"}
          </button>
        </div>
      </div>

      {/* ════════ Quick Add Form ════════ */}
      {showAddForm && (
        <QuickAddForm
          isDark={isDark}
          onAdd={handleQuickAdd}
          onClose={handleToggleAddForm}
        />
      )}

      {/* ════════ Stats ════════ */}
      <StatsBar memories={allMemories} total={totalCount} isDark={isDark} />

      {/* ════════ Search (uses callRecall) ════════ */}
      <SearchBar
        isDark={isDark}
        initialQuery={searchQuery}
        onSearch={handleSearch}
      />

      {/* ════════ Toolbar: Type Filter + View + Sort ════════ */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", flexWrap: "wrap" }}>
        <TypeFilter
          activeType={typeFilter}
          isDark={isDark}
          onFilter={handleTypeFilter}
          counts={allMemories.reduce((acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)}
        />
        <div style={{ flex: 1 }} />

        {/* View mode — setState */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["cards", "list", "compact"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => handleViewMode(mode)}
              title={mode}
              style={btnStyle(viewMode === mode)}
            >
              {mode === "cards" ? "\u2587" : mode === "list" ? "\u2630" : "\u2581"}
            </button>
          ))}
        </div>

        {/* Sort — setState */}
        <select
          value={sortBy}
          onChange={e => handleSort(e.target.value)}
          style={{
            padding: "3px 6px",
            borderRadius: 6,
            fontSize: 10,
            color: textMuted,
            background: isDark ? "#1e293b" : "#f1f5f9",
            border: `1px solid ${borderColor}`,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <option value="updated">Recent</option>
          <option value="created">Newest</option>
          <option value="alpha">A-Z</option>
          <option value="type">Type</option>
          <option value="accessed">Most Used</option>
        </select>
      </div>

      {/* ════════ Bulk Actions Bar — shown when items selected ════════ */}
      {selectedIds.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: isDark ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.06)",
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "#8B5CF6" }}>
            {selectedIds.length} selected
          </span>
          <div style={{ flex: 1 }} />
          {/* sendFollowUpMessage for AI analysis */}
          <button onClick={handleBulkSummarize} style={btnStyle(false)}>
            Summarize
          </button>
          <button onClick={handleBulkAnalyze} style={btnStyle(false)}>
            Analyze
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isForgetting}
            style={{
              ...btnStyle(false),
              color: "#ef4444",
              borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            {isForgetting ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => setState((prev: any) => ({ ...prev, selectedIds: [] }))}
            style={btnStyle(false)}
          >
            Clear
          </button>
        </div>
      )}

      {/* ════════ Tab Bar ════════ */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${borderColor}`,
          background: bg,
        }}
      >
        {(["memories", "handoffs", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            style={{
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 500,
              color: activeTab === tab ? textPrimary : textMuted,
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: `2px solid ${activeTab === tab ? "#8B5CF6" : "transparent"}`,
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
            }}
          >
            {tab === "memories"
              ? `Memories${totalCount > 0 ? ` (${totalCount})` : ""}`
              : tab === "handoffs"
                ? "Handoffs"
                : `Activity${allActivities.length > 0 ? ` (${allActivities.length})` : ""}`
            }
          </button>
        ))}
      </div>

      {/* ════════ Handoff Action Banner ════════ */}
      {p?.action && p.action.startsWith("handoff_") && p.handoff && (
        <HandoffBanner action={p.action} handoff={p.handoff as Handoff} isDark={isDark} />
      )}

      {/* ════════ Content ════════ */}
      <div
        style={{
          flex: "1 1 0%",
          overflowY: "auto",
          maxHeight: 400,
        }}
      >
        {activeTab === "memories" ? (
          sortedMemories.length === 0 ? (
            <EmptyState isDark={isDark} onAction={sendFollowUpMessage} />
          ) : (
            <div style={{ padding: "8px 12px" }}>
              {/* Select all toggle */}
              {sortedMemories.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={sortedMemories.every(m => selectedIds.includes(m.id))}
                    onChange={handleSelectAll}
                    style={{ cursor: "pointer", accentColor: "#8B5CF6" }}
                  />
                  <span style={{ fontSize: 10, color: textMuted }}>Select all</span>
                </div>
              )}

              {sortedMemories.map((memory: Memory) => (
                <div
                  key={memory.id}
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                    opacity: deletingKey === memory.key ? 0.4 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  {/* Multi-select checkbox — setState */}
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(memory.id)}
                    onChange={() => handleToggleSelect(memory.id)}
                    style={{
                      marginTop: viewMode === "compact" ? 4 : 12,
                      cursor: "pointer",
                      accentColor: "#8B5CF6",
                      flexShrink: 0,
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Inline edit mode */}
                    {editingId === memory.id ? (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: isDark ? "rgba(30,41,59,0.7)" : "#fff",
                          border: `2px solid #8B5CF6`,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>
                          Editing: {memory.key}
                        </div>
                        <textarea
                          value={editValue}
                          onChange={e => setState((prev: any) => ({ ...prev, editValue: e.target.value }))}
                          style={{
                            width: "100%",
                            minHeight: 60,
                            padding: 8,
                            borderRadius: 6,
                            fontSize: 11,
                            color: textPrimary,
                            background: isDark ? "#0f172a" : "#f8fafc",
                            border: `1px solid ${borderColor}`,
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button
                            onClick={() => handleSaveEdit(memory)}
                            disabled={isRemembering}
                            style={{
                              ...btnStyle(true),
                              opacity: isRemembering ? 0.6 : 1,
                            }}
                          >
                            {isRemembering ? "Saving..." : "Save"}
                          </button>
                          <button onClick={handleCancelEdit} style={btnStyle(false)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : viewMode === "compact" ? (
                      /* ════════ Compact view ════════ */
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: isDark ? "rgba(30,41,59,0.3)" : "#fff",
                          border: `1px solid ${borderColor}`,
                          cursor: "pointer",
                        }}
                        onClick={() => handleMemoryClick(memory)}
                      >
                        <span style={{
                          fontSize: 9, padding: "1px 4px", borderRadius: 4,
                          background: isDark ? "#1e293b" : "#f1f5f9",
                          color: textMuted, fontWeight: 500, textTransform: "uppercase",
                        }}>
                          {memory.type}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {memory.key}
                        </span>
                        <span style={{ fontSize: 10, color: textMuted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {memory.value}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(memory); }} style={{ ...btnStyle(false), fontSize: 9, padding: "2px 5px" }}>Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); handleAskAboutMemory(memory); }} style={{ ...btnStyle(false), fontSize: 9, padding: "2px 5px" }}>AI</button>
                      </div>
                    ) : viewMode === "list" ? (
                      /* ════════ List view ════════ */
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: isDark ? "rgba(30,41,59,0.4)" : "#fff",
                          border: `1px solid ${borderColor}`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 11, color: textPrimary, flex: 1 }}>
                            {memory.key}
                          </span>
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 9999,
                            textTransform: "uppercase", fontWeight: 500, letterSpacing: 0.5,
                            background: isDark ? "#1e293b" : "#f1f5f9",
                            color: textMuted,
                          }}>
                            {memory.type}
                          </span>
                          <button onClick={() => handleStartEdit(memory)} style={{ ...btnStyle(false), fontSize: 9 }}>Edit</button>
                          <button onClick={() => handleAskAboutMemory(memory)} style={{ ...btnStyle(false), fontSize: 9 }}>Ask AI</button>
                          <button onClick={() => handleDelete(memory.key)} style={{ ...btnStyle(false), fontSize: 9, color: "#ef4444" }}>Delete</button>
                        </div>
                        <div style={{ fontSize: 11, color: textMuted, marginTop: 4, cursor: "pointer" }} onClick={() => handleMemoryClick(memory)}>
                          {memory.value.length > 200 ? memory.value.slice(0, 200) + "..." : memory.value}
                        </div>
                      </div>
                    ) : (
                      /* ════════ Cards view (default) — with action buttons ════════ */
                      <div style={{ position: "relative" }}>
                        <MemoryCard
                          memory={memory}
                          isDark={isDark}
                          onDelete={handleDelete}
                          onMemoryClick={handleMemoryClick}
                        />
                        {/* Action buttons overlay */}
                        <div style={{
                          position: "absolute",
                          bottom: 6,
                          right: 6,
                          display: "flex",
                          gap: 4,
                        }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(memory); }}
                            title="Edit in place"
                            style={{ ...btnStyle(false), fontSize: 9, padding: "2px 6px" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAskAboutMemory(memory); }}
                            title="Ask AI about this memory"
                            style={{ ...btnStyle(false), fontSize: 9, padding: "2px 6px" }}
                          >
                            Ask AI
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "handoffs" ? (
          p?.handoff ? (
            <div style={{ padding: "8px 12px" }}>
              <HandoffCard
                handoff={p.handoff as Handoff}
                isDark={isDark}
                onPickup={handlePickup}
              />
              {isPickingUp && (
                <div style={{ textAlign: "center", padding: 8, fontSize: 11, color: "#8B5CF6" }}>
                  Picking up handoff...
                </div>
              )}
            </div>
          ) : (
            <HandoffEmptyState isDark={isDark} onAction={sendFollowUpMessage} />
          )
        ) : (
          <ActivityFeed activities={allActivities} isDark={isDark} />
        )}
      </div>

      {/* ════════ AI Conversation Prompts — sendFollowUpMessage ════════ */}
      <AskAboutMemories
        isDark={isDark}
        borderColor={borderColor}
        bg={bg}
        textMuted={textMuted}
        hasMemories={allMemories.length > 0}
        sendFollowUpMessage={sendFollowUpMessage}
        memoryCount={allMemories.length}
        typeBreakdown={allMemories.reduce((acc, m) => {
          acc[m.type] = (acc[m.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)}
      />

      {/* ════════ Last Refresh Indicator ════════ */}
      {lastRefresh && (
        <div style={{
          padding: "4px 12px",
          fontSize: 9,
          color: isDark ? "#475569" : "#cbd5e1",
          textAlign: "center",
          borderTop: `1px solid ${borderColor}`,
        }}>
          Last synced: {new Date(lastRefresh).toLocaleTimeString()}
          {isListingMemories && " (refreshing...)"}
        </div>
      )}

      {/* ════════ Scrollbar & animation styles ════════ */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? "#475569" : "#cbd5e1"}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${isDark ? "#64748b" : "#94a3b8"}; }
      `}</style>
    </div>
  );
}

function HandoffBanner({
  action,
  handoff,
  isDark,
}: {
  action: string;
  handoff: Handoff;
  isDark: boolean;
}) {
  const fromColor = getAgentColor(handoff.from_agent);
  const toName = handoff.picked_up_by
    ? getAgentName(handoff.picked_up_by)
    : handoff.to_agent
      ? getAgentName(handoff.to_agent)
      : "next agent";

  const config: Record<string, { bg: string; border: string; icon: string; label: string }> = {
    handoff_created: {
      bg: isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.06)",
      border: "#F59E0B",
      icon: "\u{1F91D}",
      label: `${getAgentName(handoff.from_agent)} handed off to ${toName}`,
    },
    handoff_picked_up: {
      bg: isDark ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.06)",
      border: "#3B82F6",
      icon: "\u{1F3C3}",
      label: `${toName} picked up handoff from ${getAgentName(handoff.from_agent)}`,
    },
    handoff_completed: {
      bg: isDark ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.06)",
      border: "#22c55e",
      icon: "\u2705",
      label: `Handoff #${handoff.id} completed`,
    },
  };

  const c = config[action];
  if (!c) return null;

  return (
    <div
      style={{
        margin: "8px 12px 0",
        padding: "8px 12px",
        borderRadius: 8,
        background: c.bg,
        borderLeft: `3px solid ${c.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 14 }}>{c.icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isDark ? "#e2e8f0" : "#1e293b",
          }}
        >
          {c.label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: isDark ? "#94a3b8" : "#64748b",
            marginTop: 2,
          }}
        >
          {handoff.summary.length > 100
            ? handoff.summary.slice(0, 100) + "..."
            : handoff.summary}
        </div>
      </div>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: fromColor,
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function HandoffEmptyState({
  isDark,
  onAction,
}: {
  isDark: boolean;
  onAction: (msg: string) => void;
}) {
  const textColor = isDark ? "#64748b" : "#94a3b8";

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
      <div style={{ fontSize: 30, opacity: 0.5 }}>{"\u{1F91D}"}</div>
      <div style={{ fontSize: 13 }}>No active handoffs</div>
      <div style={{ fontSize: 11, textAlign: "center" }}>
        When an agent gets stuck or finishes their part, they can hand off to the next agent.
      </div>
      <button
        onClick={() =>
          onAction(
            "Create a handoff for the next agent. Summarize what I've been working on and what needs to be done next.",
          )
        }
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          fontSize: 11,
          color: isDark ? "#94a3b8" : "#64748b",
          background: isDark ? "rgba(30,41,59,0.5)" : "#f1f5f9",
          border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
          cursor: "pointer",
          transition: "all 0.2s ease",
          fontFamily: "inherit",
        }}
      >
        Create a handoff
      </button>
    </div>
  );
}

const AI_PROMPTS = [
  {
    label: "Summarize Context",
    icon: "\u{1F4CB}",
    getMessage: (count: number, types: Record<string, number>) =>
      `I have ${count} memories stored (${Object.entries(types).map(([t, c]) => `${c} ${t}s`).join(", ")}). Summarize my project context and give a concise overview.`,
  },
  {
    label: "Find Conflicts",
    icon: "\u26A0\uFE0F",
    getMessage: (count: number, types: Record<string, number>) =>
      `Review all ${count} of my stored memories. Are there any conflicts between decisions? Contradictions? Outdated preferences that need updating?`,
  },
  {
    label: "Identify Gaps",
    icon: "\u{1F50D}",
    getMessage: (count: number, types: Record<string, number>) => {
      const missing = [];
      if (!types.decision) missing.push("decisions");
      if (!types.preference) missing.push("preferences");
      if (!types.snippet) missing.push("code snippets");
      return `I have ${count} memories. ${missing.length > 0 ? `I'm missing: ${missing.join(", ")}. ` : ""}What context am I missing? What should I store to improve our workflow?`;
    },
  },
  {
    label: "Full Analysis",
    icon: "\u{1F9E0}",
    getMessage: (count: number, types: Record<string, number>) =>
      `Do a full analysis of all ${count} memories in my Agent Memory dashboard. Identify: (1) patterns across decisions, (2) potential conflicts, (3) gaps in context, (4) memories that might be stale. Provide actionable recommendations.`,
  },
];

function AskAboutMemories({
  isDark,
  borderColor,
  bg,
  textMuted,
  hasMemories,
  sendFollowUpMessage,
  memoryCount,
  typeBreakdown,
}: {
  isDark: boolean;
  borderColor: string;
  bg: string;
  textMuted: string;
  hasMemories: boolean;
  sendFollowUpMessage: (msg: string) => void;
  memoryCount: number;
  typeBreakdown: Record<string, number>;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderTop: `1px solid ${borderColor}`,
        background: bg,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase" as const,
          letterSpacing: 0.5,
          color: textMuted,
          marginBottom: 6,
        }}
      >
        Ask AI About My Memories
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {AI_PROMPTS.map((p) => (
          <button
            key={p.label}
            onClick={() => sendFollowUpMessage(p.getMessage(memoryCount, typeBreakdown))}
            disabled={!hasMemories}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              color: hasMemories
                ? isDark
                  ? "#e2e8f0"
                  : "#1e293b"
                : textMuted,
              background: isDark ? "rgba(30,41,59,0.7)" : "#f1f5f9",
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
              cursor: hasMemories ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              opacity: hasMemories ? 1 : 0.5,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
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
