import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { defaultAutoPilotSettings, AutoPilotSettingsSchema } from '../dist/services/autopilot-settings.js';
import { retentionEditing } from '../dist/services/retention.js';
import { autoEditPlan, autoMotionFilter, editingPreset } from '../dist/services/auto-edit.js';
import { legacyMotion, smoothMotionFilter } from '@tubeflow/video-composition';

test('Auto-Pilot default settings configure active cinematic editing and balanced motion', () => {
  const settings = defaultAutoPilotSettings();
  assert.equal(settings.editing.mode, 'story');
  assert.equal(settings.editing.settings.motion, 'balanced');
  assert.equal(settings.editing.settings.preset, 'cinematic');
  assert.equal(settings.editing.settings.transitionSeconds, 0.35);
  assert.equal(AutoPilotSettingsSchema.safeParse(settings).success, true);
});

test('retentionEditing maps dynamic camera motions and provides active editing settings', () => {
  const script = {
    retentionPlan: {
      version: 1, topic: 'Test', createdAt: '', structure: '', hooks: [],
      selectedHookIndex: 0, viewerPromise: '', titles: [], thumbnailConcept: '',
      description: '', tags: [], musicMood: 'cinematic', memoryEvidence: '',
    },
    retentionEdit: {
      sourceHash: 'test',
      plan: { version: 1, title: '', thumbnailPrompt: '', scenes: [] },
      notes: ['Dynamic edit'],
      sceneDirections: [
        { sceneId: 's1', purpose: 'Hook', motion: 'push-in', transition: 'cut' },
        { sceneId: 's2', purpose: 'Discovery', motion: 'pan-right', transition: 'dissolve' },
        { sceneId: 's3', purpose: 'Scope', motion: 'pull-out', transition: 'cut' },
        { sceneId: 's4', purpose: 'Travel', motion: 'drift-in', transition: 'dissolve' },
      ],
      editedAt: '',
    },
    enableSubtitles: false,
  };

  const editing = retentionEditing(script);
  assert.ok(editing);
  assert.equal(editing.motion, 'balanced');
  assert.equal(editing.overrides.s1.motion, 'push-in');
  assert.equal(editing.overrides.s2.motion, 'pan-right');
  assert.equal(editing.overrides.s3.motion, 'pull-out');
  assert.equal(editing.overrides.s4.motion, 'drift-in');
  assert.equal(editing.overrides.s2.transition, 'dissolve');
});

test('legacyMotion provides cinematic travel for Ken Burns, zooms, and pans', () => {
  const push = legacyMotion('zoom-in', 1.15);
  assert.equal(push.motion, 'push-in');
  assert.ok(push.travel >= 0.12 && push.travel <= 0.20, `push travel should be cinematic: ${push.travel}`);

  const pan = legacyMotion('pan-left', 1.15);
  assert.equal(pan.motion, 'pan-left');
  assert.ok(pan.travel >= 0.12, `pan travel should be cinematic: ${pan.travel}`);

  const kb = legacyMotion('ken-burns-in', 1.15);
  assert.equal(kb.motion, 'drift-in');
  assert.ok(kb.travel >= 0.12, `ken-burns travel should be cinematic: ${kb.travel}`);

  const crash = legacyMotion('crash-zoom', 1.25);
  assert.equal(crash.travel, 0.20, `crash zoom travel should be 0.20: ${crash.travel}`);
});

test('autoMotionFilter with balanced motion produces active, visible subpixel movement across frames', () => {
  const filter = autoMotionFilter('push-in', 90, 320, 180, 'balanced');
  assert.ok(filter.includes("zoompan=z='1+"), 'zoompan filter must be constructed');
  assert.ok(!filter.includes("z='1'"), 'balanced motion must not freeze camera');

  const render = motion => execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x180,drawbox=x=140:y=70:w=40:h=40:color=white:t=fill',
    '-vf', autoMotionFilter(motion, 90, 320, 180, 'balanced'),
    '-frames:v', '90', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'
  ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

  const positions = data => Array.from({ length: 90 }, (_, f) => {
    let weighted = 0, sum = 0;
    for (let y = 60; y < 120; y++) {
      for (let x = 80; x < 240; x++) {
        const val = data[f * 320 * 180 + y * 320 + x];
        weighted += x * val;
        sum += val;
      }
    }
    return weighted / sum;
  });

  const pRight = positions(render('pan-right'));
  const totalShift = Math.abs(pRight.at(-1) - pRight[0]);
  assert.ok(totalShift > 15, `Balanced pan should achieve prominent visible travel (>15px on 320w), got ${totalShift.toFixed(2)}px`);
});
