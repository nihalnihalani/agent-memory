import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const { fontFamily: monoFamily } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// ─── Grid config ───────────────────────────────────────────────────────────
// 4K canvas 3840x2160, 80px padding => 3680x2000 usable
// 6 columns x 4 rows, with 20px gap
const PADDING = 80;
const GAP = 20;
const COLS = 6;
const ROWS = 4;
const USABLE_W = 3840 - PADDING * 2; // 3680
const USABLE_H = 2160 - PADDING * 2; // 2000
const CELL_W = (USABLE_W - GAP * (COLS - 1)) / COLS; // ~596.67
const CELL_H = (USABLE_H - GAP * (ROWS - 1)) / ROWS; // ~485

// ─── Cell type ─────────────────────────────────────────────────────────────
interface BentoCell {
  id: string;
  row: number;      // 0-indexed
  col: number;      // 0-indexed
  rowSpan: number;
  colSpan: number;
  icon: string;
  label: string;
  stat: string;
  gradient: [string, string];
  accentColor: string;
  entranceDelay: number; // seconds
}

// ─── The 15 cells ──────────────────────────────────────────────────────────
const CELLS: BentoCell[] = [
  // HERO 1: Agent Memory — top-left 2x2
  {
    id: "agent-memory",
    row: 0,
    col: 0,
    rowSpan: 2,
    colSpan: 2,
    icon: "🧠",
    label: "Agent Memory",
    stat: "The shared brain for AI agents",
    gradient: ["#1a0533", "#0d1117"],
    accentColor: "#8B5CF6",
    entranceDelay: 0,
  },
  // Row 0, cols 2-5: four 1x1 cells
  {
    id: "mcp-tools",
    row: 0,
    col: 2,
    rowSpan: 1,
    colSpan: 1,
    icon: "🔧",
    label: "7 MCP Tools",
    stat: "remember · recall · forget · list · handoff · pickup · complete",
    gradient: ["#0d1a2e", "#0d1117"],
    accentColor: "#3B82F6",
    entranceDelay: 0.4,
  },
  {
    id: "fts5-search",
    row: 0,
    col: 3,
    rowSpan: 1,
    colSpan: 1,
    icon: "🔍",
    label: "FTS5 Search",
    stat: "Full-text with BM25 ranking",
    gradient: ["#0d1a2e", "#0d1117"],
    accentColor: "#3B82F6",
    entranceDelay: 0.8,
  },
  {
    id: "memory-types",
    row: 0,
    col: 4,
    rowSpan: 1,
    colSpan: 1,
    icon: "📦",
    label: "5 Memory Types",
    stat: "decision · preference · task · snippet · note",
    gradient: ["#1a0a2e", "#0d1117"],
    accentColor: "#8B5CF6",
    entranceDelay: 1.2,
  },
  {
    id: "token-savings",
    row: 0,
    col: 5,
    rowSpan: 1,
    colSpan: 1,
    icon: "⚡",
    label: "60% Fewer Tokens",
    stat: "Agents recall, not repeat",
    gradient: ["#062e1b", "#0d1117"],
    accentColor: "#10B981",
    entranceDelay: 1.6,
  },
  // Row 1, cols 2-5: four 1x1 cells
  {
    id: "sqlite-wal",
    row: 1,
    col: 2,
    rowSpan: 1,
    colSpan: 1,
    icon: "🗄️",
    label: "SQLite + WAL",
    stat: "Zero-config persistent database",
    gradient: ["#0a1a2e", "#0d1117"],
    accentColor: "#06B6D4",
    entranceDelay: 2.0,
  },
  {
    id: "react-dashboard",
    row: 1,
    col: 3,
    rowSpan: 1,
    colSpan: 1,
    icon: "📊",
    label: "React Dashboard",
    stat: "3 interactive view modes",
    gradient: ["#0a1a2e", "#0d1117"],
    accentColor: "#06B6D4",
    entranceDelay: 2.4,
  },
  {
    id: "universal-mcp",
    row: 1,
    col: 4,
    rowSpan: 1,
    colSpan: 2,
    icon: "🌐",
    label: "Universal MCP",
    stat: "Claude · ChatGPT · Cursor · VS Code",
    gradient: ["#1a0a2e", "#0d1117"],
    accentColor: "#8B5CF6",
    entranceDelay: 2.8,
  },
  // Row 2: six cells across
  {
    id: "live-resources",
    row: 2,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    icon: "📡",
    label: "5 Live Resources",
    stat: "context · activity · changelog · handoffs · by-key",
    gradient: ["#1e0a20", "#0d1117"],
    accentColor: "#EC4899",
    entranceDelay: 3.2,
  },
  {
    id: "composite-scoring",
    row: 2,
    col: 1,
    rowSpan: 1,
    colSpan: 1,
    icon: "🎯",
    label: "Composite Scoring",
    stat: "BM25 + recency + frequency + type",
    gradient: ["#0d1a2e", "#0d1117"],
    accentColor: "#3B82F6",
    entranceDelay: 3.6,
  },
  {
    id: "multi-agent",
    row: 2,
    col: 2,
    rowSpan: 1,
    colSpan: 2,
    icon: "👥",
    label: "Multi-Agent Activity",
    stat: "Color-coded agent timeline",
    gradient: ["#1e0a20", "#0d1117"],
    accentColor: "#EC4899",
    entranceDelay: 4.0,
  },
  {
    id: "inline-editing",
    row: 2,
    col: 4,
    rowSpan: 1,
    colSpan: 1,
    icon: "✏️",
    label: "Inline Editing",
    stat: "Edit memories in the widget",
    gradient: ["#062e1b", "#0d1117"],
    accentColor: "#10B981",
    entranceDelay: 4.4,
  },
  {
    id: "session-briefing",
    row: 2,
    col: 5,
    rowSpan: 1,
    colSpan: 1,
    icon: "📋",
    label: "Session Briefing",
    stat: "Auto-context for new agents",
    gradient: ["#2e1a06", "#0d1117"],
    accentColor: "#F59E0B",
    entranceDelay: 4.8,
  },
  // Row 3: bottom row
  {
    id: "built-at-yc",
    row: 3,
    col: 0,
    rowSpan: 1,
    colSpan: 2,
    icon: "🚀",
    label: "Built at YC",
    stat: "MCP Apps Hackathon 2026",
    gradient: ["#2e1206", "#0d1117"],
    accentColor: "#F59E0B",
    entranceDelay: 5.2,
  },
  // HERO 2: Agent-to-Agent Handoff — bottom-right 2x4 (wide)
  {
    id: "agent-handoff",
    row: 3,
    col: 2,
    rowSpan: 1,
    colSpan: 4,
    icon: "🤝",
    label: "Agent-to-Agent Handoff",
    stat: "Seamless context transfer between any AI agents",
    gradient: ["#2e1a06", "#0d1117"],
    accentColor: "#F59E0B",
    entranceDelay: 5.6,
  },
];

// ─── Cell position calculator ──────────────────────────────────────────────
function getCellRect(cell: BentoCell) {
  const x = PADDING + cell.col * (CELL_W + GAP);
  const y = PADDING + cell.row * (CELL_H + GAP);
  const w = cell.colSpan * CELL_W + (cell.colSpan - 1) * GAP;
  const h = cell.rowSpan * CELL_H + (cell.rowSpan - 1) * GAP;
  return { x, y, w, h };
}

// ─── Determine if cell is a "hero" size ────────────────────────────────────
function isHero(cell: BentoCell): boolean {
  return (cell.colSpan >= 2 && cell.rowSpan >= 2) || cell.id === "agent-memory";
}

function isWide(cell: BentoCell): boolean {
  return cell.colSpan >= 2;
}

// ─── Single cell component ─────────────────────────────────────────────────
const BentoCellView: React.FC<{
  cell: BentoCell;
  frame: number;
  fps: number;
}> = ({ cell, frame, fps }) => {
  const { x, y, w, h } = getCellRect(cell);
  const delayFrames = cell.entranceDelay * fps;

  // Spring entrance: scale from 0.85 + translate up
  const entranceSpring = spring({
    frame: Math.max(0, frame - delayFrames),
    fps,
    config: { damping: 18, stiffness: 100, mass: 0.8 },
  });

  const opacity = interpolate(
    frame,
    [delayFrames, delayFrames + 0.35 * fps],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const translateY = interpolate(entranceSpring, [0, 1], [40, 0]);
  const scale = interpolate(entranceSpring, [0, 1], [0.88, 1]);

  // Subtle glow animation after entrance
  const glowPhase = Math.max(0, frame - delayFrames - fps);
  const glowPulse = glowPhase > 0
    ? interpolate(
        glowPhase % (3 * fps),
        [0, 1.5 * fps, 3 * fps],
        [0.0, 0.12, 0.0]
      )
    : 0;

  const hero = cell.id === "agent-memory";
  const wide = isWide(cell);

  // Icon size and text sizes scale for hero/wide/standard
  const iconSize = hero ? 120 : wide ? 64 : 56;
  const labelSize = hero ? 88 : wide ? 52 : 42;
  const statSize = hero ? 40 : wide ? 28 : 22;

  // For the hero cell, add a special gradient ring behind the icon
  const heroRingScale = hero
    ? spring({
        frame: Math.max(0, frame - 0.5 * fps),
        fps,
        config: { damping: 20, stiffness: 60 },
      })
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        borderRadius: hero ? 40 : 28,
        background: `linear-gradient(145deg, ${cell.gradient[0]}, ${cell.gradient[1]})`,
        border: `1.5px solid ${cell.accentColor}30`,
        boxShadow: `0 0 ${60 + glowPulse * 200}px ${glowPulse * 40}px ${cell.accentColor}20, inset 0 1px 0 0 ${cell.accentColor}15`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: hero ? "center" : "flex-end",
        alignItems: hero ? "center" : "flex-start",
        padding: hero ? 60 : wide ? 40 : 32,
      }}
    >
      {/* Decorative gradient orb in top-right */}
      <div
        style={{
          position: "absolute",
          top: hero ? "50%" : -20,
          right: hero ? "50%" : -20,
          width: hero ? 500 : w * 0.6,
          height: hero ? 500 : h * 0.6,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cell.accentColor}18 0%, transparent 70%)`,
          transform: hero ? "translate(50%, -50%)" : "none",
          pointerEvents: "none",
        }}
      />

      {/* Hero cell: pulsing ring */}
      {hero && (
        <>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 280,
              height: 280,
              borderRadius: "50%",
              border: `2px solid ${cell.accentColor}25`,
              transform: `translate(-50%, -60%) scale(${heroRingScale * 1.6})`,
              opacity: 0.4,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 200,
              height: 200,
              borderRadius: "50%",
              border: `2px solid ${cell.accentColor}35`,
              transform: `translate(-50%, -60%) scale(${heroRingScale * 1.2})`,
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Icon */}
      <div
        style={{
          fontSize: iconSize,
          lineHeight: 1,
          marginBottom: hero ? 28 : 16,
          filter: `drop-shadow(0 0 12px ${cell.accentColor}60)`,
          zIndex: 1,
        }}
      >
        {cell.icon}
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily,
          fontSize: labelSize,
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: hero ? "-3px" : "-1px",
          lineHeight: 1.1,
          zIndex: 1,
          textAlign: hero ? "center" : "left",
        }}
      >
        {cell.label}
      </div>

      {/* Stat / subtitle */}
      <div
        style={{
          fontFamily: cell.id === "mcp-tools" || cell.id === "live-resources" || cell.id === "memory-types"
            ? monoFamily
            : fontFamily,
          fontSize: statSize,
          fontWeight: 500,
          color: `${cell.accentColor}cc`,
          marginTop: hero ? 16 : 8,
          lineHeight: 1.4,
          zIndex: 1,
          textAlign: hero ? "center" : "left",
          maxWidth: "100%",
        }}
      >
        {cell.stat}
      </div>

      {/* Special accent for token savings: big number overlay */}
      {cell.id === "token-savings" && (
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 28,
            fontFamily,
            fontSize: 96,
            fontWeight: 800,
            color: `${cell.accentColor}15`,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          60%
        </div>
      )}

      {/* Special accent for handoff hero: arrow graphic */}
      {cell.id === "agent-handoff" && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            right: 80,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 24,
            opacity: 0.2,
            pointerEvents: "none",
          }}
        >
          <svg width="200" height="60" viewBox="0 0 200 60" fill="none">
            <path
              d="M0 30 H160 L140 10 M160 30 L140 50"
              stroke={cell.accentColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Built at YC: orange Y badge */}
      {cell.id === "built-at-yc" && (
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 32,
            width: 64,
            height: 64,
            borderRadius: 14,
            background: "#FB651E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 36,
            fontWeight: 800,
            color: "white",
          }}
        >
          Y
        </div>
      )}
    </div>
  );
};

// ─── Main composition ──────────────────────────────────────────────────────
export const SceneBentoGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Overall scene fade in and out
  const sceneOpacity = interpolate(
    frame,
    [0, 0.3 * fps, 8.5 * fps, 10 * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Subtle background grid lines
  const gridLineOpacity = interpolate(frame, [0, 1 * fps], [0, 0.04], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117" }}>
      {/* Background grid texture */}
      <AbsoluteFill
        style={{
          opacity: gridLineOpacity,
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Background radial glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "25%",
          width: 1200,
          height: 1200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "15%",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Main content with scene opacity */}
      <div style={{ opacity: sceneOpacity }}>
        {CELLS.map((cell) => (
          <BentoCellView
            key={cell.id}
            cell={cell}
            frame={frame}
            fps={fps}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
