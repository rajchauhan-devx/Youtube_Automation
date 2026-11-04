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

  assert.equal(g.type, 'vedic_title_reveal');
  assert.ok(g.title.includes('सुदर्शन चक्र') || g.title.includes('दिव्य'));
  assert.ok(g.render.html.length > 0);
  assert.ok(g.render.css.length > 0);
});

test('Against the Odds generates Hook Attention Extractor with lightning strike', async () => {
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

  assert.equal(g.type, 'thunder_lightning');
  assert.ok(g.render.html.length > 0);
  assert.ok(g.render.css.length > 0);
});
