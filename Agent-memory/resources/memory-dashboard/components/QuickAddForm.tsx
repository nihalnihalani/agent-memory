import React, { useState } from "react";

const MEMORY_TYPES = ["decision", "preference", "task", "snippet", "note"];

const TYPE_COLORS: Record<string, string> = {
  decision: "#3B82F6",
  preference: "#8B5CF6",
  task: "#F59E0B",
  snippet: "#10B981",
  note: "#6B7280",
};

interface QuickAddFormProps {
  isDark: boolean;
  onAdd: (key: string, value: string, type: string) => Promise<void>;
  onClose: () => void;
}

export default function QuickAddForm({
  isDark,
  onAdd,
  onClose,
}: QuickAddFormProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("note");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const borderColor = isDark ? "#334155" : "#e2e8f0";
  const inputBg = isDark ? "#1e293b" : "#f1f5f9";
  const textColor = isDark ? "#e2e8f0" : "#1e293b";
  const mutedColor = isDark ? "#94a3b8" : "#64748b";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) return;
    setIsSubmitting(true);
    try {
      await onAdd(key.trim(), value.trim(), type);
      setKey("");
      setValue("");
      setType("note");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: inputBg,
    border: `1px solid ${borderColor}`,
    color: textColor,
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6,
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s ease",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "10px 12px",
        borderBottom: `1px solid ${borderColor}`,
        background: isDark ? "rgba(30,41,59,0.5)" : "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: textColor,
          }}
        >
          Add Memory
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: mutedColor,
            cursor: "pointer",
            fontSize: 14,
            padding: 2,
            lineHeight: 1,
            fontFamily: "inherit",
          }}
        >
          &times;
        </button>
      </div>

      {/* Key input */}
      <input
        type="text"
        placeholder="Memory key (e.g. preferred-framework)"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{ ...inputStyle, marginBottom: 6 }}
      />

      {/* Value textarea */}
      <textarea
        placeholder="Memory value (e.g. Use React with TypeScript for all frontend projects)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        style={{
          ...inputStyle,
          marginBottom: 6,
          resize: "vertical",
          minHeight: 40,
        }}
      />

      {/* Type selector + Submit row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{
            ...inputStyle,
            width: "auto",
            flex: "0 0 auto",
            paddingRight: 24,
            appearance: "auto" as any,
            cursor: "pointer",
          }}
        >
          {MEMORY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>

        {/* Color preview dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: TYPE_COLORS[type] || "#6B7280",
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1 }} />

        <button
          type="submit"
          disabled={!key.trim() || !value.trim() || isSubmitting}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            color: "#e2e8f0",
            background:
              !key.trim() || !value.trim() || isSubmitting
                ? isDark
                  ? "#334155"
                  : "#cbd5e1"
                : "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
            border: "none",
            cursor:
              !key.trim() || !value.trim() || isSubmitting
                ? "not-allowed"
                : "pointer",
            transition: "all 0.2s ease",
            fontFamily: "inherit",
            opacity: !key.trim() || !value.trim() || isSubmitting ? 0.5 : 1,
          }}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
