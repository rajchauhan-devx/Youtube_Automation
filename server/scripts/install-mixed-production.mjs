import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workspaceContext } from '../dist/services/workspace.js';
import { store } from '../dist/services/store.js';
import { editingPreset } from '../dist/services/auto-edit.js';

const id = 'ancient_dharma_mixed_production_15m_v1';
const content = fs.readFileSync(fileURLToPath(new URL('../../docs/ancient-dharma-mixed-production.md', import.meta.url)), 'utf8');
workspaceContext.run({ accountId: 'default', profile: 'mixed' }, () => {
  if (store.getById('scripts', id)) { console.log('Mixed Media production template already exists; no changes made.'); return; }
  store.add('scripts', {
    id, accountId: 'default', section: 'mixed', name: 'Ancient Dharma — Mixed Production · 15 min max',
    lastUsed: 'Never', status: 'draft', locked: false, duration: 900, maxDurationSeconds: 900, model: 'gemini-3.6-flash',
    howItWorks: 'Enter an episode topic and source material. Generate and preview a complete Hindi documentary combining images and fixed 10-second videos. Extract scenes, copy the prompts, generate media online and import it in order. Generate synchronized narration; the finished episode is capped at 15 minutes. Review and render with the saved Clean Studio editing preset.',
    editing: editingPreset('clean'),
    prompts: [{ id: 'mixed_production_master', name: 'Ancient Dharma mixed-media production master', type: 'Custom', content }],
    pipeline: [{ id: 'response', label: 'Response', status: 'pending', summary: 'Ready for an episode topic', inputLog: '', outputPreview: '' }],
  });
  console.log('Saved Ancient Dharma — Mixed Production · 15 min max in My Channel / Mixed Media.');
});
