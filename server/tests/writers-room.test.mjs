import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-writers-room-test-'));
process.env.TUBEFLOW_DATA_DIR = testDir;

const {
  normalizeWritersRoomOptions,
  mergeFindings,
  scoreCritiques,
  approvalBlockers,
  isPlateau,
  runWritersRoom,
} = await import('../dist/services/editorial/writers-room.js');

const {
  saveWritersRoomJob,
  readWritersRoomJob,
  listWritersRoomJobs,
  latestWritersRoomJob,
  removeWritersRoomJob,
  createWritersRoomJob,
  writersRoomJobActive,
} = await import('../dist/services/writers-room-jobs.js');

after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

function makePlan() {
  return {
    version: 1,
    title: 'Test Script',
    thumbnailPrompt: 'A test thumbnail',
    scenes: [
      {
        id: 's1',
        chapter: 'Hook',
        narration: 'This is the opening hook.',
        imagePrompt: 'A dramatic scene',
        role: 'story',
        motionGraphics: [],
      },
      {
        id: 's2',
        chapter: 'Body',
        narration: 'This is the main content.',
        imagePrompt: 'An informative scene',
        role: 'story',
        motionGraphics: [],
      },
      {
        id: 's3',
        chapter: 'CTA',
        narration: 'Subscribe now.',
        imagePrompt: 'A subscribe button',
        role: 'cta',
        motionGraphics: [],
      },
    ],
  };
}

function mockCritique(critic, score, findings = [], error) {
  return {
    critic,
    model: 'test-model',
    score,
    summary: error ? 'Error' : 'Summary',
    findings,
    passed: !error && score >= 90 && findings.length === 0,
    durationMs: 10,
    ...(error ? { error } : {}),
  };
}

function mockFinding(id, critic, severity, category, sceneIds = ['s1']) {
  return {
    id,
    critic,
    severity,
    category,
    sceneIds,
    detail: `Finding for ${category}`,
    evidence: 'Evidence',
    suggestedFix: 'Fix it',
  };
}

test('normalizeWritersRoomOptions clamps values to allowed ranges', () => {
  const result = normalizeWritersRoomOptions({
    maxPasses: 10,
    maxModelCalls: 200,
    passThreshold: 20,
    plateauDelta: 50,
    plateauPasses: 10,
    freshEyes: true,
  });
  assert.deepEqual(result, {
    maxPasses: 6,
    maxModelCalls: 40,
    passThreshold: 50,
    plateauDelta: 20,
    plateauPasses: 4,
    freshEyes: true,
  });
});

test('normalizeWritersRoomOptions uses defaults when undefined', () => {
  const result = normalizeWritersRoomOptions(undefined);
  assert.deepEqual(result, {
    maxPasses: 3,
    maxModelCalls: 16,
    passThreshold: 90,
    plateauDelta: 2,
    plateauPasses: 2,
    freshEyes: false,
  });
});

test('mergeFindings deduplicates by critic/category/sceneIds/detail and drops rejected', () => {
  const finding1 = mockFinding('id1', 'retention', 'minor', 'pacing', ['s1']);
  const finding2 = mockFinding('id2', 'retention', 'minor', 'pacing', ['s1']);
  const finding3 = mockFinding('id3', 'fact', 'major', 'contradiction', ['s2']);
  const critiques = [
    mockCritique('retention', 85, [finding1, finding2]),
    mockCritique('fact', 80, [finding3]),
  ];
  // Both duplicates rejected - finding2 becomes the first for its dedup key since finding1 is rejected
  const decisions = { id1: 'rejected', id2: 'rejected' };
  const merged = mergeFindings(critiques, decisions);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'id3');
});

test('mergeFindings sorts by severity descending', () => {
  const findingMinor = mockFinding('m1', 'retention', 'minor', 'pacing', ['s1']);
  const findingMajor = mockFinding('m2', 'fact', 'major', 'anachronism', ['s2']);
  const findingBlocker = mockFinding('m3', 'retention', 'blocker', 'dead_zone', ['s3']);
  const critiques = [
    mockCritique('retention', 80, [findingMinor]),
    mockCritique('fact', 80, [findingMajor]),
    mockCritique('retention', 80, [findingBlocker]),
  ];
  const merged = mergeFindings(critiques);
  assert.equal(merged[0].id, 'm3');
  assert.equal(merged[1].id, 'm2');
  assert.equal(merged[2].id, 'm1');
});

test('scoreCritiques weights retention 0.5, fact 0.3, tone 0.2 and ignores errors', () => {
  const critiques = [
    mockCritique('retention', 80, []),
    mockCritique('fact', 90, []),
    mockCritique('tone', 100, []),
  ];
  // 80*0.5 + 90*0.3 + 100*0.2 = 40 + 27 + 20 = 87
  assert.equal(scoreCritiques(critiques), 87);
});

test('scoreCritiques ignores failed critics', () => {
  const critiques = [
    mockCritique('retention', 80, []),
    mockCritique('fact', 90, [], 'API error'),
  ];
  // only retention counted: 80
  assert.equal(scoreCritiques(critiques), 80);
});

test('scoreCritiques returns single fresh_eyes score when only that critic present', () => {
  const critiques = [mockCritique('fresh_eyes', 95, [])];
  assert.equal(scoreCritiques(critiques), 95);
});

test('approvalBlockers returns blockers and fact/fresh_eyes majors', () => {
  const findings = [
    mockFinding('f1', 'retention', 'minor', 'pacing'),
    mockFinding('f2', 'retention', 'blocker', 'dead_zone'),
    mockFinding('f3', 'fact', 'major', 'contradiction'),
    mockFinding('f4', 'tone', 'major', 'repetition'),
    mockFinding('f5', 'fresh_eyes', 'major', 'missed_issue'),
  ];
  const blockers = approvalBlockers(findings);
  assert.equal(blockers.length, 3);
  const ids = blockers.map(b => b.id).sort();
  assert.deepEqual(ids, ['f2', 'f3', 'f5']);
});

test('isPlateau detects score stagnation over specified passes', () => {
  assert.ok(isPlateau([85, 86, 86], 2, 2));
  assert.ok(!isPlateau([85, 87, 88], 2, 2));
  assert.ok(!isPlateau([85, 86], 2, 2));
  assert.ok(!isPlateau([], 2, 2));
});

test('runWritersRoom approves on first pass when all critics score high and no findings', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 3, maxModelCalls: 20, passThreshold: 90 };

  let criticCalls = 0;
  const deps = {
    retentionCritic: async () => { criticCalls++; return mockCritique('retention', 95, []); },
    factCritic: async () => { criticCalls++; return mockCritique('fact', 95, []); },
    toneCritic: async () => { criticCalls++; return mockCritique('tone', 95, []); },
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => ({ scenePlan: plan, diffs: [], repairedSceneIds: [], notes: [] }),
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
  });

  assert.equal(result.status, 'approved');
  assert.equal(criticCalls, 3);
  assert.equal(result.modelCalls, 3);
  assert.equal(result.passes.length, 1);
  assert.equal(result.passes[0].decision, 'approved');
  assert.equal(result.passes[0].diffs.length, 0);
});

test('runWritersRoom repairs then approves on second pass', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 3, maxModelCalls: 20, passThreshold: 90 };

  let criticCalls = 0;
  const finding = mockFinding('f1', 'retention', 'minor', 'pacing', ['s1']);
  const deps = {
    retentionCritic: async () => { criticCalls++; return mockCritique('retention', criticCalls === 1 ? 80 : 95, criticCalls === 1 ? [finding] : []); },
    factCritic: async () => { criticCalls++; return mockCritique('fact', criticCalls === 1 ? 80 : 95, criticCalls === 1 ? [finding] : []); },
    toneCritic: async () => { criticCalls++; return mockCritique('tone', criticCalls === 1 ? 80 : 95, []); },
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => ({ scenePlan: plan, diffs: [{ sceneId: 's1', beforeNarration: 'old', afterNarration: 'new', chapter: 'Hook' }], repairedSceneIds: ['s1'], notes: ['Fixed'] }),
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
  });

  assert.equal(result.status, 'approved');
  assert.equal(criticCalls, 6);
  assert.equal(result.modelCalls, 7);
  assert.equal(result.passes.length, 2);
  assert.equal(result.passes[0].decision, 'repair');
  assert.equal(result.passes[0].diffs.length, 1);
  assert.equal(result.passes[1].decision, 'approved');
});

test('runWritersRoom stops at max_passes and needs_review', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 2, maxModelCalls: 20, passThreshold: 90 };

  const finding = mockFinding('f1', 'retention', 'minor', 'pacing', ['s1']);
  let passCount = 0;
  const deps = {
    retentionCritic: async () => { passCount++; return mockCritique('retention', 80, [finding]); },
    factCritic: async () => mockCritique('fact', 80, [finding]),
    toneCritic: async () => mockCritique('tone', 80, []),
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => ({ scenePlan: plan, diffs: [{ sceneId: 's1', beforeNarration: 'old', afterNarration: 'new', chapter: 'Hook' }], repairedSceneIds: ['s1'], notes: ['Fixed'] }),
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
  });

  assert.equal(result.status, 'needs_review');
  assert.equal(result.passes.length, 2);
  assert.ok(result.stopReason.includes('2-pass limit'));
});

test('runWritersRoom stops with no_progress when fixer returns no diffs', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 3, maxModelCalls: 20, passThreshold: 90 };

  const finding = mockFinding('f1', 'retention', 'minor', 'pacing', ['s1']);
  let fixerCalled = false;
  const deps = {
    retentionCritic: async () => mockCritique('retention', 80, [finding]),
    factCritic: async () => mockCritique('fact', 80, [finding]),
    toneCritic: async () => mockCritique('tone', 80, []),
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => { fixerCalled = true; return { scenePlan: plan, diffs: [], repairedSceneIds: [], notes: ['No changes'] }; },
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
  });

  assert.ok(fixerCalled);
  assert.equal(result.status, 'needs_review');
  assert.ok(result.stopReason.includes('no measurable change'));
});

test('runWritersRoom fresh_eyes downgrades approved to needs_review when fresh eyes finds blocker', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer', freshEyes: 'test-fresh' };
  const apiKeys = { critic: 'key', fixer: 'key', freshEyes: 'key' };
  const options = { maxPasses: 3, maxModelCalls: 20, passThreshold: 90, freshEyes: true };

  const deps = {
    retentionCritic: async () => mockCritique('retention', 95, []),
    factCritic: async () => mockCritique('fact', 95, []),
    toneCritic: async () => mockCritique('tone', 95, []),
    freshEyesCritic: async () => {
      const finding = mockFinding('fe1', 'fresh_eyes', 'blocker', 'missed_critical', ['s2']);
      return mockCritique('fresh_eyes', 80, [finding]);
    },
    fixer: async () => ({ scenePlan: plan, diffs: [], repairedSceneIds: [], notes: [] }),
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
  });

  assert.equal(result.status, 'needs_review');
  assert.equal(result.passes.length, 2);
  assert.equal(result.passes[0].decision, 'approved');
  assert.equal(result.passes[1].kind, 'fresh_eyes');
  assert.equal(result.passes[1].decision, 'needs_review');
  assert.ok(result.remainingFindings.some(f => f.id === 'fe1'));
});

test('writers-room-jobs persists and retrieves jobs with correct status transitions', () => {
  const job = createWritersRoomJob({ scriptId: 'script-1', request: { models: { critic: 'c', fixer: 'f' }, options: { maxPasses: 3 }, sourcePlanHash: 'hash', sourcePlanTitle: 'Title' } });
  assert.ok(writersRoomJobActive(job));

  saveWritersRoomJob(job);
  const loaded = readWritersRoomJob(job.id);
  assert.ok(loaded);
  assert.equal(loaded.id, job.id);
  assert.equal(loaded.scriptId, 'script-1');
  assert.equal(loaded.status, 'queued');

  loaded.status = 'running';
  saveWritersRoomJob(loaded);
  const reloaded = readWritersRoomJob(job.id);
  assert.equal(reloaded.status, 'running');

  const list = listWritersRoomJobs('script-1');
  assert.equal(list.length, 1);

  const latest = latestWritersRoomJob('script-1');
  assert.equal(latest.id, job.id);

  removeWritersRoomJob(job.id);
  assert.equal(readWritersRoomJob(job.id), undefined);
});

test('writers-room-jobs marks stale queued/running jobs as interrupted on read', () => {
  const id = 'stale-job-' + Date.now();
  const filePath = path.join(path.join(testDir, '.writers-room'), `${id}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const staleJob = {
    version: 1,
    id,
    scriptId: 'script-x',
    owner: 'different-owner',
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { models: { critic: 'c', fixer: 'f' }, options: { maxPasses: 3 }, sourcePlanHash: 'h', sourcePlanTitle: 't' },
    progress: { pass: 1, totalPasses: 3, phase: 'critics', message: '', percent: 50, criticStatus: {} },
    passes: [],
    decisions: {},
    findings: [],
    cancelRequested: false,
  };
  fs.writeFileSync(filePath, JSON.stringify(staleJob));

  const loaded = readWritersRoomJob(id);
  assert.ok(loaded);
  assert.equal(loaded.status, 'interrupted');
  assert.ok(loaded.error.includes('server restarted'));
});

test('runWritersRoom respects cancelled signal', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 3, maxModelCalls: 20, passThreshold: 90 };

  const controller = new AbortController();
  let started = false;
  const deps = {
    retentionCritic: async () => { started = true; await new Promise(r => setTimeout(r, 50)); return mockCritique('retention', 95, []); },
    factCritic: async () => mockCritique('fact', 95, []),
    toneCritic: async () => mockCritique('tone', 95, []),
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => ({ scenePlan: plan, diffs: [], repairedSceneIds: [], notes: [] }),
  };

  const promise = runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
    signal: controller.signal,
  });

  await new Promise(r => setTimeout(r, 10));
  controller.abort();

  const result = await promise;
  assert.equal(result.status, 'cancelled');
  assert.ok(result.stopReason.includes('Cancelled'));
});

test('runWritersRoom continues from initialPasses and initialModelCalls', async () => {
  const plan = makePlan();
  const models = { critic: 'test-critic', fixer: 'test-fixer' };
  const apiKeys = { critic: 'key', fixer: 'key' };
  const options = { maxPasses: 4, maxModelCalls: 30, passThreshold: 90 };

  const initialPass = {
    pass: 1,
    kind: 'main',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    critiques: [
      mockCritique('retention', 85, [mockFinding('f1', 'retention', 'minor', 'pacing')]),
      mockCritique('fact', 85, [mockFinding('f1', 'fact', 'minor', 'pacing')]),
      mockCritique('tone', 85, []),
    ],
    mergedFindings: [mockFinding('f1', 'retention', 'minor', 'pacing')],
    score: 85,
    decision: 'repair',
    repairedSceneIds: ['s1'],
    diffs: [{ sceneId: 's1', beforeNarration: 'old', afterNarration: 'new', chapter: 'Hook' }],
    notes: ['Repaired'],
  };

  let criticCalls = 0;
  const deps = {
    retentionCritic: async () => { criticCalls++; return mockCritique('retention', criticCalls === 1 ? 95 : 95, criticCalls === 1 ? [mockFinding('f1', 'retention', 'minor', 'pacing')] : []); },
    factCritic: async () => { criticCalls++; return mockCritique('fact', criticCalls === 1 ? 95 : 95, criticCalls === 1 ? [mockFinding('f1', 'fact', 'minor', 'pacing')] : []); },
    toneCritic: async () => { criticCalls++; return mockCritique('tone', 95, []); },
    freshEyesCritic: async () => mockCritique('fresh_eyes', 95, []),
    fixer: async () => ({ scenePlan: plan, diffs: [], repairedSceneIds: [], notes: [] }),
  };

  const result = await runWritersRoom({
    scenePlan: plan,
    channelName: 'Test',
    channelGuidance: 'Test guidance',
    models,
    apiKeys,
    options,
    deps,
    initialPasses: [initialPass],
    initialModelCalls: 4,
  });

  assert.equal(result.status, 'approved');
  assert.ok(criticCalls >= 3);
  assert.ok(result.passes.length >= 2);
  assert.equal(result.passes[0].pass, 1);
  assert.equal(result.passes[1].pass, 2);
});