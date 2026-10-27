# AI presenter

Open **Timeline & Render → AI Presenter**, enable the character, select a prepared
avatar, adjust the crop and placement, then generate the video. The application
starts its Python worker automatically. You do not need to start the MuseTalk web
interface. Save settings explicitly or let Generate Video save them.

Choose an available avatar or upload a new one; imported avatars start with their
full source framing. Adjust the crop, size and placement for the actual character.
The preview shows source movement, not generated lip-sync. Final renders reserve
space above the presenter for centered captions. Subtitle left and right margins
stay equal when the avatar is resized; only their vertical clearance follows its
height, crop, and bottom position. Render again to update previously baked captions.

To remove subtitles, turn off **Show subtitles** above the presenter settings.
The choice is saved with the story and applies to the preview and the next render,
including automatic editing. Narration and the presenter are not removed. Render
again to replace subtitles that were already burned into an exported video.

## Installation

The project includes the source from
[`rajchauhan-devx/MuseTalk`](https://github.com/rajchauhan-devx/MuseTalk), pinned in
`MuseTalk-Demo/UPSTREAM.json`, plus a TubeFlow adapter in `MuseTalk-Demo/app`.
The upstream files and license are retained. No separate Gradio lab or ComfyUI is
required. Install with Python 3.10–3.12 and FFmpeg available:

```sh
npm run setup:presenter
```

Setup creates an isolated `.venv` and downloads only MuseTalk 1.5, the SD VAE,
Whisper Tiny and the small OpenCV YuNet face detector. Model revisions are recorded
in `MuseTalk-Demo/MuseTalk/models/sources.json`. Weights, environments, avatars and
temporary files are excluded from Git. Expect roughly 5 GB for the runtime/models,
plus prepared avatar frames and generated clips. The old F5 and ComfyUI installs
are not used.

Start/restart `npm run dev`, open **Timeline & Render → AI Presenter**, and upload
one forward-facing face photo or a video up to 40 MB. Preparation uses at most the
first 10 seconds, normalized to 25fps. The original motion plays forward/backward
to cover the narration. Preparation runs in the background with progress and
cancellation; completed avatars are reusable. Keep one face visible throughout.

The adapter uses the fork's neural VAE, UNet and audio processor. Face detection
uses CPU YuNet and a feathered lower-face mask instead of the upstream MMLab
DWPose/face-parsing preparation. This avoids CUDA-only build extensions on Macs;
it is a different preparation/blending path, and profile faces, occlusions and
stylized faces may need a better source. The app rejects frames without exactly
one confidently detected face. A still image animates the mouth only.

CUDA, Apple MPS and CPU are selected in that order. Set `MUSETALK_DEVICE=cpu`,
`mps` or `cuda` to force a device. Laptop/CPU rendering is not promised to be
real time. CPU and MPS use single-frame batches to limit memory. VAE decoding
uses float32 to avoid fp16 overflow. Apple MPS also needs float32 for UNet/audio
conditioning; CUDA uses fp16 for those models.

Optional CLI preparation (use `.venv/Scripts/python.exe` on Windows):

```sh
MuseTalk-Demo/.venv/bin/python MuseTalk-Demo/app/cli.py health
MuseTalk-Demo/.venv/bin/python MuseTalk-Demo/app/cli.py prepare --source /path/to/avatar.mp4 --id my_avatar --name "My presenter" --seconds 10
```

The bundled `.venv` is detected automatically. An existing custom installation can
still be selected with `MUSETALK_ROOT` and `MUSETALK_PYTHON` in `server/.env`.
Relative paths resolve from the project root. Invalid explicit overrides are
reported instead of silently selecting another installation.

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
is active. It checks ComfyUI's queue and unloads idle ComfyUI models, before starting MuseTalk. The worker exits after
each generation to release GPU memory. Independently started GPU applications
remain running; close the standalone MuseTalk lab if an out-of-memory error occurs.

Routes: `GET /api/presenter/status`, `GET /api/presenter/avatar/:id`,
`POST /api/presenter/avatars?filename=avatar.mp4` (raw `application/octet-stream`,
maximum 40 MB), `GET /api/presenter/preparation/:id`,
`POST /api/presenter/preparation/:id/cancel`, and the existing
`POST /api/render/start` with a `presenter` settings object. The same routes work
under the account/profile workspace prefix. Paths and crop/size settings are
validated on the server.

## Verification

`npm test` includes synthetic overlay, narration timing, audio isolation,
green-screen, cache and presenter API tests. `npm run build:all` checks both apps.
Optional tests that use the installed avatar are:

```
node server/scripts/test-presenter.mjs --avatar my_avatar
node server/scripts/test-presenter.mjs --avatar my_avatar --cancel
node server/tests/presenter-upload.browser.mjs
```

The real GPU test writes a four-second sample to
`artifacts/presenter/presenter-demo.mp4`. It does not modify saved stories.
The upload browser test uses the bundled sample video, verifies a real upload and
prepared preview, and removes its temporary avatar afterward. The older
`presenter.browser.mjs` test requires the legacy `avatar_005` and transparent
`avatar_007` fixtures from the original custom installation.
