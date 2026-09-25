import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  Freeze,
  useCurrentFrame,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import type {
  EditingProject,
  CompositionNode,
  ArtifactComposition,
  AssetRecord,
} from "@tubeflow/editing-contracts";
import {
  evaluateTransform,
  nodeMatrix,
  sourceMatrix,
  resolveAnchor,
} from "./math.js";
export type CompositionProps = {
  project: EditingProject;
  assets: Record<string, { url: string; record: AssetRecord }>;
};
const fontFamily = (id: string) => `editing-${id}`;
export function FontRegistry({ project, assets }: CompositionProps) {
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
        if (active) continueRender(handle);
      })
      .catch(cancelRender);
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [project, assets, handle]);
  return null;
}
const pathData = (
  commands: Extract<CompositionNode, { kind: "path" }>["commands"],
) =>
  commands
    .map((c) =>
      c.op === "Z"
        ? "Z"
        : c.op === "C"
          ? `C${c.x1},${c.y1} ${c.x2},${c.y2} ${c.x},${c.y}`
          : c.op === "Q"
            ? `Q${c.x1},${c.y1} ${c.x},${c.y}`
            : `${c.op}${c.x},${c.y}`,
    )
    .join(" ");
function Geometry({
  geometry,
}: {
  geometry: Extract<CompositionNode, { kind: "shape" }>["geometry"];
}) {
  if (geometry.kind === "polygon")
    return (
      <polygon points={geometry.points.map((p) => `${p.x},${p.y}`).join(" ")} />
    );
  const b = geometry.bounds;
  return geometry.kind === "ellipse" ? (
    <ellipse
      cx={b.x + b.width / 2}
      cy={b.y + b.height / 2}
      rx={b.width / 2}
      ry={b.height / 2}
    />
  ) : (
    <rect {...b} rx={geometry.radius} />
  );
}
export function NodeRenderer({
  node,
  artifact,
  project,
  assets,
  frame,
}: {
  node: CompositionNode;
  artifact: ArtifactComposition;
  frame: number;
} & CompositionProps) {
  const dimensions = Object.fromEntries(
    Object.entries(assets).map(([id, a]) => [
      id,
      { width: a.record.width || 1, height: a.record.height || 1 },
    ]),
  );
  const state = evaluateTransform(node, frame - artifact.startFrame),
    m = nodeMatrix(node, artifact, project, frame, dimensions),
    uid = `${artifact.id}-${node.id}`,
    clip = node.clip;
  const paint = "paint" in node ? node.paint : undefined;
  let content: React.ReactNode = null;
  if (node.kind === "text")
    content = (
      <foreignObject {...node.bounds}>
        <div
          data-editing-text={uid}
          data-artifact-id={artifact.id}
          data-node-id={node.id}
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            fontFamily: [
              node.style.fontAssetId,
              ...project.style.fontAssetIds.filter(
                (id) => id !== node.style.fontAssetId,
              ),
            ]
              .map((id) => fontFamily(id))
              .join(","),
            fontSize: node.style.fontSize,
            fontWeight: node.style.fontWeight,
            color: node.style.color,
            textAlign: node.style.align,
            lineHeight: node.style.lineHeight,
            background: node.style.background,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {node.text}
        </div>
      </foreignObject>
    );
  if (node.kind === "image") {
    const a = assets[node.assetId],
      b = node.bounds,
      c = node.crop || { x: 0, y: 0, width: 1, height: 1 },
      w = a.record.width || 1,
      h = a.record.height || 1;
    content = (
      <svg
        {...b}
        viewBox={`${c.x * w} ${c.y * h} ${c.width * w} ${c.height * h}`}
        preserveAspectRatio={`xMidYMid ${node.fit === "cover" ? "slice" : "meet"}`}
        overflow="hidden"
      >
        <image href={a.url} width={w} height={h} />
      </svg>
    );
  }
  if (node.kind === "shape") content = <Geometry geometry={node.geometry} />;
  if (node.kind === "path")
    content = (
      <path
        d={pathData(node.commands)}
        pathLength={1}
        strokeDasharray={
          state.strokeProgress < 1 ? `${state.strokeProgress} 1` : undefined
        }
      />
    );
  if (node.kind === "connector") {
    const from = resolveAnchor(node.from, artifact, project, frame, dimensions),
      to = resolveAnchor(node.to, artifact, project, frame, dimensions),
      { width, height } = project.inputs;
    // Hide a pointer whose target leaves the source crop. Never clamp it to an unrelated edge.
    if (
      [from, to].some((p) => p.x < 0 || p.x > width || p.y < 0 || p.y > height)
    )
      return null;
    const d =
      node.route === "elbow"
        ? `M${from.x},${from.y} L${to.x},${from.y} L${to.x},${to.y}`
        : node.route === "curve"
          ? `M${from.x},${from.y} Q${to.x},${from.y} ${to.x},${to.y}`
          : `M${from.x},${from.y} L${to.x},${to.y}`;
    content = (
      <path
        d={d}
        fill="none"
        pathLength={1}
        strokeDasharray={
          state.strokeProgress < 1 ? `${state.strokeProgress} 1` : undefined
        }
      />
    );
  }
  const children = artifact.nodes
    .filter((n) => n.parentId === node.id)
    .sort((a, b) => a.zIndex - b.zIndex);
  // Every leaf uses its complete world matrix. Group opacity/clip apply through SVG nesting.
  return (
    <g opacity={state.opacity} data-editing-node={uid}>
      <defs>
        {paint?.gradient && (
          <linearGradient
            id={`${uid}-gradient`}
            gradientTransform={`rotate(${paint.gradient.angle} .5 .5)`}
          >
            {paint.gradient.stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        )}
        {paint?.shadow && (
          <filter
            id={`${uid}-shadow`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feDropShadow
              dx={paint.shadow.x}
              dy={paint.shadow.y}
              stdDeviation={paint.shadow.blur / 2}
              floodColor={paint.shadow.color}
            />
          </filter>
        )}
        {clip && clip.kind !== "mask" && (
          <clipPath id={`${uid}-clip`} transform={`matrix(${m.join(" ")})`}>
            {clip.kind === "geometry" ? (
              <Geometry geometry={clip.geometry} />
            ) : (
              <path d={pathData(clip.commands)} />
            )}
          </clipPath>
        )}
        {clip?.kind === "mask" && (
          <mask
            id={`${uid}-mask`}
            maskUnits="userSpaceOnUse"
            style={{ maskType: clip.mode }}
          >
            <image
              transform={`matrix(${m.join(" ")})`}
              href={assets[clip.assetId].url}
              {...clip.bounds}
            />
          </mask>
        )}
        {state.clipProgress < 1 && (
          <clipPath id={`${uid}-reveal`}>
            <rect
              width={project.inputs.width * state.clipProgress}
              height={project.inputs.height}
            />
          </clipPath>
        )}
      </defs>
      <g
        clipPath={
          clip && clip.kind !== "mask" ? `url(#${uid}-clip)` : undefined
        }
        mask={clip?.kind === "mask" ? `url(#${uid}-mask)` : undefined}
      >
        <g
          clipPath={state.clipProgress < 1 ? `url(#${uid}-reveal)` : undefined}
        >
          <g
            transform={`matrix(${m.join(" ")})`}
            fill={
              paint?.gradient ? `url(#${uid}-gradient)` : paint?.fill || "none"
            }
            stroke={paint?.stroke || "none"}
            strokeWidth={paint?.strokeWidth}
            strokeDasharray={paint?.dash.join(" ") || undefined}
            filter={paint?.shadow ? `url(#${uid}-shadow)` : undefined}
          >
            {content}
          </g>
          {children.map((child) => (
            <NodeRenderer
              key={child.id}
              node={child}
              artifact={artifact}
              project={project}
              assets={assets}
              frame={frame}
            />
          ))}
        </g>
      </g>
    </g>
  );
}
const videoRate = (duration: number, target: number) => Math.max(0.5, Math.min(1, duration / target));
export function VideoComposition({ project, assets }: CompositionProps) {
  const frame = useCurrentFrame(),
    { width, height } = project.inputs;
  return (
    <AbsoluteFill style={{ backgroundColor: "#101018" }}>
      <FontRegistry project={project} assets={assets} />
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
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              style={{ position: "absolute", inset: 0 }}
            >
              {project.artifacts
                .filter(
                  (a) =>
                    a.enabled &&
                    a.sceneId === scene.id &&
                    frame >= a.startFrame &&
                    frame < a.endFrame,
                )
                .sort((a, b) => a.priority - b.priority)
                .map((a) => (
                  <g key={a.id}>
                    {a.nodes
                      .filter((n) => !n.parentId)
                      .sort((x, y) => x.zIndex - y.zIndex)
                      .map((node) => (
                        <NodeRenderer
                          key={node.id}
                          node={node}
                          artifact={a}
                          project={project}
                          assets={assets}
                          frame={frame}
                        />
                      ))}
                  </g>
                ))}
            </svg>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}
