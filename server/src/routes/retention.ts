import { Router } from 'express';
import { store } from '../services/store.js';
import { modelCredential } from '../services/model-json.js';
import { getGeminiApiKey } from '../services/gemini.js';
import { createRetentionPlan, editForRetention, responseHash, retentionBrief, productionHash } from '../services/retention.js';
import { reviewRenderedVideo } from '../services/retention-review.js';
import { ReviewPending } from '../services/review-retry.js';
import { vetHighRetentionTopic } from '../services/editorial/documentary-topic-vetter.js';
import { runIterativeScriptDoctor } from '../services/editorial/professional-script-doctor.js';
import { syncTopicNotes } from '../services/topic-notes.js';

export const retentionRouter = Router();
for (const operation of ['plan', 'edit', 'review'] as const) {
  retentionRouter.post(`/${operation}`, async (req, res) => {
    const script = store.getById<any>('scripts', req.body?.scriptId);
    if (!script) { res.status(404).json({ error: 'Script not found in this profile' }); return; }
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    res.on('close', disconnect);
    const model = script.model || 'gemini-3.6-flash';
    const apiKey = modelCredential(model, req);
    const template = (script.prompts || []).map((prompt: { content: string }) => prompt.content).join('\n\n');
    const source = responseHash(JSON.stringify([script.aiResponse, script.topicName, script.retentionPlan, script.scenePlan, script.generatedAudio, script.generatedImages]));
    try {
      let patch: Record<string, unknown>;
      let result: unknown;
      if (operation === 'plan') {
        if (!getGeminiApiKey(req.get('x-api-key'))) { res.status(401).json({ error: 'Add a Gemini API key for the final rendered review before starting Auto-Pilot.' }); return; }
        const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
        if (!topic || topic.length > 300) { res.status(400).json({ error: 'Select a topic before planning hooks' }); return; }
        const plan = await createRetentionPlan({
          topic,
          template,
          instructions: typeof req.body?.instructions === 'string' ? req.body.instructions : '',
          duration: script.duration || 30,
          model,
          apiKey,
          signal: controller.signal,
          storyMap: script.vettedTopic?.storyMap,
        });
        patch = { retentionPlan: plan };
        result = { plan, brief: retentionBrief(plan) };
      } else if (operation === 'edit') {
        if (!script.retentionPlan || script.retentionPlan.topic !== script.topicName || !script.aiResponse?.trim()) {
          res.status(409).json({ error: 'Generate this topic’s hook plan and script before editing.' }); return;
        }
        if (script.generatedImages?.some((image: { url?: string }) => image.url) || script.generatedAudio?.some((audio: { url?: string }) => audio.url)) {
          res.status(409).json({ error: 'Run the retention edit before producing media. Start a new Auto-Pilot run to edit again.' }); return;
        }
        const edit = await editForRetention({
          raw: script.aiResponse,
          template,
          research: script.researchData || '',
          plan: script.retentionPlan,
          model,
          apiKey,
          signal: controller.signal,
          duration: script.duration || 600,
          storyMap: script.vettedTopic?.storyMap || script.retentionPlan?.storyMap,
        });
        patch = { retentionEdit: edit };
        result = { edit };
      } else {
        if (!script.retentionPlan || !script.retentionEdit) { res.status(409).json({ error: 'This run needs a hook plan and retention edit before review.' }); return; }
        const review = await reviewRenderedVideo(script, req.body?.videoFilename, getGeminiApiKey(req.get('x-api-key')), controller.signal);
        if (review.productionHash !== productionHash(script)) throw new Error('The production changed during review.');
        patch = { retentionReview: review };
        result = { review };
      }
      controller.signal.throwIfAborted();
      const latest = store.getById<any>('scripts', script.id);
      if (!latest || responseHash(JSON.stringify([latest.aiResponse, latest.topicName, latest.retentionPlan, latest.scenePlan, latest.generatedAudio, latest.generatedImages])) !== source) {
        res.status(409).json({ error: 'The script or media changed during retention work. Run this step again.' }); return;
      }
      store.add('scripts', { ...latest, ...patch });
      res.json(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ReviewPending) res.setHeader('Retry-After', error.retryAfterSeconds).status(429).json({
          error: error.message, retryable: true, retryAfterSeconds: error.retryAfterSeconds,
          completedBatches: error.completed, totalBatches: error.total,
        });
        else res.status(422).json({ error: error instanceof Error ? error.message : 'Retention review failed' });
      }
    } finally { res.off('close', disconnect); }
  });
}

/**
 * On-demand endpoint to vet a topic and build a 5-Act story map across retention gates.
 */
retentionRouter.post('/vet-topic', async (req, res) => {
  const model = req.body?.model || 'gemini-3.6-flash';
  const apiKey = modelCredential(model, req);
  if (!apiKey) {
    res.status(401).json({ error: 'Add your Gemini API key in Settings.' });
    return;
  }
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  try {
    const notes = syncTopicNotes();
    const result = await vetHighRetentionTopic({
      topic: typeof req.body?.topic === 'string' ? req.body.topic.trim() : '',
      channelName: typeof req.body?.channelName === 'string' ? req.body.channelName : notes.name,
      channelGuidance: typeof req.body?.channelGuidance === 'string' ? req.body.channelGuidance : notes.guidance,
      instructions: typeof req.body?.instructions === 'string' ? req.body.instructions : '',
      duration: typeof req.body?.duration === 'number' ? req.body.duration : 600,
      model,
      apiKey,
      signal: controller.signal,
    });
    res.json(result);
  } catch (error) {
    if (!controller.signal.aborted) {
      res.status(422).json({ error: error instanceof Error ? error.message : 'Topic vetting failed' });
    }
  } finally {
    res.off('close', disconnect);
  }
});

/**
 * On-demand endpoint to run the Script Doctor iterative audit & repair loop on a script.
 */
retentionRouter.post('/script-doctor', async (req, res) => {
  const scriptId = req.body?.scriptId;
  const script = scriptId ? store.getById<any>('scripts', scriptId) : null;
  const scenePlan = req.body?.scenePlan || script?.retentionEdit?.plan || script?.scenePlan;
  if (!scenePlan || !Array.isArray(scenePlan.scenes) || !scenePlan.scenes.length) {
    res.status(400).json({ error: 'Valid scenePlan with scenes is required to run the Script Doctor.' });
    return;
  }
  const model = req.body?.model || script?.model || 'gemini-3.6-flash';
  const apiKey = modelCredential(model, req);
  if (!apiKey) {
    res.status(401).json({ error: 'Add your Gemini API key in Settings.' });
    return;
  }
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.on('close', disconnect);
  try {
    const notes = syncTopicNotes();
    const result = await runIterativeScriptDoctor({
      scenePlan,
      channelName: typeof req.body?.channelName === 'string' ? req.body.channelName : notes.name,
      channelGuidance: typeof req.body?.channelGuidance === 'string' ? req.body.channelGuidance : notes.guidance,
      storyMap: req.body?.storyMap || script?.vettedTopic?.storyMap || script?.retentionPlan?.storyMap,
      maxIterations: typeof req.body?.maxIterations === 'number' ? req.body.maxIterations : 3,
      model,
      apiKey,
      signal: controller.signal,
    });

    if (script && scriptId) {
      const updatedScript = {
        ...script,
        scenePlan: result.finalScenePlan,
        ...(script.retentionEdit ? {
          retentionEdit: {
            ...script.retentionEdit,
            plan: result.finalScenePlan,
            notes: [...result.editorialNotes, ...script.retentionEdit.notes],
            auditReport: result.auditReport,
            scriptDoctorSummary: {
              iterationsCount: result.iterationsCount,
              initialScore: result.initialScore,
              finalScore: result.finalScore,
              scoreProgression: result.scoreProgression,
              editorialNotes: result.editorialNotes,
            },
          },
        } : {}),
      };
      store.add('scripts', updatedScript);
    }

    res.json(result);
  } catch (error) {
    if (!controller.signal.aborted) {
      res.status(422).json({ error: error instanceof Error ? error.message : 'Script doctor execution failed' });
    }
  } finally {
    res.off('close', disconnect);
  }
});
