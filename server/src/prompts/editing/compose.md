Translate the creative brief into a graph of the supplied renderer primitives. Return one complete artifact. Use only resolved asset IDs, approved fonts and source narrative token IDs. Every word and number in text labels must occur in the cited narration: use short supplied excerpts, not new factual wording or inferred image labels. Bounds and transforms are output design pixels; source-image node coordinates are original source pixels. Keyframe frames are LOCAL to the artifact. Preserve supplied artifact ID and scene ID, stay inside the scene interval and minimum reading duration. The compiler derives final cue frames from narrativeRefs and rescales local animation to that interval; choose the specific triggering token IDs, including the correct repeated occurrence. For approximate timing use a scene-wide non-pointing composition; avoid precision cues. Source and object pointers require verified grounding evidence, not vision estimates. Connectors use identity transform and screen space. Children of groups use parent space. Clip space must match node space. Use the Devanagari font for Hindi or mixed Hindi-English text. Shapes use validated colors only. Do not put factual text into images. Create a novel arrangement appropriate to this intent without a template ID.

CRITICAL: YOU MUST CREATE RICH MOTION GRAPHICS — NOT CAPTIONS OR SUBTITLES. Every artifact MUST contain multiple layered visual elements with animation.

REQUIRED COMPOSITION STRUCTURE:
Every artifact MUST have at minimum:
1. A ROOT GROUP node (kind: "group") as the container, with child nodes using space: "parent"
2. A BACKGROUND SHAPE (kind: "shape") — a rectangle or rounded rect serving as the card container:
   - geometry: { kind: "rect", bounds: { x, y, width, height }, radius: 12..16 }
   - paint: { fill: semi-transparent dark color like "#111827EE" or style surface color, stroke: accent color, strokeWidth: 2, dash: [] }
3. A HEADLINE TEXT (kind: "text") — bold, prominent text with the key fact or number:
   - fontSize: 32..44, fontWeight: "700", color: "#F59E0B" or "#38BDF8"
   - Must cite actual narration words
4. A BODY TEXT (kind: "text") — smaller supporting text:
   - fontSize: 20..26, fontWeight: "400", color: "#F8FAFC"
   - Must cite actual narration words
5. ANIMATION TRACKS on at least the root group:
   - opacity track: keyframes [{frame:0, value:0, easing:{kind:"bezier",x1:0,y1:0,x2:0.5,y1:1}}, {frame:15, value:1, easing:{kind:"linear"}}, {frame:END-15, value:1}, {frame:END, value:0}]
   - Optional: y or x position track for slide-in effect

VISUAL ELEMENTS TO CHOOSE FROM (pick 2-4 per artifact):
- STAT CALLOUT: Bold card with a large number (e.g., "80 tons", "66m", "1200 years") and a small label beneath
- FEATURE CARD: Floating panel with category tag (e.g., "ARCHITECTURE", "HISTORY") and insight text
- DIAGRAM PANEL: Vector panel with shapes showing geometry or mechanics
- BADGE: Compact rounded rectangle in a corner with key entity name
- HIGHLIGHT BOX: Rectangular shape highlighting a specific concept
- ICON CARD: Shape + text combination representing a concept

POSITIONING RULES:
- NEVER place artifacts in the bottom 25% of the frame (y > height * 0.75) — that zone is for speech captions
- Use upper-left, upper-right, mid-left, mid-right, or center positions
- Keep cards away from edges: minimum 32px margin from frame edges
- Cards should be 280..580px wide and 120..280px tall for 1920x1080, scale proportionally for other sizes

ANIMATION REQUIREMENTS:
- Every node with tracks MUST have an opacity track with entry fade (0→1 over 15 frames) and exit fade (1→0 over last 15 frames)
- Add motion: translate a card from y-30 to y=0 over 20 frames for a "drop in" effect
- Use bezier easing for smooth natural motion: { kind: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y1: 1.0 }
- Stagger children: headline appears 5 frames before body text for a typing effect

EXAMPLE CORRECT OUTPUT STRUCTURE:
{
  "id": "scene-0-artifact",
  "sceneId": "scene-0",
  "enabled": true,
  "intent": "Highlight the 80-ton weight of the bronze statue",
  "narrativeRefs": ["token-1", "token-2"],
  "startFrame": 0,
  "endFrame": 72,
  "priority": 5,
  "nodes": [
    {
      "id": "card-group",
      "parentId": null,
      "space": "screen",
      "zIndex": 10,
      "transform": { "x": 0, "y": -20, "scaleX": 1, "scaleY": 1, "rotation": 0, "pivot": { "x": 0, "y": 0 } },
      "opacity": 1,
      "tracks": [
        { "property": "opacity", "keyframes": [
          { "frame": 0, "value": 0, "easing": { "kind": "linear" } },
          { "frame": 15, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 57, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 72, "value": 0, "easing": { "kind": "linear" } }
        ]},
        { "property": "y", "keyframes": [
          { "frame": 0, "value": -50, "easing": { "kind": "bezier", "x1": 0.25, "y1": 0.1, "x2": 0.25, "y2": 1 } },
          { "frame": 20, "value": 0, "easing": { "kind": "linear" } }
        ]}
      ],
      "kind": "group"
    },
    {
      "id": "card-bg",
      "parentId": "card-group",
      "space": "parent",
      "zIndex": 1,
      "transform": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "pivot": { "x": 0, "y": 0 } },
      "opacity": 1,
      "tracks": [],
      "kind": "shape",
      "geometry": { "kind": "rect", "bounds": { "x": 60, "y": 60, "width": 400, "height": 160 }, "radius": 14 },
      "paint": { "fill": "#111827EE", "stroke": "#F59E0B", "strokeWidth": 2, "dash": [] }
    },
    {
      "id": "headline",
      "parentId": "card-group",
      "space": "parent",
      "zIndex": 5,
      "transform": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "pivot": { "x": 0, "y": 0 } },
      "opacity": 1,
      "tracks": [
        { "property": "opacity", "keyframes": [
          { "frame": 5, "value": 0, "easing": { "kind": "linear" } },
          { "frame": 20, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 57, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 72, "value": 0, "easing": { "kind": "linear" } }
        ]}
      ],
      "kind": "text",
      "text": "80 tons",
      "style": { "fontAssetId": "FONT_ID", "fontSize": 40, "fontWeight": "700", "color": "#F59E0B", "align": "center", "lineHeight": 1.2 },
      "bounds": { "x": 80, "y": 75, "width": 360, "height": 60 }
    },
    {
      "id": "body",
      "parentId": "card-group",
      "space": "parent",
      "zIndex": 5,
      "transform": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "pivot": { "x": 0, "y": 0 } },
      "opacity": 1,
      "tracks": [
        { "property": "opacity", "keyframes": [
          { "frame": 10, "value": 0, "easing": { "kind": "linear" } },
          { "frame": 25, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 57, "value": 1, "easing": { "kind": "linear" } },
          { "frame": 72, "value": 0, "easing": { "kind": "linear" } }
        ]}
      ],
      "kind": "text",
      "text": "of bronze",
      "style": { "fontAssetId": "FONT_ID", "fontSize": 22, "fontWeight": "400", "color": "#F8FAFC", "align": "center", "lineHeight": 1.3 },
      "bounds": { "x": 80, "y": 140, "width": 360, "height": 50 }
    }
  ],
  "assetRequestIds": []
}

WHAT NOT TO DO:
- DO NOT create a single text node with the narration as a subtitle bar
- DO NOT create only a group with one text child — you need shapes AND text
- DO NOT skip animation tracks — every artifact must animate in and out
- DO NOT place text at the bottom of the frame (y > height * 0.75)
- DO NOT use text that is not from the cited narration tokens
- DO NOT create empty groups with no visual children
