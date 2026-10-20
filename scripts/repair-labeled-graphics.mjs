import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import dotenv from '../server/node_modules/dotenv/lib/main.js';

dotenv.config({ path: path.resolve('server/.env'), quiet: true });
const [projectId, ...artifactIds] = process.argv.slice(2);
if (!projectId || !artifactIds.length) throw new Error('Usage: node scripts/repair-labeled-graphics.mjs <projectId> <artifactId...>');
const { workspaceContext } = await import('../server/dist/services/workspace.js');
const { current, nextRevision, publish, projectDir } = await import('../server/dist/services/editing/repository.js');
const { reviewGraphics } = await import('../server/dist/services/editing/visualReview.js');
const { motionModel } = await import('../server/dist/services/editing/motionProvider.js');
const { reflowDiagram } = await import('../server/dist/services/editing/reflowDiagram.js');
const { DiagramReflow } = await import('@tubeflow/editing-contracts');
const { inspectDiagramCrop } = await import('../server/dist/services/editing/reflowDiagram.js');
await workspaceContext.run({ accountId: process.env.REPAIR_ACCOUNT || 'default', profile: process.env.REPAIR_PROFILE || 'shorts' }, async () => {
  const original = current(projectId);
  const draftFile = path.join(projectDir(projectId), 'native-label-repair-draft.json');
  const draft = process.env.REUSE_REPAIR_DRAFT && fs.existsSync(draftFile) ? JSON.parse(fs.readFileSync(draftFile, 'utf8')) : null;
  if (draft && draft.previousRevision !== original.revisionId) throw new Error('Repair draft is stale; inspect the current project before rebuilding.');
  const project = draft?.project || nextRevision(original);
  for (const id of artifactIds) {
    const artifact = project.artifacts.find(a => a.id === id);
    if (!artifact?.graphic?.composition) throw new Error(`No image composition: ${id}`);
    delete artifact.visualReview;
    const scene = project.scenes.find(s => s.id === artifact.sceneId);
    scene.framing = 'contain';
    scene.camera = scene.camera.map(key => ({ ...key, x: 0, y: 0, scale: 1 }));
  }
  const report = { projectId, previousRevision: original.revisionId, revisionId: project.revisionId, usage: [] };
  const context = { signal: AbortSignal.timeout(600000), maxCalls: artifactIds.length * 7,
    job: { id: randomUUID(), operation: 'review', usage: report.usage }, persist() {},
    stage: message => console.log(message) };
  const layouts = process.env.REPAIR_LAYOUT_JSON ? JSON.parse(fs.readFileSync(process.env.REPAIR_LAYOUT_JSON, 'utf8')) : null;
  if (layouts) {
    for (const id of artifactIds) {
      const artifact = project.artifacts.find(a => a.id === id), composition = artifact.graphic.composition;
      const diagram = DiagramReflow.parse(layouts[id]);
      const check = await inspectDiagramCrop(context, motionModel(project.settings.aiModel), composition.layers[0].assetId, diagram.sourceCrop);
      if (check.residualText.length) throw new Error(`Clean diagram region still contains annotation text: ${check.residualText.join('; ')}`);
      composition.diagram = diagram; composition.layout = 'cutaway'; composition.emphasis = 'none';
      artifact.graphic.bounds = { x: 0, y: 0, width: project.inputs.width, height: project.inputs.height };
      delete artifact.graphic.target;
      Object.assign(composition.layers[0], { crop: diagram.sourceCrop, fit: 'contain', motion: 'hold', delay: 0, rotation: 0 });
      delete composition.layers[0].preserveSource;
    }
  } else if (!draft) for (const id of artifactIds) await reflowDiagram(project, project.artifacts.find(a => a.id === id), context, motionModel(project.settings.aiModel));
  fs.writeFileSync(draftFile, JSON.stringify({ previousRevision: original.revisionId, project }, null, 2));
  await reviewGraphics(project, context, motionModel(project.settings.aiModel), artifactIds, [], () => {});
  report.reviews = project.artifacts.filter(a => artifactIds.includes(a.id)).map(a => ({ id: a.id, enabled: a.enabled, review: a.visualReview }));
  if (report.reviews.some(a => !a.enabled || a.review?.status !== 'passed')) throw new Error(`Repair did not pass rendered review: ${JSON.stringify(report.reviews)}`);
  project.diagnostics.push({ severity: 'info', code: 'SOURCE_LABELS_PRESERVED', stage: 'review',
    message: 'Diagram text, numbered pointers and leader lines rebuilt as native graphics in the saved output orientation.', retryable: false });
  publish(project, original.revisionId);
  const file = path.join(projectDir(projectId), `label-repair-${project.revisionId}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: file, revisionId: project.revisionId, reviews: report.reviews }));
});
