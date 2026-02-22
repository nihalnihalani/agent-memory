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

  const gridOpacity = interpolate(frame, [0, fps], [0, 0.08], {
    extrapolateRight: "clamp",
  });

  const line1Opacity = interpolate(frame, [0.3 * fps, 1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1Y = interpolate(frame, [0.3 * fps, 1 * fps], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const line2Opacity = interpolate(frame, [1.5 * fps, 2.2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2Y = interpolate(frame, [1.5 * fps, 2.2 * fps], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const statsOpacity = interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wastedTokens = Math.round(
    interpolate(frame, [2.5 * fps, 4 * fps], [0, 20000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    })
  );

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
      <AbsoluteFill
        style={{
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "120px 120px",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
          padding: "0 240px",
        }}
      >
        <div
          style={{
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
            fontFamily,
            fontSize: 128,
            fontWeight: 800,
            color: "#e2e8f0",
            textAlign: "center",
            letterSpacing: "-2px",
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
            fontSize: 72,
            fontWeight: 400,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          Every session starts from zero.
        </div>

        <div
          style={{
            opacity: statsOpacity,
            marginTop: 80,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 144,
              fontWeight: 800,
              color: `rgba(239, 68, 68, ${redPulse})`,
              letterSpacing: "-4px",
            }}
          >
            {wastedTokens.toLocaleString()}
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 44,
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
