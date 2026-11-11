import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findReferenceImageForScene } from '../dist/services/flow/jobs.js';

test('findReferenceImageForScene resolves master image or scene image for active script', () => {
  const scriptId = 'usr_96c27c90-e357-4d70-891b-bf52d9775bd0';
  const fixtureDir = path.resolve('server/data/generated', scriptId);
  fs.mkdirSync(fixtureDir, { recursive: true });
  const samplePng = path.join(fixtureDir, 'image-00-sample.png');
  if (!fs.existsSync(samplePng)) {
    // 1x1 transparent PNG header
    fs.writeFileSync(samplePng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  }

  const scene0 = findReferenceImageForScene(scriptId, 0);
  assert.ok(scene0, 'Should find scene 0 image on disk');
  assert.ok(scene0.endsWith('.png'), 'Should be a PNG file');

  // Scene 1 (which only had video initially) falls back to Scene 0 master character frame
  const scene1 = findReferenceImageForScene(scriptId, 1);
  assert.ok(scene1, 'Should find fallback master reference image for scene 1');
  assert.ok(scene1.endsWith('.png'), 'Should be a PNG file');
});
