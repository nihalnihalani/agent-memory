import { AbsoluteFill, Sequence, useVideoConfig, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { SceneHook } from "./scenes/SceneHook";
import { SceneReveal } from "./scenes/SceneReveal";
import { SceneDemo } from "./scenes/SceneDemo";
import { SceneTech } from "./scenes/SceneTech";
import { SceneClose } from "./scenes/SceneClose";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const { fontFamily: monoFamily } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

export const AgentMemoryIntro = () => {
  const { fps } = useVideoConfig();

  // Scene durations in frames (total = 900 frames = 30 seconds)
  const SCENE1 = 5 * fps; // 150 frames - Hook/Problem
  const SCENE2 = 6 * fps; // 180 frames - Reveal
  const SCENE3 = 7 * fps; // 210 frames - Demo flow
  const SCENE4 = 6 * fps; // 180 frames - Tech/Stats
  const SCENE5 = 6 * fps; // 180 frames - Close
  const TRANSITION = Math.round(0.5 * fps); // 15 frames per transition

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d1117" }}>
      {/* Background Music */}
      <Audio
        src={staticFile("bgm.mp3")}
        volume={(f) => {
          // Fade in over 1s, play at 0.35, fade out last 2s
          const fadeIn = Math.min(f / fps, 1);
          const fadeOut = Math.min((900 - f) / (2 * fps), 1);
          return Math.min(fadeIn, fadeOut) * 0.35;
        }}
      />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE1}>
          <SceneHook fontFamily={fontFamily} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE2}>
          <SceneReveal fontFamily={fontFamily} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE3}>
          <SceneDemo fontFamily={fontFamily} monoFamily={monoFamily} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE4}>
          <SceneTech fontFamily={fontFamily} monoFamily={monoFamily} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE5}>
          <SceneClose fontFamily={fontFamily} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
