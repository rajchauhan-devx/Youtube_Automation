import { Router } from 'express';
import {
  detectPopupsForScript,
  generatePopupImage,
  updatePopupAsset,
  deletePopupAsset,
  addCustomPopupAsset,
  saveUploadedPopupImage,
} from '../services/extra-popups-engine.js';
import { store } from '../services/store.js';

export const extraPopupsRouter = Router();

extraPopupsRouter.get('/:scriptId', (req, res) => {
  const { scriptId } = req.params;
  const script = store.getById<any>('scripts', scriptId);
  if (!script) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }
  res.json({ popups: script.extraPopups || [] });
});

extraPopupsRouter.post(['/detect', '/detect/:scriptId'], async (req, res) => {
  const scriptId = req.params.scriptId || req.body?.scriptId;
  const { apiKey } = req.body || {};
  if (!scriptId) {
    res.status(400).json({ error: 'scriptId is required' });
    return;
  }

  try {
    const popups = await detectPopupsForScript(scriptId, apiKey);
    res.json({ success: true, popups });
  } catch (err: any) {
    console.error('[extra-popups] detection failed:', err);
    res.status(500).json({ error: err?.message || 'Detection failed' });
  }
});

extraPopupsRouter.post('/generate', async (req, res) => {
  const { scriptId, popupId, prompt, provider, modelName, seed } = req.body || {};
  if (!scriptId || !popupId) {
    res.status(400).json({ error: 'scriptId and popupId are required' });
    return;
  }

  try {
    const updated = await generatePopupImage({
      scriptId,
      popupId,
      prompt,
      provider,
      modelName,
      seed,
    });
    res.json({ success: true, popup: updated });
  } catch (err: any) {
    console.error('[extra-popups] generation failed:', err);
    res.status(500).json({ error: err?.message || 'Generation failed' });
  }
});

extraPopupsRouter.post(['/generate-all', '/generate-all/:scriptId'], async (req, res) => {
  const scriptId = req.params.scriptId || req.body?.scriptId;
  const { provider, modelName } = req.body || {};
  if (!scriptId) {
    res.status(400).json({ error: 'scriptId is required' });
    return;
  }

  const script = store.getById<any>('scripts', scriptId);
  if (!script) {
    res.status(404).json({ error: 'Script not found' });
    return;
  }

  const popups = (script.extraPopups || []).filter(
    (p: any) => p.status === 'pending' || p.status === 'error' || !p.imageUrl
  );

  const results: any[] = [];
  const errors: any[] = [];

  for (const p of popups) {
    try {
      const generated = await generatePopupImage({
        scriptId,
        popupId: p.id,
        prompt: p.prompt,
        provider,
        modelName,
      });
      results.push(generated);
    } catch (err: any) {
      errors.push({ id: p.id, error: err?.message || 'Failed' });
    }
  }

  const updatedScript = store.getById<any>('scripts', scriptId);
  res.json({
    success: true,
    completed: results.length,
    failed: errors.length,
    popups: updatedScript?.extraPopups || [],
    errors,
  });
});

extraPopupsRouter.post('/custom', (req, res) => {
  const { scriptId, popup } = req.body || {};
  if (!scriptId || !popup) {
    res.status(400).json({ error: 'scriptId and popup data are required' });
    return;
  }

  try {
    const created = addCustomPopupAsset(scriptId, popup);
    res.json({ success: true, popup: created });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create popup' });
  }
});

extraPopupsRouter.put('/update', (req, res) => {
  const { scriptId, popup } = req.body || {};
  if (!scriptId || !popup || !popup.id) {
    res.status(400).json({ error: 'scriptId and valid popup with id are required' });
    return;
  }

  try {
    const updated = updatePopupAsset(scriptId, popup);
    res.json({ success: true, popup: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Update failed' });
  }
});

extraPopupsRouter.delete('/:scriptId/:popupId', (req, res) => {
  const { scriptId, popupId } = req.params;
  try {
    deletePopupAsset(scriptId, popupId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Delete failed' });
  }
});

extraPopupsRouter.post('/upload', (req, res) => {
  const { scriptId, popupId, base64Data } = req.body || {};
  if (!scriptId || !popupId || !base64Data) {
    res.status(400).json({ error: 'scriptId, popupId, and base64Data are required' });
    return;
  }

  try {
    const updated = saveUploadedPopupImage(scriptId, popupId, base64Data);
    res.json({ success: true, popup: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Upload failed' });
  }
});
