import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflow } from '../dist/services/comfyui.js';

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
