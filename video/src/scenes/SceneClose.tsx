import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

type Props = { fontFamily: string };

const SPONSORS = [
  { name: "OpenAI", color: "#ffffff" },
  { name: "Anthropic", color: "#CC785C" },
  { name: "Cloudflare", color: "#F6821F" },
  { name: "Puzzle", color: "#61F6B0" },
  { name: "WorkOS", color: "#6D6DF2" },
];

export const SceneClose: React.FC<Props> = ({ fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo entrance
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 15 },
  });

  // Title typewriter
  const title = "Agent Memory";
  const titleChars = Math.round(
    interpolate(frame, [0.5 * fps, 1.5 * fps], [0, title.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // Tagline
  const taglineOpacity = interpolate(frame, [1.8 * fps, 2.3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [1.8 * fps, 2.3 * fps], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Hackathon badge
  const badgeOpacity = interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sponsors row
  const sponsorStart = 3 * fps;

  // Eco pitch at bottom
  const ecoOpacity = interpolate(frame, [3.5 * fps, 4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathing glow on logo
  const glow = interpolate(
    frame % (2 * fps),
    [0, fps, 2 * fps],
    [0.3, 0.6, 0.3]
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #1a0a2e 0%, #0d1117 70%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Logo with breathing glow */}
      <div
        style={{
          transform: `scale(${logoSpring})`,
          marginBottom: 16,
        }}
      >
        <svg width="100" height="100" viewBox="0 0 120 120" fill="none">
          <circle
            cx="60"
            cy="60"
            r="40"
            fill={`rgba(139, 92, 246, ${glow})`}
          />
          <circle cx="60" cy="60" r="20" fill="#8B5CF6" opacity="0.9" />
          <line x1="60" y1="60" x2="25" y2="30" stroke="#3B82F6" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="95" y2="30" stroke="#10B981" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="25" y2="90" stroke="#F59E0B" strokeWidth="2" opacity="0.6" />
          <line x1="60" y1="60" x2="95" y2="90" stroke="#EC4899" strokeWidth="2" opacity="0.6" />
          <circle cx="25" cy="30" r="8" fill="#3B82F6" />
          <circle cx="95" cy="30" r="8" fill="#10B981" />
          <circle cx="25" cy="90" r="8" fill="#F59E0B" />
          <circle cx="95" cy="90" r="8" fill="#EC4899" />
          <circle cx="60" cy="60" r="10" fill="white" opacity="0.25" />
        </svg>
      </div>

      {/* Title with typewriter */}
      <div
        style={{
          fontFamily,
          fontSize: 80,
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: "-3px",
          textAlign: "center",
        }}
      >
        {title.slice(0, titleChars)}
        {titleChars < title.length && (
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

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          fontFamily,
          fontSize: 32,
          color: "#94a3b8",
          marginTop: 8,
          fontWeight: 500,
        }}
      >
        The Shared Brain for AI Agents
      </div>

      {/* Hackathon badge */}
      <div
        style={{
          opacity: badgeOpacity,
          marginTop: 32,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* YC badge */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: "#FB651E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 20,
            fontWeight: 800,
            color: "white",
          }}
        >
          Y
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 20,
            color: "#e2e8f0",
            fontWeight: 600,
          }}
        >
          MCP Apps Hackathon 2026
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 14,
            color: "#64748b",
            fontWeight: 500,
          }}
        >
          Built at Y Combinator
        </div>
      </div>

      {/* Sponsors row */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          display: "flex",
          gap: 48,
          alignItems: "center",
        }}
      >
        {SPONSORS.map((s, i) => {
          const sDelay = sponsorStart + i * 4;
          const sOpacity = interpolate(
            frame,
            [sDelay, sDelay + 0.3 * fps],
            [0, 0.8],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              key={s.name}
              style={{
                fontFamily,
                fontSize: 18,
                fontWeight: 700,
                color: s.color,
                opacity: sOpacity,
                letterSpacing: "0.5px",
              }}
            >
              {s.name}
            </div>
          );
        })}
      </div>

      {/* Bottom eco pitch */}
      <div
        style={{
          position: "absolute",
          bottom: 50,
          opacity: ecoOpacity,
          fontFamily,
          fontSize: 16,
          color: "#10B981",
          fontWeight: 500,
          textAlign: "center",
        }}
      >
        Every redundant token is a GPU cycle that didn't need to happen.
      </div>
    </AbsoluteFill>
  );
};
