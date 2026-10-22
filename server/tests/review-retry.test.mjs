import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { providerRetrySeconds } from '../dist/services/review-retry.js';
const code = ts.transpileModule(fs.readFileSync(new URL('../../src/services/renderReview.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { hasCaptionBlocker, reviewBlockerMessage, waitForRenderedReview } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('caption blockers require a new render and errors highlight actionable findings', () => {
  const review = { status: 'blocked', summary: 'Batch 1: No defects. Batch 2: Caption issue.', findings: [
    { severity: 'note', category: 'captioning', detail: 'Minor issue at 10.85s.' },
    { severity: 'blocker', category: 'Captions', detail: 'At 60.02s the text is unreadable.' },
  ] };
  assert.equal(hasCaptionBlocker(review), true);
  assert.equal(reviewBlockerMessage(review), 'Final review needs attention: Captions: At 60.02s the text is unreadable.');
  assert.equal(hasCaptionBlocker({ ...review, status: 'passed' }), false);
  assert.equal(hasCaptionBlocker({ ...review, findings: [{ severity: 'blocker', category: 'Audio', detail: 'Silence at 5s.' }] }), false);
  assert.equal(hasCaptionBlocker({ ...review, findings: [review.findings[0]] }), false);
  assert.equal(hasCaptionBlocker(undefined), false);
});

test('review waits honor Retry-After seconds, dates and Gemini retry details', () => {
  assert.equal(providerRetrySeconds(new Response('', { headers: { 'retry-after': '95' } }), null), 95);
  assert.equal(providerRetrySeconds(new Response('', { headers: { 'retry-after': new Date(120000).toUTCString() } }), null, 0, 0), 120);
  assert.equal(providerRetrySeconds(new Response(''), { error: { details: [{ retryDelay: '83.5s' }] } }), 84);
  assert.equal(providerRetrySeconds(new Response(''), null, 3), 240);
});
test('autopilot keeps its current MP4 and waits automatically through 429, then returns the actual review', async () => {
  const requests = [], messages = []; let seconds = 0;
  const result = await waitForRenderedReview({ scriptId: 'story', videoFilename: 'completed.mp4', apiKey: 'test',
    signal: new AbortController().signal, checkPause: async () => {}, status: m => messages.push(m),
    sleep: async ms => { seconds += ms / 1000; },
    fetcher: async (_, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1) return Response.json({ retryable: true, retryAfterSeconds: 75, completedBatches: 2, totalBatches: 5 }, { status: 429 });
      return Response.json({ review: { status: 'passed' } });
    } });
  assert.equal(result.review.status, 'passed');
  assert.equal(seconds, 75);
  assert.deepEqual(requests[0], requests[1], 'no regeneration or rerender after rate limiting');
  assert.match(messages[0], /2\/5 batches saved/);
});
test('quality failures are not retried and a provider cooldown remains cancellable', async () => {
  let requests = 0;
  const base = { scriptId: 'story', videoFilename: 'completed.mp4', apiKey: '', signal: new AbortController().signal,
    checkPause: async () => {}, status: () => {}, sleep: async () => {} };
  await assert.rejects(waitForRenderedReview({ ...base, fetcher: async () => {
    requests++; return Response.json({ error: 'Wrong production' }, { status: 422 });
  } }), /Wrong production/);
  assert.equal(requests, 1);
  const controller = new AbortController();
  await assert.rejects(waitForRenderedReview({ ...base, signal: controller.signal,
    sleep: async () => controller.abort(new Error('Cancelled by user')),
    fetcher: async () => Response.json({ retryable: true }, { status: 429 }) }), /Cancelled by user/);
});
