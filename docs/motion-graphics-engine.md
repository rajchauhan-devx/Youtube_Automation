# Original motion graphics and sound

The Motion Studio offers **Adaptive library & original compositions** for new work. It plans useful
beats from the narration and visual inventory, then asks the configured model to
compose text, shapes, images, paths, groups, connectors and numeric displays.
Ancient Dharma can select from a shared [adaptive motion library](ancient-dharma-motion-library.md)
or request a custom composition. The existing directed/image sequence engine remains available for older projects.

## Using it

1. Open Motion Artifacts or Preview & Export, select narration, and choose **Adaptive library & original compositions**.
2. Set graphic density, motion feel, sound design and optional art direction.
3. Generate. A clean scene is a valid editorial choice; the director does not fill
   a quota. Invalid optional graphics leave the footage available with a reason.
4. Preview, move the composition, edit narration-supported labels, or regenerate
   with a specific instruction. Each graph card exposes its sound cue gain and
   local cue time. Save edits to make them part of a revision.
5. Review rendered placement and export. Changes to the design or motion
   invalidate the previous review. Existing revisions and media are preserved.

Changing motion and sound preferences creates a new revision without clearing
accepted designs. Existing projects default to sound off; newly created studio
projects start with subtle sound selected. Still mode removes animation while
retaining visible content.

## Implementation

- `sceneGraphGeneration.ts` plans and designs through the existing provider,
  credentials, retry accounting, cancellation and job budget. A shallow provider
  transport expands into the canonical, locally validated graph. Accepted graphs
  replay and export without another model call.
- `scene-graph.ts` validates unique IDs, parent references/cycles/depth, connector
  targets, animation ordering/ranges, capabilities, evidence references and cue
  intervals. Generation additionally checks supplied assets and narration values.
- `sceneGraphLayout.ts` loads the actual local fonts in Chromium, resolves text
  height without changing its copy, and checks every artifact frame for text
  overflow, overlap, safe bounds, minimum size and reading time. A bounded design
  correction follows a failed local check.
- `renderSceneGraphSvg` is the same pure frame evaluator in React and export.
  It supports all keyframe segments, parent transforms, moving node anchors,
  gradients, shadows, paths, clips, image fitting/crops and numeric displays.
  A GSAP property setter evaluates it even when seeking with callbacks suppressed.
  The pinned animation library and graph fonts are copied into export bundles.
- `motionAudio.ts` builds one 48 kHz mix from stored cues, with sample-based
  placement, transient offsets, quiet gains, fades, narration-controlled effect
  attenuation and a peak limiter. Preview and studio export use the same cached
  PCM master. Legacy video compositing uses the same effect mixer against its
  existing music/narration mix, and copies that mix when sound is disabled.
- Rendering writes partial files and publishes completed overlays atomically.
  Cancellation waits for the renderer to exit before removing staging files.

## Verification commands

Run builds before tests; the server build replaces `server/dist`.

```sh
npm run typecheck
npm run build --prefix server
npm run build
node --test --test-concurrency=1 tests/editing/scene-graph.test.mjs tests/editing/scene-graph-engine.test.mjs tests/editing/scene-graph-render.test.mjs
```

The render test compares actual HyperFrames output against matching shared
renderer frames, then verifies the encoded MP4 frame count and audio duration.
Other tests exercise real font bounds, Hindi/English fallback, suppressed-callback
seeking, graph references, evidence, sound sample placement and checkpoint replay.
Browser checks require a working Chromium installation and permission to launch it.

Opt-in live proof, using configured credentials and isolated synthetic inputs:

```sh
node scripts/scene-graph-smoke.mjs --live
node scripts/scene-graph-smoke.mjs --live --comparison
```

Each invocation permits at most eight provider requests. Review files go in
`artifacts/scene-graph-proof/`. The proof audio is synthetic, not a narrated voice.
These smoke proofs exercise actual AI design, local layout checks, audio and export;
they do not stand in for editorial review of a real production video.

## Supported scope

This is a bounded 2D composition engine, not an arbitrary effects interpreter.
Source/object tracking anchors and image masks are rejected on the new graph path;
existing verified spotlight handling remains in the legacy engine. Full 3D scenes,
background blend effects and generated executable code are outside its capabilities.
AI design quality still depends on the narration, available sources, direction and
model. Rendered review remains useful for subject occlusion, context and contrast;
local layout checks alone cannot establish those editorial qualities.

The new graph renderer shares graphics between preview/export. Legacy template
previews and the separate footage/camera pipeline retain their existing adapters.

## Verified in this workspace — 24 October 2026

- Client typecheck, server build and production client build passed.
- Focused contract/API/pipeline/review/render/worker/media/style/audio regression
  suite: **96 passed, 0 failed**. The engine test also measures decoded PCM cue
  onset against its saved sample offset.
- Browser interaction proof passed: actual graph rendering, audio-clock playback,
  saved sound preferences, persisted label edits with draft clearing, and mobile
  overflow checks. Screenshot: `artifacts/scene-graph-proof/studio.png`.
- Actual HyperFrames overlay frames were compared against the shared SVG evaluator
  at three timestamps, with mean pixel difference below 3/255 after encoding.
  Encoded frame count and audio duration were checked separately.
- Live portrait branching proof: seven nodes, three animated connectors, one cue;
  one provider request; approximately 12.8 seconds for design/check/export.
- Live landscape comparison proof: four nodes, one cue, supported 60/30 labels,
  and bar widths 800/400 pixels. Four provider requests, including an HTTP 503
  model fallback; approximately 149.7 seconds for design/check/export.
- Accepted graphs, MP4s, previews and provider usage reports are under
  `artifacts/scene-graph-proof/branching/` and `comparison/`. Synthetic source
  media/audio are intentional test inputs. Automatic editorial vision review was
  disabled for these two designer/export proofs; the application review path is
  separately covered by the focused integration suite.

These timings are individual development proofs, not production throughput targets.

Final follow-up checks also passed: 17 graph/render checks after clip and metric
label hardening, and 26 API/style/alignment/engine checks after evidence rebinding.
The browser proof was rerun against the final production bundle and confirmed that
saved edits reach the revision API and clear the local draft state.
