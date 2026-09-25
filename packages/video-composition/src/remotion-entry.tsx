import React from "react";
import { Composition, registerRoot, getInputProps } from "remotion";
import { VideoComposition, type CompositionProps } from "./VideoComposition.js";
export const Root = () => (
  <Composition
    id="EnhancedVideo"
    component={VideoComposition}
    defaultProps={getInputProps() as CompositionProps}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }: { props: CompositionProps }) => ({
      width: props.project.inputs.width,
      height: props.project.inputs.height,
      fps: props.project.inputs.fps,
      durationInFrames: props.project.inputs.durationFrames,
    })}
  />
);
registerRoot(Root);
