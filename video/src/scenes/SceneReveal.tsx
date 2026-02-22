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
  { label: "decisions", color: "#3B82F6", emoji: "\u2696\uFE0F" },
  { label: "preferences", color: "#8B5CF6", emoji: "\u2699\uFE0F" },
  { label: "snippets", color: "#10B981", emoji: "\u{1F4CB}" },
  { label: "handoffs", color: "#F59E0B", emoji: "\u{1F91D}" },
  { label: "context", color: "#EC4899", emoji: "\u{1F9E0}" },
];

export const SceneReveal: React.FC<Props> = ({ fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === Phase 1: Icon drops in (0–0.8s) ===
  const iconDrop = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const iconOpacity = interpolate(frame, [0, 0.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  // === Phase 2: Title + subtitle (0.6–1.8s) ===
  const titleProgress = spring({
    frame: Math.max(0, frame - 0.6 * fps),
    fps,
    config: { damping: 20, stiffness: 100 },
  });
  const titleOpacity = interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subOpacity = interpolate(frame, [1.2 * fps, 1.7 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // === Phase 3: Tags fly in from edges (2–3.5s) ===
  // Tags are placed in a row below the subtitle

  // === Phase 4: Savings badge (3.5–5s) ===
  const savingsOpacity = interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const savingsSpring = spring({
    frame: Math.max(0, frame - 3.5 * fps),
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  // === Background glow pulse ===
  const glowSize = interpolate(
    frame,
    [0, 1 * fps, 3 * fps, 5 * fps],
    [200, 400, 500, 550],
    { extrapolateRight: "clamp" }
  );
  const glowOpacity = interpolate(
    frame,
    [0, 0.5 * fps, 4 * fps],
    [0, 0.25, 0.15],
    { extrapolateRight: "clamp" }
  );

  // === Pulsing rings from icon center ===
  const makeRing = (startSec: number) => {
    const start = startSec * fps;
    const end = start + 2.5 * fps;
    return {
      scale: interpolate(frame, [start, end], [0.3, 4], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
      opacity: interpolate(frame, [start, end], [0.6, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    };
  };
  const rings = [makeRing(0.3), makeRing(1.0), makeRing(1.7)];

  return (
    <AbsoluteFill
      style={{
        background: "#0d1117",
      }}
    >
      {/* Radial glow behind icon */}
      <div
        style={{
          position: "absolute",
          top: "28%",
          left: "50%",
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0) 70%)",
          transform: "translate(-50%, -50%)",
          opacity: glowOpacity,
        }}
      />

      {/* Pulsing rings */}
      {rings.map((ring, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "28%",
            left: "50%",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "1.5px solid rgba(139, 92, 246, 0.6)",
            transform: `translate(-50%, -50%) scale(${ring.scale})`,
            opacity: ring.opacity,
          }}
        />
      ))}

      {/* === Main content column === */}
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
          justifyContent: "flex-start",
          paddingTop: 140,
        }}
      >
        {/* Brain/Network Icon — large and prominent */}
        <div
          style={{
            transform: `scale(${iconDrop}) translateY(${interpolate(iconDrop, [0, 1], [-30, 0])}px)`,
            opacity: iconOpacity,
            marginBottom: 44,
          }}
        >
          <svg width="180" height="180" viewBox="0 0 120 120" fill="none">
            {/* Outer glow ring */}
            <circle cx="60" cy="60" r="50" stroke="#8B5CF6" strokeWidth="1" opacity="0.15" />
            <circle cx="60" cy="60" r="38" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.25" />
            {/* Connection lines */}
            <line x1="60" y1="60" x2="22" y2="28" stroke="#3B82F6" strokeWidth="2.5" opacity="0.5" />
            <line x1="60" y1="60" x2="98" y2="28" stroke="#10B981" strokeWidth="2.5" opacity="0.5" />
            <line x1="60" y1="60" x2="22" y2="92" stroke="#F59E0B" strokeWidth="2.5" opacity="0.5" />
            <line x1="60" y1="60" x2="98" y2="92" stroke="#EC4899" strokeWidth="2.5" opacity="0.5" />
            <line x1="60" y1="60" x2="60" y2="15" stroke="#06B6D4" strokeWidth="2.5" opacity="0.5" />
            {/* Central node */}
            <circle cx="60" cy="60" r="22" fill="#8B5CF6" />
            <circle cx="60" cy="60" r="14" fill="#a78bfa" opacity="0.5" />
            <circle cx="60" cy="60" r="8" fill="white" opacity="0.35" />
            {/* Outer nodes */}
            <circle cx="22" cy="28" r="10" fill="#3B82F6" />
            <circle cx="98" cy="28" r="10" fill="#10B981" />
            <circle cx="22" cy="92" r="10" fill="#F59E0B" />
            <circle cx="98" cy="92" r="10" fill="#EC4899" />
            <circle cx="60" cy="15" r="8" fill="#06B6D4" />
            {/* Inner dots on outer nodes */}
            <circle cx="22" cy="28" r="4" fill="white" opacity="0.3" />
            <circle cx="98" cy="28" r="4" fill="white" opacity="0.3" />
            <circle cx="22" cy="92" r="4" fill="white" opacity="0.3" />
            <circle cx="98" cy="92" r="4" fill="white" opacity="0.3" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${interpolate(titleProgress, [0, 1], [25, 0])}px)`,
            fontFamily,
            fontSize: 84,
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            letterSpacing: "-3px",
            lineHeight: 1,
          }}
        >
          Agent Memory
        </div>

        {/* Accent line under title */}
        <div
          style={{
            width: interpolate(frame, [1 * fps, 1.5 * fps], [0, 200], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.quad),
            }),
            height: 3,
            background: "linear-gradient(90deg, #8B5CF6, #3B82F6, #10B981)",
            borderRadius: 2,
            marginTop: 16,
            marginBottom: 16,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            opacity: subOpacity,
            fontFamily,
            fontSize: 32,
            color: "#94a3b8",
            textAlign: "center",
            fontWeight: 500,
            letterSpacing: "0.5px",
          }}
        >
          The shared brain for AI agents
        </div>

        {/* Tags row — clean horizontal chips */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 48,
            flexWrap: "nowrap",
          }}
        >
          {TAGS.map((tag, i) => {
            const tagDelay = 2 * fps + i * 0.15 * fps;
            const tagSpring = spring({
              frame: Math.max(0, frame - tagDelay),
              fps,
              config: { damping: 14, stiffness: 160 },
            });
            const tagOpacity = interpolate(
              frame,
              [tagDelay, tagDelay + 0.25 * fps],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <div
                key={tag.label}
                style={{
                  opacity: tagOpacity,
                  transform: `scale(${tagSpring}) translateY(${interpolate(tagSpring, [0, 1], [12, 0])}px)`,
                  fontFamily,
                  fontSize: 17,
                  fontWeight: 600,
                  color: tag.color,
                  background: `${tag.color}14`,
                  border: `1px solid ${tag.color}33`,
                  padding: "8px 20px",
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 15 }}>{tag.emoji}</span>
                {tag.label}
              </div>
            );
          })}
        </div>

        {/* Token savings badge */}
        <div
          style={{
            opacity: savingsOpacity,
            transform: `scale(${Math.max(savingsSpring, 0)})`,
            marginTop: 52,
            background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))",
            border: "1.5px solid rgba(16,185,129,0.3)",
            borderRadius: 16,
            padding: "16px 40px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily,
              fontSize: 48,
              fontWeight: 800,
              color: "#10B981",
              lineHeight: 1,
            }}
          >
            60%
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div
              style={{
                fontFamily,
                fontSize: 20,
                color: "#e2e8f0",
                fontWeight: 600,
              }}
            >
              fewer tokens wasted
            </div>
            <div
              style={{
                fontFamily,
                fontSize: 14,
                color: "#64748b",
                fontWeight: 400,
              }}
            >
              agents recall what they already know
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
