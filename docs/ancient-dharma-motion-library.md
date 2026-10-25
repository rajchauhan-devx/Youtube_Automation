# Ancient Dharma adaptive motion library

The profile gallery and the production director share 20 content-driven families
in `packages/video-composition/src/motion-library.ts`. They use eleven reusable
layout recipes. The original JPG/PNG reference assets remain in `public/motion-templates`;
their baked-in facts and labels are not inserted into production graphics.

## Using it

Open **Motion Templates** to browse families. Change demo labels, duration and
landscape/portrait format to see the shared renderer adapt. Demo content is local
to the gallery; it does not edit a script or production revision.

In **Motion Studio** or **Preview & Export**, expand **Choose narration & let AI
plan motion graphics**, select narration and **Adaptive library & original
compositions**, then generate. The AI sees scene media observations, narration,
channel policy and optional script hints. It chooses a suitable library family,
`custom` for an original graph, or no graphic. Other channel profiles continue to
use their existing custom/director paths.

Review the resulting composition over the actual scene. Export uses those saved
nodes, evidence and animation tracks; it does not ask the model to design again.
Existing revision and stale-input checks continue to apply.

## Script hints

Structured script generation accepts an optional `motionGraphics` array, with at
most one explanatory hint per scene:

```json
{"motionGraphics":[{"intent":"Explain the sequence described in this scene","templateId":"ad_process"}]}
```

Numbered-tag scripts can use:

```text
<motion_graphic3>
Scene: 3
Intent: Explain the order of the narrated events
Template: ad_timeline
</motion_graphic3>
```

The hint is outside spoken narration and image/video prompts. `Template` is
optional. Parsing and scene-plan serialization preserve these hints. A hint never
forces a graphic or authorizes adding unsupported facts.

## Content and fitting

The director chooses a family by its purpose, required item count and unsuitable
uses. A second provider request supplies short exact narration phrases as
`items: [{text, detail?}]`, optional parent-child links for relationship trees,
and automatic/horizontal/vertical layout. The provider supplies no executable
markup or template geometry.

The deterministic compiler supplies final-pixel positions, historical colors,
Devanagari font selection, progressive line reveals, staggered phrase entrance,
reading holds and caption clearance. Timelines/processes support two to seven
items. Dense portrait trees become indented vertical relationships. The selected
family ID, version and resulting layout are stored on `sceneGraph.template`.

Every displayed phrase binds to matching narration tokens, including a label
inside a measured scene-length phrase. Narration support is not independent
historical verification. Family definitions contain no sample dates, shlokas,
measurements, laboratory IDs or source credits.

Chromium checks actual font ink, text overlap, reading time, animation bounds and
protected regions at every artifact frame. Diagram geometry is checked alongside
text. Failed layout receives a bounded correction request, then the scene is
skipped if it still cannot fit. Rendered visual review remains responsible for
semantic relevance, subject occlusion and contrast over actual media.

Journeys, celestial relationships, dimensions and cross-sections are schematic.
These families do not infer real coordinates, trace buildings, track moving
objects, reproduce exact sacred geometry or generate 3D reconstructions. Use
verified source-map/spotlight tooling or a suitable custom composition for work
requiring those capabilities. Silence is valid; library recipes do not invent
sound measurements or force an effect on every reveal.

## Verification

```sh
npm run typecheck
npm run build --prefix server
npm run build
node --test --test-concurrency=1 tests/editing/motion-library.test.mjs tests/editing/scene-graph.test.mjs tests/editing/scene-graph-engine.test.mjs tests/editing/scene-graph-render.test.mjs server/tests/motion-editorial-policy.test.mjs
node tests/editing/motion-library-browser.mjs
```

The library suite covers real Hindi font layout for all 20 families at maximum
item counts in both video formats, supported-content correction, optional script
hints, custom/clean choices, tree validation, saved rendering and checkpoint
replay. Provider responses in these tests are mocked; actual browser rendering,
font measurement and export parity are exercised. Browser screenshots are written
under `artifacts/motion-library-proof/`.

Workspace verification on 24 October 2026: client typecheck, server build, client
production build, focused lint, 31 focused tests, the library browser proof and
the existing studio browser proof passed. The export regression compared actual
HyperFrames captures with the shared evaluator and checked encoded duration.
Three broader script-generation/legacy-parser assertions fail identically against
the original HEAD modules; the isolated baseline report is in
`artifacts/motion-library-baseline/results.txt`. No live provider proof was used
for this change.
