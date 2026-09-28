import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenePlan } from '../dist/services/scene-plan.js';
import { serializeShortsPackage } from '../dist/services/shorts-package.js';
import { incompleteResponse } from '../dist/services/generation-status.js';
import { mediaScenes, SHORTS_MEDIA_TEMPLATE } from '../dist/services/shorts-media.js';

const plan = { version: 1, title: 'वन की यात्रा', thumbnailPrompt: 'Portrait forest cover, no text', scenes: [
  { id: 'scene_001', chapter: 'Hook', role: 'story', mediaType: 'video', duration: 5, narration: 'वन में एक नई यात्रा शुरू हुई।', imagePrompt: 'Portrait still of a traveler & forest', videoPrompt: 'Five-second portrait shot of the traveler walking into the forest' },
  { id: 'scene_002', chapter: 'Payoff', role: 'story', mediaType: 'image', duration: 5, narration: 'उनके सामने एक शांत नदी थी।', imagePrompt: 'Portrait still of the same traveler beside a river' },
] };
const tagged = serializeShortsPackage(plan);

test('tagged Shorts preserve Hindi speech, separate video/image prompts and exclude the thumbnail', () => {
  const parsed = parseScenePlan(tagged);
  assert.deepEqual(parsed, plan);
  assert.deepEqual(mediaScenes({ section: 'shorts', videoImportsEnabled: false, scenePlan: parsed }).map(s => s.imagePrompt), plan.scenes.map(s => s.imagePrompt));
  assert.equal(mediaScenes({ section: 'shorts', videoImportsEnabled: true, scenePlan: parsed })[0].imagePrompt, plan.scenes[0].videoPrompt);
  assert.equal(incompleteResponse(SHORTS_MEDIA_TEMPLATE, tagged), undefined);
});

test('tagged Shorts reject missing, duplicate, mismatched and unlinked assets instead of guessing', () => {
  const cases = [
    tagged.replace('</shorts>', ''),
    tagged.replace('</video_prompt>', ''),
    tagged.replace(/<video_prompt>[\s\S]*?<\/video_prompt>/, ''),
    tagged.replace('<image_prompt>', '<image_prompt>extra</image_prompt><image_prompt>'),
    tagged.replace('<script>', '<script>Extra spoken words. '),
    tagged.replace('id="scene_002"', 'id="scene_001"'),
    tagged.replace('media_type="video"', 'media_type="image"'),
    tagged.replace('duration="5"', 'duration="0"'),
    tagged.replace('</shorts>', '<video_prompt>Orphan asset</video_prompt></shorts>'),
    tagged.replace('<title>', '<title id="wrong">'),
  ];
  for (const raw of cases) assert.throws(() => parseScenePlan(raw));
  assert.throws(() => parseScenePlan(cases[4], true), /differs/, 'timeline recovery must not silently change tagged audio');
});

test('stream completeness detects interrupted video and audio blocks', () => {
  assert.match(incompleteResponse(SHORTS_MEDIA_TEMPLATE, '<shorts><scene><video_prompt>unfinished'), /Unfinished/);
  assert.match(incompleteResponse(SHORTS_MEDIA_TEMPLATE, '<audio_prompt><script>spoken</script>'), /audio_prompt/);
  assert.match(incompleteResponse(SHORTS_MEDIA_TEMPLATE, '<video_prompt>unfinished'), /video_prompt/);
});

test('the full production template requests all supported tags and substantial production direction', () => {
  assert.ok(SHORTS_MEDIA_TEMPLATE.length > 12000);
  for (const tag of ['shorts', 'audio_prompt', 'script', 'image_prompt', 'video_prompt', 'thumbnail_prompt']) assert.ok(SHORTS_MEDIA_TEMPLATE.includes(`<${tag}>`));
  for (const instruction of ['Character, location', 'Duration and scene budgeting', 'still-image alternative', 'Final silent production check']) assert.ok(SHORTS_MEDIA_TEMPLATE.includes(instruction));
});
