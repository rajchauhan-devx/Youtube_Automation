import { fixture as legacyFixture } from './fixtures.mjs';
import { motionProject } from '@tubeflow/editing-contracts';
import { nextRevision, publish } from '../../server/dist/services/editing/repository.js';
import { compileGraphic } from '../../server/dist/services/editing/motionPackArtifacts.js';
export async function fixture(theme = 'museum', portrait = false, empty = false, kind = 'title') {
  const base = await legacyFixture(theme, portrait, true);
  const p = motionProject(nextRevision(base));
  p.settings.aiModel = 'gemini-fixture';
  if (!empty) {
    const title = theme === 'science' ? 'पानी का परिवर्तन' : 'Bronze statue';
    const quote = theme === 'science' ? 'पानी गर्म होता है।' : 'a bronze statue and its hand';
    const target = kind === 'spotlight' ? { label: 'bronze statue', region: { x: 0.50, y: 0.35, width: 0.09, height: 0.1 }, evidence: 'Synthetic fixture region', verified: true } : undefined;
    p.artifacts = [compileGraphic(p, { sceneId: p.scenes[0].id, kind, title, detail: theme === 'science' ? 'Water becomes vapor' : 'A story in bronze', target: target?.label || '', quote }, target, 'explanation')];
  }
  p.sceneOutcomes = p.scenes.map(s => ({ sceneId: s.id, state: empty ? 'not_needed' : 'complete', reason: empty ? 'Clean scene.' : 'Fixture graphic.', artifactIds: p.artifacts.filter(a => a.sceneId === s.id).map(a => a.id) }));
  publish(p, base.revisionId);
  return p;
}
