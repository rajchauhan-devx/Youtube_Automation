import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/editing-render-data");
const { fixture } = await import("./motion-fixtures.mjs");
const { exportVideo, previewFrames } = await import(
  "../../server/dist/services/editing/renderer.js"
);
const { projectDir } = await import(
  "../../server/dist/services/editing/repository.js"
);
const results = [];
for (const [theme, portrait, empty, kind] of [
  ["museum", false, false, "title"],
  ["technology", true, false, "title"],
  ["science", false, false, "title"],
  ["science", true, false, "title"],
  ["museum", false, false, "spotlight"],
  ["museum", true, false, "lower-third"],
  ["museum", true, false, "badge"],
  ["museum", true, true, "title"],
]) {
  const p = await fixture(theme, portrait, empty, kind),
    id = randomUUID(),
    start = Date.now();
  const previews = await previewFrames(p, new AbortController().signal);
  const url = await exportVideo(p, id, new AbortController().signal, () => {});
  results.push({
    theme,
    portrait,
    empty,
    kind,
    seconds: 3,
    width: p.inputs.width,
    height: p.inputs.height,
    elapsedMs: Date.now() - start,
    output: path.join(projectDir(p.id), "renders", id, "video.mp4"),
    preview: previews[Math.floor(previews.length / 2)].file,
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
