# Automatic editing

In **Long Video** or **Mixed Media → Timeline & Render**, choose **Clean Studio**, **Cinematic Story**, or **Documentary**. Applying a preset enables automatic editing and saves its settings to the script. Existing projects keep manual editing until a preset is applied or the automatic editing switch is enabled.

Clean Studio uses natural color, gentle motion and restrained transitions. Cinematic Story adds warm color, a subtle vignette, longer dissolves and warm caption accents. Documentary favors cuts and readable boxed captions. All presets preserve source video movement and existing narration timing.

Customize motion strength, transitions, transition length, fitting/cropping, color, caption style and phrase size, render quality, opening/closing fades, voice processing, music ducking, chapter sound accents, fine grain, sharpening and cinema bars. Grain, sharpening, bars and sound accents are off by default. The scene plan allows individual image-motion and incoming-transition overrides. Chapter and block names remain editing metadata and are never shown over the video.

## Timing and previews

Every mixed-media video slot remains 10 seconds. Dissolves blend the previous scene's clean final frame into the start of the next scene; they do not overlap timeline segments or shift narration. Chapter dips and opening/closing fades occur inside existing scene lengths. Clean intermediate frames exclude captions so text does not carry into the next scene.

Timeline playback shows source footage and narration. Render the video to inspect the finished color, motion, typography, transitions and audio. Caption phrases use estimated timing inside each measured narration scene; word-level alignment is not available.

## Audio and rendering

Voice polish applies gentle high/low-pass filtering, compression, a -16 LUFS normalization target and a peak limiter. Music ducking responds to the voice signal and recovers during pauses. Music fades at the beginning/end. Optional chapter accents are quiet synthesized tones. Imported video audio remains muted.

Rendering processes one scene at a time. Polished scenes use two encoding passes so clean source frames can be blended before captions. High quality produces larger files and takes longer than the existing basic render. Final audio/video duration is checked before publishing the local MP4. Changes to saved automatic settings invalidate prior render revisions.

Tests: `npm test`; `npm run build:all`; `node server/tests/mixed-media.browser.mjs` after building.
