import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflow, preparePromptForImageGeneration } from '../dist/services/comfyui.js';

test('image prompts reach the model verbatim without added style or negative filters', () => {
  const prompts = [
    'A red lighthouse',
    'Anime illustration of a blue lighthouse',
    'A hand-drawn cartoon, soft watercolor texture',
    '  मंदिर की चित्रकला\nKeep the original colors.\nNegative prompt: modern objects\nNo text.  ',
  ];
  for (const promptStr of prompts) {
    const workflow = buildWorkflow({ promptStr, seed: 42, modelName: 'juggernautXL_ragnarok.safetensors' });
    assert.equal(workflow['6'].inputs.text, promptStr);
    assert.equal(workflow['15'].inputs.text, '');
  }
});

test('retired prompt override options cannot change the raw prompt', () => {
  for (const stylePreset of ['cinematic', 'anime', 'cartoon', 'digital_art', 'raw']) {
    const promptStr = '  A pencil sketch\nNegative prompt: photographs  ';
    const workflow = buildWorkflow({
      promptStr, seed: 7, modelName: 'juggernautXL_ragnarok.safetensors',
      stylePreset, enableQualityBooster: true, enableNegativeGuardrails: true,
    });
    assert.equal(workflow['6'].inputs.text, promptStr);
    assert.equal(workflow['15'].inputs.text, '');
  }
});

test('Juggernaut Lightning uses its distilled sampling configuration', () => {
  const workflow = buildWorkflow({ promptStr: 'A red lighthouse', seed: 42, preset: 'high', modelName: 'Juggernaut-XL-Lightning.safetensors' });
  assert.equal(workflow['13'].inputs.steps, 7);
  assert.equal(workflow['13'].inputs.cfg, 1.8);
  assert.equal(workflow['13'].inputs.sampler_name, 'dpmpp_sde');
  assert.equal(workflow['13'].inputs.seed, 42);
});

test('standard SDXL preserves full-step sampling after a Lightning request', () => {
  const workflow = buildWorkflow({ promptStr: 'A blue lighthouse', seed: 7, preset: 'high', modelName: 'juggernautXL_ragnarok.safetensors' });
  assert.equal(workflow['13'].inputs.steps, 28);
  assert.equal(workflow['13'].inputs.cfg, 6);
  assert.equal(workflow['4'].inputs.ckpt_name, 'juggernautXL_ragnarok.safetensors');
});


test('preparePromptForImageGeneration extracts Negative Prompt and enforces 2D cel-shaded cartoon style consistency', () => {
  const scenePrompt =
    'Character C1 (frame-center): Oval face, pale skin, chin-length jet black bob. Render Block: clean grounded 2D animated-series frame; realistic adult human proportions; simple charcoal outlines of medium-thin weight; matte flat colour fills; two-step cel shading; no painterly texture, no glossy 3D, no photorealism. Negative Prompt: photorealistic, hyperrealistic, glossy CGI, 3D render, Pixar-like rendering. Style Tags: clean grounded 2D animated series, no photorealism, no glossy 3D.';
  const prepared = preparePromptForImageGeneration(scenePrompt, { forCloudflare: false });
  assert.equal(prepared.is2dStylized, true);
  assert.equal(/photoreal/i.test(prepared.positivePrompt), false);
  assert.equal(/pixar/i.test(prepared.positivePrompt), false);
  assert.equal(/glossy 3d/i.test(prepared.positivePrompt), false);
  assert.match(prepared.positivePrompt, /2D flat cel-shaded cartoon animation frame/);
  assert.match(prepared.negativePrompt, /photorealistic/);
  assert.match(prepared.negativePrompt, /Pixar/);

  const wf = buildWorkflow({
    promptStr: prepared.positivePrompt,
    negativePromptStr: prepared.negativePrompt,
    disableChannelLora: prepared.is2dStylized,
    cfgOverride: prepared.is2dStylized ? 7.0 : undefined,
    seed: 99,
    channelAccountId: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7',
  });
  assert.equal(Boolean(wf['20']), false, 'Photorealistic channel LoRA must be bypassed for 2D cartoon prompts');
  assert.match(wf['15'].inputs.text, /photorealistic/);
  assert.equal(wf['13'].inputs.cfg, 7);
});
