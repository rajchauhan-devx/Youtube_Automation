# Artifacts motion graphics

Artifacts creates four native Remotion graphics: cinematic titles, character lower thirds, location/era badges, and object spotlights. It uses the existing generated scene media and narration and exports a complete MP4.

## Setup

Set `GEMINI_API_KEY` in `server/.env`. Optionally set `EDITING_PLANNER_MODEL` to an available Gemini model, or select one in Artifacts. The same model plans graphics and verifies objects. Keys remain on the server. No WhisperX or grounding daemon, ComfyUI artifact manifest, external graphics assets, or separate review model is needed.

FFmpeg/ffprobe and a Chromium browser are required for export. Chrome/Edge are detected on macOS, Windows and common Linux locations. Set `EDITING_BROWSER_EXECUTABLE` for another installation. Remotion can also use its managed browser.

Run `npm run dev` from the repository root. The server build removes obsolete compiled modules automatically.

## Workflow

1. Generate or import scene images/video clips and generate matching narration.
2. In Artifacts choose narration, Gemini model, graphic density and 30 or 60 fps.
3. Generate motion graphics. Scenes without useful graphics remain clean.
4. Select a graphic to preview it. Edit its title, detail, timing and card position; save or regenerate it individually. Hide/show controls apply immediately to a new revision.
5. Export MP4 and download the completed render. Preview and export use the same composition.

The planner selects up to 2/3/4 scene graphics for subtle/balanced/expressive density, plus a duration-dependent maximum of eight spotlights. It must cite actual narration. Display text is brief, not subtitle pages.

Object spotlights on still images use a normalized box from Gemini and a separate image-crop verification. Geometry is checked throughout camera movement. Model verification is not a guarantee of correct identification; review the target in the preview. Ambiguous targets, unsafe placement and failed calls are reported and skipped. Moving clips support scene graphics; object tracking is not implemented, so video spotlights are explicitly skipped.

Narration scene boundaries are reused when available. Otherwise timing is estimated and labeled in generation notes. Exact word synchronization is not claimed. Each graphic's timing can be adjusted within its scene.

## Failure and persistence

Each provider operation has at most two requests (initial call plus one retry). Authentication/model-access errors do not retry. Every attempt counts toward `EDITING_MAX_PROVIDER_CALLS` (default 40). Cancellation propagates to requests. Job checkpoints preserve completed graphics for resume. A failed individual regeneration preserves the previous graphic.

Original scene media and narration are immutable. Saved old revisions remain on disk, but retired captions, stickers and free-form artifacts are omitted from the new preview/export. Generate a new revision to replace them. Older exported MP4 files are archived rather than offered as current renders.

## Verification

- `npm run typecheck`
- `npm run test:editing`
- `npm run test:editing:render`
- `npm run test:editing:browser`
- Optional live provider check: `EDITING_SMOKE_MODEL=<available-gemini-model> npm run test:editing:live`

Renderer/schema types retain legacy node definitions solely to read saved projects and validate storage compatibility. New graphics use the restricted `graphic` contract and cannot include executable code or legacy nodes.
