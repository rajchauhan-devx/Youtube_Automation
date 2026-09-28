# Shorts images and videos

The Shorts script list includes **Shorts · Images & Videos**. Enter a topic and target duration, run the script, then extract assets. You can also select **Use image & video Shorts template** when creating a script.

The template produces narration and scene prompts for portrait 9:16 output. Video scenes include a separate still-image alternative. In Assets you can edit the narration, media type, image prompt and video prompt.

The full [production master](shorts-production-template.md) covers Hindi storytelling, source accuracy, duration budgeting, character/location continuity, detailed portrait image and video direction, thumbnails and final quality checks. The AI returns a `<shorts>` package with one `<audio_prompt><script>…</script></audio_prompt>`, a separate `<thumbnail_prompt>`, and ordered `<scene>` blocks. Each scene contains its exact `<narration>` and an `<image_prompt>`; video scenes also contain a `<video_prompt>`. Extraction validates the tags and audio-to-scene word match without asking another model to infer asset links. The original JSON scene format remains supported.

The original built-in brief template upgrades automatically when the script list loads. Customized templates are preserved. `node server/scripts/upgrade-shorts-template.mjs` upgrades existing original templates immediately and backs up their script records.

The production template defaults to the app's configured Gemini Flash option. Its full instructions exceed the current local Ollama input limit; use the existing Gemini connection or another configured provider with sufficient input capacity.

In **Generation → Images & Videos**:

- Enable **Use video imports** to generate/import still scenes and import MP4 video scenes.
- Disable it to use images for every scene. Existing video imports remain saved, and turning it on again restores those clips. Generate or import missing still-image alternatives after changing modes.
- Use the **+** on a scene to import one file, or **Bulk import** with filenames such as `001.png`, `002.mp4`, and `003.webp`. Images support PNG, JPG and WebP; videos support MP4. The limit is 250 MB per file.
- **Generate images** fills missing image scenes. Video prompts are never sent to the image model while video imports are enabled.

Generate narration in Audio Generation, then open Timeline & Render. Scene boundaries follow measured speech, source clip audio is muted, and output is portrait 1080 × 1920. Video clips may be trimmed, slowed slightly, or held briefly on their final frame; a clip that cannot cover its narration requires longer footage.

Existing image-only Shorts scripts also support image import. Use the new template to produce narration-linked video scenes. Video generation itself remains external: copy each video prompt, create the clip in your video tool, and import its MP4.

Validation: `npm test`, `npm run typecheck`, `npm run build`. After building, run the browser regression in PowerShell with `$env:SHORTS_MEDIA_BROWSER='1'; node --test server/tests/shorts-media.test.mjs`.
