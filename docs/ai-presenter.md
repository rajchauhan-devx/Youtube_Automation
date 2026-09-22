# AI presenter

Open **Timeline & Render → AI Presenter**, enable the character, select a prepared
avatar, adjust the crop and placement, then generate the video. The application
starts its Python worker automatically. You do not need to start the MuseTalk web
interface. Save settings explicitly or let Generate Video save them.

The initial settings use `avatar_005`, a chest-up crop of the sage, a width of 24%,
and a bottom gap of 18%. Adjust the four crop percentages for other characters.
The preview shows source movement, not generated lip-sync. Final renders reserve
space above the presenter for centered captions. Subtitle left and right margins
stay equal when the avatar is resized; only their vertical clearance follows its
height, crop, and bottom position. Render again to update previously baked captions.

To remove subtitles, turn off **Show subtitles** above the presenter settings.
The choice is saved with the story and applies to the preview and the next render,
including automatic editing. Narration and the presenter are not removed. Render
again to replace subtitles that were already burned into an exported video.

## Installation

This integration reuses the installed MuseTalk-Demo engine, weights, Conda Python
environment, and prepared avatars. Defaults detect:

```
<user>/OneDrive/Documents/MuseTalk-Demo
<user>/miniconda3/envs/musetalk-demo/python.exe
```

For another installation, set `MUSETALK_ROOT` and `MUSETALK_PYTHON` in the root
`.env`, then restart `npm run dev`. Models are not copied into Git. This is an
integration with that local installation, not a standalone distribution of the
MuseTalk weights. Prepare additional avatar videos using MuseTalk's existing lab,
then click Refresh avatars in the editor. The lab can be closed afterward.

## Appearance

- Card: retains the source background inside the selected crop.
- Transparent cutout: restores the original VP9 WebM alpha channel after lip-sync.
  Select this for Picsart background-removed avatars; both preview and final render
  show the story behind the character. New character selections automatically use
  this mode when transparency is available. For an already selected card, click
  **Remove background — use original transparency**, then save and render again.
  No black color-key is used, so dark hair and clothing are preserved. The source
  is copied into `server/data/presenter-alpha` before Gradio clears its upload;
  the final mask follows MuseTalk's 25fps forward/reverse frame cycle. Existing
  rendered videos must be rendered again; cached lip-sync can be reused.
  This requires the original transparent WebM, not a flattened MP4. It does not
  perform AI background segmentation for opaque uploads.
- Green-screen cutout: removes green during the final render. The source must
  actually have a green background; this does not remove arbitrary backgrounds.
- Eye, hand, and head movement come from the source video. MuseTalk supplies lip
  motion. Keep hands away from the face and use gentle, repeatable movements.
- Silence protection restores the original mouth in quiet sections, so choose a
  source with a neutral mouth during idle movement.

## Rendering and GPU use

The render job generates or reuses one lip-sync clip for the whole narration, then
composites it over the story. Its audio is ignored; the existing narration/music
mix remains the only audio track. MuseTalk's 25fps output is resampled to 30fps
without changing playback speed. The final composite adds an encoding pass.

The generated presenter is saved under the current account/profile/script's
generated directory. The cache includes the audio content, avatar metadata and
latents, engine code, and silence settings. Moving, cropping, or resizing the
presenter does not run inference again. Cancel Render stops the owned Python and
FFmpeg process tree on Windows and cleans its temporary files.
The worker also checks for cancellation between stages, cached frames, and
inference batches. Audio compilation caches use the current user's temporary
folder (`tubeflow-musetalk-numba`) so the Python installation need not be writable.

The app refuses presenter generation while narration, image or music generation
is active. It checks ComfyUI's queue and unloads idle ComfyUI models, and stops
only its own Chatterbox process before starting MuseTalk. The worker exits after
each generation to release GPU memory. Independently started GPU applications
remain running; close the standalone MuseTalk lab if an out-of-memory error occurs.

Routes: `GET /api/presenter/status`, `GET /api/presenter/avatar/:id`, and the existing
`POST /api/render/start` with a `presenter` settings object. The same routes work
under the account/profile workspace prefix. Paths and crop/size settings are
validated on the server.

## Verification

`npm test` includes synthetic overlay, narration timing, audio isolation,
green-screen, cache and presenter API tests. `npm run build:all` checks both apps.
Optional tests that use the installed avatar are:

```
node server/tests/presenter.browser.mjs
node server/scripts/test-presenter.mjs
node server/scripts/test-presenter.mjs --cancel
```

The real GPU test writes a four-second sample to
`artifacts/presenter/presenter-demo.mp4`. It does not modify saved stories.
