import { describe, it, expect } from "vitest";
import { agentDisplayName, relativeTime, truncate, getAgentId } from "./helpers.js";

describe("agentDisplayName", () => {
  it("should map known agent names", () => {
    expect(agentDisplayName("claude-code")).toBe("Claude Code");
    expect(agentDisplayName("cursor-vscode")).toBe("Cursor");
    expect(agentDisplayName("ChatGPT")).toBe("ChatGPT");
    expect(agentDisplayName("claude-desktop")).toBe("Claude Desktop");
    expect(agentDisplayName("claude-ai")).toBe("Claude (web)");
    expect(agentDisplayName("Visual Studio Code")).toBe("VS Code");
    expect(agentDisplayName("Cline")).toBe("Cline");
    expect(agentDisplayName("Codex")).toBe("OpenAI Codex");
    expect(agentDisplayName("goose")).toBe("Goose");
    expect(agentDisplayName("gemini-cli-mcp-client")).toBe("Gemini CLI");
    expect(agentDisplayName("github-copilot-developer")).toBe("GitHub Copilot");
    expect(agentDisplayName("Roo-Code")).toBe("Roo Code");
    expect(agentDisplayName("Q-DEV-CLI")).toBe("Amazon Q");
    expect(agentDisplayName("unknown")).toBe("Unknown Agent");
  });

  it("should return the raw id for unmapped agents", () => {
    expect(agentDisplayName("my-custom-agent")).toBe("my-custom-agent");
    expect(agentDisplayName("")).toBe("");
  });
});

describe("relativeTime", () => {
  it("should return 'just now' for timestamps less than a minute ago", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("just now");
  });

  it("should return minutes for recent timestamps", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("should return hours for timestamps hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("should return days for timestamps days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoDaysAgo)).toBe("2d ago");
  });

  it("should return months for timestamps months ago", () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoMonthsAgo)).toBe("2mo ago");
  });

  it("should return years for timestamps over a year ago", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoYearsAgo)).toBe("2y ago");
  });

  it("should return 'just now' for future timestamps", () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(relativeTime(future)).toBe("just now");
  });

  it("should handle timestamps without trailing Z", () => {
    const ts = "2020-01-01T00:00:00";
    const result = relativeTime(ts);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/\d+[ymd]|ago|just now/);
  });
});

describe("truncate", () => {
  it("should return text unchanged if within maxLen", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should truncate and add ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("should return text unchanged if exactly maxLen", () => {
    expect(truncate("abc", 3)).toBe("abc");
  });

  it("should handle empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("getAgentId", () => {
  it("should extract agent id from _meta.clientInfo.name", () => {
    const ctx = { _meta: { clientInfo: { name: "claude-code" } } };
    expect(getAgentId(ctx)).toBe("claude-code");
  });

  it("should extract agent id from meta.clientInfo.name", () => {
    const ctx = { meta: { clientInfo: { name: "cursor-vscode" } } };
    expect(getAgentId(ctx)).toBe("cursor-vscode");
  });

  it("should return 'unknown' when no context provided", () => {
    expect(getAgentId(null)).toBe("unknown");
    expect(getAgentId(undefined)).toBe("unknown");
    expect(getAgentId({})).toBe("unknown");
  });

  it("should prefer _meta over meta", () => {
    const ctx = {
      _meta: { clientInfo: { name: "preferred" } },
      meta: { clientInfo: { name: "fallback" } },
    };
    expect(getAgentId(ctx)).toBe("preferred");
  });

  it("should truncate very long agent ids", () => {
    const longName = "a".repeat(300);
    const ctx = { _meta: { clientInfo: { name: longName } } };
    const result = getAgentId(ctx);
    expect(result.length).toBe(200);
  });

  it("should return 'unknown' for non-string name", () => {
    const ctx = { _meta: { clientInfo: { name: 12345 } } };
    expect(getAgentId(ctx)).toBe("unknown");
  });
});
