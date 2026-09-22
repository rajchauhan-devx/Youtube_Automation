# Mixed Media long videos

Choose **Mixed Media** in the sidebar. This profile stores its scripts and media separately from Shorts and Long Video for each account.

1. Create a script; the mixed-media template is prefilled.
2. Generate the script, review it in Preview, then Extract Assets.
3. Assets shows an Image or Video tag in scene order. Edit a scene to change its type, prompt or narration.
4. In Generation → Images & Videos, **Generate images** generates missing image scenes sequentially with the local image model. Completed/imported images are skipped and video scenes are never sent to the image model. Each image card also has **Generate image** or **Regenerate image**. Select Fast, Standard or High quality; **Stop after current image** saves the current result and stops the queue. Leaving the page stops the queue after the current image, which is saved on the server. Click the **+** on any card to import a PNG/JPG/WebP image or MP4 video. **Bulk import** matches scene numbers: `001.png`, `002.mp4`, etc. Imports are available when generation is idle; files are copied into project storage, with a 250 MB limit per file.
5. Generate synchronized narration under Audio Generation, then review the timeline and render.

Every video scene is exactly **10 seconds**. Imports accept up to 0.05 seconds of container rounding; the render normalizes that rounding to 10 seconds. Narration shorter than 10 seconds is padded with silence. Longer narration reports the scene ID and asks you to shorten it; speech is never cut or sped up automatically. Image durations follow their measured narration. Scene cuts preserve the fixed video duration, and source clip audio is muted. The final output is landscape 1920 × 1080.

Scene plans use the existing `<long_video>` JSON format, with `mediaType: "image"` or `"video"` on every scene and `duration: 10` on video scenes. `imagePrompt` stores the visual prompt for either kind. The thumbnail stays separate from timeline scenes. Google Flow browser automation is a future integration; video scenes use manual imports.

Validation: `npm test`, `npm run build:all`, and `node server/tests/mixed-media.browser.mjs` (after building).
