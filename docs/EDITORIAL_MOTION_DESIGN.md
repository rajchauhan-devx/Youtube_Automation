# Directed editorial sequences

The current system has four supported motion-design recipes: a brief statistic over full-bleed footage, a screen-space scale reveal, an illustrated process with an independently moving subject, and a joining/interlocking assembly. A planner chooses a few appropriate beats; ordinary footage stays clean. This is a bounded design system, not a general replacement for a professional motion designer or arbitrary After Effects work.

## Why the previous edit failed

The audited input is My Channel's 70.07-second mixed Brihadisvara Temple Short, `final_a4f09eb7-31b1-4684-a7dd-1e31d5f8de00.mp4`.

- Opening: a large opaque rectangular hauling photograph covers the tower.
- Approximately 12.6–19.1 seconds: an installed-capstone beat is replaced with an elephant hauling scene.
- Approximately 54.4–63.0 seconds: an interlocking-masonry beat is replaced with the king and architect reviewing plans.
- Placement review approved those source mismatches. Its intended graphic names were not reliable evidence of the actual visual content.
- The final compositor placed graphics above already-burned captions. Full-stage graphics hid captions; translucent graphics dimmed them. The final layer order now adds plain captions after graphics, and native motion captions have a dedicated top layer. Caption-only projects also render their saved overlay.
- The default FFmpeg `subtitles` path misplaced Devanagari vowel marks with this Windows build. All ASS caption paths explicitly request complex HarfBuzz shaping; the regression compares the actual compositor's Hindi pixels with complex and simple shaping renders.

The before contact sheet and immutable project snapshot are in `artifacts/temple-edit-audit/`. The replacement uses a statistic over the tower, a scale reveal over the capstone footage, a separate granite/rollers prop moving along a ramp diagram, and complementary stone parts joining. It removes the unrelated source substitutions.

## Implementation and controls

- `EditorialSequence` is a versioned scene design in the shared composition contract. Native text, quantities, subjects, paths, and timing remain separate.
- Displayed numeric values must occur in the selected scene's actual narration. The assembly and incline recipes require the corresponding narrated mechanism. This checks consistency with the script, not historical or scientific truth.
- The director may request up to three isolated illustration assets by default, with a separate image-model prompt. `EDITING_ASSET_IMAGE_MODEL` selects that model. These are illustrative subjects, never new archival evidence.
- Existing transparency is retained. Google image outputs can use an explicitly requested flat chroma backdrop; only the connected background is removed. Empty/opaque photographic cards are rejected. The image service's unrelated atmospheric fallback is disabled for motion assets.
- Companion source images get a separate pixel-based relevance check without the intended graphic title or source prompt. Full scene photographs are not accepted as generic floating overlays.
- Before approval, actual rendered motion clips with scene audio are reviewed alongside layout frames. Review clips retain timing, render at 10 fps for a 30 fps project, and are sampled at 4 fps by the vision request. This is temporal sampling, not exhaustive every-frame certification.
- Text fitting and bounds checks run after the graphics mount. Portrait/landscape use separate layouts and reserve caption/UI areas. Manual text edits invalidate approval; changing source assets, diagram anchors or the recipe requires regeneration.
- Rate-limited final review preserves completed small batches, honors cooldowns, and retries the same MP4. It does not grant approval or rerender merely because the provider is temporarily unavailable.
- Concrete caption and explanatory-label clipping remains a blocker. Review findings retain their original severity; there is no keyword-based downgrade. Permanent provider errors, such as invalid credentials, fail promptly instead of looping indefinitely.
- Final review also receives overlapping encoded video clips with audio and 4 fps temporal sampling. Isolated still frames could mistake a normal sentence continuation for clipping; clips show the caption phrase changes without suppressing a reported defect.
- Reviewed graphics overlays are cached by immutable project, renderer version and actual camera mapping, so a caption or final-composite correction can reuse the rendered animation. Failed partial overlays never become cache entries.

## Qualification and limits

`tests/editing/editorial.test.mjs` checks supported values, mechanism eligibility, isolation, source rejection, and actual video payloads. `scripts/check-native-diagrams.mjs <projectId>` renders middle/late samples in both orientations. The audited project's candidate review and render reports are in `artifacts/temple-edit-audit/`.

This does not provide moving-object tracking/rotoscoping, arbitrary 3D reconstruction, clean-plate parallax, geographic map data, automatic historical fact verification, or guaranteed professional taste on every script. Timing uses measured scene boundaries; word-precise timing requires the existing optional forced-alignment service. Rendered vision remains fallible, so a passing model response is evidence to inspect, not a quality guarantee.

## Research used

- [Adobe: keyframes, timing, and the Graph Editor](https://helpx.adobe.com/au/after-effects/desktop/animate-in-after-effects/animation-basics/animation-basics.html)
- [Adobe: easing and motion blur](https://www.adobe.com/learn/after-effects/web/create-fluid-text-animations)
- [Apple: compositing, layer order, masks, and integration](https://help.apple.com/motion/mac/5.0/help/English/en/motion/usermanual/chapter_7_section_0.html)
- [Apple: tracked masks](https://support.apple.com/en-ie/guide/motion/motn1818f1c3/mac) — documents an important capability this renderer does not claim to implement.
- [Remotion: scene transitions](https://www.remotion.dev/docs/transitions/)
- [Gemini: video input and custom temporal sampling](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)

The separately generated prototype prop and its exact prompt/tool provenance are stored in `assets/motion/temple/`.

## Audited replacement

The current replacement is `artifacts/temple-edit-audit/brihadisvara-directed-edit-1080x1920.mp4`, a 70.07-second portrait MP4 with audio. Its render response is in `final-render.json`; `after-contact.png` contains frames extracted from that final encode. Per-sequence video review is recorded in `candidate-review.json`. The final sampled retention review, when complete, is recorded in `final-review.json`; these reports describe different checks and must not be confused with an exhaustive quality guarantee.

The completed final review remains **blocked**. It identifies the grammatically unfinished phrase at 36.49 seconds as clipping, although the caption is spatially intact and the next phrase at 39.03 seconds completes it. `final-caption-continuation.png` preserves those actual encoded caption regions. The initial Hindi glyph-shaping defect was real and corrected; the remaining sentence-continuation warning has not been suppressed or converted into an approval. `assessment.json` records this limit and the delivery checksum. No video was uploaded. This is a concrete improvement in supported editorial sequences, not evidence that the whole automatic pipeline has achieved reliable professional editing quality.
