# AI-driven documentary visuals: project audit and proposed setup

Implementation update: the first image-layer and rendered-review slice is now implemented. See [current setup, supported treatments, limits and qualification commands](AI_VIDEO_EDITING_SETUP.md). The audit and broader roadmap below describe the starting point and remaining extensions; they are not a claim that segmentation, 3D reconstruction, geographical routes, or word alignment have shipped.

Prepared 2026-10-17 from source inspection. This is a proposed upgrade, not an implemented capability or a live render qualification. The requested direction includes all three treatments: archival collage, cinematic reconstruction, and map-heavy explanation.

## Finding

The active system adds a small graphic to an already chosen image or clip. Documentary storytelling needs the AI to design the shot itself: choose several assets, determine their relationship, direct attention, time a reveal, and move the camera across the composition.

The existing React/TypeScript, Remotion, Sharp, FFmpeg, asset registry, and persistent editing jobs are useful foundations. Replacing them or adding another text-animation provider is unnecessary for the first version.

## What the source currently supports

| Source | Observed behavior | Consequence |
| --- | --- | --- |
| `server/src/services/editing/pipeline.ts` | Planner returns a restricted graphic kind; at most one graphic per scene; whole-video ceiling of 16 proposals | Cannot describe a multi-stage image collage or an evidence reveal |
| `server/src/services/editing/motionPackArtifacts.ts` | Compiles proposals with `nodes: []` and `assetRequestIds: []` | No additional visual assets are prepared for a graphic |
| `packages/video-composition/src/VideoComposition.tsx` | Displays one source image/video per scene and native graphics over it | No active renderer for independently animated image layers |
| `packages/video-composition/src/MotionGraphics.tsx` | Titles, badges, captions, outlined targets, a progress line, numerals, archival borders, and text callouts | `route` is not a geographical map; `frame` does not insert archival imagery; `diagram` is a text callout |
| `packages/editing-contracts/src/index.ts` | Retains older image/mask/path/keyframe schemas; `motionProject()` filters artifacts to native graphics, clears analyses/textures, and rebuilds asset IDs from source media/audio/fonts | Adding an image node alone would not survive the active preview/export path |
| `server/src/services/editing/timing.ts` | Reuses measured narration scene boundaries or approximate timing; assigns a small centered zoom to stills | No active word alignment or story-directed shot camera planning |
| `server/src/services/auto-edit.ts` | Automatically cycles still-motion choices by scene index; Documentary preset changes editing settings | Documentary is currently a preset, rather than a visual director |
| `server/src/services/editing/media.ts` | Imports owned source media and provides `cropAsset()` backed by Sharp | A real detail-inset effect can reuse pixels from an existing image |
| `server/src/services/comfyui.ts` and `server/workflows/flux_klein_t2i.json` | Image-generation integration and an existing text-to-image workflow | Cutouts, clean background plates, and map assets need their own verified workflows/adapters |

The older `AI_VIDEO_EDITING_IMPLEMENTATION_PLAN.md` describes broader compositions, but explicitly marks itself historical and superseded. It is useful design context, not evidence that those capabilities are active.

## One engine, three treatments

These treatments should share compositing primitives and can coexist within a single video. They are initial recipes, not an exhaustive enum of what the engine can draw.

| Treatment | Visual assets | Editing behavior | Important constraint |
| --- | --- | --- | --- |
| Archival collage | Photographs, scanned documents, newspaper clippings, portrait cutouts, subtle paper texture | Overlapping images, independent reveals, push toward a document, highlight an exact line, magnify a detail | Separate real source material from illustrative recreations; retain asset provenance |
| Cinematic reconstruction | Environment plate, subject cutout, foreground element, optional generated clip | Establishing shot, restrained parallax, motivated camera movement, cut to a close detail, ambient sound | A cutout alone is insufficient for parallax if it reveals the subject still baked into the background; prepare a clean plate or use another background |
| Map-heavy explanation | Geographical base map, place coordinates, route geometry, boundaries with dates where relevant | Establish location, move to region, reveal route, show progress, cut to related imagery | Generate styling around validated geography; do not let an image model invent route coordinates or historical borders |

## Proposed automatic pipeline

```mermaid
flowchart LR
  A[Script and sources] --> B[Narration and timing]
  B --> C[Story beats and shot plan]
  C --> D[Resolve images, clips, crops, masks and maps]
  D --> E[Compile layers, camera and timed cues]
  E --> F[Preview and bounded repair]
  F --> G[Shared player and MP4 export]
```

1. **Plan story beats.** Read a chapter or short sequence at once so the director can vary wide shots, details, evidence, geography, and reconstruction. Record what the viewer should understand, the exact supporting narration span, the treatment, required assets, and the intended focus. A scene containing one long narration passage can have several shots without changing its narration duration.
2. **Resolve assets.** Prefer existing images and actual crops. Add imported archival material, generated illustrative plates, transparent cutouts, and optional clips when required. Use separate asset roles such as background, subject, insert, document, map, and foreground. Asset requests must resolve into registered IDs before rendering.
3. **Compile a composition.** Convert the creative plan into validated image/video/text/shape/path layers, masks, crops, transforms, keyframes, and camera movements. AI returns data; the renderer executes supported operations deterministically. Use coherent channel style tokens and reusable recipes, while allowing supported primitives to be combined freely.
4. **Time visual events.** Use saved scene timing initially. Add forced alignment for phrase-specific document highlighting, route reveals, and cuts. Resolve cues using narration offsets/token spans, including the correct occurrence of a repeated phrase. Low-confidence alignment falls back to a scene-level cue.
5. **Review and repair.** Validate assets, timing, bounds, reference relationships, image resolution after zoom, and camera coverage. Render low-resolution previews and inspect representative frames and short motion intervals for bad cutouts, clutter, crop drift, and repetitive editing. Repair within a fixed budget; simplify optional effects if necessary.
6. **Export the same revision.** Preview and final rendering must use the same asset set, transforms, cue times, fonts, and shot plan. Persist input hashes and invalidate only affected downstream work after a change.

## Minimum useful composition model

Introduce a versioned documentary composition alongside the existing native graphics. Keep narration scenes and shot intervals distinct. Retain old revision loading; do not simply remove the compatibility filter globally and display retired projects.

Each shot needs:

- Parent narration scene, start/end frames, supporting narration span, and creative intent.
- Several ordered layers, each referencing a registered asset or supported drawing primitive.
- Layer bounds, crop/fit, opacity, transform, mask, and time/keyframe tracks.
- An explicit coordinate space: screen, composition/world, or source image.
- Camera keyframes and a rule for which layers follow the camera. Captions generally stay in screen space.
- Timed attention cues: document highlight, source-detail emphasis, insert reveal, route progression, or focus change.
- Asset provenance and diagnostic/fallback records.

Keep this model small initially: image layers, rectangular clipping/highlights, opacity/position/scale tracks, and camera movement are enough for the first useful slice. Add masks, selected video behavior, arbitrary paths, and advanced treatments as verified extensions. Do not claim existing schema definitions are a working renderer.

## Effects to build first

| Effect | Implementation | Expected benefit |
| --- | --- | --- |
| Image over image | Independent image layers with position, scale, opacity, crop, shadow, and restrained entrance/exit | Turns a slideshow into a composed visual explanation |
| Detail magnification | Sharp crop of actual source pixels; inset plus source region linked through the camera transform | Directs attention to real detail without relying on a generic arrow |
| Document highlight | Scan plus OCR/known line geometry; highlight rectangle or underline in document coordinates | Connects a spoken claim to a specific passage |
| Foreground/background parallax | Subject mask/cutout plus clean/separate background; small differential movement | Creates depth from still assets |
| Real map route | Map image/vector plus validated coordinates and projected path | Explains geographical movement rather than displaying a progress bar |
| Evidence comparison | Two or more images with coordinated reveal/crop and a short explanatory label | Makes similarities, differences, and before/after relationships visible |

For document highlights, obtain line geometry through an OCR adapter or authored fixture data and verify that the intended text is present. A narration quote and a vision-estimated object box do not establish the location of a document line.

For moving-video highlights, add actual temporal tracking before drawing a persistent attached region. The present pipeline inspects one sampled video frame, which cannot establish a moving target trajectory. Screen-space inserts can work without tracking.

## Setup using the existing stack

| Component | Keep or add | Setup work |
| --- | --- | --- |
| Visual director | Extend existing Gemini vision/structured JSON adapter | Discover an accessible vision model, use the existing server credential mechanism, separate shot planning from label planning, and validate every response |
| Compositor | Keep Remotion and the shared composition package | Add a layer renderer and camera evaluation; expose the same documentary composition to Player and server renderer |
| Image processing | Keep Sharp | Reuse crops and thumbnails; add derived-asset metadata and effective-resolution checks |
| Subject extraction | Add a verified ComfyUI background-removal workflow | Evaluate BiRefNet on the actual installed ComfyUI version and target images; export a pinned API workflow and register both alpha output and mask |
| Background plates | Extend image generation selectively | Generate a separate plate or inpaint behind an extracted subject before revealing background through camera movement |
| Word/phrase synchronization | Add an alignment worker/adapter | Evaluate WhisperX against English, Hindi, and code-switched fixtures; pin dependencies in a separate environment; cache by narration/audio/model hashes |
| Maps | Add map asset and projection adapter | Start with imported/licensed map assets and known coordinates; add automated retrieval and historical map support separately |
| Video generation | Reuse existing clip/Flow integration where it works | Treat generated clips as one asset source; qualify actual output durations before admitting them to a shot |
| Sound | Reuse FFmpeg mixing and ducking | Add a small ambience/SFX asset track, then tie cues to meaningful visual actions |
| Jobs | Extend current scheduler/checkpoints | Include asset preparation, preview, QA and bounded repair stages; cache reusable work and queue GPU-heavy stages conservatively |

The repository contains a Flow browser worker even though some older mixed-media documentation calls Flow a future integration. Its live reliability, output duration, and fit with the fixed 10-second mixed-media slot contract were not established in this audit. New shot timing should live inside narration scenes; do not silently change those legacy media-duration contracts.

The local-AI documentation describes an RTX 3050 with 6 GB VRAM; this audit did not verify that hardware on the current Mac. Benchmark the actual target machine. Begin with one GPU task at a time and low-resolution preview renders; avoid promising that video generation, TTS, segmentation, and alignment will all run concurrently.

Current official ComfyUI documentation describes native BiRefNet support, RGBA output, and placement under `models/background_removal/`. It also warns that older/stable installations may lack the required nodes. Verify a standalone cutout before wiring it into automatic generation; do not update a working ComfyUI installation blindly.

## Implementation order and acceptance

1. **Prove layered rendering with authored fixtures.** Render a short sequence from existing media: overlapping images, a source-detail inset, and a document highlight. Introduce the new versioned contract and asset dependency collection first. Acceptance: all layers survive storage, load in preview, and appear at matching times in MP4; narration is preserved.
2. **Connect automatic planning.** Extend the director to output story beats, shot choices, asset requests, and timed compositions. Reuse the existing job/revision lifecycle. Acceptance: a script plus ready source assets produces the sequence automatically, and revising one shot preserves unrelated work.
3. **Add cutouts, clean plates, and cue alignment.** Verify real ComfyUI outputs and language-specific alignment. Acceptance: restrained parallax has no duplicated subject/background holes; highlights match the intended phrase and source passage; failed optional extraction falls back visibly in diagnostics.
4. **Add geographical maps and cinematic clips.** Qualify a map projection/route adapter and clip duration handling. Acceptance: a validated route follows real coordinates; imported/generated clips fit their shot without cutting narration or violating legacy slots.
5. **Qualify all three treatments together.** Produce a 45–60 second automatically directed sequence mixing archival evidence, cinematic reconstruction, and geographical orientation. Check readability, meaningful shot variation, camera/mask stability, duration, preview/export agreement, and live provider failure/cancellation behavior.

A first proof should use real existing project images, not only placeholder rectangles. For a document highlight test, include an actual scan or an explicitly illustrative fixture. The visual quality review should watch rendered motion, not only still screenshots.

## Main integration points

- `packages/editing-contracts/src/index.ts`: versioning, documentary composition, cross-reference validation, reachable asset dependencies, and explicit compatibility behavior.
- `packages/video-composition/src/VideoComposition.tsx`: shot scheduling and layer composition in preview/export.
- `packages/video-composition/src/`: focused layer/camera/cue renderers and their frame mathematics.
- `server/src/services/editing/pipeline.ts`: story direction, asset preparation, composition compilation, preview and repair stages.
- `server/src/services/editing/media.ts`: derived crops, masks, metadata and resolution checks.
- `server/src/services/editing/renderer.ts`: serve every approved referenced asset and validate the new composition; avoid sanitizing away new layers.
- `server/src/services/editing/timing.ts`: optional measured cue alignment while preserving existing scene timing.
- `src/components/artifacts/ArtifactsTab.tsx`: whole-shot preview, treatment/style controls, selected-shot revisions, and layer visibility.
- Autopilot orchestration: invoke documentary visual preparation after required source media/narration and before final rendering; integrate after the first slice works independently.

## Primary references checked

- [Remotion Player](https://www.remotion.dev/docs/player): embedding the shared composition in React.
- [Remotion animation](https://www.remotion.dev/docs/animating-properties): frame-driven animation.
- [Remotion server rendering](https://www.remotion.dev/docs/renderer/render-media): rendering the composition to media.
- [ComfyUI BiRefNet workflow](https://docs.comfy.org/tutorials/utility/remove-background-birefnet): subject extraction, RGBA output, model location and version caveats.
- [WhisperX](https://github.com/m-bain/whisperX): word alignment and language-specific model limitations; actual target-language quality still needs qualification.

No application behavior, model installation, provider credentials, or runtime services were changed by this audit. Existing unrelated working-tree changes were left intact.
