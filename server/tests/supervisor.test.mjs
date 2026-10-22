import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { diagnoseAndHealError, executeSupervisedStage } = await tsImport('../../src/services/supervisor.ts', import.meta.url);
const originalStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: () => '' };
test.after(() => { globalThis.localStorage = originalStorage; });
const failure = 'Rendered vision review has not passed for 2 motion graphic(s). Retry visual review before exporting.';
function setup({ recoveryFails = false, unreviewed = false } = {}) {
  const requests = [], logs = [];
  let recovered = false;
  const job = { id: 'saved-job', revisionId: 'draft', operation: 'generate', state: 'failed', error: failure, updatedAt: '2026-10-21T12:00:00Z' };
  const context = { scriptId: 'script', section: 'shorts', addLog: (_, text) => logs.push(text), setStatus() {}, patchScript() {},
    async persistScript() {}, async checkPauseOrAbort() {},
    fetch: async (url, options) => {
      requests.push([url, options?.method || 'GET']);
      if (url === '/api/scripts/script') return Response.json({ editingProjectId: 'saved-project' });
      if (url === '/api/editing/projects/saved-project') return Response.json({ stale: false, jobs: [job], project: {
        revisionId: recovered ? 'reviewed' : 'draft', settings: { visualReview: true },
        artifacts: recovered ? [{ enabled: true, graphic: { kind: 'composition' }, visualReview: { status: unreviewed ? 'unavailable' : 'passed' } }] : [],
      } });
      if (url === '/api/editing/jobs/saved-job/resume') return Response.json({ ...job, state: 'queued' });
      if (url === '/api/editing/jobs/saved-job') {
        recovered = true;
        return Response.json({ ...job, state: recoveryFails ? 'failed' : 'partial', error: recoveryFails ? 'Visible text is still clipped at frame 36.' : undefined });
      }
      throw new Error(`Unexpected recovery request: ${url}`);
    } };
  return { context, requests, logs };
}
test('supervisor resumes the saved visual job and verifies results before retrying the stage', async () => {
  const { context, requests, logs } = setup();
  let attempts = 0;
  const result = await executeSupervisedStage('plan_motion', async () => { if (++attempts === 1) throw new Error(failure); return 'complete'; }, context);
  assert.equal(result, 'complete'); assert.equal(attempts, 2);
  assert.ok(requests.some(([url]) => url.endsWith('/saved-job/resume')));
  assert.ok(requests.every(([url]) => !url.includes('/diagnose') && !url.endsWith('/generate')));
  assert.ok(logs.some(text => text.includes('Finished saved rendered visual checks')));
});
test('failed or still-unreviewed recovery never claims a repair or bypasses review', async () => {
  for (const options of [{ recoveryFails: true }, { unreviewed: true }]) {
    const { context, logs } = setup(options);
    let attempts = 0;
    await assert.rejects(executeSupervisedStage('plan_motion', async () => { attempts++; throw new Error(failure); }, context), /clipped|has not passed/);
    assert.equal(attempts, 1);
    assert.ok(logs.every(text => !text.includes('following autonomous repair')));
  }
});
test('an unrecoverable diagnosis is respected and an ordinary retry is not reported as a repair', async () => {
  const { context, logs } = setup();
  let action = 'unrecoverable';
  context.fetch = async () => Response.json({ recoveryAction: action, details: 'Requires a valid input.' });
  const result = await diagnoseAndHealError({ ...context, stage: 'research_script', attempt: 1, error: 'Invalid input.' });
  assert.equal(result.healed, false);
  action = 'retry_stage';
  let calls = 0;
  await executeSupervisedStage('research_script', async () => { if (!calls++) throw new Error('Temporary failure.'); }, context);
  assert.ok(logs.some(text => text.includes('No repair has been verified yet.')));
});
