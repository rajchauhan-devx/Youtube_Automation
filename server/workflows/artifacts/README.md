# Artifact workflow adapter

This directory deliberately contains no purportedly verified workflow JSON. The
local ComfyUI endpoint was offline during implementation, so installed nodes,
model files, reference conditioning and alpha output could not be qualified.
Existing scene-image workflows are unchanged.

Export a working **API-format** ComfyUI workflow after testing it in your installed
ComfyUI. Wrap it in the following manifest and set
`EDITING_ARTIFACT_WORKFLOW_PATH` to that manifest. Node identifiers below are
placeholders, not an installed workflow:

```json
{
  "version": "your-tested-model-and-workflow-version",
  "workflow": {},
  "bindings": {
    "prompt": { "node": "PROMPT_NODE", "input": "text" },
    "width": { "node": "LATENT_NODE", "input": "width" },
    "height": { "node": "LATENT_NODE", "input": "height" },
    "seed": { "node": "SAMPLER_NODE", "input": "seed" }
  },
  "outputNode": "SAVE_IMAGE_NODE",
  "referenceBindings": [],
  "alpha": false
}
```

Use a distinct SaveImage prefix such as `tubeflow-artifacts/`; never use existing
scene-image filenames. The adapter checks actual node availability, bindings,
output decoding, dimensions, blank images, and real alpha. Generated assets are
copied into content-addressed editing storage. A transparent request requires a
tested workflow with background removal/alpha output and `alpha: true`; opaque
or checkerboard-in-RGB results are rejected. No naive white color keying occurs.

For a reference-conditioned workflow, list its LoadImage input bindings in
`referenceBindings`, for example `[{"node":"REFERENCE_NODE","input":"image"}]`.
The request must supply exactly that many registered reference images, in order.
The adapter uploads decoded PNGs to the separate `tubeflow-artifacts` input folder.
Workflows without reference conditioning use an empty list. Explicit request seeds
are supported; absent seeds derive deterministically from the generation inputs.
Cache keys include workflow file contents, source/reference hashes, style and seed.

For an opaque generator, set `EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH` to a
separately tested API workflow manifest:

```json
{
  "version": "your-tested-background-removal-version",
  "workflow": {},
  "imageBinding": { "node": "LOAD_IMAGE_NODE", "input": "image" },
  "outputNode": "SAVE_ALPHA_IMAGE_NODE",
  "alpha": true
}
```

The adapter uploads the generated/reused/cropped image into that workflow and
checks the returned dimensions and actual alpha. Standard SaveImage prefixes
are replaced with a per-run `tubeflow-artifacts/` prefix. Test custom output nodes
for their own filename behavior. This adapter is covered by deterministic provider
tests; the placeholder manifests are not functioning or verified node graphs.
Requests requiring unavailable capabilities fall back to source crops or vector
primitives. Retrieval is explicitly unavailable.
Cancellation removes only this prompt from the pending queue; ComfyUI has no
verified per-running-prompt interruption here. Running results are discarded;
the adapter never sends a global `/interrupt`.

Background-removal reference:
https://github.com/Comfy-Org/docs/blob/main/tutorials/utility/remove-background-birefnet.mdx

Upload/prompt/queue adapter contract: https://github.com/Comfy-Org/ComfyUI/blob/master/server.py
