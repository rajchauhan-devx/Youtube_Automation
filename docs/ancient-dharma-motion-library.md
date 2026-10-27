# Script-aware motion library

Preview's script AI and the Artifacts planner now have access to all **30 gallery
motions** plus the original **20 adaptive families**. The shared production
catalog is `MOTION_LIBRARY` in `packages/video-composition/src/motion-library.ts`.
`gallery-motion-library.ts` supplies the gallery IDs, intended uses, item counts,
and restrictions. Canonical `ad_` IDs work across channels; older `rz_` and `ato_`
gallery IDs normalize to the corresponding `ad_` ID.

## Workflow

1. Generate a script in **Preview**. The prompt supplies the full catalog and asks
   the AI to select only useful explanatory moments. Most scenes can stay clean.
2. Review **planned motion graphics** beneath the Preview controls. It lists the
   scene, template name, purpose, narration cue, suggested position, duration and
   supplied text. The complete metadata remains in the tagged response.
3. **Extract Assets** saves the motion plan with its source scene. Metadata is not
   spoken narration and is not included in generated image/video prompts.
4. Generate the scene media and narration, then generate motion graphics in
   **Artifacts**. A script with an explicit motion template automatically uses
   the adaptive library engine, including older projects and mixed/video scenes.
5. The artifact planner checks actual footage and narration. When its selected
   template matches the script plan, valid content is reused without another
   content-generation call. It may choose a different template or omit a beat
   when that better fits the real scene. Saved native nodes, evidence, geometry
   and animation tracks are replayed in preview and export.

Old scripts without metadata still use the existing narration-based planner.
Existing line-based `Intent:` / `Template:` metadata remains supported. Merely
opening an old script does not generate new assets or alter existing artifacts.

## Metadata format

Each chosen scene has at most one separate numbered JSON tag. For narration
containing “प्राचीन ज्ञान”, an example is:

```xml
<motion_graphic3>
{
  "version": 1,
  "templateId": "ad_lower_third",
  "intent": "Introduce the subject mentioned by the narrator",
  "quote": "प्राचीन ज्ञान",
  "position": "bottom",
  "durationSec": 4,
  "layout": "auto",
  "content": {
    "items": [{"text": "प्राचीन ज्ञान"}],
    "links": []
  }
}
</motion_graphic3>
```

The tag number identifies the source scene. JSON transport uses the same object
in that scene's `motionGraphics` array. `position` allows `auto`, `top`, `bottom`,
`left`, `right`, or `center`; `layout` allows `auto`, `horizontal`, or `vertical`.
`durationSec` allows 1.5–15 seconds and is clamped to the actual scene end. Measured
word/phrase alignment anchors the entrance to `quote`; approximate alignment
starts at the scene boundary and is identified as approximate in Artifacts.

Every item `text`, optional `detail`, and `quote` must occur in that scene's
narration. Numeric diagrams additionally require an item `value` matching a
number in its displayed phrase. Progress/donut graphics require an explicit
percentage between 0 and 100. Bars and trends must compare the same narrated unit;
no conversions or observations are invented. Trees use explicit zero-based
`{from,to}` links, one earlier parent per child. Other templates use no links.

The serializer escapes angle brackets inside JSON strings. Invalid template IDs,
placement values, durations, links, malformed numbered tags, and unsupported text
are rejected. Narration edits preserve intent/template choice but clear stale
content or cues so production can adapt them to the revised wording.

## Production behavior

Gallery visuals demonstrate the motion concept. Production rebuilds them as
editable, evidence-bound scene-graph nodes and adapts layout and treatment to the
channel. Ancient Dharma uses Hindi narration phrases, muted gold/ivory, calm
reveals and reading holds. Electronic HUDs, rolling counters and terminal effects
become restrained emphasis; it never silently translates or adds source claims.
The gallery's demo edits and sample facts are not production inputs.

Observed open space takes precedence over the suggested position. Scenes with no
open area are skipped. Browser validation checks actual glyph bounds, reading
holds, text overlap, animation bounds and protected caption regions. Invalid
saved content or a poor fit receives a bounded adaptation attempt; failures are
reported in generation notes. Narration support is not independent historical
verification, and semantic review still matters for real footage.

Routes, dimensions, focus rings, pins, celestial diagrams and cycles are
schematic. They do not measure, magnify, track subjects or infer coordinates.
Gallery downloads remain still SVG frames; Artifacts exports the saved animation
through the existing video renderer.

## Verification

```sh
npm run typecheck
npm run build --prefix server
npm run build
node --test --test-concurrency=1 tests/editing/script-motion.test.mjs tests/editing/motion-library.test.mjs tests/editing/scene-graph-render.test.mjs server/tests/motion-editorial-policy.test.mjs
node tests/editing/script-motion-browser.mjs
node tests/editing/motion-library-browser.mjs
```

Integration tests cover the actual Preview prompt, both metadata transports,
invalid/stale data, selective planning, spoken cues, placement overrides, native
Hindi layout for all 30 gallery choices in both video formats, artifact
persistence, checkpoint replay and preview/export parity. Provider responses are
mocked; browser font measurement and rendering are real. Screenshots are under
`artifacts/script-motion-proof/` and `artifacts/motion-gallery-proof/`.

The broader script-generation suite contains an existing narration-length
assertion failure: it expects a 773-character overflow error but receives the
video-quota error instead. The same result was reproduced using the original HEAD
script-generation/parser modules; see `artifacts/script-motion-proof/baseline.txt`.
