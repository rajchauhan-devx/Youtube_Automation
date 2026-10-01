# AI-designed motion graphics

Generate narration and scene media, then use **Artifacts → Generate motion graphics**. The planner can request a custom explanation instead of selecting only the four native graphics. The designer composes text, shapes, drawn paths, integer counters and approved still images. Animation supports translation, scale, rotation, opacity and path drawing. Screen-based compositions work over stills and moving clips; verified object spotlights remain restricted to stills.

Each custom design is versioned JSON, never executable React, HTML or JavaScript. Elements use normalized local bounds; animation times span 0–1 of the artifact interval. A single renderer evaluates saved designs for both player seeking and MP4 export. Existing native graphics and revision history remain compatible.

Generation validates narration evidence, displayed numbers/counter endpoints, approved assets, element/keyframe limits, readable text, safe transformed bounds and reading time. Representative frames are rendered with the approved fonts before accepting a design. Browser text overflow feeds back into one design repair attempt. Provider calls, including repairs, count against the existing job budget. Invalid designs are skipped with a scene diagnostic; failed revisions preserve the accepted graphic. Evidence checks establish source references and numerical support; semantic accuracy and aesthetics still benefit from preview review.

The designer uses the project's font and palette direction and receives the earlier designs to discourage repetition. The current engine uses a flat, ordered element composition. Dedicated hierarchy/group editing, moving-object tracking, new asset generation, maps with geographical accuracy, and a drag-and-drop designer are outside this first version.

Artifacts exposes editable custom labels, timing, positioning, visibility and a natural-language revision field. Counters use a `{value}` placeholder; keep it when editing their label. Regenerate to change animated counter values or redesign the layout. Preview edits before export.

Accepted designs are cached per project using the proposal, narration, observed media, media hashes, format, scene duration, theme, model, design prompt and renderer version. Cached designs are revalidated and preview-rendered before reuse. Individual regeneration bypasses the cache. Job checkpoints preserve completed scenes; unfinished scenes resume using cached accepted designs where available. Version 3 checkpoints deliberately invalidate older pipeline checkpoints.

Custom generation requires the existing `GEMINI_API_KEY` and an available Remotion browser. Each uncached custom graphic uses one design request and at most one repair request, in addition to inspection/planning. Preflight rendering adds generation time. No model calls occur during preview or export.

Validation:

- `npm run build:all`
- `npm run test:editing`
- `EDITING_CUSTOM_SMOKE=true npm run test:editing:browser`

The custom tests mock Gemini responses while exercising actual browser previews, export, repair, cache reuse, checkpoint resume and Hindi portrait text. Live model visual quality is a separate manual check.
