import { createHash } from 'node:crypto';
import { spokenText, validateScenePlan, type ScenePlan } from './scene-plan.js';
import { serializeScenePlan } from './scene-plan-format.js';
import type { WritersRoomJob, WritersRoomSummary } from './editorial/writers-room-types.js';

export interface WritersRoomScriptLike {
  id: string;
  retentionEdit?: { plan: ScenePlan; notes?: string[]; [key: string]: unknown };
  scenePlan?: ScenePlan;
  generatedImages?: { url?: string }[];
  generatedAudio?: { url?: string }[];
  [key: string]: unknown;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function writersRoomPlanHash(plan: ScenePlan): string {
  return createHash('sha256').update(canonical(plan)).digest('hex');
}

export function hasGeneratedMedia(script: WritersRoomScriptLike): boolean {
  return [...(script.generatedImages || []), ...(script.generatedAudio || [])]
    .some(item => typeof item?.url === 'string' && Boolean(item.url.trim()));
}

export function currentWritersRoomPlan(script: WritersRoomScriptLike): ScenePlan | undefined {
  return script.retentionEdit?.plan || script.scenePlan;
}

export function buildWritersRoomSummary(job: WritersRoomJob, appliedAt?: string): WritersRoomSummary {
  return {
    jobId: job.id,
    status: job.status,
    finalScore: job.result?.finalScore || 0,
    stopReason: job.result?.stopReason || job.error || '',
    passCount: job.passes.length,
    remainingFindings: job.result?.remainingFindings || job.findings,
    updatedAt: new Date().toISOString(),
    ...(appliedAt ? { appliedAt } : {}),
  };
}

export function buildWritersRoomPatch(script: WritersRoomScriptLike, job: WritersRoomJob): Record<string, unknown> {
  if (!job.result?.finalScenePlan) throw new Error('This Writers’ Room run has no final script to apply.');
  const plan = validateScenePlan(job.result.finalScenePlan);
  const narration = spokenText(plan);
  const appliedAt = new Date().toISOString();
  const patch: Record<string, unknown> = {
    scenePlan: plan,
    narration,
    extractedScript: narration,
    aiResponse: serializeScenePlan(plan),
    imagePrompts: plan.scenes.map(scene => scene.imagePrompt),
    writersRoomJobId: job.id,
    writersRoomSummary: buildWritersRoomSummary(job, appliedAt),
  };
  if (script.retentionEdit) {
    patch.retentionEdit = {
      ...script.retentionEdit,
      plan,
      notes: [...job.result.editorialNotes, ...(script.retentionEdit.notes || [])].slice(0, 80),
      editedAt: appliedAt,
    };
  }
  return patch;
}
