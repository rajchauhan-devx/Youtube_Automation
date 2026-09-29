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
import { Lottie } from "@remotion/lottie";
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
  transformMatrix,
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

/** Kinetic caption artifacts render per-word highlights when their word
 *  timings resolve; otherwise the caller falls back to static nodes. */
function isKineticCaptions(a: ArtifactComposition, project: EditingProject) {
  return (
    a.intent.startsWith("Kinetic captions") &&
    a.nodes.some((n) => n.kind === "text") &&
    a.narrativeRefs.some((id) => project.alignment.tokens.some((t) => t.id === id))
  );
}

/** Fetch-once Lottie payload. Frame sync is handled by <Lottie> itself. */
function LottieData({ url }: { url: string }) {
  const [handle] = useState(() => delayRender("Load motion-pack animation"));
  const [data, setData] = useState<{ fr: number; w: number; h: number; op: number } & Record<string | number | symbol, unknown> | null>(null);
  useEffect(() => {
    let active = true;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Lottie asset ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (active) {
          if (typeof json?.fr !== "number" || typeof json?.w !== "number" || typeof json?.h !== "number" || typeof json?.op !== "number") {
            throw new Error("Lottie asset has an invalid header");
          }
          setData(json);
          continueRender(handle);
        }
      })
      .catch((e) => {
        if (active) cancelRender(e);
      });
    return () => {
      active = false;
    };
  }, [url, handle]);
  if (!data) return null;
  return <Lottie animationData={data} style={{ width: "100%", height: "100%" }} />;
}

/** HTML overlay for a lottie node: positioned by its world matrix, played in
 *  artifact-local time via Sequence so every render of a frame is identical. */
function LottieOverlay({
  node,
  artifact,
  project,
  assets,
  frame,
}: {
  node: Extract<CompositionNode, { kind: "lottie" }>;
  artifact: ArtifactComposition;
  frame: number;
} & CompositionProps) {
  const state = evaluateTransform(node, frame - artifact.startFrame),
    m = transformMatrix(state.transform),
    b = node.bounds;
  return (
    <div
      style={{
        position: "absolute",
        left: b.x,
        top: b.y,
        width: b.width,
        height: b.height,
        transform: `matrix(${m.join(",")})`,
        transformOrigin: "0 0",
        opacity: state.opacity,
      }}
    >
      <Sequence
        from={artifact.startFrame}
        durationInFrames={artifact.endFrame - artifact.startFrame}
        name={`lottie-${artifact.id}-${node.id}`}
      >
        <LottieData url={assets[node.assetId].url} />
      </Sequence>
    </div>
  );
}

/** Words emphasized even when not active. Keep in sync with the Motion Pack
 *  trigger dictionary (server/.../motionPack/triggers.ts EMPHASIS_WORDS). */
const EMPHASIS = new Set([
  "growth", "increase", "money", "revenue", "profit", "earn", "income",
  "idea", "tip", "secret", "warning", "mistake", "subscribe", "follow",
  "one", "two", "three", "first", "second", "third", "1", "2", "3",
]);

/** TikTok-style per-word highlight for kinetic caption artifacts. Timing comes
 *  from the narration alignment (deterministic project data, no new fields). */
function KineticCaptions({
  artifact,
  project,
}: {
  artifact: ArtifactComposition;
  project: EditingProject;
}) {
  const frame = useCurrentFrame();
  const line = artifact.nodes.find((n) => n.kind === "text");
  const tokens = artifact.narrativeRefs
    .map((id) => project.alignment.tokens.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .sort((a, b) => a.start - b.start);
  if (!line || line.kind !== "text" || !tokens.length) return null;
  const tSec = frame / project.inputs.fps;
  const style = line.style;
  const b = line.bounds;
  return (
    <svg
      width={project.inputs.width}
      height={project.inputs.height}
      viewBox={`0 0 ${project.inputs.width} ${project.inputs.height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <foreignObject {...b}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexWrap: "wrap",
            alignContent: "center",
            justifyContent: "center",
            gap: `${Math.round(style.fontSize * 0.28)}px`,
            fontFamily: [style.fontAssetId, ...project.style.fontAssetIds.filter((id) => id !== style.fontAssetId)]
              .map((id) => fontFamily(id))
              .join(","),
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            background: style.background,
            overflow: "hidden",
          }}
        >
          {tokens.map((t) => {
            const active = t.start <= tSec && tSec < t.end;
            const word = t.text.toLocaleLowerCase("en").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
            const emphasized = EMPHASIS.has(word) || /\d/.test(t.text);
            return (
              <span
                key={t.id}
                style={{
                  display: "inline-block",
                  color: active ? "#1a1a1a" : emphasized ? "#f2bd65" : style.color,
                  background: active ? "#f2bd65" : "transparent",
                  borderRadius: 8,
                  padding: active ? "0 8px" : undefined,
                  transform: active ? "scale(1.15)" : "scale(1)",
                }}
              >
                {t.text}
              </span>
            );
          })}
        </div>
      </foreignObject>
    </svg>
  );
}
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
                .filter((a) => !isKineticCaptions(a, project))
                .map((a) => (
                  <g key={a.id}>
                    {a.nodes
                      .filter((n) => !n.parentId && n.kind !== "lottie" && n.kind !== "audio")
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
            {project.artifacts
              .filter(
                (a) =>
                  a.enabled &&
                  a.sceneId === scene.id &&
                  frame >= a.startFrame &&
                  frame < a.endFrame,
              )
              .sort((a, b) => a.priority - b.priority)
              .map((a) =>
                isKineticCaptions(a, project) ? (
                  <KineticCaptions key={a.id} artifact={a} project={project} />
                ) : (
                  <React.Fragment key={a.id}>
                    {a.nodes
                      .filter((n) => !n.parentId && n.kind === "lottie")
                      .map((node) =>
                        node.kind === "lottie" ? (
                          <LottieOverlay
                            key={node.id}
                            node={node}
                            artifact={a}
                            project={project}
                            assets={assets}
                            frame={frame}
                          />
                        ) : null,
                      )}
                    {a.nodes
                      .filter((n) => !n.parentId && n.kind === "audio")
                      .map((node) =>
                        node.kind === "audio" ? (
                          <Sequence
                            key={node.id}
                            from={a.startFrame}
                            durationInFrames={a.endFrame - a.startFrame}
                            layout="none"
                            name={`sfx-${a.id}-${node.id}`}
                          >
                            <Audio
                              src={assets[node.assetId].url}
                              volume={evaluateTransform(node, frame - a.startFrame).opacity}
                            />
                          </Sequence>
                        ) : null,
                      )}
                  </React.Fragment>
                ),
              )}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}
