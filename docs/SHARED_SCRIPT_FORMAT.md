# One extraction format for every profile

Shorts, Long Video, and Mixed Media store extracted assets in the same scene-plan JSON format. Generation retains the exact selected template and adds a shared serialization contract plus the selected episode duration. Conflicting legacy extraction wrappers and default durations yield to these app settings; story, language, visual style, research and editorial requirements remain in force.

Gemini generation uses structured JSON directly. Its optional `supportingNotes` field retains requested research, canon, overlays, reflection, music, editing and publishing sections. An optional `thumbnailMotionPrompt` stores separately requested thumbnail animation without adding a playback scene. Wrapped `<long_video>` JSON and explicitly linked legacy packages remain supported for extraction. Long episodes are generated in bounded parts, validated and joined into one ordered plan; their narration budgets use an approximate 210 words/minute. Bounded repairs preserve scene IDs and valid assets while correcting deficient narration or visual prompts. Measured narration determines playback timing, with a visible warning when it differs from the selected runtime by more than 15%. Long profiles support imported video scenes as well as images.

The shared container is named `<long_video>` for compatibility with existing saved scene plans, including Shorts:

```text
<long_video>
{
  "version": 1,
  "title": "Finished episode title",
  "thumbnailPrompt": "Separate complete thumbnail prompt",
  "scenes": [
    {
      "id": "scene_001",
      "chapter": "Hook",
      "role": "story",
      "narration": "The exact words spoken in this scene.",
      "mediaType": "image",
      "duration": 5,
      "imagePrompt": "The complete still-image generation prompt."
    },
    {
      "id": "scene_002",
      "chapter": "Development",
      "role": "story",
      "narration": "The exact next words spoken.",
      "mediaType": "video",
      "duration": 6,
      "imagePrompt": "The matching complete still-image alternative.",
      "videoPrompt": "The complete continuous-shot video prompt."
    }
  ]
}
</long_video>
```

Use one complete block and valid JSON, or one bare JSON object for native structured generation. Every scene has a unique ID and spoken narration. Include negative instructions, style and continuity inside the relevant prompt string. The thumbnail stays outside the scenes. Include CTA and end-card scenes only when used in playback. Native generation stores supporting research, evidence and publishing information in `supportingNotes`; legacy wrapped responses may retain this information as prose outside the block.

The format is shared; profile behavior remains specific. Shorts compose for 9:16, while Mixed Media and Long Video compose for 16:9. Every video scene has a still alternative that can be used by changing its media type in Assets. Generation follows each scene's selected type.

## Existing responses

Click **Preview → Extract Assets** again after restarting the updated app. There is no need to regenerate a supported complete response.

Extraction converts these older formats to the shared scene plan:

- Complete `<shorts>` scene packages.
- Human-readable production timelines with explicitly linked `<long_video>` asset blocks.
- Numbered image/video master-prompt packages, such as Against the Odds, with a clean `<script>`, numbered scene `Text` fields, and a Coverage and Asset Manifest. Video assets need an explicit reference-image link.

Manifests can be plain text or Markdown tables. A scene may span several rows when each row explicitly links its numbered narration lines to one asset. Images may be reused for different lines or crops. Every spoken line must appear exactly once and in order. Independent text-to-video prompts keep their declared source-clip duration; the speech timing determines the final edit length. Spoken follow frames become CTA scenes. A trailing silent end-card hold remains in the original response as an editorial asset and is excluded from the narration-linked scene plan. If no `Title:` field is present, extraction uses the first numbered publishing title option.

Conversion preserves the spoken wording and supporting prose and stores the shared scene plan separately from the original AI response. Preview retains the response exactly as generated or imported. The extraction API also returns an optional normalized representation for clients that need it. Extraction excludes thumbnails and unused follow/end cards from the scene list. Already compliant JSON responses remain unchanged.

If a response lacks scene-to-asset links, contains conflicting narration, or is truncated, extraction reports the specific problem instead of guessing or rewriting content. Correct the format and links using the same story text, or regenerate using the shared output instructions. No extraction LLM key is required.
