import { generatedDir, currentWorkspace } from '../services/workspace.js';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'node:util';
import { store } from '../services/store.js';
import { sanitizeSegment } from '../services/comfyui.js';
import { clearScriptVideo } from './render.js';
import { cancelScriptImages } from './generate.js';
import { cancelNarration } from '../services/long-narration.js';
import { validateScenePlan, parseScenePlan, spokenText, normalizeNarration } from '../services/scene-plan.js';
import { validateEditingSettings } from '../services/auto-edit.js';
import { cancelMusic } from '../services/local-music.js';
import { deleteScriptEditing } from '../services/editing/scheduler.js';
import { validatePresenter } from '../services/presenter-settings.js';
import { SHORTS_MEDIA_TEMPLATE, LEGACY_SHORTS_MEDIA_TEMPLATE } from '../services/shorts-media.js';

export const scriptsRouter = Router();
scriptsRouter.param('id', (_req, res, next, value) => {
  if (!sanitizeSegment(value)) { res.status(400).json({ error: 'Invalid script ID' }); return; }
  next();
});

interface ScriptData {
  id: string;
  accountId?: string;
  section?: 'shorts' | 'long' | 'mixed';
  name: string;
  prompts: { id: string; content: string }[];
  content?: string;
  pipeline?: any[];
}

scriptsRouter.get('/', (_req, res) => {
  if (currentWorkspace().profile === 'shorts' && !store.getById('template_migrations', 'shorts-media-v4')) {
    const builtIn = store.getById<ScriptData>('scripts', 'shorts_images_videos');
    if (builtIn?.prompts.some(prompt => {
      const content = prompt.content.replace(/\r/g, '');
      return content === LEGACY_SHORTS_MEDIA_TEMPLATE.replace(/\r/g, '')
        || content.includes('Complete tagged production package · Version 2')
        || content.includes('Complete tagged production package · Version 3');
    })) {
      store.add('scripts', { ...builtIn, ...((builtIn as any).model === 'ollama/qwen3.5:4b' ? { model: 'gemini-3.6-flash' } : {}), prompts: builtIn.prompts.map(prompt => {
        const content = prompt.content.replace(/\r/g, '');
        const isLegacy = content === LEGACY_SHORTS_MEDIA_TEMPLATE.replace(/\r/g, '')
          || content.includes('Complete tagged production package · Version 2')
          || content.includes('Complete tagged production package · Version 3');
        return isLegacy ? { ...prompt, name: 'Shorts image and video scene prompts (Production V4)', content: SHORTS_MEDIA_TEMPLATE } : prompt;
      }) });
    }
    store.add('template_migrations', { id: 'shorts-media-v4' });
  }
  const scripts = store.get<ScriptData>('scripts');
  res.json(scripts);
});

scriptsRouter.get('/:id', (req, res) => {
  const script = store.getById<ScriptData>('scripts', req.params.id);
  if (!script) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  res.json(script);
});

scriptsRouter.post('/', (req, res) => {
  if (req.body?.videoImportsEnabled !== undefined && typeof req.body.videoImportsEnabled !== 'boolean') {
    res.status(400).json({ error: 'Video imports must be enabled or disabled.' }); return;
  }
  if (req.body?.presenter !== undefined) {
    try { req.body.presenter = validatePresenter(req.body.presenter); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid presenter' }); return; }
  }
  const script = (req.body || {}) as ScriptData;
  if (req.body?.maxDurationSeconds !== undefined && (!Number.isInteger(req.body.maxDurationSeconds) || req.body.maxDurationSeconds < 1 || req.body.maxDurationSeconds > 3600)) { res.status(400).json({ error: 'Maximum duration must be 1–3600 seconds.' }); return; }
  if (!sanitizeSegment(script.id) || typeof script.name !== 'string' || !script.name.trim()) {
    res.status(400).json({ error: 'Script must have id and name' });
    return;
  }
  if (store.getById('scripts', script.id)) { res.status(409).json({ error: 'Script already exists' }); return; }
  const scope = currentWorkspace();
  const saved = { ...script, accountId: scope.accountId, section: scope.profile };
  store.add('scripts', saved);
  res.status(201).json(saved);
});

scriptsRouter.put('/:id/spoken-script', async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 50000) {
    res.status(400).json({ error: 'Spoken script must contain 1–50,000 characters.' }); return;
  }
  const existing = store.getById<ScriptData & { scenePlan?: unknown; narration?: string }>('scripts', req.params.id);
  if (!existing) { res.status(404).json({ error: 'Script not found' }); return; }
  if (existing.scenePlan) { res.status(409).json({ error: 'Edit the narration in each scene so the scene plan stays synchronized.' }); return; }
  const narration = text.trim();
  if (narration === existing.narration) { res.json(existing); return; }
  try { await cancelMusic(req.params.id); await cancelNarration(req.params.id); await clearScriptVideo(req.params.id); }
  catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Could not clear the previous output.' }); return; }
  const scope = currentWorkspace();
  const updated = { ...existing, narration, extractedScript: narration, generatedAudio: [],
    timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined, generatedMusic: undefined,
    accountId: scope.accountId, section: scope.profile };
  store.add('scripts', updated);
  res.json(updated);
});

scriptsRouter.put('/:id', async (req, res) => {
  if (req.body?.name !== undefined && (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 150)) {
    res.status(400).json({ error: 'Script name must contain 1–150 characters.' }); return;
  }
  if (req.body?.prompts !== undefined && (!Array.isArray(req.body.prompts) || req.body.prompts.length < 1 || req.body.prompts.length > 50 ||
      req.body.prompts.some((prompt: any) => !prompt || typeof prompt.id !== 'string' || !prompt.id || typeof prompt.name !== 'string' || typeof prompt.content !== 'string' || prompt.content.length > 100000) ||
      new Set(req.body.prompts.map((prompt: any) => prompt.id)).size !== req.body.prompts.length)) {
    res.status(400).json({ error: 'Provide 1–50 valid prompt blocks with unique IDs.' }); return;
  }
  if (req.body?.howItWorks !== undefined && (typeof req.body.howItWorks !== 'string' || req.body.howItWorks.length > 10000)) {
    res.status(400).json({ error: 'Workflow description is too long.' }); return;
  }
  if (req.body?.videoImportsEnabled !== undefined && typeof req.body.videoImportsEnabled !== 'boolean') {
    res.status(400).json({ error: 'Video imports must be enabled or disabled.' }); return;
  }
  if (req.body?.presenter !== undefined) {
    try { req.body.presenter = validatePresenter(req.body.presenter); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid presenter' }); return; }
  }
  if (req.body?.maxDurationSeconds !== undefined && (!Number.isInteger(req.body.maxDurationSeconds) || req.body.maxDurationSeconds < 1 || req.body.maxDurationSeconds > 3600)) { res.status(400).json({ error: 'Maximum duration must be 1–3600 seconds.' }); return; }
  const existing = store.getById<ScriptData>('scripts', req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  // Both Clear and a new script run explicitly empty the AI response.
  if (req.body?.editing !== undefined) {
    try { validateEditingSettings(req.body.editing); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid editing settings' }); return; }
  }
  const responseReplaced = typeof req.body?.aiResponse === 'string' && (req.body.aiResponse !== (existing as any).aiResponse || req.body.extractedScript === '');
  let editedSceneResponse = false;
  if (responseReplaced && req.body?.scenePlan && req.body.aiResponse) {
    try {
      editedSceneResponse = isDeepStrictEqual(parseScenePlan(req.body.aiResponse), req.body.scenePlan)
        && normalizeNarration(req.body.narration || '') === normalizeNarration(spokenText(req.body.scenePlan));
    } catch { /* An unextracted replacement response must still reset assets. */ }
  }
  const reset = req.body?.aiResponse === '' || (responseReplaced && !editedSceneResponse);
  if (req.body?.scenePlan) {
    try { validateScenePlan(req.body.scenePlan); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scene plan' }); return; }
  }
  const sceneChanged = (currentWorkspace().profile !== 'shorts' || Boolean((existing as any).scenePlan) || Boolean(req.body?.scenePlan)) && ['scenePlan', 'narration'].some(key => key in (req.body || {}) && JSON.stringify(req.body[key]) !== JSON.stringify((existing as any)[key]));
  const mediaModeChanged = 'videoImportsEnabled' in (req.body || {}) && req.body.videoImportsEnabled !== (existing as any).videoImportsEnabled;
  if (reset || sceneChanged || mediaModeChanged) {
    try { await cancelMusic(req.params.id); await cancelNarration(req.params.id); await clearScriptVideo(req.params.id); }
    catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Could not clear video' }); return; }
  }
  const scope = currentWorkspace();
  const updated = { ...existing, ...req.body, id: req.params.id, accountId: scope.accountId, section: scope.profile };
  if (reset) {
    delete updated.generatedMusic;
    for (const key of ['timelineConfig', 'sceneAnalysis', 'youtubeExport', 'facebookExport', 'instagramExport', 'scenePlan']) delete updated[key];
    updated.generatedImages = [];
    updated.generatedAudio = [];
    if (responseReplaced) {
      updated.extractedScript = '';
      updated.imagePrompts = [];
      updated.narration = '';
    }
    if (updated.status === 'draft') { delete updated.topicName; delete updated.aiInstructions; }
    store.set(`pipeline_${req.params.id}`, []);
  }
  if (sceneChanged) { updated.generatedAudio = []; delete updated.timelineConfig; delete updated.youtubeExport; delete updated.facebookExport; delete updated.instagramExport; delete updated.generatedMusic; }
  if (mediaModeChanged) { delete updated.timelineConfig; delete updated.youtubeExport; delete updated.facebookExport; delete updated.instagramExport; }
  store.add('scripts', updated);
  res.json(updated);
});

async function deleteScriptOutputs(scriptId: string) {
  await cancelScriptImages(scriptId);
  await deleteScriptEditing(scriptId);
  await cancelMusic(scriptId);
  await cancelNarration(scriptId);
  await clearScriptVideo(scriptId);
  fs.rmSync(path.join(generatedDir(), scriptId), { recursive: true, force: true });
  store.delete(`pipeline_${scriptId}`);
}

scriptsRouter.post('/:id/clear', async (req, res) => {
  const existing = store.getById<ScriptData & Record<string, any>>('scripts', req.params.id);
  if (!existing) { res.status(404).json({ error: 'Script not found' }); return; }
  try {
    await deleteScriptOutputs(req.params.id);
    // Rebuild from template fields so no run data can survive a clear.
    const clean: Record<string, any> = {};
    for (const key of ['id', 'name', 'prompts', 'howItWorks', 'duration', 'model', 'locked',
      'videoImportsEnabled', 'enableSubtitles', 'presenter', 'maxDurationSeconds', 'editing', 'ttsVolume']) {
      if (key in existing) clean[key] = existing[key];
    }
    const scope = currentWorkspace();
    const saved = { ...clean, id: req.params.id, accountId: scope.accountId, section: scope.profile,
      status: 'draft', lastUsed: 'Never', aiResponse: '', extractedScript: '', narration: '',
      imagePrompts: [], generatedImages: [], generatedAudio: [], pipeline: [] };
    store.add('scripts', saved);
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not clear script data' });
  }
});

scriptsRouter.delete('/:id', async (req, res) => {
  if (!store.getById('scripts', req.params.id)) { res.status(404).json({ error: 'Script not found' }); return; }
  try {
    await deleteScriptOutputs(req.params.id);
    store.remove('scripts', req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not delete script' });
  }
});

scriptsRouter.get('/:id/pipeline', (req, res) => {
  if (!store.getById('scripts', req.params.id)) { res.status(404).json({ error: 'Script not found' }); return; }
  const pipelines = store.get<any>(`pipeline_${req.params.id}`);
  res.json(pipelines);
});

scriptsRouter.post('/:id/pipeline', (req, res) => {
  if (!store.getById('scripts', req.params.id)) { res.status(404).json({ error: 'Script not found' }); return; }
  store.set(`pipeline_${req.params.id}`, req.body);
  res.json({ ok: true });
});
