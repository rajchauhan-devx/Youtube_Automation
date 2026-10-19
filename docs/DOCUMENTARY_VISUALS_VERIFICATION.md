# Documentary visuals qualification — 2026-10-17

## Delivered behavior

- The real short exposed a gap: an optional composition type still allowed a text-only plan (one archival text frame, three counters and 49 captions). Image-led mode now uses a composition-only director and blocks generation/export when no enabled image compositions survive validation/review. Native text graphics remain available with image-led mode off.
- Autopilot respects the saved subtitles switch and uses 30 fps for documentary projects. Stale-revision recovery no longer replaces the visual edit with captions.
- Cinematic cutaways can occupy the full video frame; image-led layouts no longer inherit text-card margins. Reference and rendered images carry explicit role labels, and review distinguishes fully shown compositions from entrance/exit fades. Invalid source/crop instructions receive one bounded corrective request.
- Final-file inspection exposed libvpx's default 256 kbps intermediate target, which severely pixelated photographs. The transparent pass now requests a resolution/fps-scaled image bitrate. Renderer version 4 is included in the legacy render fingerprint, so earlier low-quality exports are not offered as current. A portrait texture test checks decoded image detail rather than just successful encoding.
- Versioned image-layer compositions survive storage, captions, preview, enhanced export, and legacy overlay export.
- Archival, cinematic-image, and source-map treatments share one renderer. Layers support actual image crops, independent reveals, contain/cover framing, restrained rotation, and gentle motion. Imported alpha images retain transparency.
- Detail and printed-region emphasis use source inspection, localization and independent crop verification. Camera-aware geometry checks remain active.
- Gemini receives original images and rendered compositions for placement review. It can correct stage/layer bounds and fit, then inspect the correction. Rejected optional visuals are hidden; unavailable checks are explicitly unreviewed. A rejected individual replacement preserves the earlier graphic.
- Layout/timing/text edits invalidate the affected review. Review-only jobs preserve narration, shot timing and unrelated diagnostics. Checkpoints preserve completed design/review work and an interrupted correction's remaining assessment budget.
- Planner beat limits reserve calls for design, localization and review. Provider retries remain bounded and counted.
- Artifacts exposes treatment, documentary/review toggles, placement status and a review-existing-placement action. Autopilot prepares visual compositions before captions/export and cancels its owned job on interruption.

## Checks actually run

| Check | Result |
| --- | --- |
| Frontend typecheck and shared package builds | Passed |
| Frontend production build | Passed; existing large-chunk advisory remains |
| Server TypeScript build | Passed |
| Editing suite | 64 passed, 0 failed |
| Legacy saved-graphics integration/export tests | 6 passed, 0 failed |
| Browser smoke | Passed: controls, playback, hide/show, persistence, enhanced editor |
| Documentary renderer smoke | Passed: landscape/portrait image-layer exports; additional-asset pixels asserted |
| Focused lint of compositor/contracts/planning/review modules | Passed |
| Artifacts UI lint | No errors; three existing hook-dependency warnings remain |
| Full `npm test` server suite | Not green: 127 passed, 23 failed, 2 skipped |

The full-suite failures include missing ACE-Step music models, channel-LoRA expectations, reference-media paths, moving-media integration and script extraction/parser assertions. These are outside this editing slice; the overall repository should not be described as fully qualified. Full output from this run is at `/tmp/documentary-server-tests.log` on the development machine.

The initial build also found invalid Script voice/language property reads in Autopilot and an invalid Gemini `chat()` call/response assumption in the existing supervisor route. Those integration errors were corrected so frontend/server builds can complete. The legacy graphics test cleanup now canonicalizes both sides of its macOS temporary-directory comparison.

## Real provider and image check

The configured `gemini-3.1-flash-lite` completed the following against an existing illustrated submarine image from project storage:

1. Inspect the actual source image.
2. Plan a documentary visual beat.
3. Design an image composition.
4. Locate the circular front window.
5. Independently verify its crop.
6. Review five rendered composition frames, accepting the magnified inset and source highlight.
7. Export the same composition to MP4; inspect its rendered midpoint visually.

Observed run: macOS, Node v20.20.1, 640 × 360, 24 fps, 192 frames / 8 seconds. Six provider requests; approximately 34.5 seconds for the measured planning/review/export sequence. No memory or monetary benchmark was collected.

The first live attempts exposed Gemini schema-complexity rejection. Planning now uses separate shallow beat/design schemas. The provider wire schema omits length/cardinality constraints that inflate its grammar; the original strict Zod parser still enforces every bound and rejects unknown properties before use. The successful live run exercised that corrected path.

Local outputs (ignored by Git):

- `artifacts/documentary-preview.mp4`
- `artifacts/documentary-preview.png`
- `artifacts/documentary-live-result.json`
- `artifacts/documentary-successful-check.json` (preserved evidence from the completed successful run)
- `artifacts/documentary-live-overload.json` (a later check encountered HTTP 503 twice and correctly stopped)
- `artifacts/documentary-render-results.json`

The sample uses test-tone audio and illustrative media. It qualifies image inspection, visual composition, sampled-frame review and export; it does not qualify spoken-word alignment or factual documentary evidence. Real footage tracking, OCR-backed text verification, automatic segmentation/clean plates, coordinate-based map routes, and 3D reconstruction are not implemented by this release. See [setup and current scope](AI_VIDEO_EDITING_SETUP.md).

Final review sampling also includes completed delayed-layer entrances and excludes unrelated caption cue frames. A caption-heavy renderer fixture verifies this stays bounded. Provider availability remains an external dependency: the later HTTP 503 run did not invalidate or replace the earlier successful sample.

## Actual short correction

The completed 64.89-second short was traced to its saved revision: no image compositions had been proposed, so exporting that revision faithfully produced text. Two subsequent automatic plans exposed invalid source/crop choices and poor compositions; the new gate correctly refused to publish a text-only result after rejection. This is evidence of the gate, not evidence that the configured lightweight model reliably directs polished documentary shots without supervision.

The actual episode was then refined with four authored image-led beats using its existing registered media: vessel/storm comparison, broken-mast detail, makeshift sail and sextant navigation. Each passed Gemini review of real rendered frames. Full-frame cutaways and explicitly labeled review images were needed to avoid inappropriate corner-placement repairs and confusion between the background reference and the visible insert. The source media are illustrative reconstructions; genuine archival retrieval and accurate map assets remain outside this implementation. No narration or scene media was regenerated for this correction.

The final corrected MP4 is `artifacts/corrected-documentary.mp4` and is also the current render returned by the scoped Review API. Actual final-file frames were extracted and inspected after compositing, including the vessel/storm comparison and sextant. Probe: 1080 × 1920, 30 fps, 1,947 frames, 64.9-second video / 64.89-second audio, 51,390,492 bytes. Its encoded audio stream SHA-256 exactly matches the original finished video's audio, confirming that the narration/music mix was preserved. Verification metadata is at `artifacts/documentary-final-verification.json`; the previous text-only video is preserved at `artifacts/previous-text-only-video.mp4`.
