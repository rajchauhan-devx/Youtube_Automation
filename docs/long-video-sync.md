# Long Video narration sync

The default account has an **Ancient Dharma Long — Narration Sync** template in its Long Video profile, with a 15-minute drafting target. Its source is `docs/ancient-dharma-long-template.md`. To install it into a fresh workspace, build the server, then run `node server/scripts/install-long-template.mjs`. The installer never overwrites an existing template. Shorts scripts are unchanged.

## Workflow

1. Select Long Video and the template. Enter the episode topic, source material and desired duration. Generate the response.
2. Extract Assets. Extraction validates the `<long_video>` JSON directly; it never guesses scene links or timings. The narration is constructed from scene text in order. The thumbnail prompt is available separately in Assets, with a Copy button; it is not automatically generated as a timeline image.
3. Generate the scene images. Long Video Image Generation defaults to batches of 5 images with a 60-second computer rest between batches. You can choose 3, 5, 8 or 10 images per batch and 0, 30, 60, 120 or 300 seconds of rest. Pause or cancel at any time; completed images remain saved and Resume continues with pending scenes. Shorts keeps its existing continuous queue. Generate narration with a saved Hindi or English voice. The scene map's language must match the selected voice; this flow does not translate narration.
4. The server generates each scene with the same voice/settings, converts it to mono 48 kHz PCM, and records integer sample offsets. Completed segments are cached per workspace, script, voice/settings and exact narration. Reopening the Audio tab reconnects to progress. Cancel waits for the current voice request to return before cleanup. After a failure or server restart, Generate reuses completed segments. It is a resume operation, not a guarantee of a new random take for unchanged settings.
5. Timeline & Render shows the measured duration, matching narration and visual for every scene. Scene order and durations are locked to narration. In Assets, use Edit on a scene to revise its spoken text and matching image prompt. Saving updates the source response and invalidates audio and rendering. Generate the matching images and voice again. Unchanged images are retained.
6. Render. Long Video uses landscape 1920×1080, continuous narration and cuts at measured boundaries. Motion, color, vignette and background music remain available. Optional captions show each scene's complete narration for that scene, not word-level karaoke subtitles.

## Correctness and recovery

- The scene contract accepts 1–160 scenes, at most 700 characters per narration segment, and 50,000 narration characters total. The template recommends shorter, natural sentence groups to preserve voice quality and readable captions. Total narration is capped at one hour.
- PCM sample counts determine every scene start; global frame boundaries are rounded only at rendering. Individual rounded scene lengths are never added to create the next start.
- The renderer encodes one scene at a time with bounded encoder threads, concatenates video segments, then muxes one continuous narration track. It validates final video and audio stream durations before publishing the MP4. This avoids a single enormous multi-input filter graph for a 20-minute episode. See the [FFmpeg concat demuxer documentation](https://ffmpeg.org/ffmpeg-formats.html#concat).
- Narration sidecars include the scene-plan hash and audio-file hash. Rendering checks the current narration, audio filename/hash, complete scene images and scene order. It refuses missing or stale mappings instead of distributing images evenly.
- Render metadata identifies the scene plan, narration and image versions. Stale renders are hidden from playback and refused by upload for structured Long Video scripts. Changing assets during rendering prevents the outdated result from being published.
- Clear/Delete cancels active narration and rendering before resetting data. Narration cancellation keeps completed cache segments for retries. Clearing the script clears its media references and rendered video; deleting the script removes its generated-media directory too.
- Voice model pronunciation, missing/repeated speech, and changes in delivery between independently generated scenes still need listening review. This implementation guarantees the mapping to generated audio segments; it does not perform speech recognition or word-level forced alignment. It cannot detect a TTS model saying the wrong words. Review chapter joins and difficult names before publishing.

## Validation

`npm test` includes strict extraction, PCM timing/cache integrity, voice-job publication/reconnect/cancellation, stale-render checks, isolated account/profile storage, a 160-scene twenty-minute frame-boundary test, and short real FFmpeg renders (including Hindi scene captions).

`node server/tests/long-video.browser.mjs` uses the Vite server at `127.0.0.1:5175` with isolated mocked API responses to test landscape layout, exact scene durations, disabled timing edits, audio-driven preview, narration text, thumbnail separation, progress reconnection and cancellation. `node server/tests/editor.browser.mjs` verifies the existing Shorts editor.

The tests use synthetic audio and stub voice synthesis, not a complete paid/cloud or local-model 20-minute episode. A real episode still requires the configured voice and image services to be ready and a content/voice review.
