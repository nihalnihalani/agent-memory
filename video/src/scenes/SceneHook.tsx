import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

type Props = { fontFamily: string };

export const SceneHook: React.FC<Props> = ({ fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pulsing grid background
  const gridOpacity = interpolate(frame, [0, fps], [0, 0.08], {
    extrapolateRight: "clamp",
  });

  // Line 1: "Your AI agents have amnesia."
  const line1Opacity = interpolate(frame, [0.3 * fps, 1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1Y = interpolate(frame, [0.3 * fps, 1 * fps], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Line 2: "Every session starts from zero."
  const line2Opacity = interpolate(frame, [1.5 * fps, 2.2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2Y = interpolate(frame, [1.5 * fps, 2.2 * fps], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Token waste stats
  const statsOpacity = interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Wasted tokens counter
  const wastedTokens = Math.round(
    interpolate(frame, [2.5 * fps, 4 * fps], [0, 20000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    })
  );

  // Red pulse on "wasted"
  const redPulse = interpolate(
    frame % (fps / 2),
    [0, fps / 4, fps / 2],
    [0.6, 1, 0.6],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #1a0a2e 0%, #0d1117 70%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Animated grid */}
      <AbsoluteFill
        style={{
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          padding: "0 120px",
        }}
      >
        {/* Main headline */}
        <div
          style={{
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
            fontFamily,
            fontSize: 64,
            fontWeight: 800,
            color: "#e2e8f0",
            textAlign: "center",
            letterSpacing: "-1px",
          }}
        >
          Your AI agents have{" "}
          <span style={{ color: "#ef4444" }}>amnesia.</span>
        </div>

        <div
          style={{
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
            fontFamily,
            fontSize: 36,
            fontWeight: 400,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          Every session starts from zero.
        </div>

        {/* Token waste stats */}
        <div
          style={{
            opacity: statsOpacity,
            marginTop: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 72,
              fontWeight: 800,
              color: `rgba(239, 68, 68, ${redPulse})`,
              letterSpacing: "-2px",
            }}
          >
            {wastedTokens.toLocaleString()}
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 22,
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            wasted tokens/day just repeating yourself
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
