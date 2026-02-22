import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

type Props = { fontFamily: string; monoFamily: string };

const TOOLS = [
  { name: "remember", color: "#8B5CF6" },
  { name: "recall", color: "#3B82F6" },
  { name: "forget", color: "#EF4444" },
  { name: "list", color: "#10B981" },
  { name: "handoff", color: "#F59E0B" },
  { name: "pickup", color: "#EC4899" },
  { name: "complete", color: "#06B6D4" },
];

const TECH_BADGES = [
  { label: "TypeScript", color: "#3178C6" },
  { label: "SQLite + FTS5", color: "#003B57" },
  { label: "mcp-use SDK", color: "#8B5CF6" },
  { label: "React Dashboard", color: "#61DAFB" },
];

export const SceneTech: React.FC<Props> = ({ fontFamily, monoFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Eco message
  const ecoOpacity = interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #0f1729 0%, #0d1117 80%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Center hub */}
      <div style={{ position: "relative", width: 700, height: 500 }}>
        {/* Central MCP Server node */}
        {(() => {
          const hubSpring = spring({
            frame,
            fps,
            config: { damping: 15 },
          });
          return (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) scale(${hubSpring})`,
                width: 160,
                height: 160,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.05) 70%)",
                border: "2px solid rgba(139,92,246,0.5)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#a78bfa",
                }}
              >
                MCP
              </div>
              <div
                style={{
                  fontFamily,
                  fontSize: 13,
                  color: "#8b5cf6",
                  fontWeight: 600,
                }}
              >
                Server
              </div>
            </div>
          );
        })()}

        {/* Tool nodes arranged in a circle */}
        {TOOLS.map((tool, i) => {
          const angle = (i / TOOLS.length) * 2 * Math.PI - Math.PI / 2;
          const radius = 210;
          const x = 350 + Math.cos(angle) * radius;
          const y = 250 + Math.sin(angle) * radius;

          const toolDelay = 0.5 * fps + i * 5;
          const toolSpring = spring({
            frame: frame - toolDelay,
            fps,
            config: { damping: 12, stiffness: 200 },
          });
          const lineOpacity = interpolate(
            frame,
            [toolDelay, toolDelay + 0.3 * fps],
            [0, 0.4],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <div key={tool.name}>
              {/* Connection line */}
              <svg
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 700,
                  height: 500,
                  pointerEvents: "none",
                }}
              >
                <line
                  x1={350}
                  y1={250}
                  x2={x}
                  y2={y}
                  stroke={tool.color}
                  strokeWidth={2}
                  opacity={lineOpacity}
                />
              </svg>

              {/* Tool node */}
              <div
                style={{
                  position: "absolute",
                  left: x - 44,
                  top: y - 22,
                  transform: `scale(${toolSpring})`,
                  background: `${tool.color}22`,
                  border: `1px solid ${tool.color}66`,
                  borderRadius: 10,
                  padding: "8px 16px",
                  fontFamily: monoFamily,
                  fontSize: 13,
                  fontWeight: 700,
                  color: tool.color,
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                {tool.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats line */}
      <div
        style={{
          position: "absolute",
          top: 70,
          display: "flex",
          gap: 60,
          alignItems: "center",
        }}
      >
        {[
          { num: "7", label: "tools" },
          { num: "5", label: "resources" },
          { num: "1", label: "protocol" },
        ].map((stat, i) => {
          const statDelay = 0.3 * fps + i * 0.3 * fps;
          const statSpring = spring({
            frame: frame - statDelay,
            fps,
            config: { damping: 12 },
          });
          return (
            <div
              key={stat.label}
              style={{
                textAlign: "center",
                transform: `scale(${statSpring})`,
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: 56,
                  fontWeight: 800,
                  color: "#e2e8f0",
                  lineHeight: 1,
                }}
              >
                {stat.num}
              </div>
              <div
                style={{
                  fontFamily,
                  fontSize: 18,
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tech badges */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          display: "flex",
          gap: 16,
        }}
      >
        {TECH_BADGES.map((badge, i) => {
          const badgeDelay = 2 * fps + i * 6;
          const badgeOpacity = interpolate(
            frame,
            [badgeDelay, badgeDelay + 0.3 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={badge.label}
              style={{
                opacity: badgeOpacity,
                fontFamily,
                fontSize: 15,
                fontWeight: 600,
                color: "#94a3b8",
                background: "rgba(30,41,59,0.8)",
                border: "1px solid rgba(51,65,85,0.5)",
                borderRadius: 8,
                padding: "8px 20px",
              }}
            >
              {badge.label}
            </div>
          );
        })}
      </div>

      {/* Eco message */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          opacity: ecoOpacity,
          fontFamily,
          fontSize: 16,
          color: "#10B981",
          fontWeight: 500,
        }}
      >
        Less inference. Less energy. Less cost.
      </div>
    </AbsoluteFill>
  );
};
