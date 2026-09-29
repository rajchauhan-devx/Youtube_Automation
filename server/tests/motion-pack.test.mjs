import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-pack-test-'));

const { directScene } = await import('../dist/services/editing/motionPack/director.js');
const { resolvePlacement } = await import('../dist/services/editing/motionPack/placement.js');
const { paginateCaptionTokens } = await import('../dist/services/editing/motionPack/kineticCaptions.js');
const { buildMotionPack } = await import('../dist/services/editing/motionPackArtifacts.js');
const { snapshotAt } = await import('../dist/services/editing/motionPack/vision.js');
const { saveAsset } = await import('../dist/services/editing/repository.js');
const { registerFonts } = await import('../dist/services/editing/media.js');

// Real asset records (bytes are never decoded by the builder; records must exist
// because placeArtifact resolves dimensions through the asset store).
const bg = saveAsset(Buffer.from('motion-pack-test-image'), {
  mime: 'image/png', width: 1080, height: 1920, alpha: false, method: 'fixture', providerVersion: 'test',
});
const audio = saveAsset(Buffer.from('motion-pack-test-audio'), {
  mime: 'audio/wav', duration: 6, alpha: false, method: 'fixture', providerVersion: 'test',
});
const fonts = registerFonts();

const HEX = 'a'.repeat(64);
const wordsOf = (text, start = 0.2, step = 0.4) => {
  const out = [];
  let cursor = 0;
  text.split(/\s+/).forEach((w, i) => {
    const at = text.indexOf(w, cursor);
    cursor = at + w.length;
    out.push({ id: `token-${i}`, text: w, startOffset: at, endOffset: at + w.length, start: start + i * step, end: start + i * step + 0.32 });
  });
  return out;
};

function fixtureProject(narration, duration = 6.0) {
  const tokens = wordsOf(narration);
  const fps = 30;
  const durationFrames = Math.ceil(duration * fps);
  return {
    id: randomUUID(),
    schemaVersion: 1,
    scriptId: 'test-script',
    revisionId: randomUUID(),
    status: 'draft',
    inputs: {
      scriptId: 'test-script',
      scriptHash: HEX,
      narrationText: narration,
      narrationHash: HEX,
      language: 'en',
      audioAssetId: audio.id,
      audioHash: audio.hash,
      imageAssets: [{ assetId: bg.id, hash: bg.hash, promptIndex: 0, prompt: 'scene' }],
      width: 1080,
      height: 1920,
      fps,
      durationFrames,
      audioFilename: 'a.wav',
      sceneTiming: [],
    },
    settings: { stylePreference: '', density: 'balanced', maxProviderCalls: 10, maxGeneratedAssets: 0 },
    style: {
      id: 'story-style',
      direction: 'test',
      colors: { background: '#172033', text: '#ffffff', accent: '#f2bd65' },
      fontAssetIds: fonts.map((f) => f.id),
      headingSize: 64,
      bodySize: 42,
      lineWeight: 3,
      textureAssetIds: [],
      shapeTreatment: 'simple',
      motionIntensity: 0.4,
      minReadingSeconds: 2.5,
      minContrast: 4.5,
    },
    alignment: {
      audioHash: audio.hash,
      narrationHash: HEX,
      language: 'en',
      duration,
      tokens: tokens.map((t) => ({ ...t, confidence: 1, evidence: 'test' })),
      provider: 'test',
      version: '1',
      mode: 'word',
    },
    scenes: [{
      id: 'scene-0',
      assetId: bg.id,
      startFrame: 0,
      endFrame: durationFrames,
      narrativeRefs: tokens.map((t) => t.id),
      camera: [{ frame: 0, x: 0, y: 0, scale: 1 }, { frame: durationFrames, x: 0, y: 0, scale: 1 }],
      transitionFrames: 0,
      reservedRegions: [{ x: 64.8, y: 1593.6, width: 950.4, height: 230.4 }],
    }],
    analyses: [],
    artifacts: [],
    assetIds: [audio.id, bg.id, ...fonts.map((f) => f.id)],
    diagnostics: [],
    createdAt: new Date().toISOString(),
  };
}

test('director triggers on keywords and enforces clutter rules', () => {
  const tokens = wordsOf('Growth growth growth growth brings money money money money now', 0.6, 0.4);
  const scene = { sceneId: 'scene-0', sceneIndex: 0, sceneStartMs: 0, sceneEndMs: 6000, tokens };
  const first = directScene(scene);
  const second = directScene(scene);
  assert.deepEqual(first, second, 'director must be deterministic');
  assert.ok(first.length <= 3, `clutter cap breached: ${first.length}`);
  for (let i = 1; i < first.length; i++) {
    assert.ok(first[i].startMs - first[i - 1].startMs >= 800, 'minimum 800ms gap');
  }
  assert.ok(first.some((d) => d.triggerPhrase === 'growth'), 'growth trigger fires');
});

test('director falls back to a scene graphic with no keyword hit', () => {
  const tokens = wordsOf('A quiet river flows under grey skies today', 0.6, 0.4);
  const out = directScene({ sceneId: 'scene-0', sceneIndex: 0, sceneStartMs: 0, sceneEndMs: 6000, tokens });
  assert.equal(out.length, 1, 'intro fallback fires on scene 0');
  assert.equal(out[0].graphic, 'burst');
});

test('placement stays in the safe zone without vision', () => {
  const d = { id: 'm0-0', sceneId: 'scene-0', sceneIndex: 0, triggerWord: 'growth', triggerPhrase: 'growth', startMs: 1000, durationMs: 1400, graphic: 'arrow-up', zone: 'top-right', fallbackZone: 'top-right', anchor: { type: 'none' }, entrance: 'draw-on' };
  const at = resolvePlacement(d, null, { width: 1080, height: 1920 }, { width: 300, height: 200 }, []);
  assert.ok(at.x >= 12 && at.x + at.width <= 1080, `x in safe zone: ${JSON.stringify(at)}`);
  assert.ok(at.y >= 12 && at.y + at.height <= 1920, `y in safe zone: ${JSON.stringify(at)}`);
});

test('vision-anchored arrow tip lands on the subject box edge', () => {
  const vision = {
    version: 1, width: 1080, height: 1920, faces: [], analyzedAt: 't',
    subjects: [{ label: 'person', x: 0.35, y: 0.25, w: 0.3, h: 0.5, conf: 0.9 }],
    emptyCells: ['top-right'],
  };
  const d = { id: 'm0-0', sceneId: 'scene-0', sceneIndex: 0, triggerWord: 'growth', triggerPhrase: 'growth', startMs: 1000, durationMs: 1400, graphic: 'arrow-up', zone: 'top-right', fallbackZone: 'top-right', anchor: { type: 'subjectBox' }, entrance: 'draw-on' };
  const at = resolvePlacement(d, vision, { width: 1080, height: 1920 }, { width: 300, height: 200 }, []);
  assert.equal(at.visionAnchored, true);
  // Subject box: x 378..702, y 480..1440. Nearest edge to top-right is top (y=480) or right (x=702).
  const nearTop = Math.abs(at.y + at.height - 480) < 120 || Math.abs(at.y - 480) < 120;
  const nearRight = Math.abs(at.x - 702) < 220 || Math.abs(at.x + at.width - 702) < 220;
  assert.ok(nearTop || nearRight, `arrow near subject edge: ${JSON.stringify(at)}`);
});

test('lower graphics shift clear of face boxes', () => {
  const vision = {
    version: 1, width: 1080, height: 1920, analyzedAt: 't',
    faces: [{ x: 0.3, y: 0.55, w: 0.4, h: 0.3, conf: 0.98 }],
    subjects: [],
    emptyCells: ['bottom-center'],
  };
  const d = { id: 'm0-0', sceneId: 'scene-0', sceneIndex: 0, triggerWord: 'link', triggerPhrase: 'link below', startMs: 1000, durationMs: 1600, graphic: 'arrow-down', zone: 'bottom-center', fallbackZone: 'bottom-center', anchor: { type: 'none' }, entrance: 'draw-on' };
  const at = resolvePlacement(d, vision, { width: 1080, height: 1920 }, { width: 300, height: 200 }, []);
  const face = { x: 0.3 * 1080 - 20, y: 0.55 * 1920 - 20, width: 0.4 * 1080 + 40, height: 0.3 * 1920 + 40 };
  const overlaps = at.x < face.x + face.width && at.x + at.width > face.x && at.y < face.y + face.height && at.y + at.height > face.y;
  assert.ok(!overlaps, `graphic avoids face: ${JSON.stringify(at)}`);
});

test('caption pager groups into <=4 words and <=1200ms pages', () => {
  const tokens = wordsOf('one two three four five six seven eight', 0.1, 0.2);
  const pages = paginateCaptionTokens(tokens);
  assert.ok(pages.length >= 2, 'splits into pages');
  for (const pg of pages) {
    assert.ok(pg.words.length <= 4, 'max 4 words');
    assert.ok(pg.end - pg.start <= 1.21, 'max ~1200ms');
  }
  const flat = pages.flatMap((pg) => pg.words.map((w) => w.text));
  assert.deepEqual(flat, 'one two three four five six seven eight'.split(' '), 'no word lost or reordered');
});

test('temporal snapshot picks the nearest sampled frame', () => {
  const temporal = {
    version: 1, source: 'test', durationMs: 5000, sampleFps: 1,
    frames: [
      { tMs: 0, faces: [], subjects: [{ label: 'car', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], emptyCells: ['top-left'] },
      { tMs: 1000, faces: [{ x: 0.4, y: 0.3, w: 0.1, h: 0.1 }], subjects: [], emptyCells: ['bottom-right'] },
      { tMs: 2000, faces: [], subjects: [], emptyCells: ['center'] },
    ],
  };
  assert.equal(snapshotAt(temporal, 0).subjects.length, 1);
  assert.equal(snapshotAt(temporal, 900).faces.length, 1, 'nearest frame wins');
  assert.deepEqual(snapshotAt(temporal, 1900).emptyCells, ['center']);
  assert.equal(snapshotAt(temporal, 99999).emptyCells[0], 'center', 'clamps to last frame');
});

test('director handles twenty varied sentences within clutter rules', () => {
  const sentences = [
    ['Please subscribe for more videos soon', ['badge']],
    ['The link in description has the full list today', ['arrow-down']],
    ['Avoid this common mistake when you edit', ['alert']],
    ['Revenue growth was higher every single quarter', ['arrow-up', 'cash']],
    ['Here is one secret tip for beginners today', ['lightbulb']],
    ['Money profit income reports are due now', ['cash']],
    ['Step one is simple and step two is easy', ['number']],
    ['Leave a comment and share this video', ['badge']],
    ['Remember this important note for later', ['underline']],
    ['Follow the channel for daily uploads', ['badge']],
    ['Never make this mistake again friends', ['alert']],
    ['Stocks may increase or skyrocket this year', ['arrow-up']],
    ['The idea came from a simple dream', ['lightbulb']],
    ['Earn more income with this method', ['cash']],
    ['First, we prepare the ingredients slowly', ['number']],
    ['Support the group with your purchase', []],
    ['A quiet river flows under grey skies', []],
    ['Growth brings money today for everyone', ['arrow-up', 'cash']],
    ['Like this video and subscribe now', ['badge']],
    ['The link below points to the toolkit', ['arrow-down']],
  ];
  let idx = 0;
  for (const [text, expected] of sentences) {
    const tokens = wordsOf(text, 0.6, 0.9);
    const endMs = Math.round((0.6 + tokens.length * 0.9 + 0.6) * 1000);
    const out = directScene({ sceneId: 'scene-0', sceneIndex: 1, sceneStartMs: 0, sceneEndMs: endMs, tokens });
    assert.ok(out.length <= 3, `"${text}": cap`);
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i].startMs - out[i - 1].startMs >= 800, `"${text}": gap`);
    }
    for (const g of expected) {
      assert.ok(out.some((d) => d.graphic === g), `"${text}": expected ${g}, got ${out.map((d) => d.graphic).join(',') || 'none'} (case ${idx})`);
    }
    if (!expected.length) assert.equal(out.length, 0, `"${text}" should stay clean`);
    idx++;
  }
});

test('motion pack build is deterministic, valid and self-contained', () => {
  const narration = 'Growth brings money this year but avoid this mistake and remember to subscribe now';
  const a = buildMotionPack(fixtureProject(narration));
  const b = buildMotionPack(fixtureProject(narration));
  const strip = (p) => JSON.stringify({ artifacts: p.artifacts, outcomes: p.sceneOutcomes });
  assert.equal(strip(a), strip(b), 'identical composition across runs');
  const intents = a.artifacts.map((x) => x.intent);
  assert.ok(intents.some((s) => s.includes('Motion cash')), `cash graphic survives: ${intents.join('; ')}`);
  assert.ok(intents.some((s) => s.includes('Motion alert')), `alert graphic survives: ${intents.join('; ')}`);
  assert.ok(intents.some((s) => s.startsWith('Kinetic captions')), 'kinetic caption pages survive');
  const kinds = new Set(a.artifacts.flatMap((x) => x.nodes.map((n) => n.kind)));
  assert.ok(kinds.has('lottie'), 'library animations cast as lottie nodes');
  assert.ok(kinds.has('audio'), 'entrance sounds cast as audio nodes');
  for (const artifact of a.artifacts) {
    for (const node of artifact.nodes) {
      if ((node.kind === 'lottie' || node.kind === 'audio') && node.assetId) {
        assert.ok(a.assetIds.includes(node.assetId), `library asset registered: ${node.assetId}`);
      }
    }
  }
  assert.ok(!a.diagnostics.some((d) => d.code === 'MOTION_SKIPPED'), `no skipped graphics: ${JSON.stringify(a.diagnostics)}`);
  assert.ok(a.diagnostics.some((d) => d.code === 'MOTION_PACK'), 'summarises the pack');
  const vocab = new Set(narration.toLowerCase().match(/[a-z0-9']+/g));
  for (const artifact of a.artifacts) {
    for (const node of artifact.nodes) {
      if (node.kind !== 'text') continue;
      for (const w of node.text.toLowerCase().match(/[a-z0-9']+/g) || []) {
        assert.ok(vocab.has(w) || /^\d+$/.test(w), `label word "${w}" outside narration`);
      }
    }
  }
});
