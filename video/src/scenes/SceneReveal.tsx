import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

type Props = { fontFamily: string };

const TAGS = [
  { label: "decisions", color: "#3B82F6", x: -320, y: -120 },
  { label: "preferences", color: "#8B5CF6", x: 280, y: -100 },
  { label: "snippets", color: "#10B981", x: -280, y: 130 },
  { label: "handoffs", color: "#F59E0B", x: 300, y: 110 },
  { label: "context", color: "#EC4899", x: 0, y: 180 },
];

export const SceneReveal: React.FC<Props> = ({ fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance with spring
  const logoScale = spring({ frame, fps, config: { damping: 12 } });
  const logoOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Pulsing rings
  const ring1Scale = interpolate(frame, [0.5 * fps, 3 * fps], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring1Opacity = interpolate(frame, [0.5 * fps, 3 * fps], [0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring2Scale = interpolate(frame, [1 * fps, 3.5 * fps], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring2Opacity = interpolate(frame, [1 * fps, 3.5 * fps], [0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title text
  const titleOpacity = interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [1 * fps, 1.5 * fps], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Subtitle
  const subOpacity = interpolate(frame, [1.8 * fps, 2.3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Token savings stat
  const savingsOpacity = interpolate(frame, [3 * fps, 3.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const savingsScale = spring({
    frame: frame - 3 * fps,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #1b1040 0%, #0d1117 70%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Pulsing rings */}
      {[
        { scale: ring1Scale, opacity: ring1Opacity },
        { scale: ring2Scale, opacity: ring2Opacity },
      ].map((ring, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            border: "2px solid rgba(139, 92, 246, 0.5)",
            transform: `scale(${ring.scale})`,
            opacity: ring.opacity,
            top: "50%",
            left: "50%",
            marginTop: -140,
            marginLeft: -100,
          }}
        />
      ))}

      {/* Brain/Memory Icon */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          marginBottom: 20,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          {/* Central node */}
          <circle cx="60" cy="60" r="20" fill="#8B5CF6" opacity="0.9" />
          <circle cx="60" cy="60" r="28" stroke="#8B5CF6" strokeWidth="2" opacity="0.4" />
          {/* Connection lines */}
          <line x1="60" y1="60" x2="25" y2="30" stroke="#3B82F6" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="95" y2="30" stroke="#10B981" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="25" y2="90" stroke="#F59E0B" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="95" y2="90" stroke="#EC4899" strokeWidth="2" opacity="0.6" />
          {/* Outer nodes */}
          <circle cx="25" cy="30" r="8" fill="#3B82F6" />
          <circle cx="95" cy="30" r="8" fill="#10B981" />
          <circle cx="25" cy="90" r="8" fill="#F59E0B" />
          <circle cx="95" cy="90" r="8" fill="#EC4899" />
          {/* Center glow */}
          <circle cx="60" cy="60" r="12" fill="white" opacity="0.3" />
        </svg>
      </div>

      {/* Floating tags */}
      {TAGS.map((tag, i) => {
        const tagDelay = 2 * fps + i * 6;
        const tagSpring = spring({
          frame: frame - tagDelay,
          fps,
          config: { damping: 15 },
        });
        const tagOpacity = interpolate(
          frame,
          [tagDelay, tagDelay + 0.3 * fps],
          [0, 0.85],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            key={tag.label}
            style={{
              position: "absolute",
              left: `calc(50% + ${tag.x}px)`,
              top: `calc(45% + ${tag.y}px)`,
              opacity: tagOpacity,
              transform: `scale(${tagSpring})`,
              fontFamily,
              fontSize: 16,
              fontWeight: 600,
              color: tag.color,
              background: `${tag.color}18`,
              border: `1px solid ${tag.color}44`,
              padding: "6px 16px",
              borderRadius: 20,
            }}
          >
            {tag.label}
          </div>
        );
      })}

      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily,
          fontSize: 72,
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          letterSpacing: "-2px",
        }}
      >
        Agent Memory
      </div>

      {/* Subtitle */}
      <div
        style={{
          opacity: subOpacity,
          fontFamily,
          fontSize: 28,
          color: "#94a3b8",
          textAlign: "center",
          marginTop: 8,
        }}
      >
        The shared brain for AI agents
      </div>

      {/* Token savings badge */}
      <div
        style={{
          opacity: savingsOpacity,
          transform: `scale(${Math.max(savingsScale, 0)})`,
          marginTop: 30,
          background: "linear-gradient(135deg, #10B98122, #10B98108)",
          border: "1px solid #10B98144",
          borderRadius: 12,
          padding: "12px 28px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 36,
            fontWeight: 800,
            color: "#10B981",
          }}
        >
          60%
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 18,
            color: "#94a3b8",
            fontWeight: 500,
          }}
        >
          fewer tokens wasted
        </div>
      </div>
    </AbsoluteFill>
  );
};
