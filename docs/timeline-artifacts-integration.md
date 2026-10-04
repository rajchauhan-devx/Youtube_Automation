# Timeline edits with saved Artifacts graphics

Legacy **Start Video Generation** automatically includes the current enabled
motion graphics and motion captions from the script's saved Artifacts project.
The final MP4 is offered by the existing render status, download and YouTube
Export interfaces.

## Rendering behavior

The legacy renderer first produces the edited footage, transitions, presenter
and audio mix. A separate Remotion composition renders saved graphics with an
alpha channel. FFmpeg then overlays that layer on the finished footage and
copies the audio stream without another audio encode.

Footage grading, vignette, sharpening, grain, transitions and bookend fades do
not alter the graphic layer. Titles, badges, lower thirds and captions retain
their authored screen positions, timestamps, colors and entrance/exit animations.
The saved Artifacts project is never rewritten by rendering.

Object spotlight source anchors follow the actual footage camera. The shared
legacy-camera.ts module supplies FFmpeg's zoom/pan filter and the overlay's
source-to-screen transform. It supports both contain and cover framing.
Rendering rejects an edit that moves a spotlight to another scene, hides its
target or puts its callout over the target. Update its timing/position in
Artifacts or adjust the footage settings before retrying.

When saved motion captions are enabled, legacy subtitles are suppressed in
this render to prevent duplicate captions. Hiding the Artifacts captions lets
the selected legacy subtitle settings apply again.

## Identity and persistence

The render uses one immutable, workspace-scoped Artifacts revision. Validation
checks script ownership, narration identity, scene media hashes/order, output
format and readiness. Replaced/reordered media, changed narration or a changed
format requires matching graphics. An unavailable or failed graphics render
fails the combined render instead of silently exporting footage alone.

The normal render revision includes the saved graphics revision and content.
Changing or hiding graphics invalidates older combined exports. Changes during
rendering prevent publication. Cancellation removes intermediate overlay files.
Scripts without enabled graphics retain the legacy rendering path.

The interactive legacy timeline preview shows the footage. Artifacts previews
show the saved graphics composition. The completed MP4 preview shows the actual
combined output used for download and YouTube Export.

## Verification

After building, run node --test server/tests/render-graphics.test.mjs.
This uses isolated data and real FFmpeg/Remotion exports to verify graphic
colors over differently graded footage, transparency, audio stream preservation,
saved-project immutability, zoom/pan spotlight geometry and exported placement,
motion captions, cancellation, stale input rejection, workspace isolation,
the normal render API and revision-based invalidation of downloads.
