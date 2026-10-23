# Antigravity implementation handoff: generative motion graphics

Prepared: 24 October 2026. Repository: `Youtube_Automation`.

## 1. Objective and completion standard

Implement an end-to-end system that reads narration and scene context, decides whether a graphic helps, generates a validated composition of visual primitives, and renders that same composition in the editor and exported video.

The user wants scene-specific graphics beyond a fixed menu of cards. A new branching diagram, comparison, annotated image, timeline, or data visualization must be expressible through data without adding a new TypeScript template. Reusable primitives, layout algorithms, materials, and animation functions are expected. Fixed compositions must not be the mandatory output of the new generation path.

Deliver working application integration, not only schemas, prompts, a standalone renderer, or a manually authored demo. Finish with actual AI-generated examples, tests, rendered videos, and an implementation report.

No architecture document guarantees zero defects. Resolve uncertainties through the gates below. Do not describe untested capabilities as complete.

### Required behavior

- AI chooses editorial purpose first, then composition and channel styling.
- AI can choose no graphic. Missing evidence must not become fabricated facts.
- AI returns structured data, never executable JavaScript, HTML, arbitrary CSS, or shell commands.
- A stored graph is sufficient to replay/export without another AI request.
- Preview, review screenshots, and export use the same resolved graph and runtime.
- Rendering is deterministic for a given graph, assets, renderer version, and frame.
- Generation latency, preview playback rate, and offline export speed are measured separately. A 60 FPS video need not render in real time.
- Respect the project's FPS and dimensions. Do not silently convert every project to 60 FPS.
- Preserve existing projects, narration, media, captions, camera behavior, account isolation, and revision history through migration.
- Do not publish videos, upload source media to a new service, or alter unrelated automation as part of this implementation.

## 2. Repository findings that must influence the implementation

These findings were checked against local source. Recheck the current working tree before editing because other work is underway.

| Area | Existing implementation | Consequence |
|---|---|---|
| Contracts | `packages/editing-contracts/src/index.ts` already has `Node`, `Geometry`, `PathCommand`, `Anchor`, `Track`, `Easing`, `Paint`, and validators | Reuse proven definitions and math; do not create a competing primitive vocabulary unnecessarily. |
| Artifact model | `Artifact` has legacy `nodes` and optional `graphic`; validation forbids combining legacy nodes with a graphic | Add an explicit new representation and validate its exclusivity. Simply adding nodes to a current graphic will fail. |
| Normalization | `motionProject()` filters to `a.graphic`, clears analyses/textures, and rebuilds asset references around existing graphic types | New graphs and their dependencies would be dropped unless this is changed. |
| API | `server/src/routes/editing.ts` filters payloads to `a.graphic` and has existing revision/idempotency checks | Update API serialization, patch validation, review readiness, and capabilities alongside the renderer. |
| Pipeline | `pipeline.ts` filters artifacts, builds proposals, resumes checkpoints, and invokes visual review | Add graph generation to the real job pipeline, including revise/review/resume flows. |
| Generation | `motionProvider.ts` supplies structured output, retries, budgets, model selection, and cancellation | Extend it; do not create an unrelated provider client. Verify configured model availability rather than copying model names blindly. |
| Rendering | `hyperframes-builder.ts` dispatches to eight template renderers; `hyperframes-renderer.ts` renders an overlay | Replace dispatch on the new path with a scene graph compiler. Keep legacy compatibility during migration. |
| Preview | `HyperFramesPlayer.tsx` recreates graphics in React separately from exported HTML/GSAP | Replace drawing branches with a wrapper around the shared composition runtime. |
| Dormant composition | `packages/video-composition/src/VideoComposition.tsx` currently returns null | Do not assume it provides a functioning shared renderer. |
| Package support | Local dependencies include `hyperframes` and `@hyperframes/player`; the installed player's README documents composition HTML loading and play/pause/seek | Verify actual installed APIs and runtime interoperability with a minimal spike. |
| Correctness | Builder inserts an unrelated archive label/date; other branches use fallback quantities, route labels, or placeholder assets | Audit all factual fallbacks. An absent fact must remain absent. |
| State | Many files and manifests already have uncommitted changes | Preserve them; do not reset, overwrite, or clean the working tree. |

## 3. Chosen architecture

```text
Narration + alignment + source evidence + scene media + channel configuration
  -> editorial beat planner
  -> AI graph designer
  -> structural and semantic validation
  -> deterministic layout/text measurement
  -> render and visual validation
  -> bounded correction loop
  -> immutable accepted composition bundle
       -> editor player
       -> review frames
       -> headless frame rendering
  -> one shared audio mix
  -> FFmpeg encoding/muxing
```

Use the existing contracts package for data types and the existing video-composition package for browser-safe geometry/compiler/runtime modules. Server services handle AI, assets, persistence, jobs, and media processing. Keep filesystem APIs, credentials, and provider SDKs out of the browser package.

### Rendering and compositing decision

For the new path, prefer a full-scene composition runtime: background scene media and graphics share the same scene, crop, camera transform, timing, and compositing context. This is the default solution for meaningful background blend modes.

The initial spike must prove frame-controlled background-video decoding at nonsequential timestamps through the installed HyperFrames stack. If that is unreliable, use deterministic background frames during offline capture, while retaining the same scene graph and graphics runtime. Record this decision before adding materials.

A separate alpha-overlay export may remain an optional supported mode. In that mode, reject or disable effects that require the absent background unless an explicit, parity-tested compositing implementation exists. Do not promise CSS background blending through a transparent overlay added to footage later. Blend modes combine colors with the backdrop available at compositing time ([W3C specification](https://www.w3.org/TR/compositing-1/#blending)).

## 4. Contract and runtime rules

### 4.1 Representation and versioning

Introduce `sceneGraph` as the new artifact representation. A new graph artifact has:

- Existing artifact ID, scene ID, enabled state, intent, narration references, start/end frames, priority, and review information.
- `sceneGraph`: version, seed, nodes, sound cues, evidence bindings, and renderer capability requirements.
- Empty legacy `nodes` and absent legacy `graphic`.

Legacy artifacts keep their existing shape while the migration adapter is in use. Reject an artifact containing more than one active representation. Centralize helpers such as `artifactRepresentation()`, `isRenderableArtifact()`, and `collectArtifactAssets()` so scattered `a.graphic` checks do not recur.

Recommended persistence approach: read historical Project V1 unchanged, introduce Project V2 for newly written graph revisions, and maintain explicit V1-to-V2 adapters. Keep old revisions immutable. Separate project schema version, scene graph version, prompt version, runtime version, and theme version. Unknown versions produce actionable diagnostics instead of silent data removal. Update all consumers before writing V2 by default.

Use Zod as the canonical contract and infer TypeScript types from it. Provider JSON schema is a transport projection; local validation remains authoritative. Structured output constrains response shape, not factual truth or visual correctness ([Google structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output)).

### 4.2 Primitive vocabulary

Start with group, text, image, rectangle, ellipse, polygon, path, and connector. Prefer extending existing node definitions where their semantics fit. Add data-driven value displays and materials only after these primitives work.

- Shapes/paths use typed numeric geometry. Convert commands into SVG internally.
- Text uses resolved font assets and numeric layout attributes; set content as text, never raw markup.
- Images reference known asset IDs with explicit crop and fit.
- Connectors reference node anchors or verified source targets, with line/elbow/Bezier routing.
- Groups provide transforms, clipping, and explicit stacking.
- Charts and diagrams are compositions of primitives plus verified data. Optional chart/layout helpers may emit primitives but must not constrain all outputs to fixed arrangements.
- Audio is represented by sound cues, not DOM audio nodes in the visual graph.
- Existing Lottie or unsupported node types remain outside the new capability set until deliberately implemented and tested.

The AI receives an exact capability manifest. Reject unsupported fields or operations; do not approximate them silently.

### 4.3 Coordinate convention

- Use project pixel coordinates for the resolved render graph, matching existing geometry math.
- An authoring layout request may use normalized stage bounds, but resolve it once into pixels and persist the resolved result. Do not mix normalized and pixel values in an untagged field.
- Define parent-space transforms, pivot units, rotation direction, transform multiplication order, and clipping space in contract comments and fixtures.
- Source anchors use normalized source coordinates and the exact scene camera/crop transform at each frame.
- Node IDs are unique within a graph. Prefix generated DOM/SVG IDs with artifact ID to avoid cross-graph collisions.
- Resolve connector anchors in a shared coordinate space after transforms. Transform all relevant corners when computing rotated bounds.
- Explicitly define stroke units, text units, z-order ties, and parent stacking behavior.

### 4.4 Timing convention

- Project and artifact intervals use integer frames, `[startFrame, endFrame)`.
- Node keyframes and cue offsets are local to their artifact.
- Local frame equals global frame minus artifact start frame.
- Animation keyframes may use a terminal boundary at artifact duration, while the final sampled local frame is duration minus one. Sound cues must begin before that terminal boundary.
- Convert to seconds only at media/GSAP boundaries using the project's FPS. Do not repeatedly round between units.
- Follow current integer FPS support initially; preserve rational frame rates explicitly if added later.
- Resolve exact narration spans using existing alignment helpers. Store whether timing is word-aligned, phrase-aligned, or approximate.

### 4.5 Animation behavior

- Allow only typed properties with meaningful numeric ranges, ordered keyframes, and defined easing.
- Reuse existing linear/Bezier/spring contracts where appropriate. Implement spring evaluation or sampled easing explicitly; do not assume GSAP accepts arbitrary stiffness/damping parameters as a built-in ease.
- Define behavior before the first keyframe and after the last. Reject duplicate times or overlapping conflicting tracks unless explicit composition semantics exist.
- Compute every visual state from frame and saved data. No unseeded randomness, wall-clock-dependent effects, or accumulated physics state.
- Preview can use a playback clock to select a frame, but the frame evaluator must be seekable in any order.
- GSAP may compile/evaluate supported tracks, but visual correctness must not depend on callbacks executing during playback. Seeking can suppress events ([GSAP seek documentation](https://gsap.com/docs/v3/GSAP/Timeline/seek()/)).
- Hide graphics outside their artifact intervals, including when seeking backwards.

### 4.6 Evidence and factual data

Separate decorative text from factual assertions. Bind each factual label, quantity, date, quotation, geographic claim, and image-source label to an evidence record or exact narration span.

Store provenance: source ID, narration token/span IDs, supplied value, display formatting, and any explicit derivation. Narration-grounded does not automatically mean independently fact-checked; preserve the actual verification status.

Never invent dates, archive sources, units, geography, values, or identities. For derived percentages or comparisons, store operands and compute deterministically. Do not infer values from a decorative title string. Omit unsupported claims or mark a schematic/illustrative visualization clearly.

### 4.7 Validation and limits

Implement three layers: schema validation; semantic/reference validation; rendered layout/visual validation.

Check unique IDs, existing references, parent cycles/depth, connector dependency cycles, assets and ownership, finite values, intervals, allowed properties, path validity, source transforms, evidence bindings, and bounds. A parent tree and connector dependency graph need separate validation.

Start with the existing 128-node-per-artifact limit, bounded paths/keyframes, and a maximum depth of 8. Add configurable project totals, image decode sizes, concurrent filters, JSON byte size, and provider output limits. Treat these as resource controls, not promises that every maximum-size graph will be fast.

No `eval`, `new Function`, arbitrary URLs, SVG `foreignObject`, script/event attributes, or external SVG references in generated data. Resolve assets through the existing account/project scope. Escape serialized JSON embedded in HTML, including closing script sequences. Keep API keys and private filesystem paths out of composition bundles.

## 5. Implementation phases

Complete phases in order. Keep a running checklist and evidence for each gate. Do not stop at the prototype and call the full task finished.

### Phase 0 — Baseline, migration inventory, and integration spike

1. Read applicable repository instructions; inspect `git status` and existing diffs. Record pre-existing changes without staging or reverting them.
2. Trace generation -> persistence -> API payload -> editor -> review -> export, including `render-graphics.ts`, editing workers, scheduler, and any autopilot render entry points.
3. Search all artifact kind switches, `a.graphic` filters, `nodes` assumptions, asset collectors, review gates, capabilities, and revision loaders. Record each consumer to update.
4. Record installed package/runtime versions and supported CLI/player APIs. Do not assume online examples match the installed versions.
5. Run relevant baseline build/typecheck/editing tests in isolated test storage. Record existing failures separately.
6. Build a small disposable integration spike using one shared composition HTML bundle, a text node, a path, a local image/video background, and narration audio. Exercise seek/play/pause and headless capture at 30 and 60 FPS.
7. Prove asset/font readiness and deterministic frame selection. Decide the background-video capture strategy described in section 3.
8. Add a feature flag/configuration for the new engine and record rollback behavior. This is a migration control, not a permanent second product.

Gate: documented execution path and working shared-runtime spike; no loss of existing user changes or data. The spike is infrastructure proof, not proof of AI generation.

### Phase 1 — Factual fallback fixes and explicit contracts

1. Remove unrelated historical archive/date defaults and audit counter, route, transcript, image, and preview placeholder branches. Missing data must omit the optional detail or produce a diagnostic.
2. Add versioned graph/evidence/cue contracts and the representation helpers in `packages/editing-contracts`.
3. Implement Project V1 reads and V2 writes/adapters, with graph exclusivity and semantic validation.
4. Replace destructive normalization assumptions in `motionProject()`. Preserve graph assets, fonts, textures, source analyses required by anchors, and scene outcome references.
5. Make asset collection recursive and comprehensive, including image nodes, masks, fonts, material assets, and SFX.
6. Add a complete machine-valid example graph and valid referenced fixture project. Include assigned node IDs, real polygon/path data, timings, evidence, and known assets. No ellipses or pseudo-JSON in executable fixtures.

Gate: old fixtures still read; new graphs survive validate/save/load/normalize/API round trips; invalid references and contradictory representations are rejected.

### Phase 2 — Shared deterministic graphics runtime

Suggested modules under `packages/video-composition/src/scene-graph/`:

- `geometry.ts`: transforms, clipping, source projection, connector geometry.
- `animation.ts`: frame evaluation and easing.
- `layout.ts`: resolved layout and text measurement integration.
- `compiler.ts`: typed graph to runtime representation and element construction.
- `runtime.ts`: readiness, frame rendering, diagnostics, lifecycle.
- `index.ts`: browser-safe public exports.

Implementation steps:

1. Build SVG/DOM nodes from validated properties using safe APIs. Define group opacity and blend isolation deliberately.
2. Compile paths, strokes, clips, transforms, and connectors. Recompute moving anchors from the same frame state as their targets.
3. Use one frame evaluation function for live playback, review capture, and export. A conceptual API is `load(bundle)`, `ready()`, `renderFrame(frame)`, `getDiagnostics()`, `dispose()`; adapt exact signatures to the installed player integration.
4. Provide local, pinned GSAP/runtime/font dependencies. Remove render-time CDN and Google Fonts requirements from new bundles.
5. Wait for fonts, decoded images, and target video frames before reporting a frame ready. Timeouts produce explicit errors, not fallback-font captures.
6. Bundle a manifest containing graph hash, asset hashes, dimensions, FPS, duration, theme version, runtime version, and layout version.
7. Test forward, reverse, repeated, and random-order frame rendering. Releasing a player must dispose timelines, listeners, media, and object URLs.

Gate: identical graph frames produce identical pre-encode pixels in the pinned capture environment regardless of seek order; all initial primitives work.

### Phase 3 — Integrate preview, API, jobs, and export

1. Update `hyperframes-builder.ts` to construct the shared bundle for graph artifacts. Keep legacy rendering isolated behind a representation adapter during migration.
2. Replace manual per-kind drawing in `HyperFramesPlayer.tsx` with the installed player/shared bundle integration. Preserve the component's public ref/events and existing controls where callers rely on them.
3. Use one authoritative playback clock. Synchronize narration, background media, graphics, pause/resume, looping, and seeking; do not leave an independent React timer running beside video playback.
4. Add revision-addressed composition bundle delivery to `server/src/routes/editing.ts`. Use existing access checks and asset serving. Serve only known files in the bundle; reject traversal and unknown revisions.
5. Update payloads, capabilities, UI names, edit forms, enable/disable, delete, timing changes, and manual adjustments for graph artifacts.
6. Update `renderer.ts`, `hyperframes-renderer.ts`, `render-graphics.ts`, workers, and review screenshots to use the same bundle. Do not add graphics twice when a rendered MP4 already contains them.
7. Preserve scene transitions, trims, camera transforms, and narration offsets in full-scene output.
8. Prevent duplicate audio: choose one audio producer and mux exactly once. For the recommended architecture, use a server-built master mix and keep video capture silent.
9. Make cancellation stop subprocesses/browser work and clean job-owned temporary resources after the process has exited. Write final files atomically.
10. Cache by all render-affecting inputs, not a constant such as `hyperframes-v1`. Failed/partial outputs must never enter the cache.

Gate: saved graph loads in the actual editor and exports through the actual application job path, with correct media, scrubbing, duration, and cancellation.

### Phase 4 — Editorial planner and actual AI graph generation

Suggested new services: `sceneGraphPlanner.ts`, `sceneGraphDesigner.ts`, and `sceneGraphValidation.ts` in `server/src/services/editing/`. Integrate with `pipeline.ts`; reuse `motionProvider.ts` and existing job accounting.

1. Provide the planner with scene narration/alignment, permitted facts, source assets, visual observations, protected regions, existing captions, neighboring beats, channel profile, and capability/budget limits.
2. Planner output identifies scene, exact supporting narration span, editorial purpose, information to convey, and whether to omit the graphic. Editorial categories guide meaning; they must not dispatch to fixed visual templates.
3. Designer output includes primitive nodes, relationships, animation tracks, layout intent, evidence bindings, and optional sound cues. Do not use a template name as the main output.
4. Give the model multiple structurally different examples and explicit unit conventions. Generate in bounded scene/beat chunks to avoid truncation.
5. Run structural and semantic validators locally, then layout resolution and render checks. Schema-correct output can still be invalid.
6. Reuse provider configuration and credential handling. Validate model support through the configured service; do not introduce another provider dependency without a real need.
7. Count all provider calls, including retry/fallback/review requests, against one job budget. Avoid multiplying retries across nested loops.
8. Persist accepted graph data and provenance before rendering the final video. Re-export must not call the model again.
9. Add revise-one-artifact support that retains stable artifact identity and preserves unrelated accepted graphics.

Gate: a real provider generates a previously unseen branching diagram or comparison from supplied narration, and it reaches preview/export without a new renderer branch or template function.

### Phase 5 — Layout, typography, and bounded correction

1. Measure text using the actual loaded font and final project resolution. Implement wrapping, alignment, line height, maximum lines, and minimum readable size. Include English and Hindi/Devanagari fixtures.
2. Resolve typography and layout once; persist the accepted resolved graph. Resizing the preview container scales the stage instead of changing the design.
3. Centralize configurable safe areas by aspect ratio/platform. Initial portrait defaults may use approximately 20–75% height, but these are conservative configuration values, not a universal platform guarantee.
4. Separate protected readable content from decoration: backgrounds may extend to frame edges; labels and essential information must fit their allowed zones.
5. Include caption regions, right-side interface exclusion areas, known faces/subjects, and other enabled graphics in collision checks. Distinguish intentional layering from accidental overlap.
6. Check animation envelopes, rotations, clips, spring overshoot, and moving targets. Validate full bounds, not only origins. Use conservative bounds or every output frame for critical safe-zone checks; sampled screenshots alone do not prove no collision between samples.
7. Attempt deterministic repair first: wrap, reroute connectors, adjust spacing, simplify decoration, or reposition within constraints. Never silently change factual text or numeric values.
8. Then request at most two design corrections per beat, within the remaining total job budget. Include the graph, structured diagnostics, and relevant rendered frames. Validate each replacement from scratch.
9. If repair fails, omit the optional graphic and expose the reason. Do not silently substitute an old orange card. A failed requested revision should preserve the last accepted artifact.
10. Reuse `visualReview.ts` where suitable, with graph-aware review hashing and screenshot capture. Bind review approval to graph/layout/assets/runtime inputs; invalidate it when any reviewed content changes.

Gate: long text, Devanagari, dense diagrams, caption collisions, missing assets, and invalid connections either resolve acceptably or fail visibly without corrupting the project.

### Phase 6 — First complete 15–20-second proof

This is the first end-to-end quality gate, built from phases 0–5. Do not substitute a manually authored graph for AI generation.

1. Use a real aligned narration clip with supplied evidence sufficient for one statistic/comparison and one spatial or branching explanation.
2. Have AI plan and create both graphics. Include clean footage between them; the two-graphic requirement is specific to this fixture, not a production quota.
3. Show actual preview playback and exported MP4, with matching frames and narration timing.
4. Save the input, generated graph, resolved graph, diagnostics, screenshots, output, versions, and provider usage.
5. Review at phone display size. Confirm comprehension, reading time, hierarchy, and unobstructed subjects.
6. Include at least one correction case and demonstrate saved-graph re-export without AI calls.

Gate: the complete automated path works and the sequence is readable and useful. Record shortcomings before multiplying materials or channel styles.

### Phase 7 — Channel design systems and procedural materials

1. Extend existing channel/profile configuration with a stable theme key. Keep account-to-theme mapping in configuration, not hardcoded account ID branches in the renderer.
2. Define theme tokens for palette, font families, type scale, spacing, strokes, corner treatment, material preferences, motion intensity, and sound palette.
3. Ancient Dharma: warm restrained palette, appropriate manuscript/stone cues, legible language-specific fonts. Rule Zero: controlled technical typography, cyan/amber accents, restrained digital motion. Against the Odds: documentary hierarchy, warning accents, mechanical movement when the story supports it.
4. Theme tokens influence the AI and compiler; they do not force every graphic into a scroll/HUD/stamp. The same editorial purpose must support different layouts.
5. Add bounded, seeded material primitives: grain, scanlines, gradients, glow, and edge variation. Heavy or unsupported materials must have an explicit deterministic simplification option.
6. Resolve fonts locally and verify glyph coverage before accepting the graph. Do not assume decorative Latin fonts cover Devanagari.
7. Keep lighting/glow effects subordinate to contrast and reading clarity. Apply background blend modes only in the compositing context validated earlier.

Gate: all three channels produce recognizably different styling and useful structural variety, while preserving the same contract/runtime.

### Phase 8 — Sound cue engine and final audio parity

1. Extend `sfx.ts` with a small locally managed or licensed library, asset metadata, decoded duration, sample rate, gain, and audible transient offset. Procedural SFX must be reproducible or cached by hash.
2. Store cues as typed data: ID, asset ID, local frame offset, gain in dB, fade/trim, and synchronization target. Define whether the cue aligns its file start or audible transient.
3. Prefer zero to two purposeful cues per graphic. Avoid one sound per keyframe.
4. Build a shared audio event manifest from accepted graph timing. Use 48 kHz PCM intermediates and sample-based placement; compute samples from the same project time base.
5. Handle intentional audio pre-roll at the project boundary explicitly; do not silently shift a hit. Define tail behavior at artifact and project ends.
6. Use adjustable narration-aware attenuation and/or ducking, calibrated against the actual mix. A fixed -12 dB value is only a starting configuration, not a universal audibility guarantee.
7. Set explicit gains/headroom, fade behavior, channel layout, duration, and limiting policy. Do not rely on default `amix` normalization. Record measured loudness and peak results.
8. Preview the same master mix that export uses. Avoid triggering SFX through GSAP callbacks, which behave differently on seek.
9. Check sync both in intermediate PCM and decoded final MP4; account for codec priming, timestamps, and cue asset silence.

Gate: audible events align to intended visual events within one project frame, narration is clear, seeking does not duplicate sounds, and the final output has one correctly timed audio mix.

### Phase 9 — Reliability, performance, and revision lifecycle

1. Version pipeline checkpoints and include input, model/prompt, graph contract, asset, theme, and runtime hashes. Resume only compatible checkpoints.
2. Use existing revision compare-and-swap and idempotency semantics. A stale job cannot overwrite a newer user edit.
3. Keep accepted graphs immutable per revision; stage and atomically publish replacements only after checks pass.
4. Implement cancellation throughout provider calls, layout/render review, frame capture, audio, and encoding. Never show a partial export as completed.
5. Bound concurrency and memory. Clean only verified job-owned temporary paths; preserve user assets and accepted outputs.
6. Record planning/design/repair time, call count, compile time, preview frame timing, dropped frames, render time per frame, peak memory, cache hits, and errors.
7. Pin versions for reproducible production builds. Include font/asset bytes and relevant browser/FFmpeg configuration in diagnostics and reproducibility records.
8. Benchmark representative 30/60 FPS projects. Set measured thresholds for the actual target hardware. Report offline export throughput separately from preview FPS.
9. Optimize only measured bottlenecks; do not reduce output quality silently or add distributed rendering before needed.

Gate: cancel/resume, stale revision, concurrent jobs, missing credentials/assets, budget exhaustion, cold cache, and warm cache behave predictably.

### Phase 10 — Acceptance suite, migration, and template retirement

1. Run the complete matrix below through the real application entry points.
2. Exercise all three channel profiles with supplied, accurate content and existing user-selected language settings.
3. Test old saved projects and previous exports. Keep historical revisions unchanged; create migrated revisions explicitly.
4. Implement legacy-to-graph adapters where equivalent representation is supported. Where migration would be lossy, retain read/export compatibility or report the limitation clearly; never silently delete content.
5. Verify newly generated work uses no old template dispatch. Remove legacy templates from the active generation path only after successful cutover.
6. Remove obsolete renderer/UI branches after all remaining callers and fixtures are migrated. If archival support still requires a legacy adapter, isolate it and document why it remains; do not claim literal code removal prematurely.
7. Enable the new engine by default only after acceptance gates pass. Rollback must preserve new graph revisions; use the compatible new reader in read-only mode or a tested legacy conversion rather than loading V2 data into an old parser.
8. Deliver implementation notes, exact commands/results, benchmark environment, demo locations, known limitations, and rollback instructions.

Gate: all required paths work, old data remains available, and no new graphic requires a hardcoded composition template.

## 6. Required test matrix

| Area | Meaningful checks |
|---|---|
| Contracts | Duplicate IDs, unresolved targets, invalid geometry, cycles, wrong units, unsupported properties, excessive resources, mixed representations. |
| Persistence/API | V1/V2 reads, graph save/load, asset preservation, scoped assets, stale revision conflict, idempotent jobs, capability disclosure. |
| Temporal behavior | Start/end exclusivity; random seek order; backward seek; initial/final frames; 30/60 FPS; negative cue/transient handling. |
| Visual primitives | Shapes, paths, text, images, groups, clips, gradients, connectors under moving/transformed parents. |
| Media | Still/video backgrounds, trim offsets, transitions, crop/camera motion, frame readiness, alpha edges, missing media. |
| Typography/layout | Long English and Hindi, missing glyphs, minimum size, portrait/landscape, protected regions, spring overshoot, deliberate overlap. |
| Evidence | Missing date stays absent; unsupported number rejected; quotation and unit retained; derived statistic traceable; decorative labels distinguished. |
| AI integration | Real new composition; malformed/truncated output; bounded repair; unavailable model/credential; quota; no extra AI on replay/export. |
| Audio | Event/transient alignment, cue tails, seek/restart behavior, ducking, clipping, final mux duration, no duplicate mix. |
| Lifecycle | Cancellation, resumed job, incompatible checkpoint, stale update, failed cache entry, asset change invalidates review/cache. |
| Regression | Existing captions, legacy projects, camera behavior, image-led requirements, preview controls, account/profile boundaries. |

### Preview/export visual comparison

Compare matching frames at the same resolution after all media/fonts are ready. First compare pre-encode render frames using the pinned environment, then compare decoded MP4 frames with documented codec-appropriate tolerances. Include actual background media, effects, and crops, not only isolated graphics. Do not promise byte-identical MP4 pixels across browsers/devices.

### Mandatory novel-composition fixtures

- A branching decision diagram with at least three outcomes and animated connectors.
- A comparison with evidence-backed values, correct relative visual scale, and readable labels.
- An annotated image whose connector follows the source target through camera motion.
- A timeline with evidence-backed dates and staged reveals.
- A long-text Hindi/English example with safe wrapping.
- A scene correctly left free of additional graphics.

At least the first two must also be generated through the actual provider flow. Deterministic recorded fixtures cover CI; live checks establish provider integration separately.

## 7. File-level work map

Names of new modules are suggestions; preserve the architecture and consolidate where appropriate.

| File/area | Work |
|---|---|
| `packages/editing-contracts/src/index.ts` | Versioned project union, graph artifacts, shared helpers, comprehensive asset/reference validation, capabilities. |
| `packages/editing-contracts/src/scene-graph.ts` (new) | Canonical graph, evidence, animation additions, sound cues, resource limits. |
| `packages/video-composition/src/scene-graph/*` (new) | Browser-safe compilation, layout, animation, geometry, runtime. |
| `packages/video-composition/src/math.ts`, `graphics.ts`, `legacy-camera.ts` | Reuse/extend transforms, bounds, and safe-area logic; eliminate duplicate policies. |
| `server/src/services/editing/sceneGraph*.ts` (new) | Planner, designer, validation/repair orchestration. |
| `pipeline.ts`, `motionProvider.ts` | Real generation/revise/review flow, budget, checkpoints, provider schema support. |
| `motionPackArtifacts.ts`, `editorial.ts`, `motionCaptions.ts` | Migration/adapters, captions and existing editorial flow compatibility. |
| `hyperframes-builder.ts` | Shared bundle assembler and representation dispatch. |
| `hyperframes-renderer.ts`, `renderer.ts`, `render-graphics.ts` | Shared runtime capture, media readiness, cancellation, caching, export. |
| `visualReview.ts`, `sourceEvidence.ts` | Graph-aware evidence and rendered review, approval invalidation. |
| `projects.ts`, `repository.ts`, `scheduler.ts`, worker entry points | Versioning, persistence, immutable revisions, resume and atomic publication. |
| `server/src/routes/editing.ts` | Payloads, mutation validation, scoped composition serving, capabilities. |
| `src/components/artifacts/HyperFramesPlayer.tsx` and callers | Shared player integration and controls; graph-aware UI. |
| `motionStyles.ts`, `motionTheme.ts`, profile settings | Configured channel themes without renderer account-ID branches. |
| `server/src/services/sfx.ts` and audio mix integration | Cue assets, deterministic placement, shared audio manifest/mix. |
| `tests/editing/*`, `server/tests/*` | Contract, migration, render, lifecycle, provider, and integration tests. |
| Package manifests/locks | Only justified runtime/build dependencies; preserve existing edits. |

## 8. Commands and verification discipline

Existing scripts discovered in the root package manifest:

```powershell
npm run typecheck
npm run build
npm run build --prefix server
npm run test:editing
npm run test:editing:render
npm run test:editing:browser
npm run test:server
```

Some scripts invoke builds internally; avoid redundant rebuilds when running targeted iterations. Run relevant focused tests during each phase, then the full appropriate suite at integration/cutover. Use isolated temporary data directories as existing tests do. Do not run scripts against real account stores merely to obtain a screenshot.

Add dedicated deterministic graph tests and a documented opt-in live-generation smoke command. Live checks must use the user's configured credentials and existing budget controls. Never print credentials. If live integration cannot run, report exactly why and do not mark that gate passed.

A failing baseline test is not permission to skip a new regression. Distinguish existing failures, introduced failures, and blocked environment-dependent checks with evidence.

## 9. Definition of done

- [ ] A real script can produce new graph arrangements without renderer code changes.
- [ ] Graphs are validated, evidence-bound, stored, editable, and replayable.
- [ ] Preview, screenshots, and export share one resolved composition/runtime.
- [ ] Text is legible; collisions, assets, and factual omissions are handled explicitly.
- [ ] Actual generation and bounded corrections run through existing application jobs.
- [ ] All three channel themes work without forcing a fixed card shape.
- [ ] Sound and final mux timing pass measured checks.
- [ ] Cancellation, resume, versioning, review/cache invalidation, and stale revisions work.
- [ ] Existing projects and user changes remain intact.
- [ ] New generation no longer depends on hardcoded composition templates.
- [ ] Acceptance renders, test results, performance measurements, and limitations are delivered.

## 10. Final instruction to Antigravity: freedom to improve this plan

Antigravity is free to change this plan on its own whenever repository inspection, implementation experience, tests, or measured results show that a different approach is better. You may rename or consolidate modules, reuse more existing code, adjust schemas and limits, reorder dependent work, change implementation techniques, and improve the design without asking for approval for routine engineering choices.

Preserve the user's intended outcome: dynamically generated, story-specific graphics; accurate content; reliable shared preview/export behavior; and preservation of existing data and work. Record material deviations with a short explanation and validate the replacement approach. Do not claim a gate passed without evidence, reduce the goal to recolored templates, or hide unfinished work behind a successful demo. If an external dependency or missing credential blocks a required check, complete all independent work and report that specific limitation clearly.
