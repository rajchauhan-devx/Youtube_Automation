import { validateScenePlan, type ScenePlan } from '../scene-plan.js';
import type { FiveActRetentionStoryMap } from './documentary-topic-vetter.js';
import { runRetentionCritic } from './retention-critic.js';
import { runFactCritic } from './fact-critic.js';
import { runToneCritic } from './tone-critic.js';
import { runFreshEyesCritic } from './fresh-eyes-critic.js';
import { repairFlaggedScenes } from './scene-repair.js';
import type {
  WritersRoomCritique,
  WritersRoomDecision,
  WritersRoomFinding,
  WritersRoomModels,
  WritersRoomOptions,
  WritersRoomPass,
  WritersRoomProgress,
  WritersRoomResult,
  WritersRoomSceneDiff,
} from './writers-room-types.js';

export interface WritersRoomDeps {
  retentionCritic: typeof runRetentionCritic;
  factCritic: typeof runFactCritic;
  toneCritic: typeof runToneCritic;
  freshEyesCritic: typeof runFreshEyesCritic;
  fixer: typeof repairFlaggedScenes;
}

export interface RunWritersRoomOptions {
  scenePlan: ScenePlan;
  channelName?: string;
  channelGuidance?: string;
  template?: string;
  research?: string;
  storyMap?: FiveActRetentionStoryMap;
  models: WritersRoomModels;
  apiKeys: { critic: string; fixer: string; freshEyes?: string };
  options?: WritersRoomOptions;
  decisions?: Record<string, 'accepted' | 'rejected'>;
  initialPasses?: WritersRoomPass[];
  initialModelCalls?: number;
  onProgress?: (progress: WritersRoomProgress, passes: WritersRoomPass[]) => void;
  signal?: AbortSignal;
  deps?: Partial<WritersRoomDeps>;
}

const DEFAULT_OPTIONS: Required<WritersRoomOptions> = {
  maxPasses: 3,
  maxModelCalls: 16,
  passThreshold: 90,
  plateauDelta: 2,
  plateauPasses: 2,
  freshEyes: false,
};

const WEIGHTS: Record<WritersRoomCritique['critic'], number> = {
  retention: 0.5,
  fact: 0.3,
  tone: 0.2,
  fresh_eyes: 1,
};

const SEVERITY_RANK: Record<WritersRoomFinding['severity'], number> = { blocker: 3, major: 2, minor: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeWritersRoomOptions(options?: WritersRoomOptions): Required<WritersRoomOptions> {
  return {
    maxPasses: clamp(options?.maxPasses ?? DEFAULT_OPTIONS.maxPasses, 1, 6),
    maxModelCalls: clamp(options?.maxModelCalls ?? DEFAULT_OPTIONS.maxModelCalls, 4, 40),
    passThreshold: clamp(options?.passThreshold ?? DEFAULT_OPTIONS.passThreshold, 50, 100),
    plateauDelta: clamp(options?.plateauDelta ?? DEFAULT_OPTIONS.plateauDelta, 0, 20),
    plateauPasses: clamp(options?.plateauPasses ?? DEFAULT_OPTIONS.plateauPasses, 1, 4),
    freshEyes: options?.freshEyes ?? DEFAULT_OPTIONS.freshEyes,
  };
}

export function mergeFindings(
  critiques: WritersRoomCritique[],
  decisions: Record<string, 'accepted' | 'rejected'> = {},
): WritersRoomFinding[] {
  const seen = new Set<string>();
  const merged: WritersRoomFinding[] = [];
  for (const critique of critiques) {
    if (critique.error) continue;
    for (const finding of critique.findings) {
      if (decisions[finding.id] === 'rejected') continue;
      const key = [finding.critic, finding.category, [...finding.sceneIds].sort().join(','), finding.detail.trim().toLowerCase()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(finding);
    }
  }
  return merged.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function scoreCritiques(critiques: WritersRoomCritique[]): number {
  const available = critiques.filter(critique => !critique.error);
  if (!available.length) return 0;
  if (available.length === 1 && available[0].critic === 'fresh_eyes') return available[0].score;
  let totalWeight = 0;
  let total = 0;
  for (const critique of available) {
    const weight = WEIGHTS[critique.critic];
    if (!weight) continue;
    totalWeight += weight;
    total += critique.score * weight;
  }
  return totalWeight ? Math.round(total / totalWeight) : 0;
}

export function approvalBlockers(findings: WritersRoomFinding[]): WritersRoomFinding[] {
  return findings.filter(finding =>
    finding.severity === 'blocker'
    || ((finding.critic === 'fact' || finding.critic === 'fresh_eyes') && finding.severity === 'major'));
}

export function isPlateau(scores: number[], delta: number, passes: number): boolean {
  if (scores.length < passes + 1) return false;
  const recent = scores.slice(-(passes + 1));
  for (let index = 1; index < recent.length; index++) {
    if (recent[index] - recent[index - 1] >= delta) return false;
  }
  return true;
}

function abortError(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function failedCritique(critic: WritersRoomCritique['critic'], model: string, error: unknown): WritersRoomCritique {
  return {
    critic,
    model,
    score: 0,
    summary: 'This critic failed before returning a review.',
    findings: [],
    passed: false,
    durationMs: 0,
    error: error instanceof Error ? error.message : 'Critic failed',
  };
}

function stopReasonFor(decision: WritersRoomDecision, score: number, options: Required<WritersRoomOptions>): string {
  switch (decision) {
    case 'approved': return `Approved with ${score}/100.`;
    case 'max_passes': return `Reached the ${options.maxPasses}-pass limit at ${score}/100; human review required.`;
    case 'plateau': return `Score stopped improving for ${options.plateauPasses} passes at ${score}/100; human review required.`;
    case 'budget': return `Model-call budget of ${options.maxModelCalls} reached at ${score}/100; human review required.`;
    case 'no_progress': return `The fixer made no measurable change at ${score}/100; human review required.`;
    default: return `Needs human review at ${score}/100.`;
  }
}

export async function runWritersRoom(options: RunWritersRoomOptions): Promise<WritersRoomResult> {
  const deps: WritersRoomDeps = {
    retentionCritic: runRetentionCritic,
    factCritic: runFactCritic,
    toneCritic: runToneCritic,
    freshEyesCritic: runFreshEyesCritic,
    fixer: repairFlaggedScenes,
    ...options.deps,
  };
  const settings = normalizeWritersRoomOptions(options.options);
  const decisions = options.decisions || {};
  const passes = [...(options.initialPasses || [])];
  const totalPasses = Math.max(settings.maxPasses, passes.length + 1);
  let plan = validateScenePlan(options.scenePlan);
  let modelCalls = options.initialModelCalls || 0;
  let lastScore = passes[passes.length - 1]?.score || 0;
  let remainingFindings: WritersRoomFinding[] = passes[passes.length - 1]?.mergedFindings || [];
  let status: WritersRoomResult['status'] = 'needs_review';
  let stopReason = '';
  let cancelled = false;

  const progress = (pass: number, phase: WritersRoomProgress['phase'], message: string, criticStatus: WritersRoomProgress['criticStatus'], percent: number) => {
    options.onProgress?.({
      pass,
      totalPasses,
      phase,
      message,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      criticStatus,
    }, [...passes]);
  };

  try {
    for (let pass = passes.length + 1; pass <= settings.maxPasses; pass++) {
      options.signal?.throwIfAborted();
      if (modelCalls + 3 > settings.maxModelCalls) {
        stopReason = `Model-call budget of ${settings.maxModelCalls} reached before pass ${pass}.`;
        break;
      }

      const startedAt = new Date().toISOString();
      const criticStatus: WritersRoomProgress['criticStatus'] = { retention: 'running', fact: 'running', tone: 'running' };
      const basePercent = ((pass - 1) / totalPasses) * 90;
      progress(pass, 'critics', `Pass ${pass}/${totalPasses}: retention, fact and tone critics are reviewing.`, { ...criticStatus }, basePercent + 5);

      const markCritic = (critic: WritersRoomCritique['critic'], value: 'done' | 'error') => {
        criticStatus[critic] = value;
        progress(pass, 'critics', `Pass ${pass}/${totalPasses}: ${critic} critic ${value}.`, { ...criticStatus }, basePercent + 15);
      };

      const runCritic = async (critic: WritersRoomCritique['critic'], task: () => Promise<WritersRoomCritique>) => {
        try {
          const result = await task();
          markCritic(critic, result.error ? 'error' : 'done');
          return result;
        } catch (error) {
          if (abortError(options.signal)) throw error;
          markCritic(critic, 'error');
          return failedCritique(critic, '', error);
        }
      };

      const critiques = await Promise.all([
        runCritic('retention', () => deps.retentionCritic({
          scenePlan: plan,
          channelName: options.channelName,
          channelGuidance: options.channelGuidance,
          storyMap: options.storyMap,
          passNumber: pass,
          model: options.models.critic,
          apiKey: options.apiKeys.critic,
          signal: options.signal,
        })),
        runCritic('fact', () => deps.factCritic({
          scenePlan: plan,
          channelName: options.channelName,
          channelGuidance: options.channelGuidance,
          template: options.template,
          research: options.research,
          storyMap: options.storyMap,
          passNumber: pass,
          model: options.models.critic,
          apiKey: options.apiKeys.critic,
          signal: options.signal,
        })),
        runCritic('tone', () => deps.toneCritic({
          scenePlan: plan,
          channelName: options.channelName,
          channelGuidance: options.channelGuidance,
          template: options.template,
          storyMap: options.storyMap,
          passNumber: pass,
          model: options.models.critic,
          apiKey: options.apiKeys.critic,
          signal: options.signal,
        })),
      ]);
      options.signal?.throwIfAborted();
      modelCalls += 3;

      const merged = mergeFindings(critiques, decisions);
      const score = scoreCritiques(critiques);
      const blockers = approvalBlockers(merged);
      const failed = critiques.filter(critique => critique.error);
      const approved = !failed.length && score >= settings.passThreshold && blockers.length === 0;
      let decision: WritersRoomDecision = approved ? 'approved' : 'repair';
      let diffs: WritersRoomSceneDiff[] = [];
      let repairedSceneIds: string[] = [];
      let passNotes: string[] = [];

      if (failed.length) {
        decision = 'needs_review';
        passNotes.push(`Critic failure: ${failed.map(critique => `${critique.critic} (${critique.error})`).join('; ')}`);
      } else if (!approved) {
        if (pass >= settings.maxPasses) decision = 'max_passes';
        else if (isPlateau([...passes.map(item => item.score), score], settings.plateauDelta, settings.plateauPasses)) decision = 'plateau';
        else if (modelCalls + 1 > settings.maxModelCalls) decision = 'budget';
      }

      if (decision === 'repair') {
        progress(pass, 'repairing', `Pass ${pass}: repairing ${merged.length} finding(s) on ${new Set(merged.flatMap(finding => finding.sceneIds)).size || 'all'} scene(s).`, { ...criticStatus }, basePercent + 55);
        const repaired = await deps.fixer({
          scenePlan: plan,
          findings: merged,
          channelName: options.channelName,
          channelGuidance: options.channelGuidance,
          template: options.template,
          research: options.research,
          model: options.models.fixer,
          apiKey: options.apiKeys.fixer,
          signal: options.signal,
        });
        modelCalls += 1;
        plan = validateScenePlan(repaired.scenePlan);
        diffs = repaired.diffs;
        repairedSceneIds = repaired.repairedSceneIds;
        passNotes = repaired.notes;
        if (!diffs.length) {
          decision = 'no_progress';
          passNotes.push('The fixer returned no measurable scene change.');
        }
      }

      lastScore = score;
      remainingFindings = merged;
      const finishedAt = new Date().toISOString();
      passes.push({
        pass,
        kind: 'main',
        startedAt,
        finishedAt,
        critiques,
        mergedFindings: merged,
        score,
        decision,
        repairedSceneIds,
        diffs,
        notes: passNotes,
      });

      if (decision === 'approved') {
        status = 'approved';
        stopReason = stopReasonFor(decision, score, settings);
        progress(pass, 'done', `Pass ${pass}: approved at ${score}/100.`, { ...criticStatus }, 100);
        break;
      }
      if (decision !== 'repair') {
        status = 'needs_review';
        stopReason = stopReasonFor(decision, score, settings);
        progress(pass, 'done', `Pass ${pass}: ${stopReason}`, { ...criticStatus }, 100);
        break;
      }
      progress(pass, 'critics', `Pass ${pass}: repairs applied, starting the next review.`, { ...criticStatus }, basePercent + 85);
    }

    if (!stopReason) {
      const last = passes[passes.length - 1];
      if (last?.decision === 'approved') {
        status = 'approved';
        stopReason = stopReasonFor('approved', last.score, settings);
      } else {
        status = 'needs_review';
        stopReason = `No further passes were requested; human review required at ${lastScore}/100.`;
      }
    }

    if (status === 'approved' && settings.freshEyes && options.models.freshEyes) {
      if (modelCalls + 1 > settings.maxModelCalls) {
        stopReason += ' Fresh-eyes review was skipped because the model-call budget was reached.';
      } else {
        options.signal?.throwIfAborted();
        const freshPass = passes.length + 1;
        progress(freshPass, 'fresh_eyes', 'Fresh-eyes editor is reviewing the approved script independently.', { fresh_eyes: 'running' }, 95);
        try {
          const critique = await deps.freshEyesCritic({
            scenePlan: plan,
            channelName: options.channelName,
            channelGuidance: options.channelGuidance,
            template: options.template,
            research: options.research,
            model: options.models.freshEyes,
            apiKey: options.apiKeys.freshEyes || options.apiKeys.critic,
            signal: options.signal,
          });
          modelCalls += 1;
          const merged = mergeFindings([critique], decisions);
          const blockers = approvalBlockers(merged);
          const passed = !critique.error && critique.score >= settings.passThreshold && blockers.length === 0;
          const decision: WritersRoomDecision = passed ? 'approved' : 'needs_review';
          passes.push({
            pass: freshPass,
            kind: 'fresh_eyes',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            critiques: [critique],
            mergedFindings: merged,
            score: critique.score,
            decision,
            repairedSceneIds: [],
            diffs: [],
            notes: [critique.summary],
          });
          lastScore = critique.score;
          remainingFindings = merged;
          if (passed) {
            stopReason = `Approved with ${lastScore}/100 after a fresh-eyes review.`;
            progress(freshPass, 'done', 'Fresh-eyes review passed.', { fresh_eyes: 'done' }, 100);
          } else {
            status = 'needs_review';
            stopReason = critique.error
              ? `Fresh-eyes review failed: ${critique.error}. Human review required.`
              : `Fresh-eyes review found ${merged.length} issue(s) at ${critique.score}/100; human review required.`;
            progress(freshPass, 'done', stopReason, { fresh_eyes: critique.error ? 'error' : 'done' }, 100);
          }
        } catch (error) {
          if (abortError(options.signal)) throw error;
          status = 'needs_review';
          stopReason = `Fresh-eyes review failed: ${error instanceof Error ? error.message : 'unknown error'}. Human review required.`;
          progress(freshPass, 'done', stopReason, { fresh_eyes: 'error' }, 100);
        }
      }
    }
  } catch (error) {
    if (abortError(options.signal)) {
      cancelled = true;
      status = 'cancelled';
      stopReason = 'Cancelled by user.';
    } else {
      throw error;
    }
  }

  const editorialNotes: string[] = [];
  for (const pass of passes) {
    editorialNotes.push(`Pass ${pass.pass} (${pass.kind}): ${pass.score}/100 — ${pass.decision}.`);
    for (const critique of pass.critiques) {
      editorialNotes.push(`${critique.critic}: ${critique.error ? `failed (${critique.error})` : critique.summary}`);
    }
    editorialNotes.push(...pass.notes);
  }
  if (stopReason) editorialNotes.push(stopReason);

  return {
    status: cancelled ? 'cancelled' : status,
    stopReason,
    finalScenePlan: plan,
    passes,
    finalScore: lastScore,
    remainingFindings,
    modelCalls,
    editorialNotes,
  };
}
