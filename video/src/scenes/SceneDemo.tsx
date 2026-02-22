import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

type Props = { fontFamily: string; monoFamily: string };

const AGENTS = [
  { name: "Claude Code", color: "#F97316", icon: "C" },
  { name: "ChatGPT", color: "#10B981", icon: "G" },
  { name: "Cursor", color: "#3B82F6", icon: "Cu" },
];

const STEPS = [
  {
    tool: "remember",
    code: 'remember({ key: "db-choice", value: "PostgreSQL" })',
    agent: 0,
    label: "Store",
  },
  {
    tool: "recall",
    code: 'recall("database") → "PostgreSQL"',
    agent: 1,
    label: "Search",
  },
  {
    tool: "handoff",
    code: "handoff({ to: Cursor, context: [...] })",
    agent: 0,
    label: "Hand off",
  },
];

export const SceneDemo: React.FC<Props> = ({ fontFamily, monoFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
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
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          fontFamily,
          fontSize: 42,
          fontWeight: 700,
          color: "#e2e8f0",
          opacity: titleOpacity,
          textAlign: "center",
          width: "100%",
        }}
      >
        Remember. Recall.{" "}
        <span style={{ color: "#F59E0B" }}>Hand off.</span>
      </div>

      {/* Three panels */}
      <div
        style={{
          display: "flex",
          gap: 32,
          marginTop: 40,
        }}
      >
        {STEPS.map((step, i) => {
          const panelDelay = 0.8 * fps + i * 1.2 * fps;
          const panelSpring = spring({
            frame: frame - panelDelay,
            fps,
            config: { damping: 15, stiffness: 120 },
          });
          const panelOpacity = interpolate(
            frame,
            [panelDelay, panelDelay + 0.4 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          // Typewriter effect for code
          const typeStart = panelDelay + 0.3 * fps;
          const charsShown = Math.round(
            interpolate(
              frame,
              [typeStart, typeStart + 1.2 * fps],
              [0, step.code.length],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
          );

          const agent = AGENTS[step.agent];
          const checkOpacity = interpolate(
            frame,
            [typeStart + 1.2 * fps, typeStart + 1.5 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <div
              key={step.tool}
              style={{
                width: 500,
                opacity: panelOpacity,
                transform: `translateY(${interpolate(panelSpring, [0, 1], [40, 0])}px)`,
                background: "rgba(30, 41, 59, 0.7)",
                border: "1px solid rgba(51, 65, 85, 0.5)",
                borderRadius: 16,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Agent badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: agent.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {agent.icon}
                </div>
                <span
                  style={{
                    fontFamily,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#e2e8f0",
                  }}
                >
                  {agent.name}
                </span>
                <span
                  style={{
                    fontFamily,
                    fontSize: 13,
                    color: "#64748b",
                    marginLeft: "auto",
                  }}
                >
                  {step.label}
                </span>
              </div>

              {/* Code block */}
              <div
                style={{
                  background: "#0f172a",
                  borderRadius: 10,
                  padding: "14px 18px",
                  fontFamily: monoFamily,
                  fontSize: 15,
                  color: "#22d3ee",
                  letterSpacing: "-0.3px",
                  minHeight: 48,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#64748b", marginRight: 8 }}>$</span>
                {step.code.slice(0, charsShown)}
                {charsShown < step.code.length && (
                  <span
                    style={{
                      opacity: frame % fps < fps / 2 ? 1 : 0,
                      color: "#8B5CF6",
                    }}
                  >
                    |
                  </span>
                )}
              </div>

              {/* Success check */}
              <div
                style={{
                  opacity: checkOpacity,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily,
                  fontSize: 14,
                  color: "#10B981",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="#10B981"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Done
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom: client logos strip */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          display: "flex",
          gap: 40,
          alignItems: "center",
        }}
      >
        {["Claude", "ChatGPT", "Cursor", "VS Code", "Gemini"].map(
          (name, i) => {
            const stripDelay = 4.5 * fps + i * 4;
            const stripOpacity = interpolate(
              frame,
              [stripDelay, stripDelay + 0.3 * fps],
              [0, 0.7],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <div
                key={name}
                style={{
                  fontFamily,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#64748b",
                  opacity: stripOpacity,
                }}
              >
                {name}
              </div>
            );
          }
        )}
      </div>
    </AbsoluteFill>
  );
};
