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
  const supplied = new Set(
    words(
      artifact.narrativeRefs
        .map(
          (id) => project.alignment.tokens.find((t) => t.id === id)?.text || "",
        )
        .join(" "),
    ),
  );
  for (const node of artifact.nodes) {
    if (node.kind !== "text") continue;
    const unsupported = words(node.text).filter((word) => !supplied.has(word));
    if (unsupported.length)
      throw new Error(
        `Label ${node.id} introduces wording outside its cited narration: ${[...new Set(unsupported)].join(", ")}. Use supplied wording; do not infer labels from images.`,
      );
  }
}
