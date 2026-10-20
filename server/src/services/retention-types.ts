import type { ScenePlan } from './scene-plan.js';

export interface RetentionHook {
  openingLine: string;
  openingVisual: string;
  curiosity: string;
  payoff: string;
  reason: string;
}
export interface RetentionPlan {
  version: 1;
  topic: string;
  createdAt: string;
  structure: string;
  hooks: RetentionHook[];
  selectedHookIndex: number;
  viewerPromise: string;
  titles: string[];
  thumbnailConcept: string;
  description: string;
  tags: string[];
  musicMood: 'calm' | 'cinematic' | 'epic' | 'upbeat' | 'none';
  memoryEvidence: string;
}
export interface RetentionEdit {
  sourceHash: string;
  plan: ScenePlan;
  notes: string[];
  sceneDirections: { sceneId: string; purpose: string; motion: 'hold' | 'slow-zoom-in' | 'drift-left' | 'drift-right'; transition: 'cut' | 'dissolve' }[];
  editedAt: string;
}
export interface RetentionReview {
  status: 'passed' | 'blocked';
  reviewedAt: string;
  videoFilename: string;
  renderHash: string;
  productionHash: string;
  duration: number;
  sampleTimes: number[];
  findings: { severity: 'blocker' | 'note'; category: string; detail: string }[];
  summary: string;
}
export interface ProductionMemory {
  hook: string;
  structure: string;
  title: string;
  duration: number;
  musicMood: string;
  scenes: { sceneId: string; start: number; end: number; purpose: string }[];
}
export interface RetentionPerformance {
  status: 'ready' | 'insufficient_data';
  fetchedAt: string;
  startDate: string;
  endDate: string;
  views: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  curve: { elapsed: number; watchRatio: number; relativePerformance?: number }[];
  dips: { elapsed: number; drop: number; sceneId?: string; purpose?: string }[];
}
