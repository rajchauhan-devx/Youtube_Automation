import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workspaceContext } from '../dist/services/workspace.js';
import { store } from '../dist/services/store.js';

const id = 'ancient_dharma_long_sync_v1';
const content = fs.readFileSync(fileURLToPath(new URL('../../docs/ancient-dharma-long-template.md', import.meta.url)), 'utf8');
workspaceContext.run({ accountId: 'default', profile: 'long' }, () => {
  if (store.getById('scripts', id)) { console.log('Long Video template already exists; no changes made.'); return; }
  store.add('scripts', {
    id, accountId: 'default', section: 'long', name: 'Ancient Dharma Long — Narration Sync',
    lastUsed: 'Never', status: 'draft', locked: false, duration: 900, model: 'gemini-3.6-flash',
    howItWorks: 'Enter a topic and source material. Generate the structured episode, Extract Assets, generate scene images and synchronized narration, review the scene boundaries, then render in landscape.',
    prompts: [{ id: 'long_sync_prompt', name: 'Long Video master prompt', type: 'Custom', content }],
    pipeline: [{ id: 'response', label: 'Response', status: 'pending', summary: 'Waiting to start', inputLog: '', outputPreview: '' }],
  });
  console.log('Created Ancient Dharma Long — Narration Sync in the default account Long Video section.');
});
