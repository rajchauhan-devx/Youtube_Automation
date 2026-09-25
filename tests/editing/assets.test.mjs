import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-assets-"),
);
const { saveAsset, assetFile } = await import(
  "../../server/dist/services/editing/repository.js"
);
const { assetCacheKey } = await import(
  "../../server/dist/services/editing/artifactWorkflow.js"
);
const { buildAsset } = await import(
  "../../server/dist/services/editing/assets.js"
);
const { presenterState } = await import(
  "../../server/dist/services/presenter-state.js"
);
const opaque = await sharp(
  Buffer.from(
    '<svg width="64" height="64"><rect width="64" height="64" fill="white"/><circle cx="32" cy="32" r="20" fill="blue"/></svg>',
  ),
)
  .png()
  .toBuffer();
const cutout = await sharp(
  Buffer.from(
    '<svg width="64" height="64"><circle cx="32" cy="32" r="20" fill="blue"/></svg>',
  ),
)
  .png()
  .toBuffer();
const source = saveAsset(opaque, {
  mime: "image/png",
  width: 64,
  height: 64,
  alpha: false,
  method: "fixture",
  providerVersion: "fixture-v1",
});
const request = {
  id: "asset-one",
  strategy: "generate",
  purpose: "blue diagram",
  prompt: "blue circle",
  width: 64,
  height: 64,
  transparent: true,
  styleId: "story",
  referenceAssetIds: [source.id],
  seed: 42,
};
const generation = {
  version: "fixture-gen-1",
  alpha: false,
  outputNode: "save",
  workflow: {
    generator: {
      class_type: "FixtureGenerate",
      inputs: { prompt: "", width: 64, height: 64, seed: 0 },
    },
    reference: { class_type: "LoadImage", inputs: { image: "" } },
    save: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "legacy-prefix" },
    },
  },
  bindings: Object.fromEntries(
    ["prompt", "width", "height", "seed"].map((input) => [
      input,
      { node: "generator", input },
    ]),
  ),
  referenceBindings: [{ node: "reference", input: "image" }],
};
const removal = {
  version: "fixture-alpha-1",
  alpha: true,
  outputNode: "save",
  workflow: {
    load: { class_type: "LoadImage", inputs: { image: "" } },
    remove: { class_type: "FixtureRemove", inputs: {} },
    save: {
      class_type: "SaveImage",
      inputs: { filename_prefix: "legacy-prefix" },
    },
  },
  imageBinding: { node: "load", input: "image" },
};
process.env.EDITING_ARTIFACT_WORKFLOW_PATH = path.join(
  process.env.TUBEFLOW_DATA_DIR,
  "generation.json",
);
process.env.EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH = path.join(
  process.env.TUBEFLOW_DATA_DIR,
  "removal.json",
);
fs.writeFileSync(
  process.env.EDITING_ARTIFACT_WORKFLOW_PATH,
  JSON.stringify(generation),
);
fs.writeFileSync(
  process.env.EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH,
  JSON.stringify(removal),
);
test("cache follows workflow contents, references and seed while ignoring ephemeral request IDs", () => {
  const before = assetCacheKey(request, { direction: "museum" });
  assert.equal(
    before,
    assetCacheKey({ ...request, id: "other" }, { direction: "museum" }),
  );
  assert.notEqual(
    before,
    assetCacheKey({ ...request, seed: 43 }, { direction: "museum" }),
  );
  fs.writeFileSync(
    process.env.EDITING_ARTIFACT_WORKFLOW_PATH,
    JSON.stringify({ ...generation, version: "fixture-gen-2" }),
  );
  assert.notEqual(before, assetCacheKey(request, { direction: "museum" }));
  fs.writeFileSync(
    process.env.EDITING_ARTIFACT_WORKFLOW_PATH,
    JSON.stringify(generation),
  );
});
function provider({ invalidAlpha = false, pending = false, controller } = {}) {
  const previous = globalThis.fetch,
    prompts = [],
    uploads = [],
    cancellations = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/upload/image") {
      const file = options.body.get("image");
      uploads.push(Buffer.from(await file.arrayBuffer()));
      return Response.json({
        name: file.name,
        subfolder: "tubeflow-artifacts",
        type: "input",
      });
    }
    if (parsed.pathname === "/object_info")
      return Response.json(
        Object.fromEntries(
          ["LoadImage", "SaveImage", "FixtureGenerate", "FixtureRemove"].map(
            (n) => [n, {}],
          ),
        ),
      );
    if (parsed.pathname === "/queue") {
      if (options.method === "POST")
        cancellations.push(JSON.parse(options.body));
      return Response.json({ queue_running: [], queue_pending: [] });
    }
    if (parsed.pathname === "/prompt") {
      prompts.push(JSON.parse(options.body).prompt);
      return Response.json({ prompt_id: `owned-${prompts.length}` });
    }
    if (parsed.pathname.startsWith("/history/")) {
      if (pending) {
        controller.abort();
        throw new Error("Cancelled");
      }
      return Response.json({
        [`owned-${prompts.length}`]: {
          outputs: {
            save: {
              images: [
                {
                  filename: `${prompts.length}.png`,
                  subfolder: "tubeflow-artifacts",
                  type: "output",
                },
              ],
            },
          },
        },
      });
    }
    if (parsed.pathname === "/view")
      return new Response(
        prompts.length === 1 || invalidAlpha ? opaque : cutout,
      );
    throw new Error(`Unexpected provider operation ${parsed.pathname}`);
  };
  return {
    prompts,
    uploads,
    cancellations,
    restore: () => {
      globalThis.fetch = previous;
    },
  };
}
test("reference-conditioned generation runs separate removal and preserves original media", async () => {
  const fake = provider();
  try {
    const asset = await buildAsset(request, new AbortController().signal);
    assert.equal(asset.alpha, true);
    assert.equal(asset.seed, 42);
    assert.equal(fake.prompts.length, 2);
    assert.equal(fake.uploads.length, 2);
    assert.deepEqual(fs.readFileSync(assetFile(source.id)), opaque);
    assert.equal(fake.prompts[0].generator.inputs.seed, 42);
    assert.match(
      fake.prompts[0].reference.inputs.image,
      /^tubeflow-artifacts\//,
    );
    assert.match(fake.prompts[1].load.inputs.image, /^tubeflow-artifacts\//);
    assert.ok(
      fake.prompts.every((p) =>
        p.save.inputs.filename_prefix.startsWith("tubeflow-artifacts/"),
      ),
    );
    assert.equal(presenterState.editingRequests, 0);
  } finally {
    fake.restore();
  }
});
test("RGB-only removal output is rejected and the GPU reservation is released", async () => {
  const fake = provider({ invalidAlpha: true });
  try {
    await assert.rejects(
      buildAsset(request, new AbortController().signal),
      /real transparency/,
    );
    assert.equal(presenterState.editingRequests, 0);
  } finally {
    fake.restore();
  }
});
test("generation cancellation removes only its owned prompt and cannot return an asset", async () => {
  const controller = new AbortController(),
    fake = provider({ pending: true, controller });
  try {
    await assert.rejects(buildAsset(request, controller.signal));
    assert.deepEqual(fake.cancellations, [{ delete: ["owned-1"] }]);
    assert.equal(presenterState.editingRequests, 0);
  } finally {
    fake.restore();
  }
});
