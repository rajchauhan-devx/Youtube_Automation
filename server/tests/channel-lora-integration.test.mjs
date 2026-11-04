import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempComfy = fs.mkdtempSync(path.join(os.tmpdir(), 'comfy-test-'));
const lorasDir = path.join(tempComfy, 'models', 'loras');
fs.mkdirSync(lorasDir, { recursive: true });
fs.writeFileSync(path.join(lorasDir, 'ancient_dharma_custom_xl.safetensors'), 'mock');
fs.writeFileSync(path.join(lorasDir, 'against_the_odds_custom_xl.safetensors'), 'mock');
process.env.COMFYUI_PATH = tempComfy;

after(() => {
  try { fs.rmSync(tempComfy, { recursive: true, force: true }); } catch {}
});

import {
  buildWorkflow,
  resolveChannelLoraForAccount,
} from '../dist/services/comfyui.js';

test('resolveChannelLoraForAccount strictly isolates channels', () => {
  const dharma = resolveChannelLoraForAccount('default');
  assert.equal(dharma.channelKey, 'ancient_dharma');
  assert.equal(dharma.channelLabel, 'Ancient Dharma');
  assert.equal(dharma.strengthModel, 0.70);
  assert.ok(dharma.loraFileName.includes('ancient_dharma'));
  assert.ok(dharma.styleDna.includes('Sacred chiaroscuro'));

  const odds = resolveChannelLoraForAccount('acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab');
  assert.equal(odds.channelKey, 'against_the_odds');
  assert.equal(odds.channelLabel, 'Against the Odds');
  assert.equal(odds.strengthModel, 0.80);
  assert.ok(odds.loraFileName.includes('against_the_odds'));
  assert.ok(odds.styleDna.includes('35mm Kodak documentary'));
});

test('buildWorkflow inserts strictly isolated LoraLoader node "20" per channel', () => {
  const prompt = 'Sacred temple sanctum at twilight';

  // Ancient Dharma
  const wfDharma = buildWorkflow({
    promptStr: prompt,
    seed: 101,
    channelAccountId: 'default',
  });
  assert.ok(wfDharma['20'], 'LoraLoader node "20" must be present');
  assert.equal(wfDharma['20'].class_type, 'LoraLoader');
  assert.ok(wfDharma['20'].inputs.lora_name.includes('ancient_dharma'));
  assert.equal(wfDharma['20'].inputs.strength_model, 0.70);
  assert.deepEqual(wfDharma['13'].inputs.model, ['20', 0]);
  assert.deepEqual(wfDharma['6'].inputs.clip, ['20', 1]);
  assert.equal(wfDharma['6'].inputs.text, prompt, 'Prompt text must remain verbatim');

  // Against the Odds
  const wfOdds = buildWorkflow({
    promptStr: prompt,
    seed: 103,
    channelAccountId: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
  });
  assert.ok(wfOdds['20']);
  assert.ok(wfOdds['20'].inputs.lora_name.includes('against_the_odds'));
  assert.equal(wfOdds['20'].inputs.strength_model, 0.80);
  assert.deepEqual(wfOdds['13'].inputs.model, ['20', 0]);

  // Strict isolation check: None of the workflows mix LoRAs
  assert.notEqual(wfDharma['20'].inputs.lora_name, wfOdds['20'].inputs.lora_name);
});
