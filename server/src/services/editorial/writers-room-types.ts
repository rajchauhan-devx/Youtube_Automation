import { createHash } from 'node:crypto';
import type { ScenePlan } from '../scene-plan.js';
import type { ScriptDoctorAuditReport } from './professional-script-doctor.js';

export type WritersRoomCriticKey = 'retention' | 'fact' | 'tone' | 'fresh_eyes';
export type WritersRoomSeverity = 'blocker' | 'major' | 'minor';
export type WritersRoomDecision = 'approved' | 'repair' | 'needs_review' | 'max_passes' | 'plateau' | 'budget' | 'no_progress';
export type WritersRoomStatus = 'queued' | 'running' | 'approved' | 'needs_review' | 'cancelled' | 'error' | 'interrupted';
export type WritersRoomPassKind = 'main' | 'fresh_eyes';

export interface WritersRoomFinding {
  id: string;
  critic: WritersRoomCriticKey;
  severity: WritersRoomSeverity;
  category: string;
  sceneIds: string[];
  detail: string;
  evidence?: string;
  suggestedFix?: string;
}

export type WritersRoomFindingInput = Omit<WritersRoomFinding, 'id'>;

export interface WritersRoomCritique {
  critic: WritersRoomCriticKey;
  model: string;
  score: number;
  summary: string;
  findings: WritersRoomFinding[];
  passed: boolean;
  durationMs: number;
  error?: string;
  auditReport?: ScriptDoctorAuditReport;
}

export interface WritersRoomSceneDiff {
  sceneId: string;
  chapter?: string;
  beforeNarration: string;
  afterNarration: string;
  beforeImagePrompt?: string;
  afterImagePrompt?: string;
  beforeVideoPrompt?: string;
  afterVideoPrompt?: string;
}

export interface WritersRoomPass {
  pass: number;
  kind: WritersRoomPassKind;
  startedAt: string;
  finishedAt: string;
  critiques: WritersRoomCritique[];
  mergedFindings: WritersRoomFinding[];
  score: number;
  decision: WritersRoomDecision;
  repairedSceneIds: string[];
  diffs: WritersRoomSceneDiff[];
  notes: string[];
}

export interface WritersRoomOptions {
  maxPasses?: number;
  maxModelCalls?: number;
  passThreshold?: number;
  plateauDelta?: number;
  plateauPasses?: number;
  freshEyes?: boolean;
}

export interface WritersRoomModels {
  critic: string;
  fixer: string;
  freshEyes?: string;
}

export interface WritersRoomResult {
  status: 'approved' | 'needs_review' | 'cancelled';
  stopReason: string;
  finalScenePlan: ScenePlan;
  passes: WritersRoomPass[];
  finalScore: number;
  remainingFindings: WritersRoomFinding[];
  modelCalls: number;
  editorialNotes: string[];
}

export interface WritersRoomProgress {
  pass: number;
  totalPasses: number;
  phase: 'critics' | 'judging' | 'repairing' | 'fresh_eyes' | 'done';
  message: string;
  percent: number;
  criticStatus: Partial<Record<WritersRoomCriticKey, 'pending' | 'running' | 'done' | 'error'>>;
}

export interface WritersRoomSummary {
  jobId: string;
  status: WritersRoomStatus;
  finalScore: number;
  stopReason: string;
  passCount: number;
  remainingFindings: WritersRoomFinding[];
  updatedAt: string;
  appliedAt?: string;
}

export interface WritersRoomJob {
  version: 1;
  id: string;
  scriptId: string;
  owner: string;
  status: WritersRoomStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  request: {
    models: WritersRoomModels;
    options: WritersRoomOptions;
    sourcePlanHash: string;
    sourcePlanTitle: string;
  };
  progress: WritersRoomProgress;
  passes: WritersRoomPass[];
  decisions: Record<string, 'accepted' | 'rejected'>;
  result?: WritersRoomResult;
  findings: WritersRoomFinding[];
  cancelRequested: boolean;
  error?: string;
}

export function makeFinding(input: WritersRoomFindingInput): WritersRoomFinding {
  const id = createHash('sha1')
    .update([input.critic, input.category, [...input.sceneIds].sort().join(','), input.detail.trim().toLowerCase()].join('|'))
    .digest('hex')
    .slice(0, 12);
  return { ...input, id };
}
