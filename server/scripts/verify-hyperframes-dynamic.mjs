import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildHyperFramesComposition } from '../dist/services/editing/hyperframes-builder.js';

const scriptsPath = path.resolve(import.meta.dirname, '../data/scripts.json');
const rawScripts = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));
const script = rawScripts.find((s) => s.id === 'usr_1787934167716');

if (!script || !script.dynamicMotionGraphics) {
  throw new Error('Script or dynamic motion graphics not found');
}

console.log('Testing Hyperframes builder with dynamic motion graphics...');

// Build mock project with artifacts carrying dynamicMotion
const fps = 30;
const artifacts = script.dynamicMotionGraphics.map((dmg, idx) => ({
  id: `art-${idx}`,
  sceneId: `scene-${dmg.sceneIndex}`,
  enabled: true,
  intent: `${dmg.type}: ${dmg.title}`,
  narrativeRefs: [],
  startFrame: Math.round((dmg.startSec || 1) * fps),
  endFrame: Math.round(((dmg.startSec || 1) + (dmg.durationSec || 4.5)) * fps),
  priority: 1,
  nodes: [],
  assetRequestIds: [],
  dynamicMotion: dmg,
}));

const mockProject = {
  id: 'proj_test_dynamic',
  revisionId: 'rev_1',
  scriptId: script.id,
  accountId: 'default',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  inputs: {
    title: script.name,
    scriptText: script.narration || '',
    fps: 30,
    width: 1080,
    height: 1920,
    durationFrames: 54 * 30,
    imageAssets: [],
    videoAssets: [],
  },
  settings: {
    motionLevel: 'dynamic',
    captionStyle: 'kinetic',
  },
  style: {
    fontAssetIds: [],
  },
  scenes: [
    { id: 'scene-1', assetId: 'ast-1', startFrame: 0, endFrame: 180, durationSec: 6 },
    { id: 'scene-2', assetId: 'ast-2', startFrame: 180, endFrame: 420, durationSec: 8 },
    { id: 'scene-4', assetId: 'ast-4', startFrame: 420, endFrame: 660, durationSec: 8 },
    { id: 'scene-6', assetId: 'ast-6', startFrame: 660, endFrame: 900, durationSec: 8 },
  ],
  artifacts,
};

const tmpDir = path.join(os.tmpdir(), `hyperframes-test-${Date.now()}`);
const indexHtmlPath = buildHyperFramesComposition({
  project: mockProject,
  outputDir: tmpDir,
});

console.log(`✔ Hyperframes composition built successfully at: ${indexHtmlPath}`);
const generatedHtml = fs.readFileSync(indexHtmlPath, 'utf8');

console.log(`- HTML size: ${generatedHtml.length} bytes`);
console.log(`- Has GSAP script: ${generatedHtml.includes('gsap.min.js')}`);
console.log(`- Has Devanagari Google Fonts: ${generatedHtml.includes('Tiro+Devanagari+Hindi')}`);
console.log(`- Has Dynamic Elements: ${generatedHtml.includes('dynamic-motion-box')}`);
console.log(`- Has Master Timeline: ${generatedHtml.includes('window.__timelines["main"] = tl;')}`);

// Clean up test dir
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('✔ Cleanup completed cleanly');
