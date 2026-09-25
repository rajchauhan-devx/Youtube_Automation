import { generatedDir, workspaceKey, currentWorkspace } from '../services/workspace.js';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { store } from '../services/store.js';
import { sanitizeSegment } from '../services/comfyui.js';
import { clearScriptVideo } from './render.js';
import { cancelNarration } from '../services/long-narration.js';
import { validateScenePlan } from '../services/scene-plan.js';
import { validateEditingSettings } from '../services/auto-edit.js';
import { cancelMusic } from '../services/local-music.js';
import { deleteScriptEditing } from '../services/editing/scheduler.js';
import { validatePresenter } from '../services/presenter-settings.js';

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

scriptsRouter.put('/:id', async (req, res) => {
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
  const reset = req.body?.aiResponse === '' || responseReplaced;
  if (req.body?.scenePlan) {
    try { validateScenePlan(req.body.scenePlan); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scene plan' }); return; }
  }
  const sceneChanged = currentWorkspace().profile !== 'shorts' && ['scenePlan', 'narration'].some(key => key in (req.body || {}) && JSON.stringify(req.body[key]) !== JSON.stringify((existing as any)[key]));
  if (reset || sceneChanged) {
    try { await cancelMusic(req.params.id); await cancelNarration(req.params.id); await clearScriptVideo(req.params.id); }
    catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Could not clear video' }); return; }
  }
  const scope = currentWorkspace();
  const updated = { ...existing, ...req.body, id: req.params.id, accountId: scope.accountId, section: scope.profile };
  if (reset) {
    delete updated.generatedMusic;
    for (const key of ['timelineConfig', 'sceneAnalysis', 'youtubeExport', 'scenePlan']) delete updated[key];
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
  if (sceneChanged) { updated.generatedAudio = []; delete updated.timelineConfig; delete updated.youtubeExport; delete updated.generatedMusic; }
  store.add('scripts', updated);
  res.json(updated);
});

scriptsRouter.delete('/:id', async (req, res) => {
  try { await deleteScriptEditing(req.params.id); await cancelMusic(req.params.id); await cancelNarration(req.params.id); await clearScriptVideo(req.params.id); }
  catch (error) { res.status(500).json({ error: error instanceof Error ? error.message : 'Could not clear video' }); return; }
  const scriptId = sanitizeSegment(req.params.id);
  store.remove('scripts', req.params.id);
  store.set(`pipeline_${req.params.id}`, []);

  // Delete generated images folder for this script if it exists
  if (scriptId) {
    const dirPath = path.join(generatedDir(), scriptId);
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete generated images folder for ${scriptId}:`, err);
      }
    }
  }

  res.json({ ok: true });
});

scriptsRouter.get('/:id/pipeline', (req, res) => {
  const pipelines = store.get<any>(`pipeline_${req.params.id}`);
  res.json(pipelines);
});

scriptsRouter.post('/:id/pipeline', (req, res) => {
  store.set(`pipeline_${req.params.id}`, req.body);
  res.json({ ok: true });
});
