import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-timing-"),
);
const { fixture } = await import("./fixtures.mjs");
const { compileCue } = await import(
  "../../server/dist/services/editing/timing.js"
);
const p = await fixture();
test("measured repeated phrases cue their token occurrence and rescale animation exactly", () => {
  const project = structuredClone(p),
    artifact = structuredClone(p.artifacts[0]);
  project.alignment.mode = "word";
  project.style.minReadingSeconds = 1;
  project.alignment.tokens = [0, 1].map((i) => ({
    id: `repeat-${i}`,
    text: "hand",
    startOffset: i * 5,
    endOffset: i * 5 + 4,
    start: i * 1.5,
    end: i * 1.5 + 0.5,
    confidence: 1,
    evidence: "fixture",
  }));
  project.scenes[0].narrativeRefs = ["repeat-0", "repeat-1"];
  artifact.narrativeRefs = ["repeat-1"];
  artifact.startFrame = 0;
  artifact.endFrame = 72;
  artifact.nodes = [artifact.nodes.find((n) => n.kind === "text")];
  artifact.nodes[0].text = "hand";
  artifact.nodes[0].tracks = [
    {
      property: "opacity",
      keyframes: [
        { frame: 0, value: 0, easing: { kind: "linear" } },
        { frame: 72, value: 1, easing: { kind: "linear" } },
      ],
    },
  ];
  const compiled = compileCue(project, artifact);
  assert.equal(compiled.startFrame, 36);
  assert.equal(compiled.endFrame, 60);
  assert.deepEqual(
    compiled.nodes[0].tracks[0].keyframes.map((k) => k.frame),
    [0, 24],
  );
  assert.equal(artifact.startFrame, 0, "compiler does not mutate its input");
});
test("approximate timing expands to its owning scene and unknown cues reject", () => {
  const artifact = structuredClone(p.artifacts[0]);
  artifact.startFrame = 12;
  artifact.endFrame = 60;
  artifact.nodes.forEach((n) => {
    n.tracks = [];
  });
  const compiled = compileCue(p, artifact);
  assert.equal(compiled.startFrame, 0);
  assert.equal(compiled.endFrame, 72);
  artifact.narrativeRefs = ["missing"];
  assert.throws(() => compileCue(p, artifact), /Unresolved/);
});
