import { auditScriptRetention, type ScriptDoctorAuditReport } from './professional-script-doctor.js';
import type { ScenePlan } from '../scene-plan.js';
import type { FiveActRetentionStoryMap } from './documentary-topic-vetter.js';
import { makeFinding, type WritersRoomCritique, type WritersRoomFinding, type WritersRoomSeverity } from './writers-room-types.js';

function severityForGate(score: number): WritersRoomSeverity {
  if (score < 15) return 'blocker';
  if (score < 20) return 'major';
  return 'minor';
}

export function findingsFromAudit(report: ScriptDoctorAuditReport): WritersRoomFinding[] {
  const findings: WritersRoomFinding[] = [];
  const gates = [
    { category: 'retention.hook', score: report.gate1_hook.score, findings: report.gate1_hook.findings, sceneIds: report.gate1_hook.flawedSceneIds },
    { category: 'retention.curiosity_chain', score: report.gate2_curiosityChain.score, findings: report.gate2_curiosityChain.findings, sceneIds: report.gate2_curiosityChain.flawedSceneIds },
    { category: 'retention.diction_cadence', score: report.gate3_dictionAndCadence.score, findings: report.gate3_dictionAndCadence.findings, sceneIds: report.gate3_dictionAndCadence.flawedSceneIds },
    { category: 'retention.climax_outro', score: report.gate4_climaxAndOutro.score, findings: report.gate4_climaxAndOutro.findings, sceneIds: report.gate4_climaxAndOutro.flawedSceneIds },
  ];

  for (const gate of gates) {
    for (const detail of gate.findings) {
      findings.push(makeFinding({
        critic: 'retention',
        severity: severityForGate(gate.score),
        category: gate.category,
        sceneIds: gate.sceneIds,
        detail,
        evidence: `Gate score ${gate.score}/25`,
        suggestedFix: report.rewritePrescription,
      }));
    }
  }

  for (const zone of report.deadZonesDetected) {
    findings.push(makeFinding({
      critic: 'retention',
      severity: 'blocker',
      category: 'retention.dead_zone',
      sceneIds: [zone.startSceneId, zone.endSceneId].filter(Boolean),
      detail: zone.reason,
      evidence: `Dead zone ${zone.startSceneId} → ${zone.endSceneId}`,
      suggestedFix: report.rewritePrescription,
    }));
  }

  if (!findings.length && report.totalScore < 90) {
    findings.push(makeFinding({
      critic: 'retention',
      severity: 'major',
      category: 'retention.overall',
      sceneIds: report.scenesToRepair,
      detail: `Retention score ${report.totalScore}/100 is below the 90/100 target.`,
      evidence: report.rewritePrescription,
      suggestedFix: report.rewritePrescription,
    }));
  }

  return findings;
}

export async function runRetentionCritic(options: {
  scenePlan: ScenePlan;
  channelName?: string;
  channelGuidance?: string;
  storyMap?: FiveActRetentionStoryMap;
  passNumber: number;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<WritersRoomCritique> {
  const started = Date.now();
  const report = await auditScriptRetention({
    scenePlan: options.scenePlan,
    channelName: options.channelName,
    channelGuidance: options.channelGuidance,
    storyMap: options.storyMap,
    passNumber: options.passNumber,
    model: options.model,
    apiKey: options.apiKey,
    signal: options.signal,
  });
  const findings = findingsFromAudit(report);
  const summary = [
    `Retention ${report.totalScore}/100.`,
    `Hook ${report.gate1_hook.score}/25, chain ${report.gate2_curiosityChain.score}/25, diction ${report.gate3_dictionAndCadence.score}/25, climax ${report.gate4_climaxAndOutro.score}/25.`,
    report.deadZonesDetected.length ? `${report.deadZonesDetected.length} dead zone(s) detected.` : 'No dead zones detected.',
  ].join(' ');

  return {
    critic: 'retention',
    model: options.model,
    score: report.totalScore,
    summary,
    findings,
    passed: report.passed,
    durationMs: Date.now() - started,
    auditReport: report,
  };
}
