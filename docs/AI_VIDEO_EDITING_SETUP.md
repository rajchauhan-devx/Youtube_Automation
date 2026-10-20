# Documentary visuals and motion graphics

For the current directed-sequence renderer, separate illustration assets, actual motion review, and its limits, see [Editorial motion design](EDITORIAL_MOTION_DESIGN.md). The image-led composition section below describes the earlier source-image workflow, retained for archival/detail shots.

## Image-led visuals and rendered placement review

Artifacts now supports versioned documentary image compositions alongside the existing titles and captions. Enable **Image-led documentary visuals**, choose **Automatic**, **Archival collage**, **Cinematic images**, or **Map focus**, then **Generate Motion Graphics**. Automatic can combine treatments across scenes. Source media and narration must already be ready.

Image-led mode requires actual image compositions. Its director cannot substitute titles/counters for image layers, and new image-led revisions cannot export with every image composition missing or hidden. Disable image-led mode when you explicitly want native text graphics only. Source selection is restricted to registered still scenes, with one bounded corrective retry for invalid AI layer/crop instructions.

The image designer can choose a smaller **inset** or a **cutaway** that fills the video frame. Full-frame images are allowed to become the primary narrated subject; inset highlights preserve the source subject. Review identifies original background references, inserted-image references and fully shown rendered frames separately so entry/exit fades are not mistaken for missing images.

The AI first inspects scene images, chooses visual beats, then designs each composition in a separate shallow structured request. A composition can contain up to four independently framed images, source crops, staggered reveals, restrained rotation, and gentle push/drift movement. It reuses registered scene images; a verified detail crop can appear as an inset while its original region is highlighted or the surrounding scene dimmed. Composition titles are editor metadata, so image compositions do not add another large text card to the footage.

**AI checks rendered placement and repairs layout** is enabled by default for new generations. After graphics are created, Remotion renders sample frames, and the selected Gemini model receives original images plus those actual compositions. It checks target attachment, covered subjects/faces, readable text, useful crops, and clutter. It can change the graphic bounds and image-layer bounds/fit, then inspect newly rendered frames. There are at most two completed visual assessments per graphic, with the existing one-retry provider limit on each request. An invalid correction or rejected placement hides the optional graphic. Unavailable review is explicitly marked; it is never reported as passed.

Cards show placement status and composition treatment/layer count. Enter a **Revision direction** such as “move the inset higher and use gentler motion” before regenerating an individual shot. **Review placement** checks an existing current revision after manual edits, without regenerating the narration or visual plan. Manual text/position/timing changes clear that graphic's previous review result. Reviewing creates a new immutable revision. An individually regenerated graphic that fails placement review preserves its previous version.

Select a graphic and choose **Drag & resize graphic** to move its stage or resize it with the four corner handles. The dashed boundary shows the safe area. Keyboard arrows move the focused box or resize handle one output pixel; Shift uses ten pixels. Layout, text, timing, and image-motion changes appear immediately in preview. **Save graphic** (or the card's **Save changes**) creates a new immutable revision; **Discard changes** restores the saved version. Export and generation stay disabled while edits are unsaved. Invalid target overlaps are rejected on save without losing the draft.

Composition cards include per-layer movement choices: still, push-in, pull-out, horizontal/vertical drift, diagonal push-in, and zoom toward a normalized focus point. Movement strength is independent of graphic density, and focus X/Y selects the zoom origin inside the cropped image stage. Manual motion edits preserve source assets, crops, layer geometry, and verified targets; changing those still requires regeneration. Saving motion changes clears the previous placement review.

Use **Preview scene** and **Loop this scene** to repeatedly play only the selected scene, including its narration. Selecting another scene or graphic updates the loop range. Looping and editor handles affect preview only; exported MP4s always use the complete saved composition. Cue planning matches the complete supporting phrase rather than its first word, including punctuation and Hindi text. Word-timed input uses the matched word timestamp; phrase-timed input uses the containing phrase timestamp. Approximate alignment retains scene-start cues; no forced-alignment service is introduced.

Checkpointing saves layer designs, corrections, and completed reviews. Review shares `EDITING_MAX_PROVIDER_CALLS` with inspection/planning/localization; exhausted budgets produce explicit incomplete-review notes. Rendered previews are saved under the immutable revision and final export uses the same approved images and layout. Preview samples cannot establish correctness of every animation frame; watch the complete motion before publishing.

Autopilot now runs documentary generation and rendered review at 30 fps before export. It creates captions only when the script's subtitles switch is enabled. Cancellation also cancels its owned visual-generation job. Stale-revision recovery cannot replace the requested documentary edit with a caption-only project.

### Current scope

- Archival image collages, cinematic image inserts, source-detail magnification, and verified document/map-feature highlighting are available with existing source media.
- Map focus requires an actual inspected map image. Geographical route construction, historical-border datasets, and coordinate projection are not implemented by this release.
- Printed-passage highlighting uses vision localization and independent crop verification; it is not an OCR-backed transcription guarantee.
- Automatic subject extraction, clean-plate inpainting, depth parallax, new archival retrieval, and full 3D reconstruction remain separate extensions. Existing imported transparent images can be composited as image assets.
- Moving footage can have still-image inserts. Object-attached highlights on moving clips still require tracking and are not enabled.
- Narration synchronization still uses saved scene boundaries or explicit approximate timing; word-level forced alignment has not been added.

### Qualification

`npm run test:editing` covers layer contracts, immutable assets, planning/design checkpoints, rendered-review payloads, bounded repair, rejected placement, budgets, and cancellation. `npm run test:documentary:render` exports authored layer fixtures for all three treatments and checks that additional registered image pixels appear in the render. Its map fixture qualifies composition rendering, not geographical correctness.

Opt-in real-provider check (uses an existing image and isolated `artifacts/` storage):

```sh
DOCUMENTARY_SMOKE_IMAGE=/absolute/path/to/image.png npm run test:documentary:live
```

Set `DOCUMENTARY_SMOKE_NARRATION` to a brief description of that image, and optionally `EDITING_SMOKE_MODEL` to a configured accessible Gemini model. The default smoke description matches the existing illustrated submarine image used during development. The check requires an enabled image composition to pass actual rendered-frame vision review and export. It uses a test tone, so it does not qualify spoken-word alignment. Reports are written under `artifacts/`.

## Existing native graphics

Artifacts also creates cinematic titles, character lower thirds, location/era badges, object spotlights, journey progress lines, date/stat labels, archival borders, and text callouts. A separate action creates animated narration captions. These use existing scene media and narration and export in the same MP4.

## Setup

Set `GEMINI_API_KEY` in `server/.env` for motion graphics. Optionally set `EDITING_PLANNER_MODEL` to an available Gemini model, or select one in Artifacts. The same model inspects scene media, plans graphics, and verifies objects. Motion captions use saved narration timing and do not require a Gemini key. Keys remain on the server. No WhisperX or grounding daemon, ComfyUI artifact manifest, external graphics assets, or separate review model is needed.

FFmpeg/ffprobe and a Chromium browser are required for export. Chrome/Edge are detected on macOS, Windows and common Linux locations. Set `EDITING_BROWSER_EXECUTABLE` for another installation. Remotion can also use its managed browser.

Run `npm run dev` from the repository root. The server build removes obsolete compiled modules automatically.

## Workflow

1. Generate or import scene images/video clips and generate matching narration.
2. In Artifacts choose narration, Gemini model, graphic density and 30 or 60 fps.
3. Generate motion graphics for important visual beats, create motion captions, or use both buttons. Each can be cleared without removing the other.
4. Select a graphic to preview it. Edit its title, detail, timing and position; save or regenerate it individually. Hide/show controls apply immediately to a new revision.
5. Export MP4 and download the completed render. Preview and export use the same composition.

To combine graphics with footage edits, switch **Timeline & Render** to **Legacy** and click **Start Video Generation** after editing. This automatically includes the script's current enabled Artifacts graphics and motion captions. The footage, transitions, presenter and audio mix render first; the saved graphics render as a transparent layer and are added afterward. Footage color grading, vignette, grain, sharpening and transitions do not change graphic colors, style, screen positions or entrance/exit animations. Saved motion captions replace legacy subtitles to avoid duplicate text. No saved Artifacts revision is modified.

Graphics retain their saved timestamps. Object spotlight anchors follow the footage's actual zoom, pan and framing, using the same camera calculation. If a framing or scene timing edit would hide a spotlight or move it away from its source scene, rendering asks you to adjust that graphic instead of producing a misplaced highlight. Changed narration, replaced/reordered media or a different output format requires a matching Artifacts revision. The completed combined MP4 is available through the normal preview, download and YouTube Export flow. The interactive legacy timeline preview continues to show the footage; use the completed video to review the combined result.

The pipeline samples one frame from each scene video or uses its still image, then sends scene samples to Gemini in batches of up to 16 for visual inspection. The planner receives visible objects, media roles, descriptions and suggested open areas with narration. Native-only mode permits at most 2/3/4 graphics per minute for subtle/balanced/expressive density, up to 16 per video. Documentary mode permits 4/8/12 visual beats per minute, up to 64; these are ceilings with no quota to fill and provider budgets still apply. One composition can contain several image layers. Spotlights also have their own duration-based limit. Every proposal must cite actual narration. Scenes stay clear when another visual cue adds no value. Graphics use a story-matched color palette selected from narration and imagery.

Object spotlights on still images use a normalized box from Gemini and a separate image-crop verification. Geometry is checked throughout camera movement, and the visible object becomes the spotlight's short label. Model verification is not a guarantee of correct identification; review the target in the preview. If a target cannot be verified or placed safely, the scene stays clean and a diagnostic explains why. Moving clips use scene graphics because object tracking is not implemented.

Short scenes keep a readable title by omitting its optional detail. Scenes shorter than the minimum title reading time remain clean.

Narration scene boundaries are reused when available. Otherwise timing is estimated and labeled in generation notes. Exact word synchronization is not claimed. Motion captions split the saved narration into short timed phrases, animate and emphasize the words as plain text with no card or backing, and stay near the bottom of the frame. Each graphic's timing can be adjusted within its scene.

## Failure and persistence

Each provider operation has at most two requests (initial call plus one retry). Authentication/model-access errors do not retry. Every attempt counts toward `EDITING_MAX_PROVIDER_CALLS` (default 40). Cancellation propagates to requests. Job checkpoints preserve completed graphics for resume. A failed individual regeneration preserves the previous graphic.

Original scene media and narration are immutable. Saved old revisions remain on disk; retired legacy captions, stickers and free-form artifacts are omitted from the new preview/export. The new motion captions are native graphics and are included. Older exported MP4 files are archived rather than offered as current renders.

## Verification

- `npm run typecheck`
- `npm run test:editing`
- `npm run test:editing:render`
- `npm run test:editing:browser`
- `node --test server/tests/render-graphics.test.mjs` (after building the server)
- Optional live provider check: `EDITING_SMOKE_MODEL=<available-gemini-model> npm run test:editing:live`

Renderer/schema types retain legacy node definitions solely to read saved projects and validate storage compatibility. New graphics and versioned image compositions use the validated `graphic` contract and cannot include executable code or legacy nodes. Layer assets remain in the approved asset registry through preview, export, captions, and legacy overlay compositing.
