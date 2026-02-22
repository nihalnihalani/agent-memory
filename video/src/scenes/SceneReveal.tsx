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
  { label: "decisions", color: "#3B82F6", x: -340, y: -60 },
  { label: "preferences", color: "#8B5CF6", x: 260, y: -50 },
  { label: "snippets", color: "#10B981", x: -300, y: 60 },
  { label: "handoffs", color: "#F59E0B", x: 280, y: 50 },
  { label: "context", color: "#EC4899", x: -20, y: 100 },
];

export const SceneReveal: React.FC<Props> = ({ fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance with spring
  const logoScale = spring({ frame, fps, config: { damping: 12 } });
  const logoOpacity = interpolate(frame, [0, 0.5 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Pulsing rings (centered on the icon)
  const ring1Scale = interpolate(frame, [0.5 * fps, 3 * fps], [0.5, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring1Opacity = interpolate(frame, [0.5 * fps, 3 * fps], [0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring2Scale = interpolate(frame, [1 * fps, 4 * fps], [0.5, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ring2Opacity = interpolate(frame, [1 * fps, 4 * fps], [0.5, 0], {
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
  const savingsOpacity = interpolate(frame, [3.2 * fps, 3.8 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const savingsScale = spring({
    frame: Math.max(0, frame - 3.2 * fps),
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #1b1040 0%, #0d1117 70%)",
      }}
    >
      {/* Pulsing rings — centered at 50%, 38% (where the icon is) */}
      {[
        { scale: ring1Scale, opacity: ring1Opacity },
        { scale: ring2Scale, opacity: ring2Opacity },
      ].map((ring, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            border: "2px solid rgba(139, 92, 246, 0.5)",
            transform: `translate(-50%, -50%) scale(${ring.scale})`,
            opacity: ring.opacity,
            top: "38%",
            left: "50%",
          }}
        />
      ))}

      {/* Center column: icon → title → subtitle → badge */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Brain/Memory Icon */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            marginBottom: 28,
          }}
        >
          <svg width="140" height="140" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="20" fill="#8B5CF6" opacity="0.9" />
            <circle cx="60" cy="60" r="28" stroke="#8B5CF6" strokeWidth="2" opacity="0.4" />
            <line x1="60" y1="60" x2="25" y2="30" stroke="#3B82F6" strokeWidth="2" opacity="0.6" />
            <line x1="60" y1="60" x2="95" y2="30" stroke="#10B981" strokeWidth="2" opacity="0.6" />
            <line x1="60" y1="60" x2="25" y2="90" stroke="#F59E0B" strokeWidth="2" opacity="0.6" />
            <line x1="60" y1="60" x2="95" y2="90" stroke="#EC4899" strokeWidth="2" opacity="0.6" />
            <circle cx="25" cy="30" r="8" fill="#3B82F6" />
            <circle cx="95" cy="30" r="8" fill="#10B981" />
            <circle cx="25" cy="90" r="8" fill="#F59E0B" />
            <circle cx="95" cy="90" r="8" fill="#EC4899" />
            <circle cx="60" cy="60" r="12" fill="white" opacity="0.3" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            fontFamily,
            fontSize: 76,
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          Agent Memory
        </div>

        {/* Subtitle */}
        <div
          style={{
            opacity: subOpacity,
            fontFamily,
            fontSize: 30,
            color: "#94a3b8",
            textAlign: "center",
            marginTop: 16,
            fontWeight: 500,
          }}
        >
          The shared brain for AI agents
        </div>

        {/* Token savings badge */}
        <div
          style={{
            opacity: savingsOpacity,
            transform: `scale(${Math.max(savingsScale, 0)})`,
            marginTop: 40,
            background: "linear-gradient(135deg, #10B98122, #10B98108)",
            border: "1px solid #10B98144",
            borderRadius: 14,
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 40,
              fontWeight: 800,
              color: "#10B981",
              lineHeight: 1,
            }}
          >
            60%
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 20,
              color: "#94a3b8",
              fontWeight: 500,
            }}
          >
            fewer tokens wasted
          </div>
        </div>
      </div>

      {/* Floating tags — positioned relative to center */}
      {TAGS.map((tag, i) => {
        const tagDelay = 2 * fps + i * 6;
        const tagSpring = spring({
          frame: Math.max(0, frame - tagDelay),
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
              top: `calc(50% + ${tag.y}px)`,
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
    </AbsoluteFill>
  );
};
