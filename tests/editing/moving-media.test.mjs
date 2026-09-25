import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "editing-moving-"));
const {fixture} = await import("./fixtures.mjs");
const {runMedia} = await import("../../server/dist/services/media-process.js");
const {registerMedia} = await import("../../server/dist/services/editing/media.js");
const {sceneThumbnails} = await import("../../server/dist/services/editing/sceneMedia.js");
const {generatedDir} = await import("../../server/dist/services/workspace.js");
const {projectDir} = await import("../../server/dist/services/editing/repository.js");
const {exportVideo} = await import("../../server/dist/services/editing/renderer.js");
const {validateProject} = await import("@tubeflow/editing-contracts");

test("mixed timeline preserves stills, moving frames, overlays, short-clip hold and full narration", async () => {
  const p = await fixture();
  const dir = path.join(generatedDir(), p.scriptId);
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, "motion.mp4");
  await runMedia("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=red:s=640x360:r=24:d=0.25", "-f", "lavfi", "-i", "color=blue:s=640x360:r=24:d=0.25", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", file]);
  const clip = await registerMedia(p.scriptId, `/api/generate/file/${p.scriptId}/motion.mp4`, "video");
  assert.equal(clip.mime, "video/mp4");
  const samples = await sceneThumbnails(clip.id, new AbortController().signal, 2);
  assert.equal(samples.length, 3);
  assert.notEqual(samples[0], samples[2], "AI sees changing source frames");
  const first = {...p.scenes[0], endFrame: 24, camera: [{frame: 0, x: 0, y: 0, scale: 1}]};
  const second = {...first, id: "scene-1", assetId: clip.id, startFrame: 24, endFrame: 72};
  delete second.analysisId;
  p.scenes = [first, second];
  p.inputs.imageAssets.push({assetId: clip.id, hash: clip.hash, promptIndex: 1, prompt: "changing colors"});
  p.assetIds.push(clip.id);
  const a = p.artifacts[0];
  a.sceneId = second.id; a.startFrame = 24;
  a.nodes = [a.nodes.find(n => n.kind === "text")];
  a.nodes[0].text = "bronze"; a.nodes[0].bounds = {x: 24, y: 24, width: 180, height: 50};
  validateProject(p);
  const id = randomUUID();
  await exportVideo(p, id, new AbortController().signal, () => {});
  const output = path.join(projectDir(p.id), "renders", id, "video.mp4");
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir(p.id), "renders", id, "manifest.json")));
  assert.equal(manifest.frameCount, 72);
  assert.equal(manifest.audioAssetId, p.inputs.audioAssetId);
  const colors = [];
  for (const frame of [0, 24, 42, 71]) {
    const png = path.join(dir, `frame-${frame}.png`);
    await runMedia("ffmpeg", ["-v", "error", "-i", output, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-y", png]);
    const rgb = await sharp(png).extract({left: 400, top: 180, width: 1, height: 1}).removeAlpha().raw().toBuffer();
    colors.push([...rgb]);
    if (frame === 24) {
      const overlay = await sharp(png).extract({left: 25, top: 25, width: 1, height: 1}).removeAlpha().raw().toBuffer();
      assert.ok(overlay[0] < 100, "artifact background overlays the red moving scene");
    }
  }
  assert.ok(colors[1][0] > 200 && colors[1][2] < 30, "clip starts at local frame zero after still");
  assert.ok(colors[2][2] > 200 && colors[3][2] > 200, "moving clip reaches blue then holds through narration end");
  assert.notDeepEqual(colors[0], colors[1], "preceding still remains in the timeline");
});
