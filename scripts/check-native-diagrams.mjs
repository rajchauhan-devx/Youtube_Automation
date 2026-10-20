import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { current } from '../server/dist/services/editing/repository.js';
import { renderSession } from '../server/dist/services/editing/renderer.js';
import { workspaceContext } from '../server/dist/services/workspace.js';
import { renderStill } from '@remotion/renderer';

const projectId = process.argv[2];
if (!projectId) throw new Error('Usage: node scripts/check-native-diagrams.mjs <projectId>');
await workspaceContext.run({ accountId: process.env.REPAIR_ACCOUNT || 'default', profile: process.env.REPAIR_PROFILE || 'shorts' }, async () => {
  const saved = current(projectId);
  const output = path.resolve('artifacts/native-diagram-qa'); fs.mkdirSync(output, { recursive: true });
  const report = [];
  for (const [format, width, height] of [['portrait', 1080, 1920], ['landscape', 1920, 1080]]) {
    const project = structuredClone(saved);
    project.inputs.width = width; project.inputs.height = height;
    project.artifacts = project.artifacts.filter(a => a.enabled && (a.graphic?.composition?.diagram || a.graphic?.composition?.editorial));
    assert.ok(project.artifacts.length, 'No native diagrams in the selected revision');
    for (const artifact of project.artifacts) artifact.graphic.bounds = { x: 0, y: 0, width, height };
    const session = await renderSession(project, AbortSignal.timeout(180000));
    try {
      for (const artifact of project.artifacts) for (const phase of [0.5, 0.85]) {
        const frame = Math.floor(artifact.startFrame + (artifact.endFrame - artifact.startFrame) * phase);
        const file = path.join(output, `${format}-${artifact.id}-${phase}.png`);
        const findings = [];
        await renderStill({ ...session, frame, output: file, imageFormat: 'png', scale: 0.5,
          onBrowserLog: log => { if (log.text.startsWith('EDITING_QA:')) findings.push(log.text); } });
        assert.deepEqual(findings, [], `${format}/${artifact.id}: native text overflow`);
        report.push({ format, frame, file, findings });
      }
    } finally { session.close(); }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ projectId, revisionId: saved.revisionId, renders: report }, null, 2));
  console.log(JSON.stringify(report));
});
