import { Composition } from "remotion";
import { AgentMemoryIntro } from "./AgentMemoryIntro";

export const RemotionRoot = () => {
  return (
    <Composition
      id="AgentMemoryIntro"
      component={AgentMemoryIntro}
      durationInFrames={900}
      fps={30}
      width={3840}
      height={2160}
    />
  );
};
