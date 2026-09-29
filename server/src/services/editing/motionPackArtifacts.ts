import {
  Artifact,
  identity,
  toFrame,
  validateProject,
  type AnimationTrack,
  type ArtifactComposition,
  type CompositionNode,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import { validateNarrativeLabels } from "./evidence.js";
import { layoutDiagnostics, placeArtifact } from "./layout.js";
import { nextRevision } from "./repository.js";
import { directScene, type MotionDirective, type SceneToken } from "./motionPack/director.js";
import { resolvePlacement, type Rect } from "./motionPack/placement.js";
import { loadVisionForAsset, snapshotAt } from "./motionPack/vision.js";
import { ensureMotionLibraries, type LottieName, type SfxName } from "./motionPack/library.js";
import { paginateCaptionTokens } from "./motionPack/kineticCaptions.js";
import { EMPHASIS_WORDS, labelFor } from "./motionPack/triggers.js";

const spring = { kind: "spring", stiffness: 170, damping: 14, mass: 1 } as const;
const bezierOut = { kind: "bezier", x1: 0.2, y1: 0, x2: 0.2, y2: 1 } as const;
const linear = { kind: "linear" } as const;

const accentOf = (p: EditingProject) =>
  p.style.colors.accent || p.style.colors.primary || "#f2bd65";
const surfaceOf = (p: EditingProject) =>
  p.style.colors.surface || p.style.colors.background || "#172033";

function dedupe(frames: Array<{ frame: number; value: number; easing: typeof linear | typeof spring | typeof bezierOut }>) {
  const seen = new Map<number, (typeof frames)[number]>();
  for (const k of frames) seen.set(k.frame, k);
  return [...seen.values()].sort((a, b) => a.frame - b.frame);
}

function opacityTrack(duration: number): AnimationTrack["keyframes"] {
  const exitFrom = Math.max(1, duration - Math.max(2, Math.round(duration * 0.15)));
  return dedupe([
    { frame: 0, value: 0, easing: linear },
    { frame: Math.min(3, duration - 1), value: 1, easing: linear },
    { frame: exitFrom, value: 1, easing: linear },
    { frame: Math.max(exitFrom + 1, duration - 1), value: 0, easing: linear },
  ]);
}

/** Entrance + exit tracks for a graphic of `duration` artifact-local frames. */
function motionTracks(entrance: MotionDirective["entrance"], duration: number): AnimationTrack[] {
  const pop = Math.max(1, Math.min(9, duration - 1));
  const tracks: AnimationTrack[] = [{ property: "opacity", keyframes: opacityTrack(duration) }];
  if (entrance === "spring-pop") {
    tracks.push(
      { property: "scaleX", keyframes: [{ frame: 0, value: 0.01, easing: spring }, { frame: pop, value: 1, easing: spring }] },
      { property: "scaleY", keyframes: [{ frame: 0, value: 0.01, easing: spring }, { frame: pop, value: 1, easing: spring }] },
    );
  } else if (entrance === "slide-in") {
    tracks.push({ property: "x", keyframes: [{ frame: 0, value: -80, easing: bezierOut }, { frame: Math.min(10, duration - 1), value: 0, easing: bezierOut }] });
  }
  return tracks;
}

function strokeTrack(duration: number): AnimationTrack {
  return {
    property: "strokeProgress",
    keyframes: dedupe([
      { frame: 0, value: 0, easing: linear },
      { frame: Math.max(1, duration - Math.max(2, Math.round(duration * 0.2))), value: 1, easing: linear },
    ]),
  };
}

const paintFor = (p: EditingProject, fill: string | null, stroke: string | null, strokeWidth = 0) => ({
  fill,
  stroke,
  strokeWidth,
  dash: [] as number[],
});

function textBounds(text: string, fontSize: number, lineHeight: number, maxWidth: number): Rect {
  const pad = 20;
  const needed = Math.ceil(text.length * fontSize * 0.55) + pad * 2;
  const width = Math.min(maxWidth, Math.max(80, needed));
  const lines = Math.max(1, Math.ceil(needed / width));
  return { x: 0, y: 0, width, height: Math.ceil(lines * fontSize * lineHeight + pad) };
}

/** Lottie + SFX casting per graphic. `number` stays vector (digits can't be
 *  pre-rendered without narration-aware text); the subscribe badge uses the
 *  animated button, other badges keep their word label. */
function mediaFor(d: MotionDirective): { lottie: LottieName | null; sfx: SfxName } {
  switch (d.graphic) {
    case "arrow-up": return { lottie: "arrow-up", sfx: "whoosh" };
    case "arrow-down": return { lottie: "arrow-down", sfx: "whoosh" };
    case "arrow-curved": return { lottie: "arrow-curved", sfx: "whoosh" };
    case "alert": return { lottie: "alert-badge", sfx: "ding" };
    case "lightbulb": return { lottie: "lightbulb", sfx: "ding" };
    case "cash": return { lottie: "cash-burst", sfx: "ding" };
    case "burst": return { lottie: "pop-burst", sfx: "pop" };
    case "underline": return { lottie: "scribble-underline", sfx: "whoosh" };
    case "badge":
      return {
        lottie: ["subscribe", "follow"].includes(d.triggerPhrase) ? "subscribe-button" : null,
        sfx: "pop",
      };
    case "number": return { lottie: null, sfx: "pop" };
  }
}

interface Built {
  artifact: ArtifactComposition;
  visionAnchored: boolean;
  libraryIds: string[];
}

function buildGraphic(
  p: EditingProject,
  scene: EditingProject["scenes"][number],
  d: MotionDirective,
  seq: number,
  tokens: SceneToken[],
  extraReserved: Rect[] = [],
): Built | null {
  const fps = p.inputs.fps;
  const startFrame = Math.max(scene.startFrame, Math.min(scene.endFrame - 1, toFrame(d.startMs / 1000, fps)));
  let endFrame = Math.min(scene.endFrame, startFrame + Math.max(2, toFrame(d.durationMs / 1000, fps)));
  if (endFrame <= startFrame) return null;
  const duration = endFrame - startFrame;

  const label = d.triggerWord ? labelFor(d.graphic, d.triggerPhrase, d.triggerWord) : labelFor(d.graphic, d.triggerPhrase, "");
  // Text-bearing graphics hold the screen at least minReadingSeconds when the scene allows it.
  if (label) {
    const want = startFrame + Math.ceil(p.style.minReadingSeconds * fps);
    if (want > endFrame && want < scene.endFrame) endFrame = want;
    else if (want >= scene.endFrame && scene.endFrame - startFrame > duration) endFrame = scene.endFrame;
  }
  const finalDuration = endFrame - startFrame;
  if (finalDuration <= 0) return null;

  const sidecar = loadVisionForAsset(scene.assetId);
  // Video scenes use the temporal sidecar frame nearest the trigger; images
  // use their single analysis. Anything missing falls back to templates.
  const vision =
    sidecar?.kind === "image"
      ? sidecar.meta
      : sidecar?.kind === "video"
        ? snapshotAt(sidecar.temporal, d.startMs)
        : null;
  const W = p.inputs.width;
  const sizeByGraphic: Record<MotionDirective["graphic"], { width: number; height: number }> = {
    badge: { width: 380, height: 120 },
    "arrow-up": { width: 300, height: 200 },
    "arrow-down": { width: 300, height: 200 },
    "arrow-curved": { width: 320, height: 200 },
    alert: { width: 220, height: 200 },
    lightbulb: { width: 230, height: 230 },
    cash: { width: 330, height: 200 },
    number: { width: 170, height: 170 },
    burst: { width: 430, height: 250 },
    underline: { width: 420, height: 48 },
  };
  // Badge/number/cash/alert boxes resize to their label.
  const fontSize = d.graphic === "number" ? 84 : d.graphic === "alert" ? 80 : d.graphic === "cash" ? 72 : 44;
  if (label && (d.graphic === "badge" || d.graphic === "number" || d.graphic === "cash" || d.graphic === "alert")) {
    const tb = textBounds(label, fontSize, 1.2, W * 0.7);
    sizeByGraphic[d.graphic] = { width: Math.ceil(tb.width + 56), height: Math.ceil(tb.height + 40) };
  }
  const size = sizeByGraphic[d.graphic];
  const placed = resolvePlacement(
    d,
    vision,
    { width: W, height: p.inputs.height },
    size,
    [...(scene.reservedRegions ?? []), ...extraReserved],
  );
  // Placement carries runtime metadata (rotation/visionAnchored) alongside the
  // rect; only x/y/width/height may enter contract geometry (strict objects).
  const at: Rect = { x: placed.x, y: placed.y, width: placed.width, height: placed.height };
  const rotation = placed.rotation;
  const visionAnchored = placed.visionAnchored;
  const accent = accentOf(p);
  const tracks = motionTracks(d.entrance, finalDuration);
  const nodes: CompositionNode[] = [];
  const libraryIds: string[] = [];
  const libs = ensureMotionLibraries();
  const media = mediaFor(d);
  const sfxAsset = libs.sfx[media.sfx];
  if (sfxAsset) libraryIds.push(sfxAsset.id);
  const audioNode = (): CompositionNode | null =>
    sfxAsset
      ? {
          id: "sfx",
          kind: "audio",
          space: "screen",
          zIndex: 0,
          transform: identity(),
          opacity: 0.6,
          tracks: [{ property: "opacity", keyframes: opacityTrack(finalDuration) }],
          assetId: sfxAsset.id,
        }
      : null;

  // Rotated arrows spin around their own center (geometry is absolute screen
  // coords with an identity offset, so the default origin pivot would swing them).
  const pivot = rotation
    ? { x: Math.round(at.x + at.width / 2), y: Math.round(at.y + at.height / 2) }
    : { x: 0, y: 0 };
  const base = { space: "screen" as const, transform: { ...identity(), rotation, pivot }, opacity: 1 as const };

  // Animated Lottie fast path: the motion graphic is a library animation plus
  // its entrance sound. Vector construction below is the offline fallback when
  // a library file is absent.
  const lottieAsset = media.lottie ? libs.lottie[media.lottie] : undefined;
  if (lottieAsset) {
    libraryIds.unshift(lottieAsset.id);
    nodes.push({
      id: "fx",
      kind: "lottie",
      ...base,
      zIndex: 2,
      tracks,
      assetId: lottieAsset.id,
      bounds: {
        x: Math.round(at.x),
        y: Math.round(at.y),
        width: Math.round(at.width),
        height: Math.round(at.height),
      },
      loop: false,
    });
    const sfx = audioNode();
    if (sfx) nodes.push(sfx);
    return finishGraphic(p, scene, d, seq, tokens, nodes, startFrame, endFrame, visionAnchored, libraryIds);
  }

  // Badge-style graphics (bg shape + word label) live inside a group: the label
  // uses group-local coordinates so the layout pass can never separate it
  // from its background (parentless screen-space text is treated as a caption
  // and relocated). The group carries the entrance tracks for the whole badge.
  const groupNode = (): CompositionNode => ({
    id: "g",
    kind: "group",
    space: "screen",
    zIndex: 1,
    transform: {
      ...identity(),
      x: Math.round(at.x),
      y: Math.round(at.y),
      rotation,
      pivot: { x: Math.round(at.width / 2), y: Math.round(at.height / 2) },
    },
    opacity: 1,
    tracks,
  });
  const labelColor =
    d.graphic === "cash" ? "#ffffff" : "#1a1a1a";
  const labelNode = (rect: Rect, zIndex: number): CompositionNode => ({
    id: "label",
    kind: "text",
    space: "parent",
    parentId: "g",
    zIndex,
    transform: identity(),
    opacity: 1,
    tracks: [],
    text: label!,
    style: {
      fontAssetId: p.style.fontAssetIds[0],
      fontSize,
      fontWeight: "700",
      color: labelColor,
      align: "center",
      lineHeight: 1.2,
      background: d.graphic === "badge" ? accent : undefined,
    },
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
  });
  const localShape = (
    geometry: Extract<CompositionNode, { kind: "shape" }>["geometry"],
    paint: Extract<CompositionNode, { kind: "shape" }>["paint"],
    zIndex: number,
  ): CompositionNode => ({
    id: "bg",
    kind: "shape",
    space: "parent",
    parentId: "g",
    zIndex,
    transform: identity(),
    opacity: 1,
    tracks: [],
    geometry,
    paint,
  });

  if (d.graphic === "badge") {
    const w = at.width;
    const h = at.height;
    nodes.push(
      groupNode(),
      localShape({ kind: "rect", bounds: { x: 0, y: 0, width: w, height: h }, radius: 24 }, paintFor(p, accent, null), 1),
      labelNode({ x: 16, y: 14, width: w - 32, height: h - 28 }, 2),
    );
  } else if (d.graphic === "number") {
    const w = at.width;
    const h = at.height;
    nodes.push(
      groupNode(),
      localShape({ kind: "ellipse", bounds: { x: 0, y: 0, width: w, height: h } }, paintFor(p, accent, "#000000", 4), 1),
      labelNode({ x: 20, y: 18, width: w - 40, height: h - 36 }, 2),
    );
  } else if (d.graphic === "cash") {
    const w = at.width;
    const h = at.height;
    nodes.push(
      groupNode(),
      localShape({ kind: "rect", bounds: { x: 0, y: 0, width: w, height: h }, radius: 28 }, paintFor(p, "#14532d", "#22c55e", 5), 1),
      labelNode({ x: 16, y: 12, width: w - 32, height: h - 24 }, 2),
    );
  } else if (d.graphic === "alert") {
    const w = at.width;
    const h = at.height;
    nodes.push(
      groupNode(),
      localShape(
        {
          kind: "polygon",
          points: [
            { x: w / 2, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ],
        },
        paintFor(p, "#f59e0b", "#000000", 5),
        1,
      ),
      labelNode({ x: w * 0.3, y: h * 0.28, width: w * 0.4, height: h * 0.66 }, 2),
    );
  } else if (d.graphic === "lightbulb" || d.graphic === "burst") {
    const { x, y, width, height } = at;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const points = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 1 : 0.72;
      return { x: Math.round(cx + Math.cos(a) * rx * r), y: Math.round(cy + Math.sin(a) * ry * r) };
    });
    nodes.push({
      id: "bg", kind: "shape", ...base, zIndex: 1, tracks,
      geometry: { kind: "polygon", points },
      paint: paintFor(p, d.graphic === "lightbulb" ? "#fde047" : accent, "#000000", 4),
    });
    if (d.graphic === "lightbulb") {
      nodes.push({
        id: "core", kind: "shape", ...base, zIndex: 2, tracks: [],
        geometry: { kind: "ellipse", bounds: { x: x + width * 0.3, y: y + height * 0.28, width: width * 0.4, height: height * 0.44 } },
        paint: paintFor(p, "#fefce8", null),
      });
    }
  } else if (d.graphic === "arrow-up" || d.graphic === "arrow-down" || d.graphic === "arrow-curved") {
    const { x, y, width, height } = at;
    const cx = x + width / 2;
    const up = d.graphic !== "arrow-down";
    const yTip = up ? y + 8 : y + height - 8;
    const yTail = up ? y + height - 8 : y + 8;
    const bend = d.graphic === "arrow-curved" ? width * 0.18 : 0;
    nodes.push({
      id: "arrow", kind: "path", ...base, zIndex: 2,
      tracks: [...tracks, strokeTrack(finalDuration)],
      commands: [
        { op: "M", x: Math.round(cx + bend), y: Math.round(yTail) },
        { op: "L", x: Math.round(cx), y: Math.round(yTip) },
        { op: "M", x: Math.round(cx - 26), y: Math.round(yTip + (up ? 34 : -34)) },
        { op: "L", x: Math.round(cx), y: Math.round(yTip) },
        { op: "L", x: Math.round(cx + 26), y: Math.round(yTip + (up ? 34 : -34)) },
      ],
      paint: paintFor(p, null, accent, 12),
    });
  } else {
    // underline: hand-drawn scribble, draws itself on.
    const { x, y, width, height } = at;
    nodes.push({
      id: "line", kind: "path", ...base, zIndex: 2,
      tracks: [...tracks.filter((t) => t.property === "opacity"), strokeTrack(finalDuration)],
      commands: [
        { op: "M", x: Math.round(x), y: Math.round(y + height * 0.6) },
        { op: "Q", x1: Math.round(x + width * 0.3), y1: Math.round(y + height * 0.1), x: Math.round(x + width * 0.55), y: Math.round(y + height * 0.55) },
        { op: "Q", x1: Math.round(x + width * 0.8), y1: Math.round(y + height * 0.9), x: Math.round(x + width), y: Math.round(y + height * 0.5) },
      ],
      paint: paintFor(p, null, accent, 9),
    });
  }

  const sfx = audioNode();
  if (sfx) nodes.push(sfx);
  return finishGraphic(p, scene, d, seq, tokens, nodes, startFrame, endFrame, visionAnchored, libraryIds);
}

function finishGraphic(
  p: EditingProject,
  scene: EditingProject["scenes"][number],
  d: MotionDirective,
  seq: number,
  tokens: SceneToken[],
  nodes: CompositionNode[],
  startFrame: number,
  endFrame: number,
  visionAnchored: boolean,
  libraryIds: string[],
): Built | null {
  const fps = p.inputs.fps;
  // Narrative refs: tokens overlapped by the graphic window, else the nearest scene token.
  const startS = startFrame / fps;
  const endS = endFrame / fps;
  let refs = tokens.filter((t) => t.start < endS && t.end > startS).map((t) => t.id);
  if (!refs.length && tokens.length) {
    let best = tokens[0];
    for (const t of tokens) {
      if (Math.abs(t.start - startS) < Math.abs(best.start - startS)) best = t;
    }
    refs = [best.id];
  }
  const sceneRefs = new Set(scene.narrativeRefs);
  refs = refs.filter((id) => sceneRefs.has(id));
  if (!refs.length) return null;

  const intent = d.triggerWord
    ? `Motion ${d.graphic} on "${d.triggerWord}"`
    : `Motion ${d.graphic} (scene fallback)`;
  const candidate = Artifact.parse({
    id: `${scene.id}-m${seq}`,
    sceneId: scene.id,
    enabled: true,
    intent: intent.slice(0, 200),
    narrativeRefs: refs,
    startFrame,
    endFrame,
    priority: 3,
    assetRequestIds: [],
    nodes,
  });
  return { artifact: candidate, visionAnchored, libraryIds };
}

function buildCaptionPages(
  p: EditingProject,
  scene: EditingProject["scenes"][number],
  tokens: SceneToken[],
): ArtifactComposition[] {
  if (!tokens.length) return [];
  const fps = p.inputs.fps;
  const pages = paginateCaptionTokens(tokens);
  if (!pages.length) return [];
  if (scene.endFrame - scene.startFrame < 2) return [];

  const W = p.inputs.width;
  const H = p.inputs.height;
  const fontSize = Math.max(36, Math.min(64, p.style.bodySize));
  const lineHeight = 1.3;
  const longest = pages.reduce((n, pg) => Math.max(n, pg.words.map((w) => w.text).join(" ").length), 0);
  const tb = textBounds("W".repeat(Math.min(Math.max(longest, 4), 60)), fontSize, lineHeight, W * 0.88);
  const width = Math.min(W * 0.88, tb.width + 40);
  const height = Math.ceil(fontSize * lineHeight + 28);
  const margin = Math.max(12, Math.round(W * 0.05));
  const reservedTop = scene.reservedRegions?.length
    ? Math.min(...scene.reservedRegions.map((r) => r.y))
    : H;
  const y = Math.max(margin, Math.min(H - margin - height, reservedTop - height - 12));
  const x = Math.round((W - width) / 2);
  const accent = accentOf(p);

  // One artifact per page: each page is placed independently by the shared
  // layout pass, so identical inputs yield an identical, stable on-screen
  // position for every page (a multi-node artifact would scatter pages via
  // occupied-region repulsion). The artifact window IS the page window, so no
  // opacity tracks are needed — pages cut in/out at word boundaries.
  return pages.flatMap((pg, i) => {
    const text = pg.words.map((w) => w.text).join(" ").slice(0, 240);
    if (!text) return [];
    const startFrame = Math.max(scene.startFrame, Math.min(scene.endFrame - 1, toFrame(pg.start, fps)));
    const endFrame = Math.max(startFrame + 1, Math.min(scene.endFrame, toFrame(pg.end, fps)));
    if (endFrame <= startFrame) return [];
    const emphasized = pg.words.some((w) =>
      EMPHASIS_WORDS.has(w.text.toLocaleLowerCase("en").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")) || /\d/.test(w.text),
    );
    return [
      Artifact.parse({
        id: `${scene.id}-c${i}`,
        sceneId: scene.id,
        enabled: true,
        intent: `Kinetic captions ${i + 1}/${pages.length}`,
        narrativeRefs: pg.words.map((w) => w.id),
        startFrame,
        endFrame,
        priority: 6,
        assetRequestIds: [],
        nodes: [
          {
            id: "line",
            kind: "text",
            space: "screen",
            zIndex: 1,
            transform: identity(),
            opacity: 1,
            tracks: [],
            text,
            style: {
              fontAssetId: p.style.fontAssetIds[0],
              fontSize,
              fontWeight: "700",
              color: emphasized ? accent : "#ffffff",
              align: "center",
              lineHeight,
              background: surfaceOf(p),
            },
            bounds: { x, y: Math.round(y), width: Math.round(width), height: Math.round(height) },
          } satisfies CompositionNode,
        ],
      }),
    ];
  });
}

/** Deterministic motion-pack builder: (script + word timings + vision sidecars)
 *  -> composition. Same inputs -> same artifacts. No network, no models. */
export function buildMotionPack(input: EditingProject): EditingProject {
  const p = nextRevision(input);
  p.artifacts = [];
  p.sceneOutcomes = [];
  p.diagnostics = [];
  const tokenById = new Map(p.alignment.tokens.map((t) => [t.id, t]));
  let graphics = 0;
  let anchored = 0;
  let lottieNodes = 0;
  let audioNodes = 0;
  let captionScenes = 0;
  let captionPages = 0;
  const libraryIds = new Set<string>();

  for (let si = 0; si < p.scenes.length; si++) {
    const scene = p.scenes[si];
    const tokens: SceneToken[] = scene.narrativeRefs
      .map((id) => tokenById.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, text: t.text, start: t.start, end: t.end }))
      .sort((a, b) => a.start - b.start);
    const fps = p.inputs.fps;
    const directives = directScene({
      sceneId: scene.id,
      sceneIndex: si,
      sceneStartMs: (scene.startFrame / fps) * 1000,
      sceneEndMs: (scene.endFrame / fps) * 1000,
      tokens,
    });
    const made: string[] = [];

    // Caption band probe: place the first page to learn where the shared
    // layout pass puts kinetic captions, then keep motion graphics clear of
    // that band (cross-artifact overlap is otherwise invisible to placement).
    let captionBand: Rect[] = [];
    try {
      const probe = buildCaptionPages(p, scene, tokens).at(0);
      if (probe) {
        validateNarrativeLabels(p, probe);
        const placedProbe = placeArtifact(p, probe);
        const line = placedProbe.nodes.find((n) => n.kind === "text");
        if (line && "bounds" in line) {
          const b = line.bounds;
          captionBand = [{ x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 }];
        }
      }
    } catch {
      captionBand = [];
    }

    for (const [gi, d] of directives.entries()) {
      try {
        const built = buildGraphic(p, scene, d, gi, tokens, captionBand);
        if (!built) continue;
        validateNarrativeLabels(p, built.artifact);
        const placed = placeArtifact(p, built.artifact);
        for (const diag of layoutDiagnostics(p, placed).slice(0, 10)) {
          if (p.diagnostics.length < 400) p.diagnostics.push(diag);
        }
        p.artifacts.push(placed);
        made.push(placed.id);
        graphics++;
        if (built.visionAnchored) anchored++;
        for (const id of built.libraryIds) libraryIds.add(id);
        lottieNodes += placed.nodes.filter((n) => n.kind === "lottie").length;
        audioNodes += placed.nodes.filter((n) => n.kind === "audio").length;
      } catch (e) {
        p.diagnostics.push({
          severity: "warning",
          code: "MOTION_SKIPPED",
          stage: "motion-pack",
          sceneId: scene.id,
          message: `Motion graphic "${d.graphic}" skipped: ${e instanceof Error ? e.message : "invalid"}`,
          retryable: false,
        });
      }
    }

    const scenesBefore = captionPages;
    for (const page of buildCaptionPages(p, scene, tokens)) {
      try {
        validateNarrativeLabels(p, page);
        const placed = placeArtifact(p, page);
        // Brief pages are intentional (they cut at word boundaries); the
        // generic reading-time heuristic does not apply to them.
        for (const diag of layoutDiagnostics(p, placed).slice(0, 10)) {
          if (diag.code === "READING_TIME") continue;
          if (p.diagnostics.length < 400) p.diagnostics.push(diag);
        }
        p.artifacts.push(placed);
        made.push(placed.id);
        captionPages++;
      } catch (e) {
        p.diagnostics.push({
          severity: "warning",
          code: "MOTION_SKIPPED",
          stage: "motion-pack",
          sceneId: scene.id,
          message: `Kinetic caption page skipped: ${e instanceof Error ? e.message : "invalid"}`,
          retryable: false,
        });
      }
    }
    if (captionPages > scenesBefore) captionScenes++;

    // Contract guard: never exceed the artifact ceiling; drop graphics first.
    while (p.artifacts.length > 160) {
      const idx = p.artifacts.findIndex((a) => a.intent.startsWith("Motion "));
      if (idx < 0) break;
      const [dropped] = p.artifacts.splice(idx, 1);
      const i = made.indexOf(dropped.id);
      if (i >= 0) made.splice(i, 1);
      graphics--;
    }

    p.sceneOutcomes.push(
      made.length
        ? { sceneId: scene.id, state: "complete", reason: "Deterministic motion graphics and kinetic captions placed without an AI model.", artifactIds: made }
        : { sceneId: scene.id, state: "not_needed", reason: "Original scene media preserved cleanly.", artifactIds: [] },
    );
  }

  p.assetIds = [...new Set([...p.assetIds, ...libraryIds])];
  p.diagnostics.unshift({
    severity: "info",
    code: "MOTION_PACK",
    stage: "pipeline",
    message: `Deterministic motion pack: ${graphics} motion graphics (${anchored} vision-anchored, ${graphics - anchored} template; ${lottieNodes} animated, ${audioNodes} with sound) and ${captionPages} kinetic caption pages across ${captionScenes} scenes. No AI model was called.`,
    retryable: false,
  });
  p.status = p.artifacts.length ? "ready" : "partial";
  return validateProject(p);
}
