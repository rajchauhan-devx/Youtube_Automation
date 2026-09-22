import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { smoothMotionFilter, editingPreset, autoEditPlan } from '../dist/services/auto-edit.js';
import { parseAiEdit } from '../dist/services/ai-edit.js';
import { removePreviousRenders } from '../dist/services/render-output.js';

test('camera pans move monotonically in subpixel steps and holds remain still', () => {
  const render = motion => execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=black:s=320x180,drawbox=x=140:y=70:w=40:h=40:color=white:t=fill', '-vf', smoothMotionFilter(motion, 90, 320, 180, 0.04), '-frames:v','90','-pix_fmt','gray','-f','rawvideo','pipe:1'], { windowsHide:true, maxBuffer: 8 * 1024 * 1024 });
  const positions = data => Array.from({length:90}, (_, f) => {
    let weighted = 0, sum = 0;
    for (let y=60;y<120;y++) for (let x=100;x<220;x++) { const value = data[f*320*180+y*320+x]; weighted += x*value; sum += value; }
    return weighted/sum;
  });
  for (const motion of ['pan-left','pan-right']) {
    const p = positions(render(motion));
    const direction = motion === 'pan-left' ? 1 : -1;
    assert.ok(Math.abs(p.at(-1)-p[0]) > 8, 'camera actually moves');
    const steps = p.slice(1).map((value,i) => (value-p[i])*direction);
    assert.ok(steps.every(step => step >= -0.03 && step < 0.5), `no reversal or pixel jump: ${Math.min(...steps)}..${Math.max(...steps)}`);
    assert.ok(steps[0] < Math.max(...steps)/2, 'camera eases in');
  }
  const held = positions(render('hold'));
  assert.ok(Math.max(...held)-Math.min(...held) < 0.01);
});

test('Gemini decisions require complete unique scene IDs and supported effects', () => {
  const plan = { scenes: [{id:'still',mediaType:'image',chapter:'A'}, {id:'clip',mediaType:'video',chapter:'A'}] };
  const reply = {summary:'Quiet camera and a clean cut.', scenes:[{sceneId:'still', motion:'drift-in',transition:'cut'},{sceneId:'clip',motion:'pan-right',transition:'cut'}]};
  const result = parseAiEdit(JSON.stringify(reply), plan, editingPreset());
  assert.deepEqual(autoEditPlan(plan, result.editing).map(s => s.motion), ['drift-in','source']);
  const off = parseAiEdit(JSON.stringify(reply), plan, {...editingPreset(),motion:'off'});
  assert.equal(autoEditPlan(plan,off.editing)[0].motion,'hold');
  for (const scenes of [reply.scenes.slice(1), [reply.scenes[0],reply.scenes[0]], [{...reply.scenes[0],motion:'shake;movie=/secret'},reply.scenes[1]]]) {
    assert.throws(() => parseAiEdit(JSON.stringify({...reply,scenes}),plan,editingPreset()));
  }
});

test('replacement removes published videos and sidecars only in the selected output directory', () => {
  const root = fs.mkdtempSync(path.resolve('server/data/replacement-test-'));
  try {
    fs.mkdirSync(path.join(root,'other'));
    for (const file of ['old.mp4','old.mp4.json','inflight.partial.mp4','notes.txt','other/keep.mp4']) fs.writeFileSync(path.join(root,file),'fixture');
    removePreviousRenders(root);
    assert.deepEqual(fs.readdirSync(root).sort(),['inflight.partial.mp4','notes.txt','other']);
    assert.ok(fs.existsSync(path.join(root,'other/keep.mp4')));
  } finally {
    assert.ok(root.startsWith(path.resolve('server/data')+path.sep));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
