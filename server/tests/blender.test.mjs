import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBlenderBinary, checkBlenderStatus } from '../dist/services/blender.js';

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
