import { Router } from 'express';
import { checkSceneVisualQA, auditScriptVisualsQA } from '../services/vision-qa.js';
import { auditNarrationScenesQA, validateNarrationScript } from '../services/tts-qa.js';

export const visionQaRouter = Router();

visionQaRouter.post('/narration-check', (req, res) => {
  const { text, language = 'hi', isShorts = false } = req.body || {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text string is required' });
    return;
  }
  const result = validateNarrationScript(text, language, Boolean(isShorts));
  res.json(result);
});

visionQaRouter.post('/audit-narration', (req, res) => {
  const { scenes, language = 'hi', isShorts = false } = req.body || {};
  if (!Array.isArray(scenes)) {
    res.status(400).json({ error: 'scenes array is required' });
    return;
  }
  const result = auditNarrationScenesQA(scenes, language, Boolean(isShorts));
  res.json(result);
});

visionQaRouter.post('/check', async (req, res) => {
  const { imagePath, sceneDescription, eraSetting, characterNames } = req.body || {};

  if (!imagePath || typeof imagePath !== 'string') {
    res.status(400).json({ error: 'imagePath is required' });
    return;
  }

  try {
    const result = await checkSceneVisualQA({
      imagePath,
      sceneDescription: sceneDescription || '',
      eraSetting,
      characterNames,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

visionQaRouter.post('/audit-script', async (req, res) => {
  const { scriptId, imagePaths } = req.body || {};

  if (!scriptId || !Array.isArray(imagePaths)) {
    res.status(400).json({ error: 'scriptId and imagePaths array are required' });
    return;
  }

  try {
    const result = await auditScriptVisualsQA({
      scriptId,
      imagePaths,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
