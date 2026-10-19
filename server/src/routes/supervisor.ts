import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { currentWorkspace, generatedDir, outputDir } from '../services/workspace.js';
import { chat, formatGeminiModel } from '../services/gemini.js';
import { store } from '../services/store.js';

const execAsync = promisify(exec);

export const supervisorRouter = Router();

// System disk space and health query
supervisorRouter.get('/health', async (_req, res) => {
  try {
    let freeMb = 10000;
    try {
      const { stdout } = await execAsync('df -k /System/Volumes/Data 2>/dev/null || df -k /');
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        // 4th column is available 1K-blocks
        const availBlocks = parseInt(parts[3], 10);
        if (!isNaN(availBlocks)) {
          freeMb = Math.round(availBlocks / 1024);
        }
      }
    } catch {
      // Fallback to os.freemem()
      freeMb = Math.round(os.freemem() / (1024 * 1024));
    }

    res.json({
      status: 'ok',
      diskFreeMb: freeMb,
      diskLow: freeMb < 2048,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Health check failed' });
  }
});

// Autonomous cleanup of temporary compositor build directories and caches
supervisorRouter.post('/cleanup', async (_req, res) => {
  try {
    let cleanedBytes = 0;
    const tmpDir = os.tmpdir();

    // 1. Clean temporary remotion / react-motion render directories older than 10 minutes
    try {
      const entries = fs.readdirSync(tmpDir);
      const now = Date.now();
      for (const entry of entries) {
        if (entry.startsWith('react-motion-render') || entry.startsWith('remotion-')) {
          const fullPath = path.join(tmpDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > 10 * 60 * 1000) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              cleanedBytes += 50 * 1024 * 1024; // approximate
            }
          } catch {
            // ignore permission errors on single files
          }
        }
      }
    } catch {
      // ignore readdir errors
    }

    // 2. Clean orphaned .pcm files in generated directory older than 30 minutes
    try {
      const genDir = generatedDir();
      if (fs.existsSync(genDir)) {
        const scriptDirs = fs.readdirSync(genDir);
        const now = Date.now();
        for (const sDir of scriptDirs) {
          const sPath = path.join(genDir, sDir);
          if (fs.statSync(sPath).isDirectory()) {
            const files = fs.readdirSync(sPath);
            for (const file of files) {
              if (file.startsWith('joined-') && file.endsWith('.pcm')) {
                const fPath = path.join(sPath, file);
                try {
                  const fStat = fs.statSync(fPath);
                  if (now - fStat.mtimeMs > 30 * 60 * 1000) {
                    cleanedBytes += fStat.size;
                    fs.rmSync(fPath, { force: true });
                  }
                } catch {}
              }
            }
          }
        }
      }
    } catch {}

    // 3. Clear Xcode DerivedData if present and disk is under 3GB
    try {
      const derivedData = path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData');
      if (fs.existsSync(derivedData)) {
        const { stdout } = await execAsync('df -k /System/Volumes/Data 2>/dev/null || df -k /');
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          const availBlocks = parseInt(parts[3], 10);
          if (availBlocks < 3 * 1024 * 1024) { // < 3GB
            await execAsync(`rm -rf "${derivedData}"/* 2>/dev/null || true`);
          }
        }
      }
    } catch {}

    res.json({
      ok: true,
      cleanedMb: Math.round(cleanedBytes / (1024 * 1024)),
      message: 'Autonomous supervisor cleanup completed',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Cleanup failed' });
  }
});

// Cognitive LLM supervisor diagnostics for novel/unhandled pipeline errors
supervisorRouter.post('/diagnose', async (req, res) => {
  const { stage, error, scriptId, workspaceState } = req.body || {};
  if (!error) {
    res.status(400).json({ error: 'error string is required' });
    return;
  }

  const script = scriptId ? store.getById<any>('scripts', scriptId) : null;
  const apiKey = (req.headers['x-api-key'] as string) || req.body?.apiKey || process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    // Fall back to heuristic rule if no API key is available
    res.json({
      diagnosis: 'Heuristic diagnostic fallback (API key not configured)',
      recoveryAction: 'retry_stage',
      confidence: 0.8,
      details: 'Proceed with autonomous stage retry and prerequisite regeneration.',
    });
    return;
  }

  try {
    const prompt = `You are the Google Gemini Autonomous Production Supervisor for TubeFlow.
A stage in the 1-click video generation pipeline encountered an error:

Stage: "${stage}"
Error: "${error}"
Script ID: "${scriptId}"
Scenes Count: ${script?.scenePlan?.scenes?.length || 0}
Has Narration: ${!!script?.narration}
Has Generated Audio: ${!!script?.generatedAudio?.length}
Has Sync Timing: ${!!script?.generatedAudio?.[0]?.sync}
Workspace Section: "${currentWorkspace().profile}"

Diagnose the root cause of this failure and specify the exact autonomous healing action.
Return JSON ONLY, matching this schema:
{
  "diagnosis": "Short explanation of why it failed",
  "recoveryAction": "regenerate_narration_sync" | "regenerate_motion_captions" | "normalize_media_types" | "restart_tts" | "retry_stage" | "unrecoverable",
  "details": "Explanation of the repair",
  "confidence": 0.95
}`;

    const modelName = formatGeminiModel(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
    const response = await chat(apiKey, { messages: [{ role: 'user', content: prompt }], model: modelName });
    const cleanJson = (response.choices[0]?.message.content || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    res.json(parsed);
  } catch (diagError) {
    res.json({
      diagnosis: 'Autonomous heuristic analyzer',
      recoveryAction: 'retry_stage',
      confidence: 0.7,
      details: error,
    });
  }
});
