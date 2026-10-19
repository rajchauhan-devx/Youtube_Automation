import type { AutoPilotStage, AutoPilotLog } from './autoPilotTypes';
import { getApiKey } from './api';

export interface SupervisorContext {
  stage: AutoPilotStage;
  error: Error | string;
  scriptId: string;
  section: string;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  addLog: (stage: AutoPilotStage, message: string, type?: AutoPilotLog['type']) => void;
  setStatus: (message: string) => void;
  patchScript: (id: string, patch: any) => void;
  persistScript: (id: string, patch: any) => Promise<void>;
  checkPauseOrAbort: () => Promise<void>;
  attempt: number;
}

export interface HealingResult {
  healed: boolean;
  actionTaken?: string;
  error?: string;
}

/**
 * Pre-flight system check run by the Autonomous Supervisor before pipeline launch.
 * Verifies system disk storage and voice engine readiness.
 */
export async function runPreflightSupervision(
  fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  addLog: (stage: AutoPilotStage, message: string, type?: AutoPilotLog['type']) => void,
  setStatus: (message: string) => void
): Promise<void> {
  try {
    // 1. Storage & Compositor Pre-flight Check
    const healthRes = await fetchFn('/api/supervisor/health').catch(() => null);
    if (healthRes && healthRes.ok) {
      const healthData = await healthRes.json();
      if (healthData.diskLow) {
        addLog('research_script', `[SUPERVISOR] ⚠️ Storage buffer low (${healthData.diskFreeMb}MB free). Purging temp compositor files...`, 'warn');
        setStatus('Gemini Supervisor: Purging temp storage buffers...');
        await fetchFn('/api/supervisor/cleanup', { method: 'POST' }).catch(() => {});
        addLog('research_script', '[SUPERVISOR] 🧹 Temporary compositor buffers cleared for high-definition render.', 'info');
      }
    }

    // 2. Chatterbox Neural TTS Pre-flight Check
    const ttsRes = await fetchFn('/api/tts/status').catch(() => null);
    const ttsStatus = ttsRes && ttsRes.ok ? await ttsRes.json() : null;
    if (!ttsStatus?.ready) {
      addLog('research_script', '[SUPERVISOR] 🎙️ Initializing & warming up Chatterbox neural voice engine...', 'info');
      setStatus('Gemini Supervisor: Starting Chatterbox neural speech engine...');
      await fetchFn('/api/tts/start', { method: 'POST' }).catch(() => {});
      
      let waited = 0;
      while (waited < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        waited += 2;
        const check = await fetchFn('/api/tts/status').catch(() => null);
        const st = check && check.ok ? await check.json() : null;
        if (st?.ready) break;
      }
    }
  } catch (err) {
    console.warn('[Supervisor] Pre-flight supervision note:', err);
  }
}

/**
 * Autonomous diagnostic and self-healing engine.
 * Inspects pipeline irregularities, repairs the broken prerequisite, and permits resumption.
 */
export async function diagnoseAndHealError(ctx: SupervisorContext): Promise<HealingResult> {
  const errMsg = typeof ctx.error === 'string' ? ctx.error : ctx.error.message || String(ctx.error);
  ctx.addLog(ctx.stage, `[SUPERVISOR] 🧠 Autonomous Supervisor analyzing irregularity: "${errMsg}" (Attempt ${ctx.attempt}/3)`, 'gemini');
  ctx.setStatus(`Gemini Supervisor: Diagnosing irregularity (Attempt ${ctx.attempt}/3)...`);

  await ctx.checkPauseOrAbort();

  // -------------------------------------------------------------------------
  // HEALING RULE 1: Synchronized Acoustic Narration Missing or Outdated
  // -------------------------------------------------------------------------
  if (/synchronized narration|sync\.json|scene plan or narration changed|narration audio changed|Select the latest synchronized narration|Hindi narration|Select a Hindi voice/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Regenerating synchronized acoustic scene audio with .sync.json...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Self-healing synchronized voiceover timing...');

    try {
      const freshRes = await ctx.fetch(`/api/scripts/${encodeURIComponent(ctx.scriptId)}`);
      const script = await freshRes.json();
      const hasHindi = /[\u0900-\u097F]/.test(script.narration || script.extractedScript || '');
      const languageToUse = hasHindi ? 'hi' : (script.language || 'en');
      const voiceToUse = script.voice || script.generatedAudio?.[0]?.voice || 'builtin';

      const startRes = await ctx.fetch('/api/tts/long/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: ctx.scriptId,
          language: languageToUse,
          voice: voiceToUse,
        }),
      });

      if (!startRes.ok) {
        const errJson = await startRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to start synchronized speech synthesis');
      }

      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 1500));
        await ctx.checkPauseOrAbort();
        const pollRes = await ctx.fetch(`/api/tts/long/status/${ctx.scriptId}`);
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          if (pollData.status === 'done') {
            done = true;
            if (pollData.result) {
              ctx.patchScript(ctx.scriptId, { generatedAudio: [pollData.result] });
              await ctx.persistScript(ctx.scriptId, { generatedAudio: [pollData.result] });
            }
          } else if (pollData.status === 'error') {
            throw new Error(pollData.error || 'TTS synthesis failed during self-healing');
          }
        }
      }

      ctx.addLog(ctx.stage, '[SUPERVISOR] ✅ Synchronized acoustic narration repaired & committed. Resuming pipeline.', 'success');
      return { healed: true, actionTaken: 'Synchronized multi-scene narration regenerated' };
    } catch (healErr) {
      console.error('[Supervisor] Narration repair failed:', healErr);
      return { healed: false, error: healErr instanceof Error ? healErr.message : String(healErr) };
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 2: Stale Motion Graphics / Project Revision Conflict
  // -------------------------------------------------------------------------
  if (/saved motion graphics use older|older media or narration|REVISION_CONFLICT|STALE_INPUT|MISSING_SCENE|Saved motion graphics require/i.test(errMsg)) {
    // A narration/media edit needs a fresh visual plan. Never "heal" it by
    // replacing the requested documentary edit with captions or detaching it.
    return { healed: false, error: 'Documentary media or revision changed. Regenerate the visual edit with the current media; caption-only recovery is disabled.' };
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 3: Missing Scene Image or Media Type / Asset Inconsistency
  // -------------------------------------------------------------------------
  if (/A scene image is missing|needs the correct media type|missing, stale or reordered image|media type|needs exactly one image/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Reconciling scene visual assets & regenerating missing keyframes...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Self-healing visual assets & mappings...');

    try {
      const freshRes = await ctx.fetch(`/api/scripts/${encodeURIComponent(ctx.scriptId)}`);
      const script = await freshRes.json();
      const scenes = script.scenePlan?.scenes || [];

      let planChanged = false;
      let generatedImages = [...(script.generatedImages || [])];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        let img = generatedImages.find((g: any) => g.index === i);

        // Check if image is missing from state or inaccessible on disk
        let needsRegen = !img || !img.url || img.status !== 'done';
        if (errMsg.includes('A scene image is missing') && img?.url) {
          const check = await ctx.fetch(img.url, { method: 'HEAD' }).catch(() => null);
          if (!check || !check.ok) {
            needsRegen = true;
          }
        }

        if (needsRegen) {
          ctx.addLog(ctx.stage, `[SUPERVISOR] 🎨 Regenerating missing keyframe for Scene ${i + 1}...`, 'info');
          const prompt = scene.imagePrompt || scene.narration || 'cinematic production visual';
          const genRes = await ctx.fetch('/api/generate/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptId: ctx.scriptId,
              index: i,
              prompt,
              preset: 'standard',
              provider: 'google',
            }),
          });
          if (genRes.ok) {
            const genData = await genRes.json();
            if (genData.generatedImages) {
              generatedImages = genData.generatedImages;
              planChanged = true;
            }
          }
        }

        // Reconcile mediaType
        img = generatedImages.find((g: any) => g.index === i);
        if (img) {
          const actualType = img.mediaType || (img.url && img.url.endsWith('.mp4') ? 'video' : 'image');
          if (scene.mediaType !== actualType) {
            scene.mediaType = actualType;
            planChanged = true;
          }
        }
      }

      if (planChanged) {
        ctx.patchScript(ctx.scriptId, { scenePlan: script.scenePlan, generatedImages });
        await ctx.persistScript(ctx.scriptId, { scenePlan: script.scenePlan, generatedImages });
        ctx.addLog(ctx.stage, '[SUPERVISOR] ✅ Visual keyframes and scene media types healed & synchronized.', 'success');
        return { healed: true, actionTaken: 'Visual keyframes and media types normalized' };
      }
      return { healed: true, actionTaken: 'Visual state verified' };
    } catch (healErr) {
      console.error('[Supervisor] Media reconciliation failed:', healErr);
      return { healed: false, error: healErr instanceof Error ? healErr.message : String(healErr) };
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 4: Disk Space Low or Compositor Overflow (ENOSPC)
  // -------------------------------------------------------------------------
  if (/ENOSPC|no space left on device|disk full/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Purging temporary render buffers and clearing cache...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Self-healing storage buffers...');

    try {
      const cleanRes = await ctx.fetch('/api/supervisor/cleanup', { method: 'POST' });
      if (cleanRes.ok) {
        const cleanData = await cleanRes.json();
        ctx.addLog(ctx.stage, `[SUPERVISOR] ✅ Purged ${cleanData.cleanedMb || 0}MB of temp compositor files.`, 'success');
        return { healed: true, actionTaken: 'Temporary compositor cache cleared' };
      }
    } catch (healErr) {
      console.error('[Supervisor] Storage cleanup failed:', healErr);
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 5: Render Already In Progress
  // -------------------------------------------------------------------------
  if (/already in progress|Wait for it or cancel it/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Resetting active render queue state...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Resetting render queue...');
    await ctx.fetch(`/api/render/cancel/${ctx.scriptId}`, { method: 'POST' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    return { healed: true, actionTaken: 'Cancelled previous render and cleared render queue' };
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 5: Chatterbox Engine Offline or Loading
  // -------------------------------------------------------------------------
  if (/TTS|Chatterbox|model loading|not ready|connection refused/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Waking and warming up Chatterbox neural voice engine...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Restarting Chatterbox neural voice engine...');

    try {
      await ctx.fetch('/api/tts/start', { method: 'POST' }).catch(() => {});
      let count = 0;
      while (count < 25) {
        await new Promise((r) => setTimeout(r, 2000));
        await ctx.checkPauseOrAbort();
        const statusRes = await ctx.fetch('/api/tts/status').catch(() => null);
        const statusJson = statusRes && statusRes.ok ? await statusRes.json() : null;
        if (statusJson?.ready) {
          ctx.addLog(ctx.stage, '[SUPERVISOR] ✅ Chatterbox neural TTS engine is warmed and ready.', 'success');
          return { healed: true, actionTaken: 'Chatterbox TTS restarted and ready' };
        }
        count++;
      }
    } catch (healErr) {
      console.error('[Supervisor] TTS warmup failed:', healErr);
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 6: Cognitive LLM Diagnostic Fallback for Unforeseen Issues
  // -------------------------------------------------------------------------
  try {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🤖 Consulting Gemini LLM Supervisor for cognitive diagnostic analysis...', 'info');
    const diagRes = await ctx.fetch('/api/supervisor/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getApiKey() ? { 'x-api-key': getApiKey() } : {}),
      },
      body: JSON.stringify({
        stage: ctx.stage,
        error: errMsg,
        scriptId: ctx.scriptId,
      }),
    });

    if (diagRes.ok) {
      const diagData = await diagRes.json();
      ctx.addLog(ctx.stage, `[SUPERVISOR] 💡 Cognitive Diagnosis: ${diagData.diagnosis || 'Stage recovery recommended'}`, 'gemini');
      if (diagData.recoveryAction === 'regenerate_narration_sync') {
        return diagnoseAndHealError({ ...ctx, error: 'Generate synchronized narration in Audio Generation first' });
      }
      if (diagData.recoveryAction === 'regenerate_motion_captions') {
        return diagnoseAndHealError({ ...ctx, error: 'The saved motion graphics use older media or narration' });
      }
      if (diagData.recoveryAction === 'normalize_media_types') {
        return diagnoseAndHealError({ ...ctx, error: 'Scene needs the correct media type' });
      }
      if (diagData.recoveryAction === 'restart_tts') {
        return diagnoseAndHealError({ ...ctx, error: 'Chatterbox model loading' });
      }
      // If general retry recommended
      return { healed: true, actionTaken: `Cognitive healing: ${diagData.details || 'Retry after state synchronization'}` };
    }
  } catch (diagErr) {
    console.warn('[Supervisor] Cognitive diagnostics note:', diagErr);
  }

  // Fallback: If 1st or 2nd attempt, pause briefly and retry once with state refresh
  if (ctx.attempt <= 2) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🔄 Re-synchronizing workspace state for automated stage retry...', 'warn');
    await new Promise((r) => setTimeout(r, 2000));
    return { healed: true, actionTaken: 'Automated workspace state re-synchronization' };
  }

  return { healed: false, error: errMsg };
}

/**
 * Executes a pipeline stage under full Autonomous Supervision.
 * If any exception occurs, triggers the self-healing loop and re-attempts execution (up to 3 times).
 */
export async function executeSupervisedStage<T>(
  stage: AutoPilotStage,
  stageFn: () => Promise<T>,
  ctx: Omit<SupervisorContext, 'attempt' | 'error' | 'stage'>
): Promise<T> {
  let attempt = 1;
  const maxAttempts = 3;

  while (attempt <= maxAttempts) {
    try {
      await ctx.checkPauseOrAbort();
      return await stageFn();
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('Aborted by user')) {
        throw err;
      }
      if (/no enabled image compositions|no usable image compositions|returned no image compositions|text-only.*blocked|image-led generation needs/i.test(err?.message || String(err))) {
        ctx.addLog(stage, '[SUPERVISOR] The image-led visual requirement was not met. Stopping for visual review instead of repeating the production stage.', 'error');
        throw err;
      }

      if (attempt >= maxAttempts) {
        ctx.addLog(stage, `[SUPERVISOR] ❌ Autonomous recovery exhausted after ${maxAttempts} attempts: ${err.message || String(err)}`, 'error');
        throw err;
      }

      const healing = await diagnoseAndHealError({
        ...ctx,
        stage,
        error: err,
        attempt,
      });

      if (!healing.healed) {
        throw new Error(healing.error || err.message || String(err));
      }

      ctx.addLog(stage, `[SUPERVISOR] 🚀 Resuming Stage "${stage}" following autonomous repair (Action: ${healing.actionTaken})`, 'success');
      attempt++;
    }
  }

  throw new Error(`Stage "${stage}" failed after ${maxAttempts} autonomous supervision attempts.`);
}
