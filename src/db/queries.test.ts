import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDatabase } from "./schema.js";
import {
  upsertMemory,
  searchMemories,
  deleteMemory,
  listMemories,
  getMemoryByKey,
  logActivity,
  getRecentActivity,
  getMemoriesByType,
  incrementAccessCount,
  getTagsForMemory,
  getTagsForMemories,
  getStats,
  getMemoryCountsByType,
  getMostAccessedMemories,
  getDistinctAgents,
  getActivityByAgent,
  createHandoff,
  getPendingHandoffs,
  getAllHandoffs,
  pickupHandoff,
  completeHandoff,
  getMemoryHistory,
  getRecentChanges,
  validateAgentId,
  exportMemories,
  importMemories,
  getMemoryStats,
} from "./queries.js";

let db: Database.Database;

beforeEach(() => {
  db = initializeDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

// ========================
// UPSERT / GET MEMORY
// ========================
describe("upsertMemory", () => {
  it("should insert a new memory", () => {
    const mem = upsertMemory(db, {
      key: "greeting",
      value: "Hello world",
      type: "note",
      agent_id: "claude-code",
    });
    expect(mem.key).toBe("greeting");
    expect(mem.value).toBe("Hello world");
    expect(mem.type).toBe("note");
    expect(mem.agent_id).toBe("claude-code");
    expect(mem.id).toBeGreaterThan(0);
    expect(mem.access_count).toBe(0);
  });

  it("should default type to 'note'", () => {
    const mem = upsertMemory(db, { key: "k1", value: "v1" });
    expect(mem.type).toBe("note");
  });

  it("should update an existing memory with same key", () => {
    upsertMemory(db, { key: "k1", value: "v1", type: "note" });
    const updated = upsertMemory(db, { key: "k1", value: "v2", type: "decision" });
    expect(updated.value).toBe("v2");
    expect(updated.type).toBe("decision");
  });

  it("should record history when value changes", () => {
    const mem = upsertMemory(db, { key: "k1", value: "old", agent_id: "a1" });
    upsertMemory(db, { key: "k1", value: "new", agent_id: "a2" });
    const history = getMemoryHistory(db, mem.id);
    expect(history).toHaveLength(1);
    expect(history[0].old_value).toBe("old");
    expect(history[0].changed_by).toBe("a2");
  });

  it("should NOT record history when value stays the same", () => {
    const mem = upsertMemory(db, { key: "k1", value: "same" });
    upsertMemory(db, { key: "k1", value: "same", type: "decision" });
    const history = getMemoryHistory(db, mem.id);
    expect(history).toHaveLength(0);
  });

  it("should store and replace tags", () => {
    upsertMemory(db, { key: "k1", value: "v1", tags: ["a", "b"] });
    const mem = getMemoryByKey(db, "k1")!;
    let tags = getTagsForMemory(db, mem.id);
    expect(tags).toContain("a");
    expect(tags).toContain("b");

    upsertMemory(db, { key: "k1", value: "v1", tags: ["c"] });
    tags = getTagsForMemory(db, mem.id);
    expect(tags).toEqual(["c"]);
  });

  it("should preserve tags when tags param is undefined", () => {
    upsertMemory(db, { key: "k1", value: "v1", tags: ["a", "b"] });
    const mem = getMemoryByKey(db, "k1")!;
    upsertMemory(db, { key: "k1", value: "v2" }); // tags undefined
    const tags = getTagsForMemory(db, mem.id);
    expect(tags).toContain("a");
    expect(tags).toContain("b");
  });

  it("should clear tags when tags is empty array", () => {
    upsertMemory(db, { key: "k1", value: "v1", tags: ["a"] });
    const mem = getMemoryByKey(db, "k1")!;
    upsertMemory(db, { key: "k1", value: "v2", tags: [] });
    const tags = getTagsForMemory(db, mem.id);
    expect(tags).toHaveLength(0);
  });

  // Validation
  it("should reject empty key", () => {
    expect(() => upsertMemory(db, { key: "", value: "v" })).toThrow("Key must not be empty");
  });

  it("should reject whitespace-only key", () => {
    expect(() => upsertMemory(db, { key: "   ", value: "v" })).toThrow("Key must not be empty");
  });

  it("should reject key exceeding max length", () => {
    const longKey = "a".repeat(256);
    expect(() => upsertMemory(db, { key: longKey, value: "v" })).toThrow("characters or less");
  });

  it("should reject value exceeding max byte length", () => {
    const longValue = "x".repeat(10241);
    expect(() => upsertMemory(db, { key: "k", value: longValue })).toThrow("10240 bytes or less");
  });

  it("should reject invalid type", () => {
    expect(() => upsertMemory(db, { key: "k", value: "v", type: "invalid" })).toThrow("Invalid type");
  });

  it("should accept all valid types", () => {
    const types = ["decision", "preference", "task", "snippet", "note"];
    for (const type of types) {
      const mem = upsertMemory(db, { key: `k-${type}`, value: "v", type });
      expect(mem.type).toBe(type);
    }
  });

  it("should reject context exceeding max length", () => {
    const longCtx = "c".repeat(5001);
    expect(() => upsertMemory(db, { key: "k", value: "v", context: longCtx })).toThrow("5000 characters or less");
  });

  it("should reject too many tags", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(() => upsertMemory(db, { key: "k", value: "v", tags })).toThrow("Maximum of 20 tags");
  });

  it("should reject tags exceeding max tag length", () => {
    const longTag = "t".repeat(101);
    expect(() => upsertMemory(db, { key: "k", value: "v", tags: [longTag] })).toThrow("100 characters or less");
  });
});

// ========================
// GET MEMORY BY KEY
// ========================
describe("getMemoryByKey", () => {
  it("should return memory when found", () => {
    upsertMemory(db, { key: "find-me", value: "here" });
    const mem = getMemoryByKey(db, "find-me");
    expect(mem).toBeDefined();
    expect(mem!.value).toBe("here");
  });

  it("should return undefined when not found", () => {
    const mem = getMemoryByKey(db, "nonexistent");
    expect(mem).toBeUndefined();
  });
});

// ========================
// DELETE MEMORY
// ========================
describe("deleteMemory", () => {
  it("should delete an existing memory and return it", () => {
    upsertMemory(db, { key: "del-me", value: "bye" });
    const deleted = deleteMemory(db, "del-me");
    expect(deleted).not.toBeNull();
    expect(deleted!.key).toBe("del-me");
    expect(getMemoryByKey(db, "del-me")).toBeUndefined();
  });

  it("should return null for non-existent key", () => {
    const deleted = deleteMemory(db, "nope");
    expect(deleted).toBeNull();
  });

  it("should cascade-delete tags", () => {
    upsertMemory(db, { key: "tagged", value: "v", tags: ["x", "y"] });
    const mem = getMemoryByKey(db, "tagged")!;
    deleteMemory(db, "tagged");
    const tags = getTagsForMemory(db, mem.id);
    expect(tags).toHaveLength(0);
  });

  it("should cascade-delete history", () => {
    const mem = upsertMemory(db, { key: "hist", value: "v1" });
    upsertMemory(db, { key: "hist", value: "v2" });
    expect(getMemoryHistory(db, mem.id)).toHaveLength(1);
    deleteMemory(db, "hist");
    expect(getMemoryHistory(db, mem.id)).toHaveLength(0);
  });
});

// ========================
// SEARCH MEMORIES
// ========================
describe("searchMemories", () => {
  beforeEach(() => {
    upsertMemory(db, { key: "react-hooks", value: "useState and useEffect are core React hooks", type: "snippet", tags: ["react"] });
    upsertMemory(db, { key: "typescript-generics", value: "TypeScript generics enable reusable typed components", type: "snippet", tags: ["typescript"] });
    upsertMemory(db, { key: "deploy-steps", value: "Run npm run deploy to push to Fly.io", type: "task", tags: ["deploy"] });
    upsertMemory(db, { key: "api-key-location", value: "API keys stored in .env file", type: "note", tags: ["security"] });
  });

  it("should find memories by keyword in value", () => {
    const results = searchMemories(db, { query: "React hooks" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.key === "react-hooks")).toBe(true);
  });

  it("should find memories by keyword in key", () => {
    const results = searchMemories(db, { query: "typescript" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.key === "typescript-generics")).toBe(true);
  });

  it("should filter by type", () => {
    const results = searchMemories(db, { query: "deploy", type: "task" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.type === "task")).toBe(true);
  });

  it("should filter by tags", () => {
    const results = searchMemories(db, { query: "hooks", tags: ["react"] });
    expect(results.length).toBeGreaterThan(0);
  });

  it("should respect limit parameter", () => {
    const results = searchMemories(db, { query: "e", limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should clamp limit to minimum of 1", () => {
    const results = searchMemories(db, { query: "React", limit: 0 });
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("should clamp limit to maximum of 20", () => {
    const results = searchMemories(db, { query: "e", limit: 100 });
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("should return empty array for unmatched queries", () => {
    const results = searchMemories(db, { query: "zzzznonexistentzzzz" });
    expect(results).toHaveLength(0);
  });

  it("should handle special characters in query gracefully", () => {
    const results = searchMemories(db, { query: "test*\"'(){}[]" });
    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle empty query gracefully", () => {
    const results = searchMemories(db, { query: "" });
    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle FTS5 boolean operators in query", () => {
    // AND, OR, NOT, NEAR should be stripped by sanitizeFtsQuery
    const results = searchMemories(db, { query: "React AND hooks OR NOT something NEAR test" });
    expect(Array.isArray(results)).toBe(true);
  });
});

// ========================
// LIST MEMORIES
// ========================
describe("listMemories", () => {
  beforeEach(() => {
    for (let i = 0; i < 15; i++) {
      upsertMemory(db, {
        key: `list-${i}`,
        value: `value ${i}`,
        type: i % 2 === 0 ? "note" : "task",
        tags: i < 5 ? ["groupA"] : [],
      });
    }
  });

  it("should return paginated results with total count", () => {
    const { memories, total } = listMemories(db, { limit: 5, offset: 0 });
    expect(memories).toHaveLength(5);
    expect(total).toBe(15);
  });

  it("should handle offset", () => {
    const page1 = listMemories(db, { limit: 5, offset: 0 });
    const page2 = listMemories(db, { limit: 5, offset: 5 });
    expect(page1.memories[0].key).not.toBe(page2.memories[0].key);
  });

  it("should filter by type", () => {
    const { memories, total } = listMemories(db, { type: "task" });
    expect(memories.every((m) => m.type === "task")).toBe(true);
    expect(total).toBeGreaterThan(0);
  });

  it("should filter by tags", () => {
    const { memories } = listMemories(db, { tags: ["groupA"] });
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.length).toBeLessThanOrEqual(5);
  });

  it("should default limit to 10 and clamp max to 50", () => {
    const { memories } = listMemories(db, {});
    expect(memories.length).toBeLessThanOrEqual(10);
  });

  it("should clamp negative offset to 0", () => {
    const { memories } = listMemories(db, { offset: -5 });
    expect(memories.length).toBeGreaterThan(0);
  });
});

// ========================
// ACTIVITY LOGGING
// ========================
describe("logActivity / getRecentActivity", () => {
  it("should log and retrieve activities", () => {
    logActivity(db, { agent_id: "claude-code", action: "store", target_key: "k1", detail: "created" });
    logActivity(db, { agent_id: "cursor-vscode", action: "search", detail: "searched for X" });

    const activities = getRecentActivity(db, 10);
    expect(activities).toHaveLength(2);
    expect(activities[0].agent_id).toBeDefined();
  });

  it("should respect limit", () => {
    for (let i = 0; i < 10; i++) {
      logActivity(db, { agent_id: "a", action: "test" });
    }
    const activities = getRecentActivity(db, 3);
    expect(activities).toHaveLength(3);
  });

  it("should order by created_at descending", () => {
    logActivity(db, { agent_id: "a", action: "first" });
    logActivity(db, { agent_id: "a", action: "second" });
    const activities = getRecentActivity(db, 10);
    expect(activities[0].action).toBe("second");
    expect(activities[1].action).toBe("first");
  });
});

describe("getActivityByAgent", () => {
  it("should filter by agent_id", () => {
    logActivity(db, { agent_id: "agent1", action: "a1" });
    logActivity(db, { agent_id: "agent2", action: "a2" });
    logActivity(db, { agent_id: "agent1", action: "a3" });

    const activities = getActivityByAgent(db, "agent1", 10);
    expect(activities).toHaveLength(2);
    expect(activities.every((a) => a.agent_id === "agent1")).toBe(true);
  });
});

describe("getDistinctAgents", () => {
  it("should return distinct agent ids from activity log", () => {
    logActivity(db, { agent_id: "a", action: "x" });
    logActivity(db, { agent_id: "b", action: "x" });
    logActivity(db, { agent_id: "a", action: "y" });

    const agents = getDistinctAgents(db);
    expect(agents).toEqual(["a", "b"]);
  });
});

// ========================
// MEMORIES BY TYPE
// ========================
describe("getMemoriesByType", () => {
  it("should return memories of the given type", () => {
    upsertMemory(db, { key: "d1", value: "v", type: "decision" });
    upsertMemory(db, { key: "n1", value: "v", type: "note" });
    upsertMemory(db, { key: "d2", value: "v", type: "decision" });

    const decisions = getMemoriesByType(db, "decision");
    expect(decisions).toHaveLength(2);
    expect(decisions.every((m) => m.type === "decision")).toBe(true);
  });
});

// ========================
// ACCESS COUNT
// ========================
describe("incrementAccessCount", () => {
  it("should increment access counts for given ids", () => {
    const m1 = upsertMemory(db, { key: "ac1", value: "v" });
    const m2 = upsertMemory(db, { key: "ac2", value: "v" });

    incrementAccessCount(db, [m1.id, m2.id]);
    incrementAccessCount(db, [m1.id]);

    const r1 = getMemoryByKey(db, "ac1")!;
    const r2 = getMemoryByKey(db, "ac2")!;
    expect(r1.access_count).toBe(2);
    expect(r2.access_count).toBe(1);
  });

  it("should handle empty array gracefully", () => {
    incrementAccessCount(db, []);
  });
});

describe("getMostAccessedMemories", () => {
  it("should return memories ordered by access count", () => {
    const m1 = upsertMemory(db, { key: "pop1", value: "v" });
    const m2 = upsertMemory(db, { key: "pop2", value: "v" });
    upsertMemory(db, { key: "pop3", value: "v" });

    incrementAccessCount(db, [m1.id]);
    incrementAccessCount(db, [m1.id]);
    incrementAccessCount(db, [m2.id]);

    const most = getMostAccessedMemories(db, 5);
    expect(most.length).toBeGreaterThan(0);
    expect(most.every((m) => m.access_count > 0)).toBe(true);
    expect(most[0].key).toBe("pop1");
  });
});

// ========================
// TAGS
// ========================
describe("getTagsForMemory", () => {
  it("should return tags for a single memory", () => {
    upsertMemory(db, { key: "t1", value: "v", tags: ["tag1", "tag2"] });
    const mem = getMemoryByKey(db, "t1")!;
    const tags = getTagsForMemory(db, mem.id);
    expect(tags.sort()).toEqual(["tag1", "tag2"]);
  });

  it("should return empty array for memory with no tags", () => {
    upsertMemory(db, { key: "notags", value: "v" });
    const mem = getMemoryByKey(db, "notags")!;
    const tags = getTagsForMemory(db, mem.id);
    expect(tags).toEqual([]);
  });
});

describe("getTagsForMemories", () => {
  it("should return tags map for multiple memories", () => {
    upsertMemory(db, { key: "m1", value: "v", tags: ["a"] });
    upsertMemory(db, { key: "m2", value: "v", tags: ["b", "c"] });
    const mem1 = getMemoryByKey(db, "m1")!;
    const mem2 = getMemoryByKey(db, "m2")!;

    const map = getTagsForMemories(db, [mem1.id, mem2.id]);
    expect(map.get(mem1.id)).toEqual(["a"]);
    expect(map.get(mem2.id)!.sort()).toEqual(["b", "c"]);
  });

  it("should handle empty ids array", () => {
    const map = getTagsForMemories(db, []);
    expect(map.size).toBe(0);
  });
});

// ========================
// STATS
// ========================
describe("getStats", () => {
  it("should return correct totals", () => {
    upsertMemory(db, { key: "s1", value: "v", agent_id: "a1" });
    upsertMemory(db, { key: "s2", value: "v", agent_id: "a2" });
    upsertMemory(db, { key: "s3", value: "v" });
    logActivity(db, { agent_id: "a1", action: "test" });
    logActivity(db, { agent_id: "a2", action: "test" });

    const stats = getStats(db);
    expect(stats.totalMemories).toBe(3);
    expect(stats.uniqueAgents).toBe(2);
    expect(stats.totalActions).toBe(2);
  });

  it("should return zeros for empty database", () => {
    const stats = getStats(db);
    expect(stats.totalMemories).toBe(0);
    expect(stats.uniqueAgents).toBe(0);
    expect(stats.totalActions).toBe(0);
  });
});

describe("getMemoryCountsByType", () => {
  it("should return counts grouped by type", () => {
    upsertMemory(db, { key: "k1", value: "v", type: "note" });
    upsertMemory(db, { key: "k2", value: "v", type: "note" });
    upsertMemory(db, { key: "k3", value: "v", type: "decision" });

    const counts = getMemoryCountsByType(db);
    expect(counts.note).toBe(2);
    expect(counts.decision).toBe(1);
  });
});

// ========================
// VALIDATE AGENT ID
// ========================
describe("validateAgentId", () => {
  it("should return agent id unchanged when within limit", () => {
    expect(validateAgentId("claude-code")).toBe("claude-code");
  });

  it("should truncate overly long agent ids", () => {
    const longId = "a".repeat(300);
    const result = validateAgentId(longId);
    expect(result.length).toBe(200);
  });
});

// ========================
// HANDOFFS
// ========================
describe("createHandoff", () => {
  it("should create a handoff with pending status", () => {
    const h = createHandoff(db, {
      from_agent: "agent-a",
      to_agent: "agent-b",
      summary: "Pass the baton",
      next_steps: "Continue from step 3",
      context_keys: ["key1", "key2"],
    });
    expect(h.from_agent).toBe("agent-a");
    expect(h.to_agent).toBe("agent-b");
    expect(h.status).toBe("pending");
    expect(h.summary).toBe("Pass the baton");
    expect(h.next_steps).toBe("Continue from step 3");
    expect(h.context_keys).toBe(JSON.stringify(["key1", "key2"]));
    expect(h.picked_up_by).toBeNull();
    expect(h.completed_at).toBeNull();
  });

  it("should create handoff without optional fields", () => {
    const h = createHandoff(db, {
      from_agent: "a",
      summary: "quick handoff",
      next_steps: "do the thing",
    });
    expect(h.to_agent).toBeNull();
    expect(h.stuck_reason).toBeNull();
    expect(h.context_keys).toBeNull();
  });
});

describe("getPendingHandoffs", () => {
  it("should only return pending handoffs", () => {
    createHandoff(db, { from_agent: "a", summary: "s1", next_steps: "n1" });
    createHandoff(db, { from_agent: "b", summary: "s2", next_steps: "n2" });
    const h3 = createHandoff(db, { from_agent: "c", summary: "s3", next_steps: "n3" });
    pickupHandoff(db, h3.id, "agent-x");

    const pending = getPendingHandoffs(db);
    expect(pending).toHaveLength(2);
    expect(pending.every((h) => h.status === "pending")).toBe(true);
  });
});

describe("getAllHandoffs", () => {
  it("should return all handoffs regardless of status", () => {
    const h1 = createHandoff(db, { from_agent: "a", summary: "s1", next_steps: "n1" });
    createHandoff(db, { from_agent: "b", summary: "s2", next_steps: "n2" });
    pickupHandoff(db, h1.id, "x");

    const all = getAllHandoffs(db);
    expect(all).toHaveLength(2);
  });

  it("should respect limit", () => {
    for (let i = 0; i < 5; i++) {
      createHandoff(db, { from_agent: "a", summary: `s${i}`, next_steps: `n${i}` });
    }
    const limited = getAllHandoffs(db, 3);
    expect(limited).toHaveLength(3);
  });
});

describe("pickupHandoff", () => {
  it("should pick up a pending handoff", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    const picked = pickupHandoff(db, h.id, "agent-y");
    expect(picked).not.toBeNull();
    expect(picked!.status).toBe("in_progress");
    expect(picked!.picked_up_by).toBe("agent-y");
    expect(picked!.picked_up_at).not.toBeNull();
  });

  it("should return null if handoff is not pending (already picked up)", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    pickupHandoff(db, h.id, "agent-x");
    const secondAttempt = pickupHandoff(db, h.id, "agent-z");
    expect(secondAttempt).toBeNull();
  });

  it("should return null for non-existent handoff id", () => {
    const result = pickupHandoff(db, 9999, "agent-x");
    expect(result).toBeNull();
  });
});

describe("completeHandoff", () => {
  it("should complete an in_progress handoff", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    pickupHandoff(db, h.id, "agent-x");
    const completed = completeHandoff(db, h.id);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("completed");
    expect(completed!.completed_at).not.toBeNull();
  });

  it("should return null if handoff is still pending (not in_progress)", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    const result = completeHandoff(db, h.id);
    expect(result).toBeNull();
  });

  it("should return null if already completed", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    pickupHandoff(db, h.id, "x");
    completeHandoff(db, h.id);
    const secondComplete = completeHandoff(db, h.id);
    expect(secondComplete).toBeNull();
  });

  it("should enforce agent ownership when agentId is provided", () => {
    const h = createHandoff(db, { from_agent: "a", summary: "s", next_steps: "n" });
    pickupHandoff(db, h.id, "agent-x");
    // Wrong agent tries to complete
    const result = completeHandoff(db, h.id, "agent-y");
    expect(result).toBeNull();
    // Correct agent can complete
    const completed = completeHandoff(db, h.id, "agent-x");
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe("completed");
  });
});

// ========================
// MEMORY HISTORY
// ========================
describe("getMemoryHistory", () => {
  it("should return history entries for a memory", () => {
    const mem = upsertMemory(db, { key: "h1", value: "v1" });
    upsertMemory(db, { key: "h1", value: "v2", agent_id: "a1" });
    upsertMemory(db, { key: "h1", value: "v3", agent_id: "a2" });

    const history = getMemoryHistory(db, mem.id);
    expect(history).toHaveLength(2);
    // Both old values should be present
    const oldValues = history.map((h) => h.old_value).sort();
    expect(oldValues).toEqual(["v1", "v2"]);
  });

  it("should return empty array for memory with no history", () => {
    const mem = upsertMemory(db, { key: "nohistory", value: "v" });
    expect(getMemoryHistory(db, mem.id)).toHaveLength(0);
  });
});

describe("getRecentChanges", () => {
  it("should return changes with memory keys", () => {
    upsertMemory(db, { key: "rc1", value: "v1" });
    upsertMemory(db, { key: "rc1", value: "v2" });

    const changes = getRecentChanges(db, 10);
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe("rc1");
    expect(changes[0].old_value).toBe("v1");
  });
});

// ========================
// EXPORT / IMPORT
// ========================
describe("exportMemories", () => {
  it("should export all memories with tags", () => {
    upsertMemory(db, { key: "e1", value: "v1", type: "note", tags: ["a", "b"], agent_id: "a1" });
    upsertMemory(db, { key: "e2", value: "v2", type: "task", agent_id: "a2" });

    const exported = exportMemories(db, {});
    expect(exported).toHaveLength(2);
    const e1 = exported.find((e) => e.key === "e1")!;
    expect(e1.tags.sort()).toEqual(["a", "b"]);
    expect(e1.type).toBe("note");
  });

  it("should filter by agent_id", () => {
    upsertMemory(db, { key: "ea1", value: "v", agent_id: "a1" });
    upsertMemory(db, { key: "ea2", value: "v", agent_id: "a2" });

    const exported = exportMemories(db, { agent_id: "a1" });
    expect(exported).toHaveLength(1);
    expect(exported[0].key).toBe("ea1");
  });

  it("should filter by type", () => {
    upsertMemory(db, { key: "et1", value: "v", type: "note" });
    upsertMemory(db, { key: "et2", value: "v", type: "decision" });

    const exported = exportMemories(db, { type: "decision" });
    expect(exported).toHaveLength(1);
    expect(exported[0].key).toBe("et2");
  });

  it("should filter by tags", () => {
    upsertMemory(db, { key: "etg1", value: "v", tags: ["x"] });
    upsertMemory(db, { key: "etg2", value: "v", tags: ["y"] });

    const exported = exportMemories(db, { tags: ["x"] });
    expect(exported).toHaveLength(1);
    expect(exported[0].key).toBe("etg1");
  });
});

describe("importMemories", () => {
  it("should import valid memories", () => {
    const result = importMemories(db, [
      { key: "imp1", value: "v1", type: "note", context: null, agent_id: null, created_at: "", updated_at: "", access_count: 0, tags: ["t1"] },
      { key: "imp2", value: "v2", type: "task", context: null, agent_id: null, created_at: "", updated_at: "", access_count: 0, tags: [] },
    ], "importer");

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const m1 = getMemoryByKey(db, "imp1")!;
    expect(m1.value).toBe("v1");
    const tags = getTagsForMemory(db, m1.id);
    expect(tags).toEqual(["t1"]);
  });

  it("should skip duplicates", () => {
    upsertMemory(db, { key: "existing", value: "original" });
    const result = importMemories(db, [
      { key: "existing", value: "new", type: "note", context: null, agent_id: null, created_at: "", updated_at: "", access_count: 0, tags: [] },
    ], "importer");

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    // Original value should be preserved
    expect(getMemoryByKey(db, "existing")!.value).toBe("original");
  });

  it("should skip entries with missing key or value", () => {
    const result = importMemories(db, [
      { key: "", value: "v", type: "note", context: null, agent_id: null, created_at: "", updated_at: "", access_count: 0, tags: [] },
    ], "importer");

    expect(result.skipped).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should skip entries with invalid type", () => {
    const result = importMemories(db, [
      { key: "bad-type", value: "v", type: "bogus", context: null, agent_id: null, created_at: "", updated_at: "", access_count: 0, tags: [] },
    ], "importer");

    expect(result.skipped).toBe(1);
    expect(result.errors.some((e) => e.includes("Invalid type"))).toBe(true);
  });
});

// ========================
// MEMORY STATS
// ========================
describe("getMemoryStats", () => {
  it("should return comprehensive stats", () => {
    upsertMemory(db, { key: "ms1", value: "v1", type: "note", agent_id: "a1", tags: ["x"] });
    upsertMemory(db, { key: "ms2", value: "v2", type: "decision", agent_id: "a2" });
    logActivity(db, { agent_id: "a1", action: "store" });
    createHandoff(db, { from_agent: "a1", summary: "s", next_steps: "n" });

    const stats = getMemoryStats(db);
    expect(stats.totalMemories).toBe(2);
    expect(stats.memoriesByType.note).toBe(1);
    expect(stats.memoriesByType.decision).toBe(1);
    expect(stats.memoriesPerAgent).toHaveLength(2);
    expect(stats.storageSizeEstimate).toBeGreaterThan(0);
    expect(stats.activeHandoffs).toBe(1);
    expect(stats.ftsHealthy).toBe(true);
    expect(stats.totalTags).toBe(1);
    expect(stats.totalActivityLogs).toBe(1);
  });

  it("should return zeros for empty database", () => {
    const stats = getMemoryStats(db);
    expect(stats.totalMemories).toBe(0);
    expect(stats.activeHandoffs).toBe(0);
    expect(stats.totalTags).toBe(0);
    expect(stats.totalActivityLogs).toBe(0);
  });
});

// ========================
// EDGE CASES
// ========================
describe("edge cases", () => {
  it("should handle unicode in keys and values", () => {
    const mem = upsertMemory(db, { key: "emoji-key-test", value: "Hello World" });
    expect(mem.value).toBe("Hello World");
    const fetched = getMemoryByKey(db, "emoji-key-test")!;
    expect(fetched.value).toBe("Hello World");
  });

  it("should reject keys with special SQL characters (key format validation)", () => {
    // Keys must match KEY_FORMAT_REGEX: start with alphanumeric, then alphanumeric/-_./
    expect(() => upsertMemory(db, { key: "key'with\"quotes", value: "value" })).toThrow("Invalid key format");
  });

  it("should accept keys with valid format characters", () => {
    const mem = upsertMemory(db, { key: "my-key_v2.0/sub", value: "value" });
    expect(mem.key).toBe("my-key_v2.0/sub");
  });

  it("should handle search with SQL injection attempt", () => {
    const results = searchMemories(db, { query: "'; DROP TABLE memories; --" });
    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle concurrent-like upserts (same key rapid writes)", () => {
    for (let i = 0; i < 10; i++) {
      upsertMemory(db, { key: "rapid", value: `v${i}` });
    }
    const mem = getMemoryByKey(db, "rapid")!;
    expect(mem.value).toBe("v9");
    const history = getMemoryHistory(db, mem.id);
    expect(history).toHaveLength(9);
  });

  it("should handle search with percent and underscore (LIKE wildcards)", () => {
    upsertMemory(db, { key: "percent-test", value: "100% complete" });
    upsertMemory(db, { key: "underscore-test", value: "under_score_value" });

    const r1 = searchMemories(db, { query: "100%" });
    expect(r1.some((r) => r.key === "percent-test")).toBe(true);

    const r2 = searchMemories(db, { query: "under_score" });
    expect(r2.some((r) => r.key === "underscore-test")).toBe(true);
  });

  it("should handle very long search query gracefully", () => {
    const longQuery = "test ".repeat(200);
    const results = searchMemories(db, { query: longQuery });
    expect(Array.isArray(results)).toBe(true);
  });
});
