# Project review — 12 September 2026

This is a working local prototype with useful generation features. It is **not yet a production-ready hosted application**. This review covers the React workflow, Express routes, persistence, ComfyUI generation, TTS integration, video rendering, captions, and YouTube export. Live paid generation and YouTube uploads were not performed. Existing credential contents were not printed or modified.

## Verified machine and current model

- NVIDIA RTX 3050 Laptop GPU: 6 GB VRAM; system RAM: 16 GB.
- Installed checkpoint: `juggernautXL_ragnarok.safetensors`.
- The file `server/workflows/flux_klein_t2i.json` is misleadingly named: its graph is **SDXL**, using CheckpointLoaderSimple, CLIPTextEncode, KSampler and EmptyLatentImage. It does not run FLUX Klein.
- FFmpeg 8.1.1 is installed. The system `python` alias failed in this execution environment. ComfyUI startup now accepts `COMFYUI_PYTHON`; configure it with the actual interpreter used by your ComfyUI installation.

## Changes implemented

| Area | Problem found | Change |
| --- | --- | --- |
| Timing | Audio metadata reset every scene to an equal duration | Metadata only updates measured narration length; saved timings are preserved |
| Playback | Preview advanced on a separate wall clock; seeking did not seek narration | Audio currentTime drives preview; playhead and restart seek the audio |
| Scene order | Preview indexed original images after reordering/removal | Preview uses the edited timeline |
| Renderer | Zoompan used its default 25 fps while duration math assumed 30 fps | Explicit 30 fps, frame-based boundaries and finite source clips |
| Transitions | Overlap and cumulative offsets disagreed; manual durations were silently rescaled | Outgoing sources include transition overlap; narration boundaries remain fixed; mismatched manual timing is rejected |
| Single-image output | Motion used a fixed frame count | Frames derive from actual narration length |
| Editor | Clip editing functions were not exposed | Duration, cut/fade, fade length, move, remove, undo/redo, audio playhead and end-at-playhead controls |
| Format | Landscape and zoom state lacked controls | Portrait/landscape and zoom controls; saved on the timeline |
| Render lifecycle | Cancel did not kill FFmpeg; incomplete MP4s appeared finished | Abort reaches FFmpeg; partial files remain hidden until successful completion and are removed on failure |
| Reliability | Multiple renders could compete; failed jobs disappeared when polled | One active render, reservation before async preparation, stable terminal status, UI polling cleanup and reconnection on reopening |
| Saving | HTTP save errors were ignored; full stale objects could overwrite new edits | Check responses, serialize saves per script, send patches, create missing scripts and display save failures |
| Local storage | JSON write could truncate the only copy; corrupt files looked empty | Write temporary file then rename; fail on corrupt JSON instead of silently replacing it |
| Local access | API and ComfyUI listened on all interfaces | Default loopback binding; reject unexpected browser origins |
| File safety | Dot segments and arbitrary render input paths were accepted | Validate identifiers; constrain render media to the script's generated directory; check real paths |
| Image generation | Fake fallback model; advertised unmeasured generation times | Only list discovered models, remove unsupported timing claims, prevent overlapping image requests |
| Low VRAM | ComfyUI startup lacked memory configuration | Start with `--lowvram` by default; disable via `COMFYUI_LOW_VRAM=false` |
| Lightning | All checkpoints received standard SDXL sampling | Recognized Juggernaut Lightning names use 5/6/7 steps, CFG 1.8, DPM++ SDE/Karras |
| Captions | Minimum duration could place captions after narration ended | Estimated caption chunks stay within the narration duration; UI labels timing as approximate |
| Unsupported control | SFX toggle had no audio mixing implementation | Removed the ineffective SFX switch |

## Recommended image setup

**First choice: keep the installed Juggernaut Ragnarok SDXL checkpoint.** It is already compatible with this application. Start at 768 × 1344, batch size 1, High quality (28 steps), and ComfyUI low-VRAM mode. This is a practical starting configuration, not a locally measured quality or speed guarantee. Assess hands, faces, consistency and prompt adherence using repeatable prompts/seeds. Better scene prompts and reference-image consistency can matter more than a larger checkpoint.

**Faster batch alternative: Juggernaut XL Lightning.** The publisher recommends 5–7 steps, CFG 1.5–2 and DPM++ SDE/Karras. The application now recognizes filenames containing both Juggernaut and Lightning and applies that configuration. Install its single-file SDXL checkpoint into ComfyUI's `models/checkpoints`, refresh discovery and select it. Lightning is primarily a speed option; it is not guaranteed to improve detail over your existing model. See the [publisher's model card](https://huggingface.co/RunDiffusion/Juggernaut-XL-Lightning), including its deployment terms.

**Experimental upgrade: quantized FLUX.2 Klein 4B or Z-Image Turbo.** These require different workflows, encoders and memory testing. Klein's official unquantized guidance is about 13 GB VRAM, while Z-Image Turbo is a 6B model with CPU-offload support. With 6 GB VRAM and 16 GB system RAM, do not treat either as a drop-in upgrade or promise interactive speed. No new model was downloaded or benchmarked in this pass. Sources: [Black Forest Labs overview](https://docs.bfl.ai/flux_2/flux2_overview), [Klein model](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [Z-Image Turbo model](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo), [ComfyUI troubleshooting](https://docs.comfy.org/troubleshooting/overview).

Generate images and local speech sequentially. A global GPU scheduler with model unloading is still required; preventing simultaneous image requests does not coordinate ComfyUI with Chatterbox.

## How to correct a video's scene sync now

1. Generate narration and images, then open **Timeline & Render**.
2. Use **Fit timing to narration** if total scene duration differs from the measured audio. This preserves relative clip lengths; it does not locate spoken sentences.
3. Play/scrub narration, select a scene, and choose **End scene at playhead** at the relevant spoken boundary. This adjusts the selected scene and its next neighbor without changing total length. Use cuts for an immediate boundary; fades begin at the boundary and complete afterward.
4. Reorder or remove scenes as needed. Removing a scene transfers its time to a neighbor. Undo/redo are available within the current editor session.
5. Render and inspect the MP4 for motion, transitions, subtitles and the music mix. The interactive composition preview shows hard scene changes and narration; it does not reproduce the FFmpeg effects/music mix.

## Remaining release blockers, in priority order

1. **Measured speech alignment and scene mapping.** AI scene analysis and caption timing are estimates. Add stable scene IDs, each scene's exact narration text, audio identity/hash, and measured word/segment timestamps. Prefer exact per-scene TTS segment durations when synthesizing scene by scene; for existing recordings, add forced alignment (with language-specific validation for English/Hindi). Derive image boundaries and captions from one timing source. Invalidate alignment when narration/audio changes. The current changes fix playback/render drift and enable manual correction; they do not implement automatic semantic alignment.
2. **Credential handling.** `server/data/client_secret.json` and `server/data/youtube-token.json` are already Git-tracked. Added ignore rules do not untrack existing files or remove history. Review repository exposure, revoke/rotate exposed tokens as appropriate, remove secrets from version control and use an OS credential store. The existing modified token file was left untouched. OAuth callback needs a one-use, browser-bound state check, safe error rendering and a restricted postMessage destination. No YouTube publish operation was tested.
3. **Durable job execution.** Render/image job maps live in memory. Add SQLite job records, explicit states, retry limits, cancellation acknowledgement, recovery after restart, disk-space checks, output manifests and per-script output versions. Use a single GPU scheduler for image/TTS tasks. Do not use directory scanning as the authority for which render should be uploaded.
4. **Authentication and complete request validation.** Loopback and origin checks improve local operation; they are not user authentication. Before network deployment, add authentication/authorization, complete route schemas, rate limits, resource limits, upload validation and systematic traversal tests for every file-serving/export/TTS route. Express 4 async handlers need consistent rejection forwarding. Multi-user YouTube credentials must be isolated per account.
5. **Persistence and recovery.** Atomic rename is better than in-place writes, but JSON files still lack transactions, migrations, automatic backups and multi-process locking. Save errors are visible but there is no offline durable edit queue. Move scripts/assets/jobs to SQLite and test backup/restore.
6. **Finish the editor.** Add waveform display, sentence markers, draggable boundaries, character/reference consistency, per-scene regenerate/replace, timed caption editing, saved render settings, draft render previews and output invalidation. Current undo history resets on leaving the page. Advanced motion/music/subtitle settings are not all persisted. Some unrelated pages remain placeholders; the old `EditorTab.tsx` is unused mock UI, while the actual editor is `ReviewAdjustTab.tsx`.
7. **Quality gates and deployment.** Resolve existing source lint errors, verify dependency advisories when registry access works, add CI, health/readiness checks and a single production startup path that serves the built client. Validate actual ComfyUI/Chatterbox startup, long-running English/Hindi narration, low-disk/OOM failures, a long video and an authorized private YouTube upload before calling this production-ready. Replace unverified hardcoded LLM model IDs with provider model discovery or configured IDs.

## Verification

- Frontend TypeScript check and frontend/backend production builds passed.
- Automated FFmpeg tests cover mixed cut/fade timing, scene-color order, narration coverage, single-image duration, actual process cancellation, partial cleanup, malformed timing and path rejection.
- Workflow tests cover Lightning sampling and standard SDXL isolation.
- Browser regression uses synthetic media and mocked APIs; it checks saved timing, reorder, undo/redo, seeking, boundary placement, remove, fit and persistence after reload. Desktop/mobile screenshots are in `artifacts/`.
- Source lint still has pre-existing errors; detailed report is in `artifacts/lint-report.json`. The broader `npm run lint` also scans old backup scripts; it is not a release gate that currently passes.
- Dependency advisory lookup could not reach the npm audit endpoint. No clean security-audit claim is made.
- No new-model quality benchmark, live TTS/image generation or YouTube upload was performed.

Commands: `npm run build:all`; `npm test`; start `npm run dev:client -- --host 127.0.0.1 --port 5175`, then `node server/tests/editor.browser.mjs` for the isolated UI check.
