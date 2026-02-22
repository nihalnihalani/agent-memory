import { Composition } from "remotion";
import { AgentMemoryIntro } from "./AgentMemoryIntro";
import { SceneBentoGrid } from "./scenes/SceneBentoGrid";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="AgentMemoryIntro"
        component={AgentMemoryIntro}
        durationInFrames={900}
        fps={30}
        width={3840}
        height={2160}
      />
      <Composition
        id="BentoGrid"
        component={SceneBentoGrid}
        durationInFrames={300}
        fps={30}
        width={3840}
        height={2160}
      />
    </>
  );
};
