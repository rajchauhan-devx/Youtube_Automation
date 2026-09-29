import { useCallback, useEffect, useState } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, Freeze, useCurrentFrame, delayRender, continueRender, cancelRender } from "remotion";
import type { EditingProject, AssetRecord } from "@tubeflow/editing-contracts";
import { sourceMatrix } from "./math.js";
import { MotionGraphicRenderer } from "./MotionGraphics.js";
export type CompositionProps = {
  project: EditingProject;
  assets: Record<string, { url: string; record: AssetRecord }>;
};
const fontFamily = (id: string) => `editing-${id}`;
export function FontRegistry({ project, assets, onReady }: CompositionProps & { onReady: () => void }) {
  const [handle] = useState(() => delayRender("Load approved fonts"));
  useEffect(() => {
    let active = true;
    Promise.all([
      ...project.style.fontAssetIds.map(async (id) => {
        const face = new FontFace(
          fontFamily(id),
          `url(${JSON.stringify(assets[id].url)})`,
          { weight: "100 900" },
        );
        await face.load();
        document.fonts.add(face);
      }),
      ...Object.values(assets)
        .filter((a) => a.record.mime.startsWith("image/"))
        .map(async (a) => {
          const img = new Image();
          img.src = a.url;
          await img.decode();
        }),
    ])
      .then(async () => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        document
          .querySelectorAll<HTMLElement>("[data-editing-text]")
          .forEach((element) => {
            if (
              element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1
            ) {
              console.warn(
                "EDITING_QA:" +
                  JSON.stringify({
                    code: "TEXT_OVERFLOW",
                    artifactId: element.dataset.artifactId,
                    nodeId: element.dataset.nodeId,
                    message:
                      "Text exceeds its bounds after approved fonts loaded",
                  }),
              );
            }
          });
        if (active) { onReady(); continueRender(handle); }
      })
      .catch(cancelRender);
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [project, assets, handle, onReady]);
  return null;
}
const videoRate = (duration: number, target: number) => Math.max(0.5, Math.min(1, duration / target));
export function VideoComposition({ project, assets }: CompositionProps) {
  const [fontsReady, setFontsReady] = useState(false);
  const markFontsReady = useCallback(() => setFontsReady(true), []);
  const frame = useCurrentFrame(),
    { width, height } = project.inputs;
  return (
    <AbsoluteFill style={{ backgroundColor: "#101018" }}>
      <FontRegistry project={project} assets={assets} onReady={markFontsReady} />
      <Audio src={assets[project.inputs.audioAssetId].url} />
      {project.scenes.map((scene) => {
        if (frame < scene.startFrame || frame >= scene.endFrame) return null;
        const asset = assets[scene.assetId],
          m = sourceMatrix(
            scene,
            frame,
            { width, height },
            { width: asset.record.width!, height: asset.record.height! },
          );
        const t = scene.transitionFrames,
          local = frame - scene.startFrame,
          remaining = scene.endFrame - 1 - frame;
        const opacity = t
          ? Math.min(1, (local + 1) / t, (remaining + 1) / t)
          : 1;
        return (
          <AbsoluteFill key={scene.id} style={{ opacity }}>
            {asset.record.mime === "video/mp4" ? (
              <Sequence from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame} layout="none">
                <Freeze frame={Math.max(0, Math.floor((asset.record.duration! * project.inputs.fps - 1) / videoRate(asset.record.duration!, (scene.endFrame - scene.startFrame) / project.inputs.fps)))}
                  active={local * videoRate(asset.record.duration!, (scene.endFrame - scene.startFrame) / project.inputs.fps) >= asset.record.duration! * project.inputs.fps - 1}>
                  <OffthreadVideo src={asset.url} muted playbackRate={videoRate(asset.record.duration!, (scene.endFrame - scene.startFrame) / project.inputs.fps)}
                    style={{position: "absolute", width: asset.record.width, height: asset.record.height, transformOrigin: "0 0", transform: 'matrix(' + m.join(',') + ')'}} />
                </Freeze>
              </Sequence>
            ) : <Img
              src={asset.url}
              style={{
                position: "absolute",
                width: asset.record.width,
                height: asset.record.height,
                transformOrigin: "0 0",
                transform: `matrix(${m.join(",")})`,
              }}
            />}
            {fontsReady && project.artifacts.filter(a => a.graphic && a.enabled && a.sceneId === scene.id && frame >= a.startFrame && frame < a.endFrame)
              .map(a => <MotionGraphicRenderer key={a.id} artifact={a} project={project} frame={frame} source={{ width: asset.record.width!, height: asset.record.height! }} />)}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}
