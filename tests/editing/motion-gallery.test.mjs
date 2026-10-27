import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-gallery-'));
for (const name of ['motionTemplates', 'reusableMotionTemplates']) {
  const source = fs.readFileSync(`src/services/${name}.ts`, 'utf8').replace("from './reusableMotionTemplates'", "from './reusableMotionTemplates.mjs'");
  fs.writeFileSync(path.join(directory, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
const { getTemplatesForProfile, findMatchingTemplate } = await import(pathToFileURL(path.join(directory, 'motionTemplates.mjs')));
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('each channel retains ten originals and exposes twenty distinct reusable motions', () => {
  const ids = new Set();
  for (const profile of ['default', 'rule_zero', 'against_the_odds']) {
    const templates = getTemplatesForProfile(profile);
    assert.equal(templates.length, 30);
    assert.equal(templates.filter(t => t.collection === 'essentials').length, 20);
    for (const template of templates) {
      assert.ok(!ids.has(template.id)); ids.add(template.id);
      for (const [w, h] of [[1920, 1080], [1080, 1920]]) {
        for (const frame of [0, 1, 45, 90, 179]) {
          const svg = template.renderSvg(frame, 180, w, h);
          assert.ok(svg.includes(`viewBox="0 0 ${w} ${h}"`));
          assert.ok(!/NaN|Infinity|="--/.test(svg), `${template.id} frame ${frame}`);
          assert.equal(svg, template.renderSvg(frame, 180, w, h), 'seeking must be deterministic');
        }
      }
    }
  }
});

test('editable labels are escaped in original and new SVGs, including defaults merged with edits', () => {
  for (const template of getTemplatesForProfile('default')) {
    const params = Object.fromEntries(Object.entries(template.defaultParams).map(([key,value]) => [key, typeof value === 'string' && key !== 'values' ? 'A & B <script>alert(1)</script> "quote"' : value]));
    const svg = template.renderSvg(90, 180, 1920, 1080, params);
    assert.ok(!svg.includes('<script>'), template.id);
    assert.ok(!svg.includes('A & B'), template.id);
    assert.ok(svg.includes('&amp;'), template.id);
  }
});

test('numeric inputs stay finite and percentages stay within a whole', () => {
  const templates = getTemplatesForProfile('default');
  for (const id of ['ad_progress_bar', 'ad_donut_chart', 'ad_radial_metric']) {
    const template = templates.find(t => t.id === id);
    const svg = template.renderSvg(90, 180, 1920, 1080, { value: 200, targetPercent: 200 });
    assert.ok(!svg.includes('200%'));
    assert.ok(svg.includes('100'));
  }
  for (const template of templates) {
    const params = Object.fromEntries(Object.entries(template.defaultParams).map(([key,value]) => [key, typeof value === 'number' ? Infinity : value]));
    assert.ok(!/NaN|Infinity/.test(template.renderSvg(90,180,1920,1080,params)), template.id);
  }
  const scale = templates.find(t => t.id === 'ad_scale_scanner').renderSvg(90,180,1920,1080,{unit:'FEET'});
  assert.ok(scale.includes('FEET')); assert.ok(!/>\s*\d+m\s*</.test(scale));
});

test('keyword selection permits no match and avoids matching CE inside unrelated words', () => {
  assert.equal(findMatchingTemplate('silence', 'default'), null);
  assert.equal(findMatchingTemplate('zzzz', 'default'), null);
  assert.equal(findMatchingTemplate('इस चक्र को समझें', 'default')?.id, 'ad_cycle_loop');
});
