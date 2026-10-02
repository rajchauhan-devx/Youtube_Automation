# One extraction format for every profile

Shorts, Long Video, and Mixed Media use the same scene-plan JSON format. Every script generation request adds this output requirement while retaining the original custom prompt, topic, research rules, story and production instructions. The built-in Shorts template and scene editors also use this format.

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

Use one complete block and valid JSON. Every scene has a unique ID and spoken narration. Include negative instructions, style and continuity inside the relevant prompt string. The thumbnail stays outside the scenes. Include CTA and end-card scenes only when used in playback. Supporting research, evidence and publishing information can remain as ordinary prose outside the block.

The format is shared; profile behavior remains specific. Shorts compose for 9:16, Mixed Media for 16:9, and Long Video uses 16:9 image scenes only. Every video scene has a still alternative for image-only operation.

## Existing responses

Click **Preview → Extract Assets** again after restarting the updated app. There is no need to regenerate a supported complete response.

Extraction converts these older formats to the shared scene plan:

- Complete `<shorts>` scene packages.
- Human-readable production timelines with explicitly linked `<long_video>` asset blocks.
- Numbered image/video master-prompt packages, such as Against the Odds, with a clean `<script>`, numbered scene `Text` fields, and a Coverage and Asset Manifest. Video assets need an explicit reference-image link.

Conversion preserves the spoken wording and supporting prose. It changes extraction markup and adds the shared JSON representation. It excludes thumbnails and unused follow/end cards from the scene list. Already compliant JSON responses remain unchanged.

If a response lacks scene-to-asset links, contains conflicting narration, or is truncated, extraction reports the specific problem instead of guessing or rewriting content. Correct the format and links using the same story text, or regenerate using the shared output instructions. No extraction LLM key is required.
