import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflow } from '../dist/services/comfyui.js';

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
