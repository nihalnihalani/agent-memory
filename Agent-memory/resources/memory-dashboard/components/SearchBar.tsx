import React, { useState } from "react";

interface SearchBarProps {
  isDark: boolean;
  initialQuery?: string;
  onSearch: (query: string) => void;
}

export default function SearchBar({
  isDark,
  initialQuery = "",
  onSearch,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: "relative",
        padding: "8px 12px",
      }}
    >
      <input
        type="text"
        placeholder="Search memories..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          width: "100%",
          background: isDark ? "#1e293b" : "#f1f5f9",
          border: `1px solid ${isFocused ? "#8B5CF6" : isDark ? "#334155" : "#e2e8f0"}`,
          color: isDark ? "#e2e8f0" : "#1e293b",
          fontSize: 12,
          padding: "8px 36px 8px 12px",
          borderRadius: 8,
          outline: "none",
          transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          boxShadow: isFocused
            ? "0 0 0 3px rgba(139, 92, 246, 0.12), 0 0 20px rgba(139, 92, 246, 0.06)"
            : "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
      <button
        type="submit"
        style={{
          position: "absolute",
          right: 20,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          color: isDark ? "#64748b" : "#94a3b8",
          display: "flex",
          alignItems: "center",
        }}
      >
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
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>
    </form>
  );
}
