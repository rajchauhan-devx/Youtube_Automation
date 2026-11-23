import { z } from 'zod';
import { validatedModelJson } from '../model-json.js';
import { extractSpeakerName, type ScenePlan } from '../scene-plan.js';
import { refreshMotionHints } from '../script-motion.js';
import { channelEditorialRules, channelFor, clip, sceneDigest } from './critic-context.js';
import type { WritersRoomFinding, WritersRoomSceneDiff } from './writers-room-types.js';

const RepairOutputSchema = z.object({
  repairedScenes: z.array(z.object({
    id: z.string().trim(),
    narration: z.string().trim().min(5).max(12000),
    imagePrompt: z.string().trim().min(10).max(8000),
    videoPrompt: z.string().trim().max(8000).optional(),
    explanationOfFix: z.string().trim().min(1).max(1000),
  })).min(1).max(80),
});

export interface SceneRepairResult {
  scenePlan: ScenePlan;
  repairedSceneIds: string[];
  diffs: WritersRoomSceneDiff[];
  notes: string[];
}

function preserveSpeakerTag(original: string, next: string): string {
  const originalTag = original.match(/^\s*(\[\s*[A-Za-z\u0900-\u097F\s]{2,25}\s*\]\s*[:—–-])/);
  if (!originalTag) return next;
  if (/^\s*\[\s*[A-Za-z\u0900-\u097F\s]{2,25}\s*\]\s*[:—–-]/.test(next)) return next;
  return `${originalTag[1]} ${next.trim()}`;
}

export async function repairFlaggedScenes(options: {
  scenePlan: ScenePlan;
  findings: WritersRoomFinding[];
  channelName?: string;
  channelGuidance?: string;
  template?: string;
  research?: string;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<SceneRepairResult> {
  const channel = channelFor(options.channelName, options.channelGuidance);
  const validIds = new Set(options.scenePlan.scenes.map(scene => scene.id));
  const targeted = new Set(options.findings.flatMap(finding => finding.sceneIds).filter(id => validIds.has(id)));
  const candidates = (targeted.size ? options.scenePlan.scenes.filter(scene => targeted.has(scene.id)) : options.scenePlan.scenes)
    .slice(0, 80);
  const candidateIds = new Set(candidates.map(scene => scene.id));
  const context = sceneDigest(options.scenePlan, 420);
  const findingsByScene = new Map<string, WritersRoomFinding[]>();
  const globalFindings: WritersRoomFinding[] = [];
  for (const finding of options.findings) {
    const ids = finding.sceneIds.filter(id => validIds.has(id));
    if (!ids.length) { globalFindings.push(finding); continue; }
    for (const id of ids) findingsByScene.set(id, [...(findingsByScene.get(id) || []), finding]);
  }

  const parsed = await validatedModelJson({
    model: options.model,
    apiKey: options.apiKey,
    signal: options.signal,
    maxTokens: 32000,
    messages: [
      {
        role: 'system',
        content: 'You are an elite script doctor executing targeted repairs. Preserve all verified facts, canon, scene IDs, scene order, media types, roles, chapters and durations. Do not invent facts, quotations or citations. Return only JSON.',
      },
      {
        role: 'user',
        content: [
          `Repair only the flagged scenes in this ${channel} script.`,
          `Channel rules: ${channelEditorialRules(channel)}`,
          `Template and canon context:\n${clip(options.template, 12000) || 'No template supplied.'}`,
          `Research dossier:\n${clip(options.research, 16000) || 'No research supplied. Preserve the existing factual level and never add new specifics.'}`,
          `Full scene index for continuity:\n${JSON.stringify(context, null, 2)}`,
          `Scenes allowed to repair:\n${JSON.stringify(candidates, null, 2)}`,
          `Critic findings grouped by scene:\n${JSON.stringify(Object.fromEntries([...findingsByScene.entries()].map(([id, findings]) => [id, findings])), null, 2)}`,
          globalFindings.length ? `Script-wide findings:\n${JSON.stringify(globalFindings, null, 2)}` : '',
          `Repair instructions:
- Return only scenes whose content you changed. Never return a scene outside the allowed list.
- Keep the exact scene id. Never rename, renumber, merge, split, omit or reorder scenes.
- Preserve each scene's mediaType, role, chapter and duration.
- For video scenes return a complete videoPrompt; for image scenes do not add a videoPrompt.
- Keep the imagePrompt a detailed, self-contained production prompt consistent with the revised narration.
- Address every finding for the scene without adding unsupported facts. Keep strong lines intact.
- Keep the channel voice: ${channel === 'ancient-dharma' ? 'noble devotional Hindi, danda pauses, no street slang.' : channel === 'against-the-odds' ? 'clinical factual English, verified details only.' : 'natural spoken language for the template.'}
Return JSON: {"repairedScenes":[{"id":"...","narration":"...","imagePrompt":"...","videoPrompt":"only for video scenes","explanationOfFix":"..."}]}`,
        ].filter(Boolean).join('\n\n'),
      },
    ],
  }, RepairOutputSchema, 'Writers room scene repair');

  const repairMap = new Map<string, typeof parsed.repairedScenes[number]>();
  for (const repair of parsed.repairedScenes) {
    if (!candidateIds.has(repair.id) || repairMap.has(repair.id)) continue;
    repairMap.set(repair.id, repair);
  }

  if (!repairMap.size) {
    return {
      scenePlan: options.scenePlan,
      repairedSceneIds: [],
      diffs: [],
      notes: ['The fixer returned no valid scene repairs.'],
    };
  }

  const repairedSceneIds: string[] = [];
  const diffs: WritersRoomSceneDiff[] = [];
  const notes: string[] = [];
  const updatedScenes = options.scenePlan.scenes.map(scene => {
    const repair = repairMap.get(scene.id);
    if (!repair) return scene;
    const narration = preserveSpeakerTag(scene.narration, repair.narration);
    const imagePrompt = repair.imagePrompt;
    const videoPrompt = scene.mediaType === 'video'
      ? (repair.videoPrompt?.trim() || scene.videoPrompt || imagePrompt)
      : undefined;
    const next = {
      ...scene,
      narration,
      imagePrompt,
      speaker: extractSpeakerName(narration) || scene.speaker,
      ...(scene.motionGraphics ? { motionGraphics: refreshMotionHints(scene.motionGraphics, narration) } : {}),
      ...(scene.mediaType === 'video' ? { videoPrompt } : {}),
    };
    repairedSceneIds.push(scene.id);
    notes.push(`${scene.id}: ${repair.explanationOfFix}`);
    diffs.push({
      sceneId: scene.id,
      chapter: scene.chapter,
      beforeNarration: scene.narration,
      afterNarration: narration,
      ...(scene.imagePrompt !== imagePrompt ? { beforeImagePrompt: scene.imagePrompt, afterImagePrompt: imagePrompt } : {}),
      ...(scene.videoPrompt !== videoPrompt && (scene.videoPrompt || videoPrompt)
        ? { beforeVideoPrompt: scene.videoPrompt, afterVideoPrompt: videoPrompt }
        : {}),
    });
    return next;
  });

  return {
    scenePlan: { ...options.scenePlan, scenes: updatedScenes },
    repairedSceneIds,
    diffs,
    notes,
  };
}
