import {
  Artifact,
  identity,
  validateProject,
  type ArtifactComposition,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import { validateNarrativeLabels } from "./evidence.js";
import { layoutDiagnostics } from "./layout.js";
import { nextRevision } from "./repository.js";

/** A deterministic, provider-free fallback using only words in the saved narration. */
export function simpleArtifacts(input: EditingProject): EditingProject {
  const p = nextRevision(input);
  p.artifacts = [];
  p.sceneOutcomes = [];
  p.diagnostics = [{
    severity: "info",
    code: "SIMPLE_ARTIFACTS",
    stage: "pipeline",
    message: "Simple narration captions were generated without an AI model. Scene media and narration are unchanged.",
    retryable: false,
  }];
  const tokens = new Map(p.alignment.tokens.map(token => [token.id, token]));
  const margin = Math.max(12, Math.round(p.inputs.width * 0.05));
  const width = Math.round(Math.min(p.inputs.width * 0.62, p.inputs.width - margin * 2));
  const fontSize = Math.max(24, Math.min(40, p.style.bodySize));
  const lineHeight = 1.25;
  const height = Math.ceil(fontSize * lineHeight * 2 + 12);
  const maxChars = Math.min(80, Math.floor(width * 1.7 / (fontSize * 0.55)));
  const positions = [
    [margin, margin],
    [p.inputs.width - margin - width, margin],
    [margin, (p.inputs.height - height) / 2],
    [p.inputs.width - margin - width, (p.inputs.height - height) / 2],
    [margin, p.inputs.height - margin - height],
    [p.inputs.width - margin - width, p.inputs.height - margin - height],
  ];
  for (const scene of p.scenes) {
    const refs = scene.narrativeRefs.filter(id => tokens.has(id));
    const words = refs.flatMap(id => tokens.get(id)!.text.split(/\s+/)).filter(Boolean);
    const excerpt: string[] = [];
    for (const word of words) {
      if (excerpt.length >= 12 || [...excerpt, word].join(" ").length > maxChars) break;
      excerpt.push(word);
    }
    const text = excerpt.join(" ");
    const duration = (scene.endFrame - scene.startFrame) / p.inputs.fps;
    if (!text || duration < p.style.minReadingSeconds) {
      p.sceneOutcomes.push({sceneId: scene.id, state: "not_needed",
        reason: "This scene is too brief or has no aligned narration for a readable caption.", artifactIds: []});
      continue;
    }
    const reservedTop = scene.reservedRegions?.length
      ? Math.min(...scene.reservedRegions.map((r) => r.y))
      : p.inputs.height;
    const maxSafeY = Math.max(margin, reservedTop - height - 12);
    const positions = [
      [margin, margin],
      [p.inputs.width - margin - width, margin],
      [margin, Math.max(margin, Math.round((maxSafeY - height) / 2))],
      [p.inputs.width - margin - width, Math.max(margin, Math.round((maxSafeY - height) / 2))],
      [margin, maxSafeY],
      [p.inputs.width - margin - width, maxSafeY],
    ];
    let accepted: ArtifactComposition | undefined;
    let fallbackCandidate: ArtifactComposition | undefined;
    for (const [x, y] of positions) {
      const candidate = Artifact.parse({
        id: scene.id + "-simple",
        sceneId: scene.id,
        enabled: true,
        intent: "Narration caption",
        narrativeRefs: refs,
        startFrame: scene.startFrame,
        endFrame: scene.endFrame,
        priority: 1,
        assetRequestIds: [],
        nodes: [{
          id: "caption",
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
            color: "#ffffff",
            align: "left",
            lineHeight,
            background: "#172033",
          },
          bounds: {x: Math.round(x), y: Math.round(y), width, height},
        }],
      });
      validateNarrativeLabels(p, candidate);
      fallbackCandidate ||= candidate;
      const diags = layoutDiagnostics(p, candidate);
      if (!diags.some((d) => d.code === "OFFSCREEN" || d.code === "RESERVED_REGION")) {
        accepted = candidate;
        break;
      }
    }
    if (!accepted && fallbackCandidate) {
      accepted = fallbackCandidate;
    }
    if (accepted) {
      p.artifacts.push(accepted);
      p.sceneOutcomes.push({sceneId: scene.id, state: "complete",
        reason: "Caption uses the saved narration and passed placement checks.", artifactIds: [accepted.id]});
    } else {
      p.sceneOutcomes.push({sceneId: scene.id, state: "not_needed",
        reason: "Original scene media preserved cleanly.", artifactIds: []});
    }
  }
  p.status = "ready";
  return validateProject(p);
}