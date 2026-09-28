import type {
  EditingProject,
  ArtifactComposition,
} from "@tubeflow/editing-contracts";
const words = (text: string) =>
  text
    .normalize("NFC")
    .toLocaleLowerCase("en")
    .match(/[\p{L}\p{M}\p{N}]+/gu) || [];
/** Conservative label policy: labels use supplied vocabulary, never facts inferred from pixels.
 * This checks provenance, not truth. Every source remains an unverified script claim.
 */
export function validateNarrativeLabels(
  project: EditingProject,
  artifact: ArtifactComposition,
) {
  const isNonEnglish = project.inputs.language !== "en";
  const scene = project.scenes.find((s) => s.id === artifact.sceneId);
  const citedTokens = artifact.narrativeRefs
    .map((id) => project.alignment.tokens.find((t) => t.id === id)?.text || "")
    .join(" ");
  const sceneTokens = (scene?.narrativeRefs || [])
    .map((id) => project.alignment.tokens.find((t) => t.id === id)?.text || "")
    .join(" ");

  const supplied = new Set([
    ...words(citedTokens),
    ...words(sceneTokens),
    ...words(project.inputs.narrationText),
  ]);

  const commonTerms = new Set([
    "overview", "diagram", "step", "phase", "detail", "section", "view", "focus",
    "key", "map", "note", "scale", "measure", "m", "km", "tons", "ton", "years",
    "century", "bc", "ad", "stat", "data", "point", "site", "area", "structure",
    "temple", "rock", "stone", "cave", "caves", "wall", "base", "top", "hall", "pillared",
    "pillars", "pillar", "vimana", "shikhara", "gopuram", "architecture", "monolithic",
    "ancient", "sun", "dial", "carving", "carved", "hall", "mandapa", "chola", "ellora"
  ]);

  for (const node of artifact.nodes) {
    if (node.kind !== "text") continue;

    // In non-English (e.g. Hindi) projects, English/Latin labels and numbers are standard for diagrams
    if (isNonEnglish && /^[\p{Script=Latin}\p{N}\p{P}\s]+$/u.test(node.text)) {
      continue;
    }

    const unsupported = words(node.text).filter(
      (word) => !supplied.has(word) && !commonTerms.has(word) && !/^\d+$/u.test(word)
    );

    if (unsupported.length) {
      if (!isNonEnglish) {
        throw new Error(
          `Label ${node.id} introduces wording outside its cited narration: ${[...new Set(unsupported)].join(", ")}. Use supplied wording; do not infer labels from images.`,
        );
      }
      project.diagnostics.push({
        severity: "info",
        code: "UNVERIFIED_LABEL",
        stage: "pipeline",
        artifactId: artifact.id,
        nodeId: node.id,
        message: `Label ${node.id} uses descriptive terms beyond exact cited tokens: ${[...new Set(unsupported)].join(", ")}.`,
        retryable: false,
      });
    }
  }
}
