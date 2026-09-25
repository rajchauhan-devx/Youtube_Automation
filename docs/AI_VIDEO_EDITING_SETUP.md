# AI-directed editing: setup and qualification

Implemented on branch `feature/ai-directed-video-editing`, 2026-09-23/24.
The requested specification is preserved in
[AI_VIDEO_EDITING_IMPLEMENTATION_PLAN.md](AI_VIDEO_EDITING_IMPLEMENTATION_PLAN.md).

## Current behavior

The **Artifacts** tab sits after Generation. Select an explicit narration/voice,
optional art direction and density, then **Generate visual edit**. The scheduler
creates an immutable media snapshot, aligns/maps narration, directs style,
inspects images, plans free-form compositions, resolves assets, validates layout,
renders preview samples, and reviews them. Empty artifact lists are valid.
Primitive graphs are data, never executable model code or a fixed effect catalog.

The shared Remotion composition powers both the browser player and MP4 export.
The enhanced editor has real scene/artifact tracks, scrubbing, playback and
revision selection. Cards support natural-language revision, regeneration and
enable/disable. A failed artifact revision leaves the current usable revision
unchanged. **Timeline & Render** explicitly switches between legacy and enhanced
modes. Enhanced exports use the chosen immutable ready revision and its audio;
there is no independent duration/zoom setting. Nothing publishes to YouTube.

The new pipeline is **disabled until configured**. Legacy image/audio generation,
scripts, presenter, music and export remain available. Old audio without saved
TTS text must be regenerated once; the application does not assume a current
script still matches an old recording. Newly generated narration records its
submitted text and audio content hash in a sidecar.

## Install and build

```powershell
npm ci
npm ci --prefix server
npm run build:all
npm run dev
```

Root installation is required: shared workspace packages and renderer/image/font
dependencies are installed at the repository root. The server remains a separate
package; its build compiles workspace packages first, then server workers, and
copies versioned prompts to `server/dist/prompts/editing`. Development startup
also builds the worker. Production uses `npm start --prefix server` after the
build; do not deploy `server/dist` without the root packages/dependencies.

Observed host: Windows, Node 24.16.0, npm 11.13.0, FFmpeg/ffprobe on PATH, Microsoft
Edge installed. The renderer selects local Edge/Chrome when found; on another
host set `EDITING_BROWSER_EXECUTABLE` to a supported Chromium executable.
No Python ML packages were installed into the application or existing TTS venv.

Pinned Remotion packages: **4.0.527**, matched across core/player/bundler/renderer.
Sharp: **0.35.4**. Zod: **4.6.5**. Fontsource Noto Sans/Devanagari packages provide
local WOFF2 fonts under the SIL Open Font License. Font files are hashed, served
from the registry and loaded before capture. Review the applicable
[Remotion license](https://github.com/remotion-dev/remotion/blob/main/packages/core/LICENSE.md)
before product distribution; this implementation does not establish eligibility
for free use. Rendering API reference:
[renderMedia](https://www.remotion.dev/docs/renderer/render-media).

## Server configuration

Put values in the existing server environment (typically `server/.env`). Never use
`VITE_` variables for credentials. Model names below are deliberately placeholders.

```dotenv
AI_EDITING_ENABLED=true
EDITING_PLANNER_MODEL=<available structured-output model>
EDITING_VISION_MODEL=<available image-input and structured-output model>
EDITING_REVIEW_MODEL=<available image-input and structured-output model>
# OPENROUTER_API_KEY=<server credential, or use existing browser settings>
EDITING_MAX_REPAIR_ATTEMPTS=2
EDITING_MAX_PROVIDER_CALLS=40
EDITING_MAX_GENERATED_ASSETS=4
EDITING_RENDER_CONCURRENCY=1
EDITING_GPU_CONCURRENCY=1
EDITING_PROVIDER_TIMEOUT_MS=120000
EDITING_RENDER_TIMEOUT_MS=1800000
# EDITING_BROWSER_EXECUTABLE=C:/path/to/chrome.exe
# EDITING_ALIGNMENT_URL=http://127.0.0.1:8765
# EDITING_GROUNDING_URL=http://127.0.0.1:8766
# EDITING_ARTIFACT_WORKFLOW_PATH=C:/path/to/verified-artifact-manifest.json
# EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH=C:/path/to/verified-removal-manifest.json
```

`GET /api/editing/capabilities?verify=true` checks configured model IDs against
OpenRouter's model metadata. A configured name alone is not evidence of working
image input/structured outputs. HTTP 401/402 becomes `needs_configuration`; after
fixing credentials/billing use **Resume**. Request attempts and provider-reported
token usage are persisted; keys are never persisted. Failed requests have unknown
usage, not a monetary cost estimate.

The existing `TUBEFLOW_DATA_DIR` selects the storage root and retains account/profile
isolation. No separate global editing directory bypasses workspace boundaries.
Data lives in workspace-local `editing` and `editing-assets` directories.
Generated media is copied by hash; original files are not moved or rewritten.
Back up these directories alongside scripts/generated media.

### Local AI through Ollama

All three AI roles can run locally using an installed vision model. Prefix its
Ollama name with `ollama/`. For the model inspected on this computer:

```dotenv
AI_EDITING_ENABLED=true
EDITING_PLANNER_MODEL=ollama/qwen3.5:4b
EDITING_VISION_MODEL=ollama/qwen3.5:4b
EDITING_REVIEW_MODEL=ollama/qwen3.5:4b
EDITING_LOCAL_CONTEXT=16384
EDITING_LOCAL_OUTPUT_TOKENS=4096
EDITING_LOCAL_TIMEOUT_MS=300000
```

This host has an RTX 3050 Laptop GPU with 6 GB VRAM, 16 GB RAM, and Qwen 3.5 4B
already installed in Ollama (Q4_K_M, approximately 3.2 GiB on disk). `/api/show`
reported completion and vision capabilities. The first synthetic image check
correctly identified a blue circle and returned schema-valid JSON in 17.9 seconds.
That measurement includes loading/unloading and is not a throughput promise.

These settings are now enabled in this host's ignored `server/.env`; the running
capabilities endpoint reports **Local · Ollama**, ready, with no missing settings.
Refresh the Artifacts tab to reload capabilities. The latest real local pipeline
test completed six model requests (style, analysis, planning, composition, repair
and review) and exported an MP4 in 134 seconds. Its generated composition passed
structural/layout checks but was omitted after visual review, leaving **zero
artifacts**. This verifies local inference and the render/fallback path, not reliable
automatic artifact quality. The small model's composition and review quality need
further qualification; do not interpret a completed render as artifact acceptance.

The adapter uses loopback `127.0.0.1:11434`, native image bytes and JSON-schema
structured output. Local-only roles require no API key and do not use OpenRouter.
It disables thinking, processes requests sequentially and unloads the model after
each call. Active image/TTS/music/presenter or local text work prevents an overlapping
artifact-model request. Cancellation aborts inference and requests model unloading.
It never downloads a model automatically. Oversized requests fail explicitly;
long projects may need scene batching or a larger model/context than this initial
local adapter supports. Generated raster artwork remains a separate ComfyUI task.

The Artifacts screen shows the configured local provider. A mixed-media timeline
containing moving clips is rejected explicitly instead of exporting only its still
images. The legacy mixed-media renderer retains its complete image/video support.

Local smoke command (synthetic fixtures; maximum ten AI requests):

```powershell
$env:EDITING_SMOKE_MODEL='ollama/qwen3.5:4b'
npm run test:editing:live
```

Contracts: [Ollama structured output](https://docs.ollama.com/capabilities/structured-outputs)
and [native vision input](https://docs.ollama.com/capabilities/vision).

## Alignment, grounding and assets

See [the isolated alignment service](../services/alignment/README.md). It provides
a cancellable subprocess adapter for WhisperX, pinned at 3.8.6, with transcript
correspondence checks and original text offsets. Its `uv.lock` includes resolved
transitive dependencies and hashes for Python 3.11/3.12. Frozen installation,
model installation and runtime qualification remain deployment setup.

When alignment is unavailable, synchronized long-video TTS uses its measured PCM
scene boundaries in phrase mode. Other narration gets explicit approximate timing
with zero confidence; precision cues are disabled and artifacts occupy their owning
scene. Approximation is not a claim of word alignment. Audio duration always comes
from ffprobe. Scene mapping uses narrative token IDs, including repeated phrases.

Grounding is an optional configured service contract: `POST /ground`, multipart
`image` plus `analysis`, returning the shared `SceneAnalysis` schema with identical
asset/hash/dimensions and detector evidence. No grounding model/service was installed
or qualified locally. Vision-estimated boxes **cannot** produce precise pointers.
Accepted grounded objects require confidence >=0.8 and a non-vision localization
method. This threshold is an operational policy, not a measured accuracy guarantee.

See [artifact workflow setup](../server/workflows/artifacts/README.md) for ComfyUI.
Source reuse and actual-image crops work without a generation provider. New raster
generation requires a separately verified workflow. Optional failures simplify or
omit graphics with diagnostics. Background scenes/narration remain mandatory.

## Persistence, limits and recovery

- One file-backed scheduler owner per data root, with a PID lock. A second active
  server fails clearly. Restart marks unfinished jobs interrupted; **Resume** reuses
  matching checkpoints. It does not silently recover missing browser credentials.
- UUID routes, atomic sibling-file renames, immutable revisions, optimistic conflict
  checks, content hashes, symlink containment and registered media routes.
- Enqueues are idempotent. Cancellation reaches fetches, the alignment subprocess,
  owned pending ComfyUI requests and the render worker. Late output is not served as
  success. Partial local render files are removed on normal cancellation.
- Default one GPU artifact task; existing image/TTS/music/presenter paths respect
  the reservation. A running ComfyUI prompt may finish after cancellation because
  global interruption would affect unrelated work. Its output is discarded.
- Maximum 160 scenes/artifacts, 128 nodes per artifact, graph depth 8, 256 path
  commands, 20 generated assets/configurable lower budget, 100 provider attempts,
  five explicit job attempts. No arbitrary CSS, scripts, remote media URLs, video
  nodes, 3D, particle systems, GIF playback or path morphing.
- Deleting a script cancels its editing jobs and removes owned project outputs.
  Asset collection preserves references in other projects and historical revisions;
  collection is deferred while another import/job is active. Empty hash directories
  and deferred orphan cache records may remain for conservative retention.
- Labels use wording from cited narration; claims remain internally marked as
  unverified script claims. This provenance policy is intentionally conservative
  and does not establish factual correctness.

Corrupt project JSON raises an explicit storage error; it is not silently reset.
Restore the affected record from backup. For a stale input or revision conflict,
refresh and create a new input revision. Existing ready history can still be viewed
or explicitly exported with its original selected audio.

## Verification and observed limits

Discoverable checks:

```powershell
npm run typecheck
npm run build
npm run lint
npm run build --prefix server
npm test
npm run test:editing
npm run test:editing:render
npm run test:editing:browser
py -3.12 -m unittest discover -s services/alignment -p test_adapter.py -v
# Optional, sends synthetic fixtures only and caps requests at 10:
$env:EDITING_SMOKE_MODEL='<inspected image + structured-output model>'
npm run test:editing:live
```

Baseline before changes: frontend typecheck/build and server build passed; lint had
**281 errors and 109 warnings**. Sandbox filesystem restrictions initially blocked
esbuild; the same build passed with appropriate host access. Existing regression
suite: **79/79 passed**; the editing suite passes **39/39** (118 total), and the isolated Python
adapter tests pass **4/4**. New coverage includes schemas,
geometry, full-frame anchor math, factual-label provenance, revision conflicts,
scoped media/ranges, job idempotency/restart/resume/cancel, malformed provider JSON,
bounded repair, actual preview renders, compiled worker resolution, MP4 generation,
worker cancellation, deletion and retained shared assets. Browser automation checks
Hindi text, scrubbing, enable/disable, refresh persistence and enhanced editor entry.
Workflow adapter tests cover reference upload, separate alpha removal, workflow
content/seed cache invalidation and owned prompt cancellation. Python adapter tests
cover repeated Hindi/code-switched words, UTF-16 offsets, omitted/low-confidence
words and cancellation before a model starts, without loading any ML dependencies.
The full lint comparison retained the baseline **281 errors and 109 warnings**, with
no new diagnostics. A subsequent focused check identified an existing unused catch
binding in `ollama.ts`; that binding has also been removed.

Five local 3-second/24-fps fixtures rendered: museum annotation, technology diagram,
Hindi/mixed-language science in both orientations, and a quiet scene. Resolutions:
640x360 and 360x640. Each includes a synthetic tone, not human narration. First-run
preview+MP4 elapsed times were approximately 5.4–13.3 s; a repeat while other builds
were active took 9.9–38.3 s. These are observations, not 1080p throughput promises.
Final exports inspect exact frame count, video duration and audio duration separately.
Synthetic pointer error remained below 2 px over every fixture frame. Hindi glyphs
and the corrected nonrectangular cutout were visually inspected.

Machine-local evidence is under `artifacts/editing-smoke/` (ignored by Git): MP4
locations/results, browser screenshot and live-provider result. Peak GPU/RAM usage,
1080p long-video performance, and provider monetary cost were not measured.

## Remaining release qualification

The complete release acceptance matrix is **not yet qualified**:

1. Live OpenRouter: one inspected model timed out; a second returned HTTP 402. No
   successful cloud AI-to-MP4 result or actual cloud provider usage/cost can be claimed.
   Local Ollama completed inference and export, but review omitted the composition;
   a successful live export retaining an AI-generated artifact remains unqualified.
2. ComfyUI was offline at `127.0.0.1:8188`; no artifact/alpha workflow or model nodes
   were verified. Raster generation and grounding adapters need live service checks.
3. WhisperX/model weights were not installed. English/Hindi/code-switch cue accuracy
   against human annotations, including the 200 ms median target, remains unmeasured.
4. Reference-image and separate background-removal bindings have deterministic adapter
   tests, but need verified installed workflows. Authenticated retrieval and a
   detector-specific grounding implementation are not included; unavailable requests
   fall back explicitly.
5. Geometry and text fit are checked deterministically, but visual review samples
   selected frames. Comprehensive long-clip layout/perceptual qualification and
   runtime verification of the locked Python environment remain release work.

No existing credentials were changed, no heavyweight ML models were installed,
and nothing was deployed or published.
