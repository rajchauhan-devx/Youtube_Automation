import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { checkBlenderStatus, renderBlenderScene } from '../services/blender.js';
import { generatedDir } from '../services/workspace.js';

export const blenderRouter = Router();

/**
 * GET /api/blender/status
 * Returns detection state, executable path, and version of Blender.
 */
blenderRouter.get('/status', async (_req, res) => {
  try {
    const status = await checkBlenderStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      installed: false,
      error: error instanceof Error ? error.message : 'Failed to probe Blender status',
    });
  }
});

/**
 * POST /api/blender/render
 * Triggers a headless 3D cross-section or 2D animation render for a scene.
 */
blenderRouter.post('/render', async (req, res) => {
  try {
    const { scriptId, sceneIndex = 0, action = 'drill_down', duration = 5.0, fps = 30 } = req.body || {};

    if (!scriptId) {
      res.status(400).json({ error: 'scriptId is required' });
      return;
    }

    const scriptDir = path.join(generatedDir(), scriptId);
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const outputFile = path.join(scriptDir, `blender_scene_${sceneIndex}.mp4`);

    const resultPath = await renderBlenderScene({
      action,
      durationSeconds: Number(duration) || 5.0,
      fps: Number(fps) || 30,
      outputPath: outputFile,
    });

    res.json({
      success: true,
      outputPath: resultPath,
      filename: path.basename(resultPath),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Blender rendering failed',
    });
  }
});
