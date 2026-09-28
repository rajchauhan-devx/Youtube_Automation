import fs from 'node:fs';
import path from 'node:path';
import { listAccounts, atomicJson } from '../dist/services/accounts.js';
import { workspaceContext, workspaceDir } from '../dist/services/workspace.js';
import { store } from '../dist/services/store.js';
import { SHORTS_MEDIA_TEMPLATE, LEGACY_SHORTS_MEDIA_TEMPLATE } from '../dist/services/shorts-media.js';

// Upgrade only our original prompt; leave narration, media and custom templates intact.
for (const account of listAccounts()) {
  workspaceContext.run({ accountId: account.id, profile: 'shorts' }, () => {
    const script = store.getById('scripts', 'shorts_images_videos');
    const isOriginal = prompt => prompt.content?.replace(/\r/g, '') === LEGACY_SHORTS_MEDIA_TEMPLATE.replace(/\r/g, '');
    if (!script?.prompts?.some(isOriginal) && !(script?.model === 'ollama/qwen3.5:4b' && script.prompts?.some(prompt => prompt.content === SHORTS_MEDIA_TEMPLATE))) return;
    const backup = path.join(workspaceDir(), 'backups', 'shorts-template-before-v2.json');
    if (!fs.existsSync(backup)) atomicJson(backup, script);
    store.add('scripts', { ...script, ...(script.model === 'ollama/qwen3.5:4b' ? { model: 'gemini-3.6-flash' } : {}), prompts: script.prompts.map(prompt => isOriginal(prompt) ? { ...prompt, content: SHORTS_MEDIA_TEMPLATE } : prompt) });
    store.add('template_migrations', { id: 'shorts-media-v2' });
    console.log(`Updated the Shorts production template for ${account.name}. Existing episode assets retained.`);
  });
}
