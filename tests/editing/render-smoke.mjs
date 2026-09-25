import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/editing-render-data");
const { fixture } = await import("./fixtures.mjs");
const { exportVideo, previewFrames } = await import(
  "../../server/dist/services/editing/renderer.js"
);
const { projectDir } = await import(
  "../../server/dist/services/editing/repository.js"
);
const results = [];
for (const [theme, portrait, empty] of [
  ["museum", false, false],
  ["technology", true, false],
  ["science", false, false],
  ["science", true, false],
  ["museum", true, true],
]) {
  const p = await fixture(theme, portrait, empty),
    id = randomUUID(),
    start = Date.now();
  await previewFrames(p, new AbortController().signal);
  const url = await exportVideo(p, id, new AbortController().signal, () => {});
  results.push({
    theme,
    portrait,
    empty,
    seconds: 3,
    width: p.inputs.width,
    height: p.inputs.height,
    elapsedMs: Date.now() - start,
    output: path.join(projectDir(p.id), "renders", id, "video.mp4"),
    preview: path.join(projectDir(p.id), "previews", p.revisionId, "36.png"),
    url,
  });
  console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(
  "artifacts/editing-smoke/results.json",
  JSON.stringify(
    { host: process.platform, node: process.version, results },
    null,
    2,
  ),
);
