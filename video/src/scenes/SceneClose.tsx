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

  const logoSpring = spring({ frame, fps, config: { damping: 15 } });

  const title = "Agent Memory";
  const titleChars = Math.round(
    interpolate(frame, [0.5 * fps, 1.5 * fps], [0, title.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const taglineOpacity = interpolate(frame, [1.8 * fps, 2.3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [1.8 * fps, 2.3 * fps], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  const badgeOpacity = interpolate(frame, [2.5 * fps, 3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sponsorStart = 3 * fps;

  const demoOpacity = interpolate(frame, [3.8 * fps, 4.3 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const demoScale = spring({
    frame: Math.max(0, frame - 3.8 * fps),
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const cursorVisible = frame % fps < fps * 0.6;

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
      }}
    >
      {/* Center column */}
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
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logoSpring})`,
            marginBottom: 40,
          }}
        >
          <svg width="220" height="220" viewBox="0 0 120 120" fill="none">
            <circle cx="60" cy="60" r="40" fill={`rgba(139, 92, 246, ${glow})`} />
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

        {/* Title typewriter */}
        <div
          style={{
            fontFamily,
            fontSize: 160,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-6px",
            textAlign: "center",
            lineHeight: 1,
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
            fontSize: 64,
            color: "#94a3b8",
            marginTop: 24,
            fontWeight: 500,
          }}
        >
          The Shared Brain for AI Agents
        </div>

        {/* Hackathon badge */}
        <div
          style={{
            opacity: badgeOpacity,
            marginTop: 72,
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: "#FB651E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily,
              fontSize: 40,
              fontWeight: 800,
              color: "white",
            }}
          >
            Y
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 40,
              color: "#e2e8f0",
              fontWeight: 600,
            }}
          >
            MCP Apps Hackathon 2026
          </div>
          <div
            style={{
              fontFamily,
              fontSize: 28,
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            Built at Y Combinator
          </div>
        </div>

        {/* "The demo begins" */}
        <div
          style={{
            opacity: demoOpacity,
            transform: `scale(${Math.max(demoScale, 0)})`,
            marginTop: 96,
            fontFamily,
            fontSize: 88,
            fontWeight: 700,
            color: "#8B5CF6",
            textAlign: "center",
            letterSpacing: "-2px",
          }}
        >
          The demo begins
          <span
            style={{
              opacity: cursorVisible ? 1 : 0,
              color: "#a78bfa",
              marginLeft: 4,
            }}
          >
            _
          </span>
        </div>
      </div>

      {/* Sponsors row */}
      <div
        style={{
          position: "absolute",
          bottom: 160,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 96,
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
                fontSize: 36,
                fontWeight: 700,
                color: s.color,
                opacity: sOpacity,
                letterSpacing: "1px",
              }}
            >
              {s.name}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
