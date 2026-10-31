import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideDynamicMotionGraphics,
  compileDynamicMotionGraphic,
} from '../dist/services/dynamic-motion-engine.js';
import { DynamicMotionGraphic } from '@tubeflow/editing-contracts';

test('Ancient Dharma generates 3D Sudarshana Chakra with lens flare, embers, and SFX cue', async () => {
  const graphics = await decideDynamicMotionGraphics({
    channelName: 'Ancient Dharma',
    scenes: [
      {
        sceneIndex: 0,
        narration: 'भगवान विष्णु का सुदर्शन चक्र ब्रह्मांड का सबसे शक्तिशाली अस्त्र है।',
        visualPrompt: 'Close up of blazing golden Sudarshana Chakra rotating with solar corona',
        durationSec: 6.5,
      },
    ],
  });

  assert.equal(graphics.length, 1);
  const g = graphics[0];

  // Validate schema
  DynamicMotionGraphic.parse(g);

  assert.equal(g.type, 'celestial_astra_geometry');
  assert.equal(g.title, 'सुदर्शन चक्र');
  assert.ok(g.vfx?.tilt3d, 'Expected 3D tilt to be enabled');
  assert.ok(g.vfx?.lensflare, 'Expected lens flare to be enabled');
  assert.ok(g.vfx?.particles, 'Expected particles to be enabled');
  assert.equal(g.sfx?.kind, 'energy_hum');

  // Check HTML and CSS contain 3D perspective and lens flare classes
  assert.ok(g.render.html.includes('dm-3d-card'), 'Expected 3D card in HTML');
  assert.ok(g.render.html.includes('dm-lens-flare'), 'Expected lens flare bar in HTML');
  assert.ok(g.render.html.includes('dm-ember'), 'Expected embers in HTML');
  assert.ok(g.render.css.includes('perspective: 1200px'), 'Expected 3D perspective in CSS');
});

test('Rule Zero generates Tactical Cyber HUD with hexagonal reticle and telemetry SFX', async () => {
  const graphics = await decideDynamicMotionGraphics({
    channelName: 'Rule Zero',
    scenes: [
      {
        sceneIndex: 0,
        narration: 'The system locks on the neural cyber matrix as telemetry surges.',
        visualPrompt: 'Cybernetic combat interface with tactical lock-on reticle',
        durationSec: 6.0,
      },
    ],
  });

  assert.equal(graphics.length, 1);
  const g = graphics[0];

  // Validate schema
  DynamicMotionGraphic.parse(g);

  assert.equal(g.type, 'tactical_cyber_hud');
  assert.equal(g.title, 'TARGET ACQUIRED');
  assert.equal(g.sfx?.kind, 'telemetry_chirp');
  assert.ok(g.render.html.includes('dm-tactical-svg'), 'Expected tactical HUD SVG in HTML');
  assert.ok(g.render.html.includes('dm-ecg-path'), 'Expected ECG pulse wave in HTML');
});

test('Against the Odds generates 3D Archival Nautical Compass with whoosh SFX', async () => {
  const graphics = await decideDynamicMotionGraphics({
    channelName: 'Against the Odds',
    scenes: [
      {
        sceneIndex: 0,
        narration: 'The lost expedition tracked their final latitude into the uncharted storm.',
        visualPrompt: 'Historical nautical brass navigation compass on ancient parchment map',
        durationSec: 6.0,
      },
    ],
  });

  assert.equal(graphics.length, 1);
  const g = graphics[0];

  // Validate schema
  DynamicMotionGraphic.parse(g);

  assert.equal(g.type, 'archival_compass_telemetry');
  assert.equal(g.title, 'EXPEDITION ARCHIVE');
  assert.equal(g.sfx?.kind, 'whoosh');
  assert.ok(g.render.html.includes('dm-compass-svg'), 'Expected compass SVG in HTML');
});
