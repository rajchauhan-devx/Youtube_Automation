import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenePlan } from '../dist/services/scene-plan.js';
import { parseV72ScenePackage } from '../dist/services/v72-scene-package.js';

// Split-architecture master-prompt shape (v7.2 style): SECTION 1 scenes with
// "<emoji> SCENE N — Title" headings plus numbered <image_prompt> blocks.
const fixture = `## PART 3 SCRIPT PROMPT
### SECTION 1 — SCRIPT
\u{1F3AC} SCENE 1 — THE ARCHITECT
Duration: 10s
Emotion: Awe
Visual: An architect at sunrise.
Line 1: Why does the door face east?
Tone: Whisper
Pause: (break)
On-Screen Text: Sun and energy

\u{1F3AC} SCENE 2 — THE ALIGNMENT
Duration: 15s
Emotion: Reverence
Visual: Sun rays pierce the entrance.
Line 2: It is not stone. It is an instrument.
Tone: Divine
Pause: (break)
On-Screen Text: Life breath

### SECTION 2B — VOICED SCRIPT
<script>
Why does the door face east? (break) It is not stone. It is an instrument.
</script>

## PART 4 PRODUCTION PROMPT
### SECTION 3 — IMAGE PROMPTS
<image_prompt>
#image 0
\u{1F5BC} IMAGE 0 — THUMBNAIL
A dramatic close-up of a golden temple entrance at dawn, warm glow.
</image_prompt>

<image_prompt>
#image 1
\u{1F5BC} IMAGE 1 — THE ARCHITECT
Ancient Indian architect, 50 years old, fair complexion, sunrise.
</image_prompt>

<image_prompt>
#image 2
\u{1F5BC} IMAGE 2 — THE ALIGNMENT
Interior of a stone temple sanctum, single beam of sunlight.
</image_prompt>

<image_prompt>
#image 3
\u{1F5BC} IMAGE 3 — FOLLOW FRAME
A devotee silhouette with folded hands, temple glow behind.
</image_prompt>

<image_prompt>
#image 4
\u{1F5BC} IMAGE 4 — END CARD
An empty stone temple corridor at dawn, calm and quiet.
</image_prompt>

### SECTION 4 — HINDI TEXT OVERLAYS
Overlay words for the editor.
### SECTION 5 — REFLECTION ENGINE
A question for the comments.`;

test('v7.2 split format extracts scenes, still prompts and thumbnail', () => {
  const plan = parseScenePlan(fixture);
  assert.equal(plan.scenes.length, 2);
  assert.deepEqual(plan.scenes.map(s => s.id), ['scene_001', 'scene_002']);
  assert.deepEqual(plan.scenes.map(s => s.mediaType), ['image', 'image']);
  assert.deepEqual(plan.scenes.map(s => s.duration), [10, 15]);
  assert.equal(plan.scenes[0].narration, 'Why does the door face east?');
  assert.equal(plan.scenes[1].narration, 'It is not stone. It is an instrument.');
  assert.match(plan.scenes[0].imagePrompt, /Ancient Indian architect/);
  assert.ok(!/IMAGE 1|THUMBNAIL/i.test(plan.scenes[0].imagePrompt), 'caption labels stay out of prompts');
  assert.match(plan.thumbnailPrompt, /golden temple entrance/);
  assert.match(plan.supportingNotes || '', /question for the comments/);
});

test('v7.2 parser also accepts labeled Prompt fields', () => {
  const labeled = fixture.replace('Ancient Indian architect, 50 years old, fair complexion, sunrise.',
    'Prompt:\nAncient Indian architect at sunrise.\n\nNegative Prompt:\nNo modern objects.');
  const plan = parseV72ScenePackage(labeled);
  assert.match(plan.scenes[0].imagePrompt, /Ancient Indian architect at sunrise/);
  assert.match(plan.scenes[0].imagePrompt, /Negative Prompt:\nNo modern objects/);
});

test('v7.2 parser rejects broken contracts with actionable errors', () => {
  assert.throws(() => parseV72ScenePackage('no tags here'), /<script>/);
  assert.throws(() => parseV72ScenePackage(fixture.replace(/<image_prompt>\n#image 1\n[^]*?(?=<image_prompt>)/, '')),
    /Scene 2 has no linked image/);
  assert.throws(() => parseV72ScenePackage(fixture.replace('A dramatic close-up of a golden temple entrance at dawn, warm glow.', '')),
    /Missing generation prompt for #image 0/);
  const twoThumbs = fixture.replace('IMAGE 1 — THE ARCHITECT', 'IMAGE 1 — THUMBNAIL EXTRA');
  assert.match(parseV72ScenePackage(twoThumbs).thumbnailPrompt, /golden temple entrance/,
    'duplicate THUMBNAIL flags resolve to the lowest-numbered block instead of failing');
  // Unlabeled #image 0 with surplus images keeps the thumbnail convention.
  const bareZero = fixture.replace(/\u{1F5BC} IMAGE 0 — THUMBNAIL\n/, '');
  assert.match(parseV72ScenePackage(bareZero).thumbnailPrompt, /golden temple entrance/);
  // No thumbnail anywhere: extraction still succeeds, first scene image doubles.
  const noThumb = fixture.replace(/<image_prompt>\n#image 0\n[^]*?<\/image_prompt>\n/, '');
  const noThumbPlan = parseV72ScenePackage(noThumb);
  assert.equal(noThumbPlan.scenes.length, 2, 'missing thumbnail never blocks scene extraction');
  assert.equal(noThumbPlan.thumbnailPrompt, noThumbPlan.scenes[0].imagePrompt);
});

// Compact sibling dialect (same contract, same-line "#image N — LABEL"
// addressing with labeled Prompt: fields, EPISODE title, later sections
// after the last scene): one parser, no per-profile inconsistency.
const sibling = `## EPISODE: THE MAN WHO SURVIVED
### SECTION 1 — SCRIPT
\u{1F3AC} SCENE 1 — THE CAPSIZE
Duration: 10s
Emotion: Terror
Visual: Water rushing in.
LINE 1: The ship flipped in the dark.
\u{1F3AC} SCENE 2 — THE RESCUE
Duration: 20s
Emotion: Relief
Visual: A diver's gloved hand.
LINE 2: The diver touched his hand. He was alive.

#### SECTION 2 — TIMESTAMPS
[0:00 - 0:10] The ship flipped in the dark.
### SECTION 2B — VOICED
<script>
The ship flipped in the dark. The diver touched his hand. He was alive.
</script>
### SECTION 3 — IMAGE PROMPTS
<image_prompt>
#image 0 — THUMBNAIL
Prompt: A hand reaching from dark water toward torch light.
</image_prompt>
<image_prompt>
#image 1 — SCENE 1
Prompt: A violent wide shot of a ship hallway at night.
</image_prompt>
<image_prompt>
#image 2 — SCENE 2
Prompt: A diver's gloved hand grabbing a survivor's hand.
</image_prompt>
### SECTION 4 — ENGLISH TEXT OVERLAYS
Overlay words.
### SECTION 5 — REFLECTION ENGINE
A question.`;

test('sibling dialect extracts through the same parser', () => {
  const plan = parseScenePlan(sibling);
  assert.equal(plan.title, 'THE MAN WHO SURVIVED');
  assert.deepEqual(plan.scenes.map(s => s.id), ['scene_001', 'scene_002']);
  assert.deepEqual(plan.scenes.map(s => s.duration), [10, 20]);
  assert.equal(plan.scenes[1].narration, 'The diver touched his hand. He was alive.');
  assert.match(plan.scenes[0].imagePrompt, /ship hallway/);
  assert.match(plan.thumbnailPrompt, /torch light/);
  assert.ok(!/SECTION|TIMESTAMPS/i.test(plan.scenes[1].narration), 'later sections stay out of speech');
});
