import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPrompt, generationIssue, generationResponseSchema, narrationWordBudget, supportingSections, requiredVideoCount } from '../dist/services/script-generation.js';
import { serializeScenePlan } from '../dist/services/scene-plan-format.js';
import { incompleteResponse } from '../dist/services/generation-status.js';

const plan = (words = 210, duration = 60) => ({version:1,title:'Survival',thumbnailPrompt:'Ship on the sea',scenes:[0,1,2].map(i => ({id:`scene_00${i+1}`,chapter:'Journey',role:'story',mediaType:'image',duration:duration/3,narration:Array.from({length:Math.floor(words/3)},()=> 'Survival').join(' '),imagePrompt:'A ship on a stormy ocean'}))});

test('every profile receives the original template, selected duration and one extraction contract', () => {
  for (const profile of ['shorts','long','mixed']) {
    const prompt = buildGenerationPrompt('Original template: default 45 seconds.', 'Ocean survival', 'Use Hindi', 900, profile);
    assert.ok(prompt.startsWith('Original template: default 45 seconds.'));
    assert.ok(prompt.includes('Target Duration: ~900 seconds.'));
    assert.ok(prompt.includes('Additional Instructions: Use Hindi'));
    assert.equal((prompt.match(/Shared extraction format V1/g)||[]).length,1);
    assert.deepEqual(narrationWordBudget(900), {minimum:2835,maximum:3465});
  }
});

test('thumbnail motion is separate from playback and authored default video counts apply',()=>{
  const template='## SECTION 3B — MOTION (3 SCENES ONLY)\nGemini motion prompts provided for EXACTLY 3 images: Thumbnail + 2 scene images';
  assert.equal(requiredVideoCount(template),2);
  assert.equal(requiredVideoCount('## SECTION 3B — VIDEO PROMPTS\nDefault clip budget: 8.'),8);
  assert.equal(requiredVideoCount('## SECTION 3B — VIDEO STATUS (IMAGE-ONLY)\nDefault clip budget: 8.'),0);
  const p=plan();p.scenes.slice(0,2).forEach(s=>{s.mediaType='video';s.videoPrompt=Array(80).fill('motion').join(' ');});
  const prompt=buildGenerationPrompt(template,'Ocean','',60,'shorts');
  assert.match(generationIssue(prompt,JSON.stringify(p),60),/thumbnailMotionPrompt/);
  p.thumbnailMotionPrompt=Array(80).fill('motion').join(' ');
  assert.equal(generationIssue(prompt,JSON.stringify(p),60),undefined);assert.equal(p.scenes.length,3);
});

test('a provider STOP is not sufficient for an invalid or short episode', () => {
  const prompt=buildGenerationPrompt('Story', 'Ocean', '', 60, 'long');
  assert.equal(generationIssue(prompt,serializeScenePlan(plan()),60),undefined);
  assert.match(generationIssue(prompt,serializeScenePlan(plan(60)),60),/Narration has/);
  assert.match(generationIssue(prompt,serializeScenePlan(plan(210,20)),60),/Scene planning/);
  assert.match(generationIssue(prompt,'<long_video>{invalid}</long_video>',60),/invalid JSON/);
  assert.match(generationIssue(prompt,'<long_video>{',60),/Unfinished/);
  const video=plan(); video.scenes[0].mediaType='video';video.scenes[0].videoPrompt='Bare video directions';
  assert.match(generationIssue(prompt,serializeScenePlan(video),60),/80 words/);
});

test('legacy completion recognizes emoji section headings and suffixed sections', () => {
  const prompt='## 🎬 SECTION 1: Story\n## SECTION 2B: Manifest\n## SECTION 3B: Publishing';
  assert.match(incompleteResponse(prompt,'## SECTION 1: Story\n## SECTION 2B: Manifest'),/3B/);
  assert.equal(incompleteResponse(prompt,prompt),undefined);
});

test('short chapter narration gets a visual allocation and actionable overflow repair without losing the video quota', () => {
  const template='## SECTION 3B — VIDEO PROMPTS\nDefault clip budget: 3.';
  const prompt=buildGenerationPrompt(template,'Ocean','',120,'shorts');
  assert.match(prompt,/Short-episode allocation: prefer 12/);
  assert.match(prompt,/exactly 3 video scenes/);
  assert.match(generationResponseSchema(120,template).properties.scenes.description,/Prefer 12/);
  const p=plan(420,120);p.scenes[0].narration='voice '.repeat(129).trim();
  assert.match(generationIssue(prompt,JSON.stringify(p),120),/Scene scene_001: narration has 773 characters/);
  assert.match(generationIssue(prompt,JSON.stringify(p),120),/Split this chapter.*required video quota/);
});

test('schema conversion retains requested editorial sections and image-only constraints', () => {
  const template='## 🎬 SECTION 3B — VIDEO STATUS (IMAGE-ONLY)\n## 🇬🇧 SECTION 4 — ENGLISH TEXT OVERLAYS\n## SECTION 5 — THE REFLECTION ENGINE';
  const prompt=buildGenerationPrompt(template,'Ocean','',60,'long');
  assert.deepEqual(supportingSections(template).map(section=>section.id),['4','5']);
  assert.match(generationIssue(prompt,serializeScenePlan(plan()),60),/supporting sections: 4, 5/);
  assert.equal(generationIssue(prompt,serializeScenePlan(plan())+'\n'+template,60),undefined);
  const video=plan(); video.scenes[0].mediaType='video';video.scenes[0].videoPrompt=Array(80).fill('direction').join(' ');
  assert.match(generationIssue(prompt,serializeScenePlan(video)+'\n'+template,60),/requires 0 video/);
  const native={...plan(),supportingNotes:template+'\nA literal <image_prompt> label is discussed in these notes.'};
  assert.equal(generationIssue(prompt,JSON.stringify(native),60),undefined);
  assert.match(generationIssue(prompt,JSON.stringify(native)+' trailing prose',60),/invalid JSON/);
});
