# Artifacts motion graphics

Artifacts creates four native Remotion graphics: cinematic titles, character lower thirds, location/era badges, and object spotlights. A separate action creates animated narration captions. Both use the existing scene media and narration and export in the same MP4.

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

The pipeline samples one frame from each scene video or uses its still image, then sends scene samples to Gemini in batches of up to 16 for visual inspection. The planner receives the visible objects and suggested open area along with narration. It selects at most 2/3/4 graphics per minute for subtle/balanced/expressive density, up to 16 per video, with no quota to fill. Spotlights count toward the same ceiling and have their own duration-based limit. It must cite actual narration. Scenes stay clear when another visual cue adds no value. Graphics use a story-matched color palette selected from the narration and imagery; the planner can refine the theme.

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
- Optional live provider check: `EDITING_SMOKE_MODEL=<available-gemini-model> npm run test:editing:live`

Renderer/schema types retain legacy node definitions solely to read saved projects and validate storage compatibility. New graphics use the restricted `graphic` contract and cannot include executable code or legacy nodes.
