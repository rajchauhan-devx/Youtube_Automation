import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBlenderBinary, checkBlenderStatus, actionToShotIndex } from '../dist/services/blender.js';

test('resolveBlenderBinary looks up standard candidate paths', () => {
  const binary = resolveBlenderBinary();
  // On this test machine Blender may or may not be installed yet;
  // if not found, it must return undefined rather than crashing.
  if (binary) {
    assert.equal(typeof binary, 'string');
    assert.match(binary, /blender/i);
  } else {
    assert.equal(binary, undefined);
  }
});

test('checkBlenderStatus returns clean detection structure with installation hint', async () => {
  const status = await checkBlenderStatus();
  assert.equal(typeof status.installed, 'boolean');
  assert.equal(typeof status.installCommand, 'string');
  assert.match(status.installCommand, /blender/i);
  if (status.installed) {
    assert.ok(status.path);
    assert.ok(status.version);
  }
});

test('actionToShotIndex maps semantic actions to 16-shot film index', () => {
  assert.equal(actionToShotIndex('drill_down'), 1);
  assert.equal(actionToShotIndex('derrick_well'), 2);
  assert.equal(actionToShotIndex('sand_caving'), 3);
  assert.equal(actionToShotIndex('mud_pump'), 4);
  assert.equal(actionToShotIndex('mud_column'), 5);
  assert.equal(actionToShotIndex('derrick_upward'), 6);
  assert.equal(actionToShotIndex('pipe_ejection'), 7);
  assert.equal(actionToShotIndex('pipe_breaking_crown'), 8);
  assert.equal(actionToShotIndex('oil_gusher'), 9);
  assert.equal(actionToShotIndex('deep_strata_plunge'), 10);
  assert.equal(actionToShotIndex('reservoir_myth'), 11);
  assert.equal(actionToShotIndex('macro_pores_zoom'), 12);
  assert.equal(actionToShotIndex('sponge_rock_zoom'), 13);
  assert.equal(actionToShotIndex('casing_travel'), 14);
  assert.equal(actionToShotIndex('bop_clamp'), 15);
  assert.equal(actionToShotIndex('pump_jack'), 16);
  assert.equal(actionToShotIndex('unknown_action'), 1);
});
