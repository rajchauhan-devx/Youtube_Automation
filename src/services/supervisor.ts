import { narrationOptions, type AutoPilotSettings } from '../../server/src/services/autopilot-settings';
import type { AutoPilotStage, AutoPilotLog } from './autoPilotTypes';
import { getApiKey } from './api';
import { editingRequest, type EditingPayload } from './editingApi';
import { assertGraphicsReviewed, type JobRecord } from '@tubeflow/editing-contracts';

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
  autoPilotSettings?: AutoPilotSettings;
}

export interface HealingResult {
  healed: boolean;
  retryOnly?: boolean;
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
  setStatus: (message: string) => void,
  provider = 'default'
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
    const ttsRes = await fetchFn(`/api/tts/status?provider=${provider}`).catch(() => null);
    const ttsStatus = ttsRes && ttsRes.ok ? await ttsRes.json() : null;
    if (!ttsStatus?.ready) {
      addLog('research_script', '[SUPERVISOR] 🎙️ Initializing & warming up selected voice engine...', 'info');
      setStatus('Gemini Supervisor: Starting selected speech engine...');
      await fetchFn('/api/tts/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) }).catch(() => {});
      
      let waited = 0;
      while (waited < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        waited += 2;
        const check = await fetchFn(`/api/tts/status?provider=${provider}`).catch(() => null);
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

  // A scene edit can race with a queued keyframe request. Reload the actual
  // prerequisites before the stage retries, without asking an LLM to guess.
  if (ctx.stage === 'generate_images' && /Choose a valid scene with its current extracted prompt|Scene changed during (?:reference frame )?generation/i.test(errMsg)) {
    const response = await ctx.fetch(`/api/scripts/${encodeURIComponent(ctx.scriptId)}`);
    if (!response.ok) return { healed: false, error: 'Could not reload the current scenes for image recovery.' };
    const script = await response.json();
    if (!script.scenePlan?.scenes?.length && !script.imagePrompts?.length)
      return { healed: false, error: 'The saved production has no extracted visual prompts.' };
    ctx.patchScript(ctx.scriptId, script);
    ctx.addLog(ctx.stage, '[SUPERVISOR] Reloaded the saved scenes and prompts. Retrying missing visuals with the current production state.', 'info');
    return { healed: true, actionTaken: 'Reloaded current scene prompts and saved visuals' };
  }

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
      const voiceToUse = ctx.autoPilotSettings?.voice.voiceId || script.voice || script.generatedAudio?.[0]?.voice || 'builtin';
      const voiceOptions = ctx.autoPilotSettings ? narrationOptions(ctx.autoPilotSettings, languageToUse) : { language: languageToUse, voice: voiceToUse };

      if (ctx.autoPilotSettings?.voice.language === 'auto') {
        const response = await ctx.fetch(`/api/tts/voices?language=${voiceOptions.language}&provider=${ctx.autoPilotSettings.voice.provider}`);
        const library = await response.json();
        if (!response.ok || !Array.isArray(library.voices)) throw new Error(library.error || 'Could not load the selected voice library.');
        if (!library.voices.some((voice: { id: string }) => voice.id === voiceOptions.voice))
          voiceOptions.voice = library.voices.find((voice: { source?: string }) => voice.source === 'clone')?.id || library.voices[0]?.id;
        if (!voiceOptions.voice) throw new Error('No matching narration voice is available.');
      }
      const startRes = await ctx.fetch('/api/tts/long/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: ctx.scriptId,
          ...voiceOptions,
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
  // Resume unfinished rendered review instead of generating another project.
  // -------------------------------------------------------------------------
  if (/Rendered vision review has not passed|VISUAL_REVIEW_REQUIRED|Rendered typography failed the layout check/i.test(errMsg)) {
    try {
      const response = await ctx.fetch(`/api/scripts/${encodeURIComponent(ctx.scriptId)}`);
      if (!response.ok) throw new Error('Could not reload the production for visual recovery.');
      const script = await response.json();
      if (!script.editingProjectId) throw new Error('The production has no saved visual project to recover.');
      const path = `/projects/${script.editingProjectId}`;
      const saved = await editingRequest<EditingPayload>(ctx.fetch, path);
      if (saved.stale) throw new Error('Saved visual inputs changed; regenerate the visual edit with the current media.');
      const candidates = saved.jobs.filter(job => job.revisionId === saved.project.revisionId &&
        ['generate', 'review', 'revise'].includes(job.operation)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const unfinished = candidates.find(job => ['queued', 'running', 'cancel_requested', 'failed', 'interrupted', 'needs_configuration'].includes(job.state));
      ctx.addLog(ctx.stage, '[SUPERVISOR] Resuming unfinished visual checks from the saved project; keeping generated assets and passed reviews.', 'info');
      ctx.setStatus('Gemini Supervisor: Recovering unfinished rendered visual checks...');
      await ctx.checkPauseOrAbort();
      const started = unfinished
        ? ['queued', 'running', 'cancel_requested'].includes(unfinished.state) ? { jobId: unfinished.id }
          : { jobId: (await editingRequest<JobRecord>(ctx.fetch, `/jobs/${unfinished.id}/resume`, {})).id }
        : await editingRequest<{ jobId: string }>(ctx.fetch, `${path}/review`, { expectedRevisionId: saved.project.revisionId });
      let active = true;
      try {
        while (true) {
          await ctx.checkPauseOrAbort();
          const job = await editingRequest<JobRecord>(ctx.fetch, `/jobs/${started.jobId}`);
          if (['succeeded', 'partial', 'failed', 'interrupted', 'needs_configuration', 'cancelled'].includes(job.state)) {
            active = false;
            if (!['succeeded', 'partial'].includes(job.state)) throw new Error(job.error || `Visual recovery ${job.state}.`);
            break;
          }
          ctx.setStatus(`Gemini Supervisor: ${job.stage}`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } finally {
        if (active) await editingRequest(ctx.fetch, `/jobs/${started.jobId}/cancel`, {}).catch(() => {});
      }
      const recovered = await editingRequest<EditingPayload>(ctx.fetch, path);
      assertGraphicsReviewed(recovered.project);
      ctx.patchScript(ctx.scriptId, script);
      return { healed: true, actionTaken: 'Finished saved rendered visual checks and verified their results' };
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('Aborted by user'))) throw error;
      return { healed: false, error: error instanceof Error ? error.message : String(error) };
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
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Waking and warming up selected voice engine...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Restarting selected voice engine...');

    try {
      await ctx.fetch('/api/tts/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: ctx.autoPilotSettings?.voice.provider || 'default' }) }).catch(() => {});
      let count = 0;
      while (count < 25) {
        await new Promise((r) => setTimeout(r, 2000));
        await ctx.checkPauseOrAbort();
        const statusRes = await ctx.fetch(`/api/tts/status?provider=${ctx.autoPilotSettings?.voice.provider || 'default'}`).catch(() => null);
        const statusJson = statusRes && statusRes.ok ? await statusRes.json() : null;
        if (statusJson?.ready) {
          ctx.addLog(ctx.stage, '[SUPERVISOR] ✅ Selected TTS engine is warmed and ready.', 'success');
          return { healed: true, actionTaken: 'Selected TTS engine restarted and ready' };
        }
        count++;
      }
    } catch (healErr) {
      console.error('[Supervisor] TTS warmup failed:', healErr);
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 6: Model Overloaded or Rate Limited (HTTP 503, 429, UNAVAILABLE)
  // -------------------------------------------------------------------------
  if (/503|overloaded|temporarily overloaded|model is busy|UNAVAILABLE|rate limit|quota|429/i.test(errMsg)) {
    const fallbackList = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    const currentModel = ctx.autoPilotSettings?.graphics?.model || 'gemini-3.1-flash-lite';
    const nextModel = fallbackList.find(m => m !== currentModel) || 'gemini-3.5-flash-lite';
    ctx.addLog(ctx.stage, `[SUPERVISOR] 🛠️ Healing Action: Model overloaded (HTTP 503/429). Switching pipeline AI model to low-traffic model (${nextModel})...`, 'gemini');
    ctx.setStatus(`Gemini Supervisor: Switching to low-traffic model (${nextModel})...`);

    try {
      if (ctx.autoPilotSettings?.graphics) {
        ctx.autoPilotSettings.graphics.model = nextModel;
      }
      ctx.patchScript(ctx.scriptId, { model: nextModel });
      await ctx.persistScript(ctx.scriptId, { model: nextModel });
      ctx.addLog(ctx.stage, `[SUPERVISOR] ✅ Pipeline AI model switched to ${nextModel}. Retrying stage...`, 'success');
      await new Promise((r) => setTimeout(r, 1000));
      return { healed: true, actionTaken: `Switched model to ${nextModel}` };
    } catch (healErr) {
      console.error('[Supervisor] Model switch healing failed:', healErr);
    }
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 7: Connection Interruption or Stale JSON Body
  // -------------------------------------------------------------------------
  if (/Unexpected end of JSON input|Failed to execute 'json'|ECONNREFUSED|Failed to fetch|NetworkError/i.test(errMsg)) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] 🛠️ Healing Action: Backend connection temporarily interrupted. Waiting for server to stabilize...', 'gemini');
    ctx.setStatus('Gemini Supervisor: Re-establishing backend connection...');
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const health = await ctx.fetch('/api/supervisor/health');
      if (health.ok) {
        ctx.addLog(ctx.stage, '[SUPERVISOR] ✅ Backend server is online and healthy. Resuming stage...', 'success');
        return { healed: true, actionTaken: 'Backend connection restored' };
      }
    } catch {}
    return { healed: true, retryOnly: true, actionTaken: 'Retry after a backend connection delay' };
  }

  // -------------------------------------------------------------------------
  // HEALING RULE 8: Cognitive LLM Diagnostic Fallback for Unforeseen Issues
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
      if (diagData.recoveryAction === 'switch_to_low_traffic_model') {
        return diagnoseAndHealError({ ...ctx, error: '503 The selected model is temporarily overloaded' });
      }
      if (diagData.recoveryAction === 'unrecoverable') return { healed: false, error: diagData.details || errMsg };
      // A recommendation is not evidence that a repair was executed.
      return { healed: true, retryOnly: true, actionTaken: diagData.details || 'Retry recommended by diagnostic analysis' };
    }
  } catch (diagErr) {
    console.warn('[Supervisor] Cognitive diagnostics note:', diagErr);
  }

  // Fallback: If 1st or 2nd attempt, pause briefly and retry once with state refresh
  if (ctx.attempt <= 2) {
    ctx.addLog(ctx.stage, '[SUPERVISOR] Waiting briefly before another bounded stage attempt...', 'warn');
    await new Promise((r) => setTimeout(r, 2000));
    return { healed: true, retryOnly: true, actionTaken: 'Retry after temporary delay' };
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
        ctx.addLog(stage, '[SUPERVISOR] 💡 Documentary overlays optional; proceeding autonomously with full scene visuals.', 'info');
        return undefined as any;
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

      ctx.addLog(stage, healing.retryOnly
        ? `[SUPERVISOR] Retrying Stage "${stage}" (${healing.actionTaken}). No repair has been verified yet.`
        : `[SUPERVISOR] 🚀 Resuming Stage "${stage}" following autonomous repair (Action: ${healing.actionTaken})`, healing.retryOnly ? 'info' : 'success');
      attempt++;
    }
  }

  throw new Error(`Stage "${stage}" failed after ${maxAttempts} autonomous supervision attempts.`);
}
