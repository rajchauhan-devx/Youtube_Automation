import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneGraph } from '@tubeflow/editing-contracts';
import { compileSceneGraph, commandsToSvgPath, computeConnectorPath } from '@tubeflow/video-composition';

test('commandsToSvgPath converts path commands into standard SVG d path', () => {
  const commands = [
    { op: 'M', x: 10, y: 20 },
    { op: 'L', x: 50, y: 60 },
    { op: 'Q', x1: 70, y1: 80, x: 100, y: 120 },
    { op: 'C', x1: 110, y1: 130, x2: 140, y2: 150, x: 180, y: 200 },
    { op: 'Z' },
  ];
  const d = commandsToSvgPath(commands);
  assert.equal(d, 'M 10 20 L 50 60 Q 70 80 100 120 C 110 130 140 150 180 200 Z');
});

test('computeConnectorPath produces valid SVG lines and curves', () => {
  const line = computeConnectorPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 'line');
  assert.equal(line, 'M 0 0 L 100 100');

  const curve = computeConnectorPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 'curve');
  assert.ok(curve.startsWith('M 0 0 C'));
  assert.ok(curve.endsWith('100 100'));
});

test('SceneGraph Zod contract validates well-formed graph and rejects invalid bounds', () => {
  const validGraph = {
    version: 1,
    seed: 42,
    bounds: { x: 50, y: 300, width: 800, height: 400 },
    nodes: [
      {
        id: 'box-1',
        kind: 'shape',
        space: 'screen',
        zIndex: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        geometry: { kind: 'rect', bounds: { x: 0, y: 0, width: 800, height: 400 }, radius: 8 },
        paint: { fill: '#1E293B', stroke: '#00F0FF', strokeWidth: 2, dash: [] },
      },
      {
        id: 'metric-1',
        kind: 'metric',
        space: 'screen',
        zIndex: 2,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        targetValue: 33000,
        startValue: 0,
        unit: 'FT',
        label: 'MAXIMUM ALTITUDE',
        bounds: { x: 40, y: 40, width: 720, height: 120 },
        decimals: 0,
        style: {
          fontAssetId: 'font-mono',
          fontSize: 48,
          fontWeight: '700',
          color: '#00F0FF',
          align: 'left',
          lineHeight: 1.1,
        },
      },
    ],
    soundCues: [],
    evidence: [],
    capabilities: ['metric', 'shape'],
  };

  const parsed = SceneGraph.parse(validGraph);
  assert.equal(parsed.nodes.length, 2);
  assert.equal(parsed.nodes[1].kind, 'metric');

  // Negative bounds width must fail
  assert.throws(() => {
    SceneGraph.parse({
      ...validGraph,
      bounds: { x: 50, y: 300, width: -100, height: 400 },
    });
  });
});

test('compileSceneGraph compiles a novel branching decision diagram without engine templates', () => {
  const branchingGraph = {
    version: 1,
    seed: 101,
    bounds: { x: 60, y: 400, width: 900, height: 600 },
    theme: {
      name: 'cyber',
      primary: '#00F0FF',
      accent: '#FF0055',
      background: 'rgba(5, 8, 14, 0.95)',
      text: '#FFFFFF',
      fontFamily: 'JetBrains Mono',
      lineWeight: 2,
      radius: 4,
    },
    nodes: [
      {
        id: 'root-decision',
        kind: 'text',
        space: 'screen',
        zIndex: 2,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        text: 'DECISION PROTOCOL: ENGAGE TARGET',
        bounds: { x: 50, y: 40, width: 800, height: 60 },
        style: {
          fontAssetId: 'font-1',
          fontSize: 24,
          fontWeight: '700',
          color: '#00F0FF',
          align: 'center',
          lineHeight: 1.2,
        },
      },
      {
        id: 'branch-a',
        kind: 'text',
        space: 'screen',
        zIndex: 2,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        text: 'BRANCH A: EVACUATION',
        bounds: { x: 50, y: 220, width: 350, height: 50 },
        style: {
          fontAssetId: 'font-1',
          fontSize: 18,
          fontWeight: '700',
          color: '#FFFFFF',
          align: 'center',
          lineHeight: 1.2,
        },
      },
      {
        id: 'branch-b',
        kind: 'text',
        space: 'screen',
        zIndex: 2,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        text: 'BRANCH B: COUNTERMEASURE',
        bounds: { x: 500, y: 220, width: 350, height: 50 },
        style: {
          fontAssetId: 'font-1',
          fontSize: 18,
          fontWeight: '700',
          color: '#FF0055',
          align: 'center',
          lineHeight: 1.2,
        },
      },
      {
        id: 'connector-1',
        kind: 'connector',
        space: 'screen',
        zIndex: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        from: { kind: 'node', nodeId: 'root-decision', point: { x: 0.5, y: 1 }, offset: { x: 0, y: 0 } },
        to: { kind: 'node', nodeId: 'branch-a', point: { x: 0.5, y: 0 }, offset: { x: 0, y: 0 } },
        paint: { fill: null, stroke: '#00F0FF', strokeWidth: 2, dash: [4, 4] },
        route: 'elbow',
      },
      {
        id: 'connector-2',
        kind: 'connector',
        space: 'screen',
        zIndex: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        from: { kind: 'node', nodeId: 'root-decision', point: { x: 0.5, y: 1 }, offset: { x: 0, y: 0 } },
        to: { kind: 'node', nodeId: 'branch-b', point: { x: 0.5, y: 0 }, offset: { x: 0, y: 0 } },
        paint: { fill: null, stroke: '#FF0055', strokeWidth: 2, dash: [4, 4] },
        route: 'elbow',
      },
    ],
    soundCues: [],
    evidence: [],
    capabilities: ['branching', 'connectors'],
  };

  const res = compileSceneGraph(branchingGraph, {
    artifactId: 'test-branching-art',
    startSec: 2.0,
    durationSec: 4.5,
    fps: 30,
    projectWidth: 1080,
    projectHeight: 1920,
  });

  assert.ok(res.html.includes('DECISION PROTOCOL: ENGAGE TARGET'), 'HTML includes root decision node');
  assert.ok(res.html.includes('BRANCH A: EVACUATION'), 'HTML includes Branch A');
  assert.ok(res.html.includes('BRANCH B: COUNTERMEASURE'), 'HTML includes Branch B');
  assert.ok(res.html.includes('sg-connector'), 'HTML includes procedural connector paths');
  assert.ok(res.js.includes('tl.fromTo'), 'JS includes GSAP animation timeline');
  assert.ok(res.css.includes('scene-graph-container'), 'CSS includes container styling');
});

test('planEditorialBeat identifies metrics and permits clean scenes without graphics', async () => {
  const { planEditorialBeat } = await import('../../server/dist/services/editing/sceneGraphPlanner.js');

  const dummyProject = {
    inputs: {
      narrationText: 'The aircraft plunged 33,000 feet into the dense forest below.',
      sceneTiming: [
        { sceneId: 'scene-0', text: 'Introduction to the flight record.' },
        { sceneId: 'scene-1', text: 'The aircraft plunged 33,000 feet into the dense forest below.' },
        { sceneId: 'scene-2', text: 'Silence engulfed the mountain ridge.' },
      ],
    },
  };

  // Scene 1 has metric 33,000 feet
  const beat1 = planEditorialBeat({ id: 'scene-1' }, dummyProject, 1, 3);
  assert.equal(beat1.warrantsGraphic, true);
  assert.equal(beat1.category, 'metric');
  assert.equal(beat1.extractedFacts.value, 33000);
  assert.equal(beat1.extractedFacts.unit, 'FEET');

  // Scene 2 has NO metrics/dates/rules -> MUST NOT have a graphic (clean scene!)
  const beat2 = planEditorialBeat({ id: 'scene-2' }, dummyProject, 2, 3);
  assert.equal(beat2.warrantsGraphic, false);
  assert.equal(beat2.category, 'none');
});

test('designSceneGraph builds distinct universe geometries across the three channel profiles', async () => {
  const { getChannelUniverseTheme, designSceneGraph } = await import('../../server/dist/services/editing/sceneGraphDesigner.js');

  const dummyProject = {
    inputs: { audioAssetId: 'audio-main' },
    style: { fontAssetIds: ['font-main'] },
  };
  const dummyScene = { id: 'scene-1', narrativeRefs: ['token-1', 'token-2'] };

  // 1. Ancient Dharma
  const dharmaTheme = getChannelUniverseTheme('usr_1787934167716', 'Ancient Dharma');
  assert.equal(dharmaTheme.primary, '#F59E0B', 'Ancient Dharma uses Temple Gold');
  assert.ok(dharmaTheme.fontFamily.includes('Cinzel'), 'Uses classical serif font');

  const dharmaBeat = {
    sceneId: 'scene-1',
    category: 'evidence',
    warrantsGraphic: true,
    intent: 'Sacred Inscription',
    supportingText: 'Chapter 1: The Divine Order',
    extractedFacts: { title: 'DIVINE ORDER', label: 'VEDIC RECORD' },
  };
  const dharmaGraph = designSceneGraph(dharmaBeat, dummyScene, dummyProject, dharmaTheme);
  assert.ok(dharmaGraph);
  const dharmaBg = dharmaGraph.nodes.find((n) => n.id === 'bg-frame');
  assert.equal(dharmaBg.geometry.kind, 'rect');
  assert.deepEqual(dharmaBg.paint.dash, [12, 4], 'Dharma uses ornate dashed scroll frame');

  // 2. Rule Zero
  const ruleZeroTheme = getChannelUniverseTheme('acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7', 'Rule Zero');
  assert.equal(ruleZeroTheme.primary, '#00F0FF', 'Rule Zero uses Cyber Cyan');
  assert.ok(ruleZeroTheme.fontFamily.includes('JetBrains Mono'), 'Uses Monospace font');

  const ruleBeat = {
    sceneId: 'scene-1',
    category: 'evidence',
    warrantsGraphic: true,
    intent: 'Rule Zero Protocol',
    supportingText: 'Directive 0: Absolute Discipline',
    extractedFacts: { title: 'RULE ZERO', label: 'PROTOCOL' },
  };
  const ruleGraph = designSceneGraph(ruleBeat, dummyScene, dummyProject, ruleZeroTheme);
  assert.ok(ruleGraph);
  const ruleBg = ruleGraph.nodes.find((n) => n.id === 'bg-frame');
  assert.equal(ruleBg.geometry.kind, 'polygon', 'Rule Zero uses chamfered polygon HUD');
  assert.equal(ruleBg.geometry.points.length, 6, 'Has 6 chamfered vertex points');

  // 3. Against the Odds
  const oddsTheme = getChannelUniverseTheme('acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab', 'Against the Odds');
  assert.equal(oddsTheme.primary, '#FACC15', 'Against the Odds uses Hazard Yellow');
  assert.equal(oddsTheme.lineWeight, 3, 'Heavy industrial border stroke');
});
