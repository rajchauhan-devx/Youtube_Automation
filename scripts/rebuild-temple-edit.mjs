import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from '../server/node_modules/dotenv/lib/main.js';
import sharp from 'sharp';
dotenv.config({ path: path.resolve('server/.env'), quiet: true });
const { current, nextRevision, publish, saveAsset } = await import('../server/dist/services/editing/repository.js');
const { sceneNarration } = await import('../server/dist/services/editing/motionPackArtifacts.js');
const { compileEditorial } = await import('../server/dist/services/editing/editorial.js');
const { previewFrames } = await import('../server/dist/services/editing/renderer.js');
const { reviewGraphics } = await import('../server/dist/services/editing/visualReview.js');
const { motionModel } = await import('../server/dist/services/editing/motionProvider.js');
const { workspaceContext } = await import('../server/dist/services/workspace.js');
const { validateProject } = await import('@tubeflow/editing-contracts');
const out = path.resolve('artifacts/temple-edit-audit'); fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'project-candidate.json');
await workspaceContext.run({ accountId: 'default', profile: 'shorts' }, async () => {
  const original = current('cd73befa-e66b-4dff-a876-095a23f5adc0');
  const context = { signal: AbortSignal.timeout(1800000), maxCalls: 24, persist() {},
    job: { id: randomUUID(), operation: 'review', usage: [] }, stage: message => console.log(message) };
  if (process.argv.includes('--review')) {
    const candidate = validateProject(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (candidate.parentRevisionId !== original.revisionId) throw new Error('The project changed after the preview; refusing to replace it.');
    await reviewGraphics(candidate, context, motionModel(candidate.settings.aiModel), candidate.artifacts.map(a => a.id), [], () => fs.writeFileSync(file, JSON.stringify(candidate, null, 2)));
    fs.writeFileSync(path.join(out, 'candidate-review.json'), JSON.stringify({ usage: context.job.usage,
      artifacts: candidate.artifacts.map(a => ({ id: a.id, enabled: a.enabled, review: a.visualReview })) }, null, 2));
    if (candidate.artifacts.some(a => !a.enabled || a.visualReview?.status !== 'passed')) throw new Error('Candidate has not passed review. It was not published.');
    candidate.status = 'ready'; publish(candidate, original.revisionId);
    console.log(JSON.stringify({ published: candidate.revisionId })); return;
  }
  const p = nextRevision(original); p.artifacts = []; p.diagnostics = []; p.status = 'draft';
  p.style.colors = { background: '#101820', text: '#f4eee5', accent: '#d7aa62' };
  p.style.direction = 'Full-bleed documentary footage and purposeful editorial motion sequences. Separate isolated subjects, coordinated reveals, generous typography, warm stone/gold with charcoal blue. No photographic stickers.';
  const assetBytes = fs.readFileSync('assets/motion/temple/granite-on-rollers-v1.png');
  const meta = await sharp(assetBytes).metadata();
  if (!meta.hasAlpha) throw new Error('The illustration must have genuine alpha');
  const asset = saveAsset(assetBytes, { mime: 'image/png', width: meta.width, height: meta.height, alpha: true,
    method: 'generate', providerVersion: 'built-in-imagegen', attribution: 'AI-generated illustrative engineering prop, not archaeological evidence' });
  p.assetIds.push(asset.id);
  const plans = [
    { scene: 0, template: 'impact', headline: 'बिना आधुनिक क्रेन', kicker: 'बृहदीश्वर मंदिर', facts: [{ value: '80', label: 'टन का पत्थर' }], disclosure: '' },
    { scene: 2, template: 'measure', headline: 'शिखर का पैमाना', kicker: 'आकार और भार', facts: [{ value: '216', label: 'फीट ऊँचा मंदिर' }, { value: '80,000', label: 'किलो का शिखर पत्थर' }], disclosure: 'सांकेतिक पैमाना' },
    { scene: 5, template: 'process', headline: 'मिट्टी का रैंप', kicker: 'ऊपर तक पहुँचने का रास्ता', facts: [{ value: '6', label: 'किलोमीटर लंबा रैंप' }], disclosure: 'सांकेतिक पुनर्निर्माण · पैमाने पर नहीं' },
    { scene: 7, template: 'assembly', headline: 'पत्थर से पत्थर का जोड़', kicker: 'इंटरलॉकिंग निर्माण', facts: [{ value: 'बिना सीमेंट या गारे', label: '' }], disclosure: 'तकनीक का सांकेतिक चित्र' },
  ];
  for (const plan of plans) {
    const { scene: index, ...sequence } = plan, scene = p.scenes[index];
    const artifact = await compileEditorial(p, { sceneId: scene.id, kind: 'composition', title: `${sequence.template}-${scene.id}`, detail: '',
      quote: sceneNarration(p, scene.id), target: '', sequence: { ...sequence, direction: sequence.template === 'process' ? 'incline' : 'horizontal' } }, context);
    if (sequence.template === 'process') artifact.graphic.composition.editorial.subjectAssetId = asset.id;
    p.artifacts.push(artifact);
  }
  p.sceneOutcomes = p.scenes.map(s => ({ sceneId: s.id, state: p.artifacts.some(a => a.sceneId === s.id) ? 'complete' : 'not_needed',
    reason: 'Purposeful editorial sequence or clean full-bleed footage.', artifactIds: p.artifacts.filter(a => a.sceneId === s.id).map(a => a.id) }));
  validateProject(p); fs.writeFileSync(file, JSON.stringify(p, null, 2));
  const previews = await previewFrames(p, context.signal);
  fs.writeFileSync(path.join(out, 'candidate-previews.json'), JSON.stringify(previews, null, 2));
  if (previews.some(item => item.findings.length)) throw new Error('Candidate typography/bounds checks failed. Inspect candidate-previews.json.');
  console.log(JSON.stringify({ candidateRevision: p.revisionId, previews: previews.length, artifacts: p.artifacts.map(a => ({ id: a.id, start: a.startFrame, end: a.endFrame })) }));
});
